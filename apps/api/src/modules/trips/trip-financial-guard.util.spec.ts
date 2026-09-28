import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isCurrentTripParticipant, lockTripAndAssertMutable, withDeadlockRetry } from './trip-financial-guard.util';

function makeTx(overrides: any = {}) {
  return {
    $queryRaw: jest.fn(),
    trip: { findUnique: jest.fn() },
    tripMember: { findUnique: jest.fn() },
    ...overrides,
  };
}

describe('lockTripAndAssertMutable (spec sections 36-38 - transaction-internal re-validation)', () => {
  it('rejects when the trip is archived, even though the pre-transaction authz check already passed', async () => {
    const tx: any = makeTx();
    tx.trip.findUnique.mockResolvedValue({ ownerId: 'owner-1' });
    tx.$queryRaw.mockResolvedValueOnce([{ id: 't1', ownerId: 'owner-1', archivedAt: new Date() }]);
    await expect(lockTripAndAssertMutable(tx, 't1', 'owner-1')).rejects.toMatchObject({ response: { code: 'TRIP_ARCHIVED' } });
  });

  it('allows the owner, locking only the Trip row (TripMember row lock skipped entirely for the owner)', async () => {
    const tx: any = makeTx();
    tx.trip.findUnique.mockResolvedValue({ ownerId: 'owner-1' });
    tx.$queryRaw.mockResolvedValueOnce([{ id: 't1', ownerId: 'owner-1', archivedAt: null }]);
    const trip = await lockTripAndAssertMutable(tx, 't1', 'owner-1');
    expect(trip.ownerId).toBe('owner-1');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('allows a current EDITOR - locks TripMember FIRST, then Trip (matching remove/updateRole order to avoid deadlocking with them)', async () => {
    const tx: any = makeTx();
    tx.trip.findUnique.mockResolvedValue({ ownerId: 'owner-1' });
    tx.$queryRaw.mockResolvedValueOnce([{ id: 'm1', role: 'EDITOR' }]).mockResolvedValueOnce([{ id: 't1', ownerId: 'owner-1', archivedAt: null }]);
    const trip = await lockTripAndAssertMutable(tx, 't1', 'editor-1');
    expect(trip.id).toBe('t1');
  });

  it('rejects a removed member (no TripMember row found under lock) - the member-removal-vs-create race (spec section 36)', async () => {
    const tx: any = makeTx();
    tx.trip.findUnique.mockResolvedValue({ ownerId: 'owner-1' });
    tx.$queryRaw.mockResolvedValueOnce([]);
    await expect(lockTripAndAssertMutable(tx, 't1', 'editor-1')).rejects.toMatchObject({ response: { code: 'TRIP_PERMISSION_DENIED' } });
  });

  it('rejects a downgraded member (role is now VIEWER under lock) - the role-downgrade-vs-mutation race (spec section 37)', async () => {
    const tx: any = makeTx();
    tx.trip.findUnique.mockResolvedValue({ ownerId: 'owner-1' });
    tx.$queryRaw.mockResolvedValueOnce([{ id: 'm1', role: 'VIEWER' }]);
    await expect(lockTripAndAssertMutable(tx, 't1', 'editor-1')).rejects.toThrow(ForbiddenException);
  });

  it('throws a defensive TRIP_NOT_FOUND if the Trip row is somehow gone by the time it is locked (should not happen in practice)', async () => {
    const tx: any = makeTx();
    tx.trip.findUnique.mockResolvedValue({ ownerId: 'owner-1' });
    tx.$queryRaw.mockResolvedValueOnce([]);
    await expect(lockTripAndAssertMutable(tx, 't1', 'owner-1')).rejects.toThrow(ConflictException);
  });

  it('throws a defensive TRIP_NOT_FOUND if the unlocked peek itself finds nothing', async () => {
    const tx: any = makeTx();
    tx.trip.findUnique.mockResolvedValue(null);
    await expect(lockTripAndAssertMutable(tx, 'missing', 'owner-1')).rejects.toThrow(ConflictException);
  });
});

describe('isCurrentTripParticipant', () => {
  it('the owner is always a current participant, no TripMember lookup needed', async () => {
    const tx: any = makeTx();
    expect(await isCurrentTripParticipant(tx, 't1', 'owner-1', 'owner-1')).toBe(true);
    expect(tx.tripMember.findUnique).not.toHaveBeenCalled();
  });

  it('an accepted member is a current participant', async () => {
    const tx: any = makeTx();
    tx.tripMember.findUnique.mockResolvedValue({ id: 'm1', role: 'VIEWER' });
    expect(await isCurrentTripParticipant(tx, 't1', 'owner-1', 'viewer-1')).toBe(true);
  });

  it('a removed/former member is not a current participant', async () => {
    const tx: any = makeTx();
    tx.tripMember.findUnique.mockResolvedValue(null);
    expect(await isCurrentTripParticipant(tx, 't1', 'owner-1', 'former-member')).toBe(false);
  });
});

describe('withDeadlockRetry', () => {
  it('retries exactly once on a P2034 deadlock/write-conflict error', async () => {
    let attempts = 0;
    const fn = jest.fn(async () => {
      attempts++;
      if (attempts === 1) {
        throw new Prisma.PrismaClientKnownRequestError('deadlock', { code: 'P2034', clientVersion: '5.20.0' });
      }
      return 'ok';
    });
    await expect(withDeadlockRetry(fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('never retries a business-rule rejection (any other error propagates immediately)', async () => {
    const fn = jest.fn(async () => {
      throw new ForbiddenException('nope');
    });
    await expect(withDeadlockRetry(fn)).rejects.toThrow(ForbiddenException);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
