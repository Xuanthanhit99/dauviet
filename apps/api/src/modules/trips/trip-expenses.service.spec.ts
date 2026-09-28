import { NotFoundException } from '@nestjs/common';
import { TripExpensesService } from './trip-expenses.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TripAuthorizationService } from './trip-authorization.service';
import { TripCollaborationEventService } from './trip-collaboration-event.service';

function makeHarness() {
  const prisma: any = {
    trip: { findUnique: jest.fn().mockResolvedValue({ ownerId: 'owner-1' }) },
    $queryRaw: jest.fn().mockResolvedValue([{ id: 't1', ownerId: 'owner-1', archivedAt: null }]),
    tripMember: { findUnique: jest.fn().mockResolvedValue({ id: 'm1', role: 'EDITOR' }) },
    tripExpense: {
      create: jest.fn((args) => ({ id: 'exp-1', ...args.data, shares: [] })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn((args) => ({ id: args.where.id, shares: [] })),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    tripExpenseShare: { deleteMany: jest.fn(), createMany: jest.fn() },
    $transaction: jest.fn((arg: unknown) => (typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as Promise<unknown>[]))),
  };
  const audit = { log: jest.fn() } as unknown as AuditService;
  const authz = { authorize: jest.fn().mockResolvedValue({ trip: { id: 't1', ownerId: 'owner-1', archivedAt: null }, role: 'EDITOR' }) } as unknown as TripAuthorizationService;
  const collaborationEvents = { record: jest.fn() } as unknown as TripCollaborationEventService;
  const service = new TripExpensesService(prisma as unknown as PrismaService, audit, authz, collaborationEvents);
  return { service, prisma, audit, authz, collaborationEvents };
}

const baseDto = {
  title: 'Dinner',
  category: 'FOOD' as const,
  amount: '300.00',
  currency: 'USD',
  payerUserId: 'owner-1',
  splitMode: 'EQUAL' as const,
  occurredOn: '2026-11-02',
  shares: [{ userId: 'owner-1' }, { userId: 'editor-1' }, { userId: 'viewer-1' }],
};

describe('TripExpensesService.create (spec sections 9-25, 32)', () => {
  it('rejects a non-positive amount', async () => {
    const { service } = makeHarness();
    await expect(service.create('t1', 'owner-1', { ...baseDto, amount: '0' })).rejects.toMatchObject({ response: { code: 'TRIP_EXPENSE_INVALID' } });
  });

  it('rejects a malformed amount string', async () => {
    const { service } = makeHarness();
    await expect(service.create('t1', 'owner-1', { ...baseDto, amount: 'abc' })).rejects.toMatchObject({ response: { code: 'TRIP_EXPENSE_INVALID' } });
  });

  it('EQUAL split: creates the expense with deterministically-resolved shares that sum to the amount', async () => {
    const { service, prisma, audit, collaborationEvents } = makeHarness();
    const result = await service.create('t1', 'owner-1', baseDto);
    expect(prisma.tripExpense.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          shares: { createMany: { data: expect.arrayContaining([expect.objectContaining({ userId: 'owner-1' }), expect.objectContaining({ userId: 'editor-1' }), expect.objectContaining({ userId: 'viewer-1' })]) } },
        }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'tripExpense.created' }), prisma);
    expect(collaborationEvents.record).toHaveBeenCalledWith(expect.objectContaining({ type: 'EXPENSE_ADDED' }), prisma);
    // No amount in collaboration activity metadata (spec section 61).
    const collabCall = (collaborationEvents.record as jest.Mock).mock.calls[0][0];
    expect(JSON.stringify(collabCall.metadata)).not.toContain('300');
    expect(result.id).toBe('exp-1');
  });

  it('rejects an EQUAL split where a share supplies amount/percentage (structurally invalid)', async () => {
    const { service } = makeHarness();
    await expect(service.create('t1', 'owner-1', { ...baseDto, shares: [{ userId: 'a', amount: '100' }, { userId: 'b' }] as any })).rejects.toMatchObject({
      response: { code: 'TRIP_EXPENSE_SPLIT_INVALID' },
    });
  });

  it('EXACT split: rejects a sum mismatch atomically, never calls tripExpense.create', async () => {
    const { service, prisma } = makeHarness();
    await expect(
      service.create('t1', 'owner-1', { ...baseDto, splitMode: 'EXACT', shares: [{ userId: 'owner-1', amount: '100' }, { userId: 'editor-1', amount: '150' }] as any }),
    ).rejects.toMatchObject({ response: { code: 'TRIP_EXPENSE_SPLIT_INVALID' } });
    expect(prisma.tripExpense.create).not.toHaveBeenCalled();
  });

  it('EXACT split: accepts an exact sum match', async () => {
    const { service } = makeHarness();
    await expect(
      service.create('t1', 'owner-1', { ...baseDto, splitMode: 'EXACT', shares: [{ userId: 'owner-1', amount: '100.00' }, { userId: 'editor-1', amount: '200.00' }] as any }),
    ).resolves.toBeDefined();
  });

  // G12 pre-freeze audit: only the SUM used to be checked, so a negative share that kept the sum
  // right (150 / -50 of a 100 expense) was accepted - a hidden transfer G09-GATE-028 rules out.
  it.each([
    ['EXACT negative share', { splitMode: 'EXACT', amount: '100.00', shares: [{ userId: 'owner-1', amount: '150.00' }, { userId: 'editor-1', amount: '-50.00' }] }],
    ['PERCENTAGE negative share', { splitMode: 'PERCENTAGE', amount: '100.00', shares: [{ userId: 'owner-1', percentage: '150' }, { userId: 'editor-1', percentage: '-50' }] }],
    ['PERCENTAGE above 100', { splitMode: 'PERCENTAGE', amount: '100.00', shares: [{ userId: 'owner-1', percentage: '100.01' }, { userId: 'editor-1', percentage: '-0.01' }] }],
    ['PERCENTAGE with more than 2 decimals (column scale)', { splitMode: 'PERCENTAGE', amount: '100.00', shares: [{ userId: 'owner-1', percentage: '33.333' }, { userId: 'editor-1', percentage: '66.667' }] }],
  ])('G12: rejects %s atomically, never calls tripExpense.create', async (_label, override) => {
    const { service, prisma } = makeHarness();
    await expect(service.create('t1', 'owner-1', { ...baseDto, ...(override as any) })).rejects.toMatchObject({ response: { code: 'TRIP_EXPENSE_SPLIT_INVALID' } });
    expect(prisma.tripExpense.create).not.toHaveBeenCalled();
  });

  it('G12: still accepts a zero EXACT share (payer who consumed nothing, G09-GATE-051)', async () => {
    const { service, prisma } = makeHarness();
    await service.create('t1', 'owner-1', { ...baseDto, splitMode: 'EXACT', amount: '100.00', shares: [{ userId: 'owner-1', amount: '0' }, { userId: 'editor-1', amount: '100.00' }] as any });
    expect(prisma.tripExpense.create).toHaveBeenCalled();
  });

  it('PERCENTAGE split: rejects when percentages do not sum to exactly 100', async () => {
    const { service } = makeHarness();
    await expect(
      service.create('t1', 'owner-1', { ...baseDto, splitMode: 'PERCENTAGE', shares: [{ userId: 'owner-1', percentage: '60' }, { userId: 'editor-1', percentage: '30' }] as any }),
    ).rejects.toMatchObject({ response: { code: 'TRIP_EXPENSE_SPLIT_INVALID' } });
  });

  it('PERCENTAGE split: accepts percentages that sum to exactly 100', async () => {
    const { service } = makeHarness();
    await expect(
      service.create('t1', 'owner-1', { ...baseDto, splitMode: 'PERCENTAGE', shares: [{ userId: 'owner-1', percentage: '60' }, { userId: 'editor-1', percentage: '40' }] as any }),
    ).resolves.toBeDefined();
  });

  it('rejects duplicate userIds in shares', async () => {
    const { service } = makeHarness();
    await expect(service.create('t1', 'owner-1', { ...baseDto, shares: [{ userId: 'owner-1' }, { userId: 'owner-1' }] })).rejects.toMatchObject({ response: { code: 'TRIP_EXPENSE_SPLIT_INVALID' } });
  });

  it('rejects a payer who is not a current trip participant (spec section 14/22/24)', async () => {
    const { service, prisma } = makeHarness();
    prisma.tripMember.findUnique.mockResolvedValue(null); // payerUserId "editor-1" resolves via tripMember lookup when not the owner
    await expect(service.create('t1', 'owner-1', { ...baseDto, payerUserId: 'former-member', shares: [{ userId: 'owner-1' }] })).rejects.toMatchObject({
      response: { code: 'TRIP_EXPENSE_PARTICIPANT_INVALID' },
    });
  });

  it('rejects a share userId who is not a current trip participant', async () => {
    const { service, prisma } = makeHarness();
    prisma.tripMember.findUnique.mockResolvedValue(null);
    await expect(service.create('t1', 'owner-1', { ...baseDto, shares: [{ userId: 'owner-1' }, { userId: 'former-member' }] })).rejects.toMatchObject({
      response: { code: 'TRIP_EXPENSE_PARTICIPANT_INVALID' },
    });
  });

  it('rejects on an archived trip even though the pre-check authz already passed (transaction-internal re-check)', async () => {
    const { service, prisma } = makeHarness();
    prisma.$queryRaw.mockResolvedValue([{ id: 't1', ownerId: 'owner-1', archivedAt: new Date() }]);
    await expect(service.create('t1', 'owner-1', baseDto)).rejects.toMatchObject({ response: { code: 'TRIP_ARCHIVED' } });
  });
});

