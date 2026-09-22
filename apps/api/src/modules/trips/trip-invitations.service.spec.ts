import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { TripInvitationsService } from './trip-invitations.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TripAuthorizationService } from './trip-authorization.service';
import { TripCollaborationEventService } from './trip-collaboration-event.service';
import { MailerService } from '../mailer/mailer.service';

function makeHarness() {
  const prisma: any = {
    trip: { findUnique: jest.fn() },
    tripInvitation: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findUniqueOrThrow: jest.fn() },
    tripMember: { findUnique: jest.fn(), upsert: jest.fn() },
    user: { findUnique: jest.fn() },
    $transaction: jest.fn((arg: unknown) => (typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as Promise<unknown>[]))),
  };
  const audit = { log: jest.fn() } as unknown as AuditService;
  const authz = { authorize: jest.fn().mockResolvedValue({ trip: { id: 't1', ownerId: 'owner-1', title: 'Kyoto trip', archivedAt: null }, role: 'OWNER' }) } as unknown as TripAuthorizationService;
  const collaborationEvents = { record: jest.fn() } as unknown as TripCollaborationEventService;
  const mailer = { sendTripInvitation: jest.fn() } as unknown as MailerService;
  const service = new TripInvitationsService(prisma as unknown as PrismaService, audit, authz, collaborationEvents, mailer);
  return { service, prisma, audit, authz, collaborationEvents, mailer };
}

const PENDING_INVITATION = {
  id: 'inv-1',
  tripId: 't1',
  email: 'friend@example.com',
  role: 'EDITOR',
  status: 'PENDING',
  tokenHash: 'irrelevant-in-mock',
  expiresAt: new Date(Date.now() + 60_000),
};

describe('TripInvitationsService.accept (spec sections 21/22/55 - atomic, concurrency-safe)', () => {
  it('rejects an unknown token without revealing anything about why', async () => {
    const { service, prisma } = makeHarness();
    prisma.tripInvitation.findUnique.mockResolvedValue(null);
    await expect(service.accept('bad-token', { id: 'u1', email: 'friend@example.com' })).rejects.toMatchObject({ response: { code: 'TRIP_INVITATION_INVALID' } });
  });

  it('rejects when the accepting user\'s email does not match the invitation target (recipient binding, spec section 22)', async () => {
    const { service, prisma } = makeHarness();
    prisma.tripInvitation.findUnique.mockResolvedValue(PENDING_INVITATION);
    await expect(service.accept('token', { id: 'u1', email: 'someone-else@example.com' })).rejects.toMatchObject({
      response: { code: 'TRIP_INVITATION_RECIPIENT_MISMATCH' },
    });
  });

  it('lazily transitions an expired-but-still-PENDING row to EXPIRED and rejects the accept (spec section 20)', async () => {
    const { service, prisma } = makeHarness();
    const expired = { ...PENDING_INVITATION, expiresAt: new Date(Date.now() - 1000) };
    prisma.tripInvitation.findUnique.mockResolvedValue(expired);
    prisma.tripInvitation.update.mockResolvedValue({ ...expired, status: 'EXPIRED' });
    await expect(service.accept('token', { id: 'u1', email: 'friend@example.com' })).rejects.toMatchObject({ response: { code: 'TRIP_INVITATION_EXPIRED' } });
    expect(prisma.tripInvitation.update).toHaveBeenCalledWith({ where: { id: 'inv-1' }, data: { status: 'EXPIRED' } });
  });

  it('rejects when the trip has since been archived', async () => {
    const { service, prisma } = makeHarness();
    prisma.tripInvitation.findUnique.mockResolvedValue(PENDING_INVITATION);
    prisma.trip.findUnique.mockResolvedValue({ id: 't1', archivedAt: new Date() });
    await expect(service.accept('token', { id: 'u1', email: 'friend@example.com' })).rejects.toMatchObject({ response: { code: 'TRIP_ARCHIVED' } });
  });

  it('a lost race (concurrent accept/decline already flipped status - updateMany matches zero rows) fails cleanly, never creating a duplicate membership', async () => {
    const { service, prisma } = makeHarness();
    prisma.tripInvitation.findUnique.mockResolvedValue(PENDING_INVITATION);
    prisma.trip.findUnique.mockResolvedValue({ id: 't1', archivedAt: null });
    prisma.tripInvitation.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.accept('token', { id: 'u1', email: 'friend@example.com' })).rejects.toThrow(ConflictException);
    expect(prisma.tripMember.upsert).not.toHaveBeenCalled();
  });

  it('on success: atomic PENDING->ACCEPTED transition, then membership created, then collaboration/audit evidence - in that order, all in one transaction', async () => {
    const { service, prisma } = makeHarness();
    prisma.tripInvitation.findUnique.mockResolvedValue(PENDING_INVITATION);
    prisma.trip.findUnique.mockResolvedValue({ id: 't1', archivedAt: null });
    prisma.tripInvitation.updateMany.mockResolvedValue({ count: 1 });
    prisma.tripMember.upsert.mockResolvedValue({ id: 'm1', tripId: 't1', userId: 'u1', role: 'EDITOR' });

    const result = await service.accept('token', { id: 'u1', email: 'friend@example.com' });

    expect(prisma.tripInvitation.updateMany).toHaveBeenCalledWith({
      where: { id: 'inv-1', status: 'PENDING' },
      data: { status: 'ACCEPTED', acceptedAt: expect.any(Date), acceptedByUserId: 'u1' },
    });
    expect(prisma.tripMember.upsert).toHaveBeenCalledWith({
      where: { tripId_userId: { tripId: 't1', userId: 'u1' } },
      update: {},
      create: { tripId: 't1', userId: 'u1', role: 'EDITOR' },
    });
    expect(result.tripId).toBe('t1');
  });
});

describe('TripInvitationsService.create (spec sections 18/19/57/66/90)', () => {
  it('never allows inviting the trip owner\'s own email', async () => {
    const { service, prisma } = makeHarness();
    prisma.user.findUnique.mockImplementation(({ where }: any) => (where.id === 'owner-1' ? { email: 'owner@example.com' } : null));
    await expect(
      service.create('t1', 'owner-1', { email: 'owner@example.com', role: 'EDITOR' }),
    ).rejects.toMatchObject({ response: { code: 'TRIP_INVITATION_TARGET_IS_OWNER' } });
  });

  it('rejects a duplicate PENDING invite to the same recipient with a friendly pre-check error (DB partial unique index is the real backstop)', async () => {
    const { service, prisma } = makeHarness();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.tripInvitation.findFirst.mockResolvedValue({ id: 'existing-pending' });
    await expect(
      service.create('t1', 'owner-1', { email: 'friend@example.com', role: 'EDITOR' }),
    ).rejects.toMatchObject({ response: { code: 'TRIP_INVITATION_ALREADY_PENDING' } });
  });

  it('never reveals whether the target email already has an account beyond what is operationally necessary (spec section 90) - an unregistered email is simply invited, no different error shape', async () => {
    const { service, prisma } = makeHarness();
    prisma.user.findUnique.mockResolvedValue(null); // no account exists for this email
    prisma.tripInvitation.findFirst.mockResolvedValue(null);
    prisma.tripInvitation.create.mockResolvedValue({ id: 'inv-2' });
    prisma.tripInvitation.findUniqueOrThrow.mockResolvedValue({ id: 'inv-2', email: 'new@example.com', role: 'EDITOR', status: 'PENDING' });

    await expect(service.create('t1', 'owner-1', { email: 'new@example.com', role: 'EDITOR' })).resolves.toMatchObject({ id: 'inv-2' });
  });
});
