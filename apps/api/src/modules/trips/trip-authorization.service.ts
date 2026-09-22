import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Trip, TripMemberRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TRIP_ERROR_CODES } from '../../common/errors/trip-error-codes';

/** Every trip-scoped action a caller might attempt (spec section 10) - the single vocabulary every controller/service checks against, never a bare role-name comparison scattered around. */
export enum TripCapability {
  VIEW_TRIP = 'VIEW_TRIP',
  EDIT_TRIP = 'EDIT_TRIP',
  GENERATE_ESTIMATE = 'GENERATE_ESTIMATE',
  MANAGE_MEMBERS = 'MANAGE_MEMBERS',
  MANAGE_INVITATIONS = 'MANAGE_INVITATIONS',
  TRANSFER_OWNERSHIP = 'TRANSFER_OWNERSHIP',
  ARCHIVE_TRIP = 'ARCHIVE_TRIP',
}

/** OWNER is virtual - never a stored TripMember row (spec section 7/8). */
export type EffectiveTripRole = 'OWNER' | TripMemberRole;

/**
 * Transcribed verbatim from the brief's permission matrix (spec section 9).
 * EDITOR gains planning capabilities but never governance ones; VIEWER gets
 * read-only. Kept as one literal table, not scattered per-service `if`
 * chains, so a future capability addition/removal is a one-line change in
 * exactly one place.
 */
const PERMISSION_MATRIX: Record<EffectiveTripRole, ReadonlySet<TripCapability>> = {
  OWNER: new Set(Object.values(TripCapability)),
  EDITOR: new Set([TripCapability.VIEW_TRIP, TripCapability.EDIT_TRIP, TripCapability.GENERATE_ESTIMATE]),
  VIEWER: new Set([TripCapability.VIEW_TRIP]),
};

export interface TripAuthorizationResult {
  trip: Trip;
  role: EffectiveTripRole;
}

/**
 * The ONLY place trip-scoped authorization is decided (spec section 10 -
 * "centralize sufficiently to prevent controller/service drift"). Re-reads
 * `Trip.ownerId` and `TripMember` fresh from Postgres on every call - never
 * cached, never derived from a JWT claim (spec section 67/68/69/70), so a
 * role change or removal takes effect on the very next request with nothing
 * to invalidate, mirroring G02's `ProviderRegistryService` discipline.
 *
 * Existence is never hidden (spec section 11): a missing trip is 404
 * regardless of the caller's relationship to it; an existing trip the
 * caller has no relationship to at all is 403 with the SAME
 * `TRIP_PERMISSION_DENIED` code an insufficiently-privileged member would
 * get - a VIEWER attempting an OWNER action and a total stranger get
 * indistinguishable error shapes, so the response itself never reveals
 * "you have some relationship to this trip, just not enough."
 */
@Injectable()
export class TripAuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveRole(trip: Trip, userId: string): Promise<EffectiveTripRole | null> {
    if (trip.ownerId === userId) return 'OWNER';
    const member = await this.prisma.tripMember.findUnique({ where: { tripId_userId: { tripId: trip.id, userId } } });
    return member?.role ?? null;
  }

  /** Fetch-and-authorize in one call - the shared choke point every route ultimately calls, directly or via `TripsService.getOwnedOrThrow`. */
  async authorize(tripId: string, userId: string, capability: TripCapability): Promise<TripAuthorizationResult> {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException({ code: TRIP_ERROR_CODES.TRIP_NOT_FOUND, message: 'Trip not found.' });

    const role = await this.resolveRole(trip, userId);
    if (!role || !PERMISSION_MATRIX[role].has(capability)) {
      throw new ForbiddenException({ code: TRIP_ERROR_CODES.TRIP_PERMISSION_DENIED, message: 'You do not have permission to perform this action on this trip.' });
    }
    return { trip, role };
  }

  /** Role resolution only, no capability check, no throw - for read paths that need to know "which role am I" without gating (e.g. rendering a member-list row's own-role indicator). Returns null for no relationship at all. */
  async currentRole(tripId: string, userId: string): Promise<EffectiveTripRole | null> {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException({ code: TRIP_ERROR_CODES.TRIP_NOT_FOUND, message: 'Trip not found.' });
    return this.resolveRole(trip, userId);
  }

  /** True if `userId` has ANY relationship (owner or member) to the trip - used by `TripsService.list`'s OWNED+MEMBER evolution and by activity/member-list access checks (spec section 12/42). */
  hasCapability(role: EffectiveTripRole | null, capability: TripCapability): boolean {
    return role !== null && PERMISSION_MATRIX[role].has(capability);
  }
}