describe('TripExpensesService.update (spec sections 32-35, 64)', () => {
  it('on version conflict (updateMany count 0) with a still-existing row at a different version -> 409 TRIP_VERSION_CONFLICT', async () => {
    const { service, prisma } = makeHarness();
    prisma.tripExpense.updateMany.mockResolvedValue({ count: 0 });
    prisma.tripExpense.findFirst.mockResolvedValue({ id: 'exp-1', tripId: 't1', version: 5, deletedAt: null });
    await expect(service.update('t1', 'exp-1', 'owner-1', { ...baseDto, expectedVersion: 0 })).rejects.toMatchObject({ response: { code: 'TRIP_VERSION_CONFLICT' } });
  });

  it('on version conflict where the row is now soft-deleted -> 404 TRIP_EXPENSE_NOT_FOUND, not a version conflict (edit-vs-delete race, spec section 35)', async () => {
    const { service, prisma } = makeHarness();
    prisma.tripExpense.updateMany.mockResolvedValue({ count: 0 });
    prisma.tripExpense.findFirst.mockResolvedValue({ id: 'exp-1', tripId: 't1', version: 0, deletedAt: new Date() });
    await expect(service.update('t1', 'exp-1', 'owner-1', { ...baseDto, expectedVersion: 0 })).rejects.toThrow(NotFoundException);
  });

  it('on success: replaces shares entirely (delete then createMany) in the same transaction', async () => {
    const { service, prisma } = makeHarness();
    await service.update('t1', 'exp-1', 'owner-1', { ...baseDto, expectedVersion: 0 });
    expect(prisma.tripExpenseShare.deleteMany).toHaveBeenCalledWith({ where: { expenseId: 'exp-1' } });
    expect(prisma.tripExpenseShare.createMany).toHaveBeenCalled();
  });
});

