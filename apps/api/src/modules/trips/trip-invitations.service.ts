import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes, createHash } from 'node:crypto';
import { EntityKind, Prisma, TripInvitation } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailerService } from '../mailer/mailer.service';
import { TRIP_ERROR_CODES } from '../../common/errors/trip-error-codes';
import { TripAuthorizationService, TripCapability } from './trip-authorization.service';
import { TripCollaborationEventService } from './trip-collaboration-event.service';
import { CreateTripInvitationDto } from './dto/trip-collaboration.dto';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Never select tokenHash for anything returned to a client (spec section 16/75). */
const SAFE_INVITATION_SELECT = {
  id: true,
  tripId: true,
  inviterId: true,
  email: true,
  role: true,
  status: true,
  expiresAt: true,
  acceptedAt: true,
  acceptedByUserId: true,
  declinedAt: true,
  revokedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Invitation lifecycle (spec sections 13-25/55-58). Token handling
 * duplicates `AuthService`'s exact opaque-token/SHA-256-hash pattern
 * locally (see docs/backend/G07_PRE_IMPLEMENTATION_REPORT.md section 4) -
 * `AuthService` itself is locked Phase-02 code, not touched here.
 * Acceptance/decline use a conditional `updateMany` (WHERE status =
 * PENDING), never a read-then-write pair, so two concurrent requests for
 * the same token can never both succeed (spec section 55).
 */
@Injectable()
export class TripInvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly authz: TripAuthorizationService,
    private readonly collaborationEvents: TripCollaborationEventService,
    private readonly mailer: MailerService,
  ) {}

  private generateToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  /** Lazily transitions a stale PENDING row to EXPIRED at touch time (spec section 20 - "lazy status transition is acceptable if documented") - never requires a background scheduler. */
  private async touchExpiry(invitation: TripInvitation, db: Prisma.TransactionClient | PrismaService = this.prisma): Promise<TripInvitation> {
    if (invitation.status === 'PENDING' && invitation.expiresAt < new Date()) {
      return db.tripInvitation.update({ where: { id: invitation.id }, data: { status: 'EXPIRED' } });
    }
    return invitation;
  }

  async create(tripId: string, userId: string, dto: CreateTripInvitationDto) {
    const { trip } = await this.authz.authorize(tripId, userId, TripCapability.MANAGE_INVITATIONS);
    if (trip.archivedAt) {
      throw new ConflictException({ code: TRIP_ERROR_CODES.TRIP_ARCHIVED, message: 'This trip is archived and read-only.' });
    }

    const email = this.normalizeEmail(dto.email);
    const owner = await this.prisma.user.findUnique({ where: { id: trip.ownerId }, select: { email: true } });
    if (owner && this.normalizeEmail(owner.email) === email) {
      throw new BadRequestException({ code: TRIP_ERROR_CODES.TRIP_INVITATION_TARGET_IS_OWNER, message: 'The trip owner is already the owner - cannot invite them as a member.' });
    }

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      const existingMember = await this.prisma.tripMember.findUnique({ where: { tripId_userId: { tripId, userId: existingUser.id } } });
      if (existingMember) {
        throw new BadRequestException({ code: TRIP_ERROR_CODES.TRIP_INVITATION_TARGET_ALREADY_MEMBER, message: 'This user is already a member of this trip.' });
      }
    }

    // Deterministic duplicate behavior (spec section 18): a repeated invite
    // to the same still-pending recipient is rejected with a specific code
    // rather than silently spamming a second email - the partial unique
    // index (WHERE status = 'PENDING') is the real database backstop; this
    // pre-check just gives a friendly, specific error before hitting it.
    const existingPending = await this.prisma.tripInvitation.findFirst({ where: { tripId, email, status: 'PENDING' } });
    if (existingPending) {
      throw new ConflictException({ code: TRIP_ERROR_CODES.TRIP_INVITATION_ALREADY_PENDING, message: 'A pending invitation already exists for this email on this trip.' });
    }

    const token = this.generateToken();
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

    let invitation: TripInvitation;
    try {
      invitation = await this.prisma.$transaction(async (tx) => {
        const created = await tx.tripInvitation.create({
          data: { tripId, inviterId: userId, email, role: dto.role, tokenHash, expiresAt },
        });
        await this.audit.log({ actorId: userId, action: 'tripInvitation.created', entityType: EntityKind.TRIP_INVITATION, entityId: created.id, metadata: { email, role: dto.role } }, tx);
        return created;
      });
    } catch (err) {
      // Database backstop (spec section 56/57/58) - the partial unique
      // index rejects a race the pre-check above could not see.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({ code: TRIP_ERROR_CODES.TRIP_INVITATION_ALREADY_PENDING, message: 'A pending invitation already exists for this email on this trip.' });
      }
      throw err;
    }

    // Email delivery never blocks/breaks membership correctness (spec
    // section 49) - `MailerService.send` already swallows/logs failures
    // internally rather than throwing.
    await this.mailer.sendTripInvitation(email, token, trip.title);

    return this.prisma.tripInvitation.findUniqueOrThrow({ where: { id: invitation.id }, select: SAFE_INVITATION_SELECT });
  }

  async list(tripId: string, userId: string, status?: string) {
    await this.authz.authorize(tripId, userId, TripCapability.MANAGE_INVITATIONS);
    return this.prisma.tripInvitation.findMany({
      where: { tripId, status: status as any },
      select: SAFE_INVITATION_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  async revoke(tripId: string, invitationId: string, userId: string) {
    await this.authz.authorize(tripId, userId, TripCapability.MANAGE_INVITATIONS);
    const invitation = await this.prisma.tripInvitation.findFirst({ where: { id: invitationId, tripId } });
    if (!invitation) throw new NotFoundException({ code: TRIP_ERROR_CODES.TRIP_INVITATION_NOT_FOUND, message: 'Invitation not found.' });

    // Atomic conditional transition (spec section 24/55/56) - only a
    // currently-PENDING row can be revoked; a concurrent accept/decline
    // racing this call is resolved by whichever `updateMany` commits first.
    const result = await this.prisma.tripInvitation.updateMany({
      where: { id: invitationId, status: 'PENDING' },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });
    if (result.count !== 1) {
      throw new ConflictException({ code: TRIP_ERROR_CODES.TRIP_INVITATION_NOT_PENDING, message: 'This invitation is no longer pending.' });
    }
    await this.audit.log({ actorId: userId, action: 'tripInvitation.revoked', entityType: EntityKind.TRIP_INVITATION, entityId: invitationId });
    return this.prisma.tripInvitation.findUniqueOrThrow({ where: { id: invitationId }, select: SAFE_INVITATION_SELECT });
  }

  /**
   * Accept (spec section 21/22/55). Fully atomic: token validated ->
   * recipient bound -> membership created -> invitation marked ACCEPTED ->
   * collaboration/audit evidence written, all in one transaction. The
   * `updateMany` WHERE-status=PENDING guard is what actually makes
   * concurrent double-accept impossible (spec section 55) - not the
   * earlier read, which only produces a fast, friendly rejection for the
   * common (non-racing) case.
   */
  async accept(rawToken: string, actingUser: { id: string; email: string }) {
    const tokenHash = this.hashToken(rawToken);
    let invitation = await this.prisma.tripInvitation.findUnique({ where: { tokenHash } });
    if (!invitation) throw new BadRequestException({ code: TRIP_ERROR_CODES.TRIP_INVITATION_INVALID, message: 'Invalid invitation token.' });

    invitation = await this.touchExpiry(invitation);
    if (invitation.status === 'EXPIRED') {
      throw new BadRequestException({ code: TRIP_ERROR_CODES.TRIP_INVITATION_EXPIRED, message: 'This invitation has expired.' });
    }
    if (invitation.status !== 'PENDING') {
      throw new BadRequestException({ code: TRIP_ERROR_CODES.TRIP_INVITATION_NOT_PENDING, message: 'This invitation is no longer pending.' });
    }

    // Recipient binding (spec section 22) - the authenticated user accepting
    // must own the exact email the invitation targeted. Never let any
    // logged-in user accept a leaked invitation meant for someone else.
    if (this.normalizeEmail(actingUser.email) !== invitation.email) {
      throw new ForbiddenException({ code: TRIP_ERROR_CODES.TRIP_INVITATION_RECIPIENT_MISMATCH, message: 'This invitation was issued to a different email address.' });
    }

    const trip = await this.prisma.trip.findUnique({ where: { id: invitation.tripId } });
    if (!trip) throw new NotFoundException({ code: TRIP_ERROR_CODES.TRIP_NOT_FOUND, message: 'Trip not found.' });
    if (trip.archivedAt) {
      throw new ConflictException({ code: TRIP_ERROR_CODES.TRIP_ARCHIVED, message: 'This trip is archived and read-only - the invitation can no longer be accepted.' });
    }

    return this.prisma.$transaction(async (tx) => {
      const transition = await tx.tripInvitation.updateMany({
        where: { id: invitation!.id, status: 'PENDING' },
        data: { status: 'ACCEPTED', acceptedAt: new Date(), acceptedByUserId: actingUser.id },
      });
      if (transition.count !== 1) {
        // Lost the race to a concurrent accept/decline/revoke (spec section
        // 55) - never create a duplicate membership.
        throw new ConflictException({ code: TRIP_ERROR_CODES.TRIP_INVITATION_NOT_PENDING, message: 'This invitation is no longer pending.' });
      }

      // Database uniqueness backstops this too (spec section 56) -
      // `@@unique([tripId, userId])` - but by this point the invitation
      // transition above already guarantees only one caller reaches here
      // per token.
      const member = await tx.tripMember.upsert({
        where: { tripId_userId: { tripId: invitation!.tripId, userId: actingUser.id } },
        update: {},
        create: { tripId: invitation!.tripId, userId: actingUser.id, role: invitation!.role },
      });

      await this.audit.log({ actorId: actingUser.id, action: 'tripInvitation.accepted', entityType: EntityKind.TRIP_INVITATION, entityId: invitation!.id }, tx);
      await this.collaborationEvents.record({ tripId: invitation!.tripId, type: 'INVITATION_ACCEPTED', actorUserId: actingUser.id, metadata: { role: invitation!.role } }, tx);
      await this.collaborationEvents.record({ tripId: invitation!.tripId, type: 'MEMBER_JOINED', actorUserId: actingUser.id, metadata: { role: invitation!.role } }, tx);

      return { tripId: invitation!.tripId, member };
    });
  }

  async decline(rawToken: string, actingUser: { id: string; email: string }) {
    const tokenHash = this.hashToken(rawToken);
    let invitation = await this.prisma.tripInvitation.findUnique({ where: { tokenHash } });
    if (!invitation) throw new BadRequestException({ code: TRIP_ERROR_CODES.TRIP_INVITATION_INVALID, message: 'Invalid invitation token.' });

    invitation = await this.touchExpiry(invitation);
    if (invitation.status === 'EXPIRED') {
      throw new BadRequestException({ code: TRIP_ERROR_CODES.TRIP_INVITATION_EXPIRED, message: 'This invitation has expired.' });
    }
    if (this.normalizeEmail(actingUser.email) !== invitation.email) {
      throw new ForbiddenException({ code: TRIP_ERROR_CODES.TRIP_INVITATION_RECIPIENT_MISMATCH, message: 'This invitation was issued to a different email address.' });
    }

    const result = await this.prisma.tripInvitation.updateMany({
      where: { id: invitation.id, status: 'PENDING' },
      data: { status: 'DECLINED', declinedAt: new Date() },
    });
    if (result.count !== 1) {
      throw new ConflictException({ code: TRIP_ERROR_CODES.TRIP_INVITATION_NOT_PENDING, message: 'This invitation is no longer pending.' });
    }
    await this.audit.log({ actorId: actingUser.id, action: 'tripInvitation.declined', entityType: EntityKind.TRIP_INVITATION, entityId: invitation.id });
    return { declined: true };
  }
}
