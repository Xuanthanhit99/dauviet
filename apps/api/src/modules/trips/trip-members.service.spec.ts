import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { TripMembersService } from './trip-members.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TripAuthorizationService } from './trip-authorization.service';
import { TripCollaborationEventService } from './trip-collaboration-event.service';

function makeHarness() {
  const prisma: any = {
    trip: { findUnique: jest.fn(), updateMany: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn() },
    tripMember: { findUnique: jest.fn(), findFirst: jest.fn(), delete: jest.fn(), create: jest.fn(), update: jest.fn() },
    // G08 - remove()/leave() location-sharing termination hook (see
    // docs/backend/G08_PRE_IMPLEMENTATION_REPORT.md section 12). Default:
    // no ACTIVE sharing existed for the affected member.
    $executeRaw: jest.fn().mockResolvedValue(0),
    tripLocationSharing: { findUnique: jest.fn().mockResolvedValue(null) },
    tripMemberLocation: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    $transaction: jest.fn((arg: unknown) => (typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as Promise<unknown>[]))),
  };
  const audit = { log: jest.fn() } as unknown as AuditService;
  const authz = { authorize: jest.fn().mockResolvedValue({ trip: { id: 't1', ownerId: 'owner-1', version: 0 }, role: 'OWNER' }) } as unknown as TripAuthorizationService;
  const collaborationEvents = { record: jest.fn() } as unknown as TripCollaborationEventService;
  const service = new TripMembersService(prisma as unknown as PrismaService, audit, authz, collaborationEvents);
  return { service, prisma, audit, authz, collaborationEvents };
}

describe('TripMembersService.leave (spec section 29)', () => {
  it('the owner cannot leave their own trip - explicit check, since MANAGE_MEMBERS gating does not apply to this self-service route', async () => {
    const { service, prisma } = makeHarness();
    prisma.trip.findUnique.mockResolvedValue({ id: 't1', ownerId: 'owner-1', version: 0 });
    await expect(service.leave('t1', 'owner-1', { expectedVersion: 0 })).rejects.toMatchObject({
      response: { code: 'TRIP_OWNER_CANNOT_LEAVE' },
    });
  });

  it('a non-member gets TRIP_MEMBER_NOT_FOUND, not a silent no-op', async () => {
    const { service, prisma } = makeHarness();
    prisma.trip.findUnique.mockResolvedValue({ id: 't1', ownerId: 'owner-1', version: 0 });
    prisma.tripMember.findUnique.mockResolvedValue(null);
    await expect(service.leave('t1', 'stranger', { expectedVersion: 0 })).rejects.toThrow(NotFoundException);
  });

  it('a stale expectedVersion produces TRIP_VERSION_CONFLICT before ever touching membership', async () => {
    const { service, prisma } = makeHarness();
    prisma.trip.findUnique.mockResolvedValue({ id: 't1', ownerId: 'owner-1', version: 5 });
    await expect(service.leave('t1', 'editor-1', { expectedVersion: 3 })).rejects.toMatchObject({ response: { code: 'TRIP_VERSION_CONFLICT' } });
    expect(prisma.tripMember.findUnique).not.toHaveBeenCalled();
  });

  it('on success: removes the TripMember row (G08 - also terminates location sharing for the leaving user first, in the same transaction; a no-op here since none was ACTIVE)', async () => {
    const { service, prisma, collaborationEvents } = makeHarness();
    prisma.trip.findUnique.mockResolvedValue({ id: 't1', ownerId: 'owner-1', version: 0 });
    prisma.tripMember.findUnique.mockResolvedValue({ id: 'm1', tripId: 't1', userId: 'editor-1', role: 'EDITOR' });

    const result = await service.leave('t1', 'editor-1', { expectedVersion: 0 });

    expect(prisma.$executeRaw).toHaveBeenCalled();
    expect(prisma.tripMemberLocation.deleteMany).toHaveBeenCalledWith({ where: { tripId: 't1', userId: 'editor-1' } });
    // No TripLocationSharing row existed - $executeRaw returned 0 - so no
    // extra tripLocationSharing.terminated audit entry is written.
    expect(prisma.tripLocationSharing.findUnique).not.toHaveBeenCalled();
    expect(prisma.tripMember.delete).toHaveBeenCalledWith({ where: { id: 'm1' } });
    expect(collaborationEvents.record).toHaveBeenCalledWith(expect.objectContaining({ type: 'MEMBER_LEFT' }), prisma);
    expect(result).toEqual({ left: true });
  });

  it('G08: when the leaving user had an ACTIVE sharing session, it is stopped and audited in the same transaction as the leave', async () => {
    const { service, prisma, audit } = makeHarness();
    prisma.trip.findUnique.mockResolvedValue({ id: 't1', ownerId: 'owner-1', version: 0 });
    prisma.tripMember.findUnique.mockResolvedValue({ id: 'm1', tripId: 't1', userId: 'editor-1', role: 'EDITOR' });
    prisma.$executeRaw.mockResolvedValue(1); // one ACTIVE TripLocationSharing row was stopped
    prisma.tripLocationSharing.findUnique.mockResolvedValue({ id: 'sharing-1', tripId: 't1', userId: 'editor-1' });

    await service.leave('t1', 'editor-1', { expectedVersion: 0 });

    expect(prisma.tripMemberLocation.deleteMany).toHaveBeenCalledWith({ where: { tripId: 't1', userId: 'editor-1' } });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'editor-1', action: 'tripLocationSharing.terminated', entityId: 'sharing-1', metadata: { reason: 'MEMBER_LEFT' } }),
      prisma,
    );
  });
});

