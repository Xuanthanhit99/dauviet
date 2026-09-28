import { TripSettlementsService } from './trip-settlements.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TripAuthorizationService } from './trip-authorization.service';
import { TripCollaborationEventService } from './trip-collaboration-event.service';

function makeHarness() {
  const prisma: any = {
    trip: { findUnique: jest.fn().mockResolvedValue({ ownerId: 'owner-1' }) },
    $queryRaw: jest.fn().mockResolvedValue([{ id: 't1', ownerId: 'owner-1', archivedAt: null }]),
    tripMember: { findUnique: jest.fn().mockResolvedValue({ id: 'm1', role: 'EDITOR' }) },
    tripSettlement: {
      create: jest.fn((args) => ({ id: 'settle-1', ...args.data })),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    $transaction: jest.fn((arg: unknown) => (typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as Promise<unknown>[]))),
  };
  const audit = { log: jest.fn() } as unknown as AuditService;
  const authz = { authorize: jest.fn().mockResolvedValue({ trip: { id: 't1', ownerId: 'owner-1', archivedAt: null }, role: 'EDITOR' }) } as unknown as TripAuthorizationService;
  const collaborationEvents = { record: jest.fn() } as unknown as TripCollaborationEventService;
  const service = new TripSettlementsService(prisma as unknown as PrismaService, audit, authz, collaborationEvents);
  return { service, prisma, audit, authz, collaborationEvents };
}

const baseDto = { fromUserId: 'editor-1', toUserId: 'owner-1', amount: '100.00', currency: 'USD', settledAt: '2026-11-05' };

describe('TripSettlementsService.create (spec sections 46-51)', () => {
  it('rejects fromUserId === toUserId', async () => {
    const { service } = makeHarness();
    await expect(service.create('t1', 'owner-1', { ...baseDto, toUserId: 'editor-1' })).rejects.toMatchObject({ response: { code: 'TRIP_SETTLEMENT_INVALID' } });
  });

  it('rejects a non-positive amount', async () => {
    const { service } = makeHarness();
    await expect(service.create('t1', 'owner-1', { ...baseDto, amount: '0' })).rejects.toMatchObject({ response: { code: 'TRIP_SETTLEMENT_INVALID' } });
  });

  it('rejects a malformed amount', async () => {
    const { service } = makeHarness();
    await expect(service.create('t1', 'owner-1', { ...baseDto, amount: 'nope' })).rejects.toMatchObject({ response: { code: 'TRIP_SETTLEMENT_INVALID' } });
  });

  it('rejects an unrelated (non-participant) fromUserId/toUserId - never an arbitrary user (spec section 48)', async () => {
    const { service, prisma } = makeHarness();
    prisma.tripMember.findUnique.mockResolvedValue(null);
    await expect(service.create('t1', 'owner-1', { ...baseDto, fromUserId: 'stranger' })).rejects.toMatchObject({ response: { code: 'TRIP_SETTLEMENT_INVALID' } });
  });

  it('on success: creates the settlement, audits with amount, but excludes amount from collaboration activity metadata (spec section 61)', async () => {
    const { service, prisma, audit, collaborationEvents } = makeHarness();
    const result = await service.create('t1', 'owner-1', baseDto);
    expect(prisma.tripSettlement.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ fromUserId: 'editor-1', toUserId: 'owner-1', currency: 'USD' }) }));
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'tripSettlement.created', metadata: expect.objectContaining({ amount: '100' }) }), prisma);
    const collabCall = (collaborationEvents.record as jest.Mock).mock.calls[0][0];
    expect(collabCall.metadata).toEqual({ currency: 'USD' });
    expect(result.id).toBe('settle-1');
  });

  it('rejects on an archived trip via the transaction-internal re-check', async () => {
    const { service, prisma } = makeHarness();
    prisma.$queryRaw.mockResolvedValue([{ id: 't1', ownerId: 'owner-1', archivedAt: new Date() }]);
    await expect(service.create('t1', 'owner-1', baseDto)).rejects.toMatchObject({ response: { code: 'TRIP_ARCHIVED' } });
  });
});
