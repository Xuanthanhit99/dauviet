import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma, TripMemberRole } from '@prisma/client';
import { TRIP_ERROR_CODES } from '../../common/errors/trip-error-codes';

interface LockedTripRow {
  id: string;
  ownerId: string;
  archivedAt: Date | null;
}
interface LockedMemberRow {
  id: string;
  role: TripMemberRole;
}

/**
 * Transaction-internal re-validation for every G09 financial mutation
 * (create/update/delete expense, create settlement) - closes the member-
 * removal-vs-create (spec section 36), role-downgrade-vs-mutation (spec
 * section 37), and archive-vs-mutation (spec section 38) races that a
 * pre-transaction `TripAuthorizationService.authorize` call alone cannot,
 * since that call reads state *before* the transaction that might
 * invalidate it.
 *
 * Lock order: if the acting user is (per an unlocked pre-check read) NOT
 * the trip owner, the `TripMember` row is locked FIRST, then the `Trip` row
 * second - matching `TripMembersService.remove`/`.updateRole`'s own
 * internal order EXACTLY (docs/backend/G09_PRE_IMPLEMENTATION_REPORT.md
 * section 5/12). This was deliberately switched from the initially-planned
 * "Trip row first" order after a REAL PostgreSQL deadlock (`40P01`) was
 * observed live between a concurrent `TripExpensesService.create` and
 * `TripMembersService.remove` during this phase's own e2e race tests - see
 * `G09_FINAL_REPORT.md`'s "Lock-ordering incident" section. Matching
 * `remove`/`updateRole`'s order eliminates that specific deadlock; it
 * leaves a narrower, pre-existing, undocumented-by-G07 tension with
 * `TripMembersService.transferOwnership` (which locks `Trip` first) as an
 * accepted, documented remaining risk, mitigated by `withDeadlockRetry`
 * (below).
 *
 * A narrow accepted edge case: the owner-vs-member branch is decided from
 * an UNLOCKED read of `Trip.ownerId` before either row is locked, so a
 * concurrent ownership transfer landing on this exact actor, in the
 * instant between that read and the lock acquisition, could see this
 * function take the wrong branch. Not exercised by any required race in
 * the brief (which lists removal/downgrade/archive, not concurrent
 * self-transfer) and documented here rather than silently accepted.
 */
export async function lockTripAndAssertMutable(tx: Prisma.TransactionClient, tripId: string, actorId: string): Promise<LockedTripRow> {
  const peek = await tx.trip.findUnique({ where: { id: tripId }, select: { ownerId: true } });
  if (!peek) {
    // Cannot happen in practice (the pre-transaction authz call already
    // proved the trip exists) - defensive only, mirrors every other
    // "impossible but checked" guard in this codebase.
    throw new ConflictException({ code: TRIP_ERROR_CODES.TRIP_NOT_FOUND, message: 'Trip not found.' });
  }

  if (peek.ownerId !== actorId) {
    const memberRows = await tx.$queryRaw<LockedMemberRow[]>`
      SELECT "id", "role" FROM "TripMember" WHERE "tripId" = ${tripId} AND "userId" = ${actorId} FOR UPDATE
    `;
    const member = memberRows[0];
    if (!member || member.role !== 'EDITOR') {
      throw new ForbiddenException({ code: TRIP_ERROR_CODES.TRIP_PERMISSION_DENIED, message: 'You do not have permission to perform this action on this trip.' });
    }
  }

  const tripRows = await tx.$queryRaw<LockedTripRow[]>`
    SELECT "id", "ownerId", "archivedAt" FROM "Trip" WHERE "id" = ${tripId} FOR UPDATE
  `;
  const trip = tripRows[0];
  if (!trip) {
    throw new ConflictException({ code: TRIP_ERROR_CODES.TRIP_NOT_FOUND, message: 'Trip not found.' });
  }
  if (trip.archivedAt) {
    throw new ConflictException({ code: TRIP_ERROR_CODES.TRIP_ARCHIVED, message: 'This trip is archived and read-only - the expense ledger cannot be changed.' });
  }

  return trip;
}

/** Any `User` currently financially participating in this trip - owner or an accepted TripMember of any role (spec section 22/24). Plain read (no lock) - see pre-implementation report section 12 for why only the ACTOR's own authority needs the FOR UPDATE treatment above. */
export async function isCurrentTripParticipant(tx: Prisma.TransactionClient, tripId: string, ownerId: string, userId: string): Promise<boolean> {
  if (userId === ownerId) return true;
  const member = await tx.tripMember.findUnique({ where: { tripId_userId: { tripId, userId } } });
  return member !== null;
}

function isDeadlockOrWriteConflict(err: unknown): boolean {
  // Prisma's own recognized code for "transaction failed due to a write
  // conflict or a deadlock - please retry."
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') return true;
  // A raw PostgreSQL deadlock (SQLSTATE 40P01) surfaces as an UNKNOWN
  // request error (not P2034) when it comes from the underlying connector
  // rather than Prisma's own conflict detection - observed live against
  // this exact lock-ordering tension (see the class doc comment above).
  if (err instanceof Prisma.PrismaClientUnknownRequestError && err.message.includes('deadlock detected')) return true;
  return false;
}

/**
 * A single automatic retry on a genuine PostgreSQL deadlock/write-conflict
 * - a narrow-window safety net for the lock-order tension documented above
 * (with `transferOwnership`, which this module cannot fully eliminate
 * without touching locked G07 code). Never retries any other error
 * (business-rule rejections must surface immediately, not be silently
 * retried).
 */
export async function withDeadlockRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isDeadlockOrWriteConflict(err)) {
      return fn();
    }
    throw err;
  }
}
