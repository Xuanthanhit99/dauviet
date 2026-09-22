import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityKind } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TRIP_ERROR_CODES } from '../../common/errors/trip-error-codes';
import { TripAuthorizationService, TripCapability } from './trip-authorization.service';
import { TripCollaborationEventService } from './trip-collaboration-event.service';
import { LeaveTripDto, RemoveTripMemberDto, TransferTripOwnershipDto, UpdateTripMemberRoleDto } from './dto/trip-collaboration.dto';

/**
 * Membership lifecycle (spec sections 26-31/56/87/88) - every mutation here
 * is a single atomic Prisma transaction, and ownership transfer specifically
 * uses a conditional `updateMany` (WHERE ownerId = <current> AND version =
 * <expected>) rather than a read-then-write pair, so the one-owner
 * invariant holds under real concurrent requests, not just in the common
 * case (spec section 31/37 - proven live in the E2E suite, not just
 * documented).
 */
@Injectable()
export class TripMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly authz: TripAuthorizationService,
    private readonly collaborationEvents: TripCollaborationEventService,
  ) {}

  /** Accepted members + owner may view the list (spec section 26) - VIEW_TRIP is the lowest capability, held by everyone with any relationship to the trip. */
  async list(tripId: string, userId: string) {
    await this.authz.authorize(tripId, userId, TripCapability.VIEW_TRIP);
    return this.prisma.tripMember.findMany({
      where: { tripId },
      include: { user: { select: { id: true, displayName: true, avatarMediaId: true } } },
      orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
    });
  }

  /** OWNER only (spec section 27) - EDITOR/VIEWER structurally cannot reach this: MANAGE_MEMBERS is not in either role's capability set. Self-promotion is structurally impossible too - the owner has no TripMember row to target in the first place. */
  async updateRole(tripId: string, memberId: string, userId: string, dto: UpdateTripMemberRoleDto) {
    const { trip } = await this.authz.authorize(tripId, userId, TripCapability.MANAGE_MEMBERS);
    if (trip.version !== dto.expectedVersion) {
      throw new ConflictException({ code: TRIP_ERROR_CODES.TRIP_VERSION_CONFLICT, message: 'This trip changed since you last read it - reload and retry.' });
    }
    const member = await this.prisma.tripMember.findFirst({ where: { id: memberId, tripId } });
    if (!member) throw new NotFoundException({ code: TRIP_ERROR_CODES.TRIP_MEMBER_NOT_FOUND, message: 'Trip member not found.' });

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.tripMember.update({ where: { id: memberId }, data: { role: dto.role } });
      await tx.trip.update({ where: { id: tripId }, data: { version: { increment: 1 } } });
      await this.audit.log({ actorId: userId, action: 'tripMember.roleChanged', entityType: EntityKind.TRIP_MEMBER, entityId: memberId, metadata: { newRole: dto.role } }, tx);
      await this.collaborationEvents.record({ tripId, type: 'ROLE_CHANGED', actorUserId: userId, metadata: { memberUserId: member.userId, newRole: dto.role } }, tx);
      return updated;
    });
  }

  /** OWNER only. Structurally can never target the owner (no TripMember row exists for them) - spec section 87's invariant holds by construction, not by an extra runtime check. */
  async remove(tripId: string, memberId: string, userId: string, dto: RemoveTripMemberDto) {
    const { trip } = await this.authz.authorize(tripId, userId, TripCapability.MANAGE_MEMBERS);
    if (trip.version !== dto.expectedVersion) {
      throw new ConflictException({ code: TRIP_ERROR_CODES.TRIP_VERSION_CONFLICT, message: 'This trip changed since you last read it - reload and retry.' });
    }
    const member = await this.prisma.tripMember.findFirst({ where: { id: memberId, tripId } });
    if (!member) throw new NotFoundException({ code: TRIP_ERROR_CODES.TRIP_MEMBER_NOT_FOUND, message: 'Trip member not found.' });

    return this.prisma.$transaction(async (tx) => {
      await tx.tripMember.delete({ where: { id: memberId } });
      await tx.trip.update({ where: { id: tripId }, data: { version: { increment: 1 } } });
      await this.audit.log({ actorId: userId, action: 'tripMember.removed', entityType: EntityKind.TRIP_MEMBER, entityId: memberId, metadata: { removedUserId: member.userId } }, tx);
      // Collaboration/audit history is NOT deleted with the member (spec
      // section 28) - only the TripMember row itself is removed; every
      // prior TripCollaborationEvent naming this member (by actorUserId
      // soft-reference, or in another event's metadata) survives untouched.
      await this.collaborationEvents.record({ tripId, type: 'MEMBER_REMOVED', actorUserId: userId, metadata: { removedUserId: member.userId } }, tx);
      return { removed: true };
    });
  }

  /** Voluntary self-removal (spec section 29). Owner cannot leave while still owner - an explicit check, since (unlike remove/updateRole) this route needs no MANAGE_MEMBERS capability at all, so the "owner has no TripMember row" structural guard doesn't automatically fire here the way it does for remove/updateRole. */
  async leave(tripId: string, userId: string, dto: LeaveTripDto) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException({ code: TRIP_ERROR_CODES.TRIP_NOT_FOUND, message: 'Trip not found.' });
    if (trip.ownerId === userId) {
      throw new ForbiddenException({ code: TRIP_ERROR_CODES.TRIP_OWNER_CANNOT_LEAVE, message: 'The owner cannot leave their own trip - transfer ownership first.' });
    }
    if (trip.version !== dto.expectedVersion) {
      throw new ConflictException({ code: TRIP_ERROR_CODES.TRIP_VERSION_CONFLICT, message: 'This trip changed since you last read it - reload and retry.' });
    }
    const member = await this.prisma.tripMember.findUnique({ where: { tripId_userId: { tripId, userId } } });
    if (!member) throw new NotFoundException({ code: TRIP_ERROR_CODES.TRIP_MEMBER_NOT_FOUND, message: 'You are not a member of this trip.' });

    return this.prisma.$transaction(async (tx) => {
      await tx.tripMember.delete({ where: { id: member.id } });
      await tx.trip.update({ where: { id: tripId }, data: { version: { increment: 1 } } });
      await this.audit.log({ actorId: userId, action: 'tripMember.left', entityType: EntityKind.TRIP_MEMBER, entityId: member.id }, tx);
      await this.collaborationEvents.record({ tripId, type: 'MEMBER_LEFT', actorUserId: userId }, tx);
      return { left: true };
    });
  }

  /**
   * Ownership transfer (spec section 30/31) - the one operation in this
   * service proven under real concurrent PostgreSQL load. The conditional
   * `updateMany` below is the entire safety mechanism: its WHERE clause
   * re-checks BOTH "the caller is still the current owner" AND "the version
   * is still what they last read" atomically, as part of the single UPDATE
   * statement. Two concurrent transfer attempts with the same starting
   * version can never both succeed - whichever commits first changes
   * `ownerId`/`version`, so the second's WHERE clause matches zero rows and
   * it fails with `TRIP_VERSION_CONFLICT`, never a corrupted two-owner or
   * zero-owner state.
   */
  async transferOwnership(tripId: string, userId: string, dto: TransferTripOwnershipDto) {
    await this.authz.authorize(tripId, userId, TripCapability.TRANSFER_OWNERSHIP);

    // A self-transfer (dto.newOwnerUserId === userId) is never valid here by
    // construction, with no special-cased branch needed: the
    // target-must-be-an-existing-member check just below always rejects it,
    // since the owner never has a TripMember row of their own (spec section
    // 7/31) - surfaced with the same not-a-member code rather than inventing
    // an "idempotent no-op" branch the brief did not ask for.
    return this.prisma.$transaction(async (tx) => {
      const targetMember = await tx.tripMember.findUnique({ where: { tripId_userId: { tripId, userId: dto.newOwnerUserId } } });
      if (!targetMember) {
        throw new BadRequestException({
          code: TRIP_ERROR_CODES.TRIP_OWNERSHIP_TRANSFER_TARGET_NOT_MEMBER,
          message: 'Ownership can only be transferred to an existing accepted member of this trip.',
        });
      }

      const result = await tx.trip.updateMany({
        where: { id: tripId, ownerId: userId, version: dto.expectedVersion },
        data: { ownerId: dto.newOwnerUserId, version: { increment: 1 } },
      });
      if (result.count !== 1) {
        throw new ConflictException({ code: TRIP_ERROR_CODES.TRIP_VERSION_CONFLICT, message: 'This trip changed since you last read it (ownership may have already been transferred) - reload and retry.' });
      }

      // New owner is never also a TripMember row (spec section 7) - remove
      // their membership row now that they hold `Trip.ownerId` directly.
      await tx.tripMember.delete({ where: { id: targetMember.id } });
      // Old owner receives a deterministic resulting role, EDITOR (spec
      // section 30) - so they keep trip access instead of being silently
      // locked out of a trip they just owned.
      await tx.tripMember.create({ data: { tripId, userId, role: 'EDITOR' } });

      await this.audit.log(
        { actorId: userId, action: 'trip.ownershipTransferred', entityType: EntityKind.TRIP, entityId: tripId, metadata: { previousOwnerId: userId, newOwnerId: dto.newOwnerUserId } },
        tx,
      );
      await this.collaborationEvents.record(
        { tripId, type: 'OWNERSHIP_TRANSFERRED', actorUserId: userId, metadata: { previousOwnerId: userId, newOwnerId: dto.newOwnerUserId } },
        tx,
      );

      return tx.trip.findUniqueOrThrow({ where: { id: tripId } });
    });
  }
}