describe('TripMembersService.remove (spec sections 27/87 - owner-only)', () => {
  it('on success: removes the target TripMember row (G08 - also terminates their location sharing first, in the same transaction)', async () => {
    const { service, prisma, collaborationEvents } = makeHarness();
    prisma.tripMember.findFirst.mockResolvedValue({ id: 'm1', tripId: 't1', userId: 'editor-1', role: 'EDITOR' });

    const result = await service.remove('t1', 'm1', 'owner-1', { expectedVersion: 0 });

    expect(prisma.$executeRaw).toHaveBeenCalled();
    expect(prisma.tripMemberLocation.deleteMany).toHaveBeenCalledWith({ where: { tripId: 't1', userId: 'editor-1' } });
    expect(prisma.tripMember.delete).toHaveBeenCalledWith({ where: { id: 'm1' } });
    expect(collaborationEvents.record).toHaveBeenCalledWith(expect.objectContaining({ type: 'MEMBER_REMOVED' }), prisma);
    expect(result).toEqual({ removed: true });
  });

  it('G08: when the removed member had an ACTIVE sharing session, it is stopped and audited with reason MEMBER_REMOVED, actor is the remover (not the removed member)', async () => {
    const { service, prisma, audit } = makeHarness();
    prisma.tripMember.findFirst.mockResolvedValue({ id: 'm1', tripId: 't1', userId: 'editor-1', role: 'EDITOR' });
    prisma.$executeRaw.mockResolvedValue(1);
    prisma.tripLocationSharing.findUnique.mockResolvedValue({ id: 'sharing-1', tripId: 't1', userId: 'editor-1' });

    await service.remove('t1', 'm1', 'owner-1', { expectedVersion: 0 });

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'owner-1', action: 'tripLocationSharing.terminated', entityId: 'sharing-1', metadata: { reason: 'MEMBER_REMOVED' } }),
      prisma,
    );
  });
});

describe('TripMembersService.transferOwnership (spec sections 30/31/37/55 - the one-owner invariant)', () => {
  it('rejects a transfer target who is not an existing accepted member', async () => {
    const { service, prisma } = makeHarness();
    prisma.tripMember.findUnique.mockResolvedValue(null);
    await expect(service.transferOwnership('t1', 'owner-1', { newOwnerUserId: 'not-a-member', expectedVersion: 0 })).rejects.toThrow(BadRequestException);
    expect(prisma.trip.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a self-transfer the same way as any other non-member target (owner has no TripMember row of their own)', async () => {
    const { service, prisma } = makeHarness();
    prisma.tripMember.findUnique.mockResolvedValue(null); // owner is never a member row - lookup for their own id finds nothing
    await expect(service.transferOwnership('t1', 'owner-1', { newOwnerUserId: 'owner-1', expectedVersion: 0 })).rejects.toMatchObject({
      response: { code: 'TRIP_OWNERSHIP_TRANSFER_TARGET_NOT_MEMBER' },
    });
  });

  it('a concurrent/stale transfer attempt (conditional updateMany matches zero rows) fails with TRIP_VERSION_CONFLICT - never silently succeeds or corrupts ownership', async () => {
    const { service, prisma } = makeHarness();
    prisma.tripMember.findUnique.mockResolvedValue({ id: 'm1', tripId: 't1', userId: 'editor-1', role: 'EDITOR' });
    prisma.trip.updateMany.mockResolvedValue({ count: 0 }); // someone else already transferred, or version is stale
    await expect(service.transferOwnership('t1', 'owner-1', { newOwnerUserId: 'editor-1', expectedVersion: 0 })).rejects.toThrow(ConflictException);
    // Never proceeds to touch membership rows once the atomic ownership update itself did not commit.
    expect(prisma.tripMember.delete).not.toHaveBeenCalled();
    expect(prisma.tripMember.create).not.toHaveBeenCalled();
  });

  it('on success: target member row is removed (new owner is never also a member), old owner gets a fresh EDITOR row, exactly one updateMany call performs the actual ownership change', async () => {
    const { service, prisma } = makeHarness();
    prisma.tripMember.findUnique.mockResolvedValue({ id: 'm1', tripId: 't1', userId: 'editor-1', role: 'EDITOR' });
    prisma.trip.updateMany.mockResolvedValue({ count: 1 });
    prisma.trip.findUniqueOrThrow.mockResolvedValue({ id: 't1', ownerId: 'editor-1', version: 1 });

    const result = await service.transferOwnership('t1', 'owner-1', { newOwnerUserId: 'editor-1', expectedVersion: 0 });

    expect(prisma.trip.updateMany).toHaveBeenCalledWith({
      where: { id: 't1', ownerId: 'owner-1', version: 0 },
      data: { ownerId: 'editor-1', version: { increment: 1 } },
    });
    expect(prisma.tripMember.delete).toHaveBeenCalledWith({ where: { id: 'm1' } });
    expect(prisma.tripMember.create).toHaveBeenCalledWith({ data: { tripId: 't1', userId: 'owner-1', role: 'EDITOR' } });
    expect(result.ownerId).toBe('editor-1');
  });
});