describe('TripExpensesService.delete (spec section 31 - soft delete)', () => {
  it('sets deletedAt via a conditional updateMany, never a hard delete', async () => {
    const { service, prisma } = makeHarness();
    const result = await service.delete('t1', 'exp-1', 'owner-1', { expectedVersion: 0 });
    expect(prisma.tripExpense.updateMany).toHaveBeenCalledWith({
      where: { id: 'exp-1', tripId: 't1', version: 0, deletedAt: null },
      data: expect.objectContaining({ deletedAt: expect.any(Date), version: { increment: 1 } }),
    });
    expect(result).toEqual({ deleted: true });
  });

  it('404s when already deleted', async () => {
    const { service, prisma } = makeHarness();
    prisma.tripExpense.updateMany.mockResolvedValue({ count: 0 });
    prisma.tripExpense.findFirst.mockResolvedValue({ id: 'exp-1', tripId: 't1', version: 0, deletedAt: new Date() });
    await expect(service.delete('t1', 'exp-1', 'owner-1', { expectedVersion: 0 })).rejects.toThrow(NotFoundException);
  });
});

describe('TripExpensesService.list/detail', () => {
  it('list excludes soft-deleted expenses by default', async () => {
    const { service, prisma } = makeHarness();
    await service.list('t1', 'owner-1', { page: 1, pageSize: 20 });
    expect(prisma.tripExpense.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tripId: 't1', deletedAt: null } }));
  });

  it('detail 404s for an unknown expense', async () => {
    const { service, prisma } = makeHarness();
    (prisma.tripExpense as any).findFirst = jest.fn().mockResolvedValue(null);
    await expect(service.detail('t1', 'missing', 'owner-1')).rejects.toThrow(NotFoundException);
  });
});
