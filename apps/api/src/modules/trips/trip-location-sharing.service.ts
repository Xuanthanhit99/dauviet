import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntityKind, TripLocationSharingStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppConfig } from '../../config/configuration';
import { TRIP_ERROR_CODES } from '../../common/errors/trip-error-codes';
import { TripAuthorizationService, TripCapability } from './trip-authorization.service';
import { TripCollaborationEventService } from './trip-collaboration-event.service';
import { StartTripLocationSharingDto } from './dto/trip-location.dto';
import { computeLocationAvailability } from './trip-location-availability.util';

interface SharingLockRow {
  id: string;
  status: TripLocationSharingStatus;
  expiresAt: Date;
}

/**
 * Explicit, self-service, finite-duration consent lifecycle (spec sections
 * 5-11, 55-59). TRIP MEMBERSHIP != LOCATION CONSENT (spec section 1) - every
 * method here requires the caller to already be an accepted participant
 * (`TripAuthorizationService.authorize(..., VIEW_TRIP)`, the same
 * lowest-common capability owner/EDITOR/VIEWER all hold), but nothing about
 * membership itself ever creates, extends, or reactivates a consent row -
 * only an explicit call to `start` by that exact user does (self-consent
 * only, spec section 8/11 - there is deliberately no `targetUserId`
 * parameter anywhere in this service).
 *
 * `start`/`stop` both begin their transaction by touching the
 * `TripLocationSharing` row for (tripId, userId) FIRST - `start` via a raw
 * `SELECT ... FOR UPDATE`, `stop` via a conditional `UPDATE ... WHERE status
 * = 'ACTIVE'` (the same "one statement is both the lock and the atomic
 * transition" pattern G07's invitation accept/decline already uses). This
 * is the single serialization point shared with `TripLocationsService.update`
 * and the G07 remove/leave/archive integrations, which is what makes the
 * required concurrency proofs (spec sections 73-77) hold against a real
 * PostgreSQL instance rather than just "usually work."
 */
