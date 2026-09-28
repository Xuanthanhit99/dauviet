import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfig } from '../../config/configuration';
import { TRIP_ERROR_CODES } from '../../common/errors/trip-error-codes';
import { TripAuthorizationService, TripCapability } from './trip-authorization.service';
import { UpdateTripLocationDto } from './dto/trip-location.dto';
import { computeLocationAvailability, TripLocationAvailability } from './trip-location-availability.util';

interface UpsertResultRow {
  id: string;
  capturedAt: Date;
}

/**
 * Location write/read paths (spec sections 13-25, 91). Deliberately
 * separate from `TripLocationSharingService` (consent lifecycle) - this
 * service never creates/mutates a `TripLocationSharing` row, only reads its
 * current state as an authorization gate.
 */
@Injectable()
export class TripLocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: TripAuthorizationService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  private get settings() {
    return this.config.get('tripLocation', { infer: true });
  }

  /**
   * Self-only write (spec section 20/61) - `userId` always comes from the
   * authenticated caller, never the request body. Newer-`capturedAt`-wins,
   * proven with real PostgreSQL concurrency
   * (docs/backend/G08_PRE_IMPLEMENTATION_REPORT.md section 11): the
   * transaction's first statement locks this user's `TripLocationSharing`
   * row (`FOR UPDATE`), the same serialization point `stop`/`remove`/
   * `leave`/`archive` use, so a write can never land after one of those has
   * already committed - and the location row itself is written via a single
   * conditional `INSERT ... ON CONFLICT ... WHERE stored.capturedAt <
   * EXCLUDED.capturedAt`, so two concurrent writes with different
   * `capturedAt` resolve deterministically to whichever is newer regardless
   * of which HTTP request's transaction actually commits last.
   */
  async update(tripId: string, userId: string, dto: UpdateTripLocationDto) {
    await this.authz.authorize(tripId, userId, TripCapability.VIEW_TRIP);

    const capturedAt = new Date(dto.capturedAt);
    if (Number.isNaN(capturedAt.getTime())) {
      throw new BadRequestException({ code: TRIP_ERROR_CODES.TRIP_LOCATION_INVALID, message: 'capturedAt is not a valid ISO 8601 timestamp.' });
    }
    const now = new Date();
    const maxFuture = now.getTime() + this.settings.maxFutureClockSkewSeconds * 1000;
    if (capturedAt.getTime() > maxFuture) {
      // Device-reported evidence is never blindly trusted (spec section 16).
      throw new BadRequestException({ code: TRIP_ERROR_CODES.TRIP_LOCATION_INVALID, message: 'capturedAt is too far in the future.' });
    }

    return this.prisma.$transaction(async (tx) => {
      const lockRows = await tx.$queryRaw<{ status: string; expiresAt: Date }[]>`
        SELECT "status", "expiresAt" FROM "TripLocationSharing"
        WHERE "tripId" = ${tripId} AND "userId" = ${userId}
        FOR UPDATE
      `;
      const sharing = lockRows[0];
      if (!sharing || sharing.status !== 'ACTIVE') {
        throw new ConflictException({ code: TRIP_ERROR_CODES.TRIP_LOCATION_SHARING_NOT_ACTIVE, message: 'Location sharing is not currently active for this trip.' });
      }
      if (sharing.expiresAt <= now) {
        throw new ConflictException({ code: TRIP_ERROR_CODES.TRIP_LOCATION_SHARING_EXPIRED, message: 'Location sharing has expired - start a new session.' });
      }

      const receivedAt = now;
      const expiresAt = new Date(receivedAt.getTime() + this.settings.ttlSeconds * 1000);
      const id = randomUUID();

      const upserted = await tx.$queryRaw<UpsertResultRow[]>`
        INSERT INTO "TripMemberLocation"
          ("id", "tripId", "userId", "latitude", "longitude", "accuracyMeters", "capturedAt", "receivedAt", "expiresAt", "createdAt", "updatedAt")
        VALUES
          (${id}, ${tripId}, ${userId}, ${dto.latitude}, ${dto.longitude}, ${dto.accuracyMeters}, ${capturedAt}, ${receivedAt}, ${expiresAt}, NOW(), NOW())
        ON CONFLICT ("tripId", "userId") DO UPDATE SET
          "latitude" = EXCLUDED."latitude",
          "longitude" = EXCLUDED."longitude",
          "accuracyMeters" = EXCLUDED."accuracyMeters",
          "capturedAt" = EXCLUDED."capturedAt",
          "receivedAt" = EXCLUDED."receivedAt",
          "expiresAt" = EXCLUDED."expiresAt",
          "updatedAt" = NOW()
        WHERE "TripMemberLocation"."capturedAt" < EXCLUDED."capturedAt"
        RETURNING "id", "capturedAt"
      `;

      if (upserted.length > 0) {
        return { accepted: true, capturedAt: upserted[0].capturedAt, availability: 'FRESH' as TripLocationAvailability };
      }

      // Conflict occurred but the WHERE guard rejected it - the stored row
      // is unchanged. Disambiguate equal (idempotent retry, spec section
      // 23) from strictly older (stale, spec sections 21/22/76) with one
      // more read, never by touching the row.
      const current = await tx.tripMemberLocation.findUniqueOrThrow({ where: { tripId_userId: { tripId, userId } } });
      if (current.capturedAt.getTime() === capturedAt.getTime()) {
        return { accepted: true, capturedAt: current.capturedAt, availability: 'FRESH' as TripLocationAvailability };
      }
      throw new ConflictException({
        code: TRIP_ERROR_CODES.TRIP_LOCATION_STALE_UPDATE,
        message: 'A newer location has already been recorded for this trip - this update was superseded and was not applied.',
      });
    });
  }

  /**
   * Read path (spec sections 24-25, 38, 93/99) - every accepted participant
   * (owner + EDITOR + VIEWER, spec section 25) may read every OTHER
   * participant's currently-shareable latest location, minimized to exactly
   * what the trip UI needs (no email/device/session/internal-id fields).
   * Archived trips return no locations at all (spec section 54), even
   * though membership itself survives archiving - defense in depth on top
   * of `archive()` already force-terminating every sharing session and
   * deleting every location row for the trip.
   */
  async list(tripId: string, userId: string) {
    const { trip } = await this.authz.authorize(tripId, userId, TripCapability.VIEW_TRIP);
    if (trip.archivedAt) return [];

    const [owner, members] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: trip.ownerId }, select: { id: true, displayName: true, avatarMediaId: true } }),
      this.prisma.tripMember.findMany({
        where: { tripId },
        select: { userId: true, joinedAt: true, user: { select: { id: true, displayName: true, avatarMediaId: true } } },
        orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
      }),
    ]);

    const participants = [
      ...(owner ? [{ id: owner.id, displayName: owner.displayName, avatarMediaId: owner.avatarMediaId }] : []),
      ...members.map((m) => ({ id: m.user.id, displayName: m.user.displayName, avatarMediaId: m.user.avatarMediaId })),
    ];
    const participantIds = participants.map((p) => p.id);
    if (participantIds.length === 0) return [];

    const [sharings, locations] = await Promise.all([
      this.prisma.tripLocationSharing.findMany({ where: { tripId, userId: { in: participantIds } } }),
      this.prisma.tripMemberLocation.findMany({ where: { tripId, userId: { in: participantIds } } }),
    ]);
    const sharingByUser = new Map(sharings.map((s) => [s.userId, s]));
    const locationByUser = new Map(locations.map((l) => [l.userId, l]));
    const now = new Date();

    return participants.map((p) => {
      const sharing = sharingByUser.get(p.id);
      const location = locationByUser.get(p.id) ?? null;
      const effectiveStatus = sharing ? (sharing.status === 'ACTIVE' && sharing.expiresAt <= now ? 'EXPIRED' : sharing.status) : 'STOPPED';
      const availability = computeLocationAvailability({
        sharingStatus: effectiveStatus as 'ACTIVE' | 'STOPPED' | 'EXPIRED',
        sharingExpiresAt: sharing?.expiresAt ?? now,
        location: location ? { capturedAt: location.capturedAt, expiresAt: location.expiresAt } : null,
        now,
        freshnessSeconds: this.settings.freshnessSeconds,
      });

      const base = { userId: p.id, displayName: p.displayName, avatarMediaId: p.avatarMediaId, availability };
      if (availability === 'UNAVAILABLE' || !location) return base;
      return { ...base, latitude: location.latitude, longitude: location.longitude, accuracyMeters: location.accuracyMeters, capturedAt: location.capturedAt };
    });
  }
}