@Injectable()
export class TripLocationSharingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly authz: TripAuthorizationService,
    private readonly collaborationEvents: TripCollaborationEventService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  private get settings() {
    return this.config.get('tripLocation', { infer: true });
  }

  async start(tripId: string, userId: string, dto: StartTripLocationSharingDto) {
    const { trip } = await this.authz.authorize(tripId, userId, TripCapability.VIEW_TRIP);
    if (trip.archivedAt) {
      throw new ConflictException({ code: TRIP_ERROR_CODES.TRIP_ARCHIVED, message: 'This trip is archived and read-only - location sharing cannot be started.' });
    }

    const { sharingMinDurationMinutes, sharingMaxDurationMinutes } = this.settings;
    if (dto.durationMinutes < sharingMinDurationMinutes || dto.durationMinutes > sharingMaxDurationMinutes) {
      throw new BadRequestException({
        code: TRIP_ERROR_CODES.TRIP_LOCATION_INVALID,
        message: `durationMinutes must be between ${sharingMinDurationMinutes} and ${sharingMaxDurationMinutes}.`,
      });
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + dto.durationMinutes * 60_000);

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<SharingLockRow[]>`
        SELECT "id", "status", "expiresAt" FROM "TripLocationSharing"
        WHERE "tripId" = ${tripId} AND "userId" = ${userId}
        FOR UPDATE
      `;
      const existing = rows[0];
      // A currently-ACTIVE-and-unexpired session must be stopped explicitly
      // before a new one starts (spec section 56) - never a silent implicit
      // extension of an existing grant.
      if (existing && existing.status === 'ACTIVE' && existing.expiresAt > now) {
        throw new ConflictException({
          code: TRIP_ERROR_CODES.TRIP_LOCATION_SHARING_ALREADY_ACTIVE,
          message: 'Location sharing is already active for this trip - stop it before starting a new session.',
        });
      }

      // One mutable row per (tripId, userId) - see
      // docs/backend/G08_PRE_IMPLEMENTATION_REPORT.md section 9/80. A prior
      // STOPPED/EXPIRED session's row is reactivated in place, never
      // duplicated into a session history.
      const sharing = existing
        ? await tx.tripLocationSharing.update({ where: { id: existing.id }, data: { status: 'ACTIVE', startedAt: now, expiresAt, stoppedAt: null } })
        : await tx.tripLocationSharing.create({ data: { tripId, userId, status: 'ACTIVE', startedAt: now, expiresAt } });

      await this.audit.log(
        { actorId: userId, action: 'tripLocationSharing.started', entityType: EntityKind.TRIP_LOCATION_SHARING, entityId: sharing.id, metadata: { durationMinutes: dto.durationMinutes } },
        tx,
      );
      await this.collaborationEvents.record({ tripId, type: 'LOCATION_SHARING_STARTED', actorUserId: userId }, tx);

      return this.toStatusDto(sharing, null);
    });
  }

  /** The sharing user may stop their own sharing at any time (spec section 9) - takes effect on the very next read with no logout/new-JWT/restart/worker required (spec section 9/71). */
  async stop(tripId: string, userId: string) {
    await this.authz.authorize(tripId, userId, TripCapability.VIEW_TRIP);

    return this.prisma.$transaction(async (tx) => {
      const stopped = await tx.$executeRaw`
        UPDATE "TripLocationSharing" SET "status" = 'STOPPED', "stoppedAt" = NOW(), "updatedAt" = NOW()
        WHERE "tripId" = ${tripId} AND "userId" = ${userId} AND "status" = 'ACTIVE'
      `;
      if (stopped === 0) {
        throw new ConflictException({ code: TRIP_ERROR_CODES.TRIP_LOCATION_SHARING_NOT_ACTIVE, message: 'Location sharing is not currently active.' });
      }
      // Immediate unavailability on the next read (spec section 9) - the
      // latest-location row is deleted in the SAME transaction, not left
      // for a background sweep.
      await tx.tripMemberLocation.deleteMany({ where: { tripId, userId } });

      const sharing = await tx.tripLocationSharing.findUniqueOrThrow({ where: { tripId_userId: { tripId, userId } } });
      await this.audit.log({ actorId: userId, action: 'tripLocationSharing.stopped', entityType: EntityKind.TRIP_LOCATION_SHARING, entityId: sharing.id }, tx);
      await this.collaborationEvents.record({ tripId, type: 'LOCATION_SHARING_STOPPED', actorUserId: userId }, tx);

      return this.toStatusDto(sharing, null);
    });
  }

  /** Safe self-inspection (spec section 26) - reports only status/timing/own-location-freshness, never internal consent-row ids or other members' data. */
  async me(tripId: string, userId: string) {
    await this.authz.authorize(tripId, userId, TripCapability.VIEW_TRIP);

    const [sharing, location] = await Promise.all([
      this.prisma.tripLocationSharing.findUnique({ where: { tripId_userId: { tripId, userId } } }),
      this.prisma.tripMemberLocation.findUnique({ where: { tripId_userId: { tripId, userId } }, select: { capturedAt: true, expiresAt: true } }),
    ]);

    return this.toStatusDto(sharing, location);
  }

  private toStatusDto(
    sharing: { id: string; status: TripLocationSharingStatus; startedAt: Date; expiresAt: Date; stoppedAt: Date | null } | null,
    location: { capturedAt: Date; expiresAt: Date } | null,
  ) {
    if (!sharing) {
      return { status: 'NEVER_SHARED' as const, startedAt: null, expiresAt: null, stoppedAt: null, locationAvailability: 'UNAVAILABLE' as const };
    }
    const now = new Date();
    // Effective status is derived at read time (spec section 55) - never
    // trusts a possibly-stale stored `ACTIVE` past its own `expiresAt`,
    // regardless of whether any lazy DB write has run.
    const effectiveStatus: TripLocationSharingStatus = sharing.status === 'ACTIVE' && sharing.expiresAt <= now ? 'EXPIRED' : sharing.status;
    const locationAvailability = computeLocationAvailability({
      sharingStatus: effectiveStatus,
      sharingExpiresAt: sharing.expiresAt,
      location,
      now,
      freshnessSeconds: this.settings.freshnessSeconds,
    });
    return {
      status: effectiveStatus,
      startedAt: sharing.startedAt,
      expiresAt: sharing.expiresAt,
      stoppedAt: sharing.stoppedAt,
      locationAvailability,
    };
  }
}
