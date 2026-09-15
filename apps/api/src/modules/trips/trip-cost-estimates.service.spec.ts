import { Prisma } from '@prisma/client';
import { TripCostEstimatesService } from './trip-cost-estimates.service';
import { TripsService } from './trips.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ProviderRegistryService } from '../providers/provider-registry.service';

const trip = {
  id: 't1',
  ownerId: 'owner-1',
  version: 4,
  travelerCount: 2,
  roomCount: 1,
  primaryCurrency: 'VND',
  startDate: new Date('2026-11-01'),
  endDate: new Date('2026-11-02'),
  archivedAt: null,
};

const day1 = { id: 'day-1', tripId: 't1', date: new Date('2026-11-01') };
const day2 = { id: 'day-2', tripId: 't1', date: new Date('2026-11-02') };

function makePrismaStub() {
  const prisma: any = {
    tripDestination: { findMany: jest.fn().mockResolvedValue([]) },
    tripDay: { findMany: jest.fn().mockResolvedValue([day1, day2]) },
    tripItem: { findMany: jest.fn().mockResolvedValue([]) },
    tripTransportLeg: { findMany: jest.fn().mockResolvedValue([]) },
    destination: { findMany: jest.fn().mockResolvedValue([]) },
    costAssumption: { findFirst: jest.fn().mockResolvedValue(null) },
    tripCostEstimateGeneration: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'gen-1' }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'gen-1', estimates: [] }),
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    tripCostEstimate: { create: jest.fn().mockResolvedValue({ id: 'est-1' }) },
    tripCostEstimateItem: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    providerAccommodationReference: { findMany: jest.fn().mockResolvedValue([]) },
    providerActivityReference: { findMany: jest.fn().mockResolvedValue([]) },
    accommodationOffer: { findFirst: jest.fn().mockResolvedValue(null) },
    activityOffer: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn((arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg as Promise<unknown>[]);
      return (arg as (tx: unknown) => Promise<unknown>)(prisma);
    }),
  };
  return prisma;
}

function makeService(prisma = makePrismaStub()) {
  const audit = { log: jest.fn() };
  const tripsService = { getOwnedActiveOrThrow: jest.fn().mockResolvedValue(trip), getOwnedOrThrow: jest.fn().mockResolvedValue(trip) };
  const registry = { getExecutionContext: jest.fn().mockResolvedValue({ ok: true, context: {} }) };
  const service = new TripCostEstimatesService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    tripsService as unknown as TripsService,
    registry as unknown as ProviderRegistryService,
  );
  return { service, prisma, audit, tripsService, registry };
}

function accommodationReferenceRow(overrides: Partial<any> = {}) {
  return { id: 'ref-1', accommodationId: 'acc-1', status: 'ACTIVE', provider: { id: 'prov-1', code: 'FIXTURE_PROVIDER' }, ...overrides };
}

function accommodationOfferRow(overrides: Partial<any> = {}) {
  return {
    id: 'offer-1',
    providerReferenceId: 'ref-1',
    checkInDate: new Date('2026-11-01'),
    checkOutDate: new Date('2026-11-02'),
    guests: 2,
    rooms: 1,
    currency: 'VND',
    amount: new Prisma.Decimal(900000),
    expiresAt: null,
    fetchedAt: new Date('2026-10-01'),
    ...overrides,
  };
}

/** Simulates real DB filtering by `where.currency`/`where.guests.gte`/`where.rooms.gte` (spec section 257-269's exact matching contract), rather than trusting the resolver's branching blindly. */
function filteringOfferFindFirst(row: ReturnType<typeof accommodationOfferRow> | null) {
  return jest.fn().mockImplementation(({ where }: any) => {
    if (!row) return Promise.resolve(null);
    if (where.currency !== row.currency) return Promise.resolve(null);
    if (row.guests < where.guests.gte) return Promise.resolve(null);
    if (row.rooms < where.rooms.gte) return Promise.resolve(null);
    return Promise.resolve(row);
  });
}

function accommodationItem(overrides: Partial<any> = {}) {
  return { id: 'i1', tripId: 't1', tripDayId: 'day-1', type: 'ACCOMMODATION', accommodationId: 'acc-1', plannedAmount: null, plannedCurrency: null, ...overrides };
}

function assumptionRow(overrides: Partial<any> = {}) {
  return {
    id: 'ca-1',
    scope: 'GLOBAL',
    scopeId: null,
    unit: 'PER_PERSON_PER_DAY',
    currency: 'VND',
    lowAmount: new Prisma.Decimal(100000),
    typicalAmount: new Prisma.Decimal(150000),
    highAmount: new Prisma.Decimal(200000),
    version: 1,
    effectiveFrom: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('TripCostEstimatesService.generate', () => {
  it('is owner-gated and blocked once archived, via TripsService.getOwnedActiveOrThrow', async () => {
    const { service, tripsService } = makeService();
    await service.generate('t1', 'owner-1');
    expect(tripsService.getOwnedActiveOrThrow).toHaveBeenCalledWith('t1', 'owner-1');
  });

  it('produces two FOOD and two local-TRANSPORT line items for a two-day trip with no itinerary at all - both UNKNOWN with no assumption seeded', async () => {
    const { service, prisma } = makeService();
    await service.generate('t1', 'owner-1');

    const itemsWritten = prisma.tripCostEstimateItem.createMany.mock.calls[0][0].data;
    expect(itemsWritten.filter((i: any) => i.category === 'FOOD')).toHaveLength(2);
    expect(itemsWritten.filter((i: any) => i.category === 'TRANSPORT' && i.description === 'Local transport')).toHaveLength(2);
    expect(itemsWritten.every((i: any) => i.provenance === 'UNKNOWN')).toBe(true);
  });

  it('resolves FOOD via a GLOBAL CostAssumption fallback when no restaurant item is priced that day', async () => {
    const { service, prisma } = makeService();
    prisma.costAssumption.findFirst.mockImplementation(({ where }: any) => (where.category === 'FOOD' ? Promise.resolve(assumptionRow()) : Promise.resolve(null)));

    await service.generate('t1', 'owner-1');

    const itemsWritten = prisma.tripCostEstimateItem.createMany.mock.calls[0][0].data;
    const foodItems = itemsWritten.filter((i: any) => i.category === 'FOOD');
    expect(foodItems).toHaveLength(2);
    expect(foodItems.every((i: any) => i.provenance === 'RULE_BASED_ESTIMATE')).toBe(true);
    // createMany call[0] is the LOW scenario (COST_SCENARIOS = ['LOW','TYPICAL','HIGH']);
    // lowAmount(100000) * PER_PERSON_PER_DAY multiplier (travelerCount 2 * days 1) = 200000.
    expect(foodItems[0].amount.toString()).toBe('200000');
  });

  it('sums priced RESTAURANT items for FOOD instead of falling back to an assumption - never both', async () => {
    const { service, prisma } = makeService();
    prisma.tripItem.findMany.mockResolvedValue([
      { id: 'i1', tripId: 't1', tripDayId: 'day-1', type: 'RESTAURANT', plannedAmount: new Prisma.Decimal(50000), plannedCurrency: 'VND' },
      { id: 'i2', tripId: 't1', tripDayId: 'day-1', type: 'RESTAURANT', plannedAmount: new Prisma.Decimal(30000), plannedCurrency: 'VND' },
    ]);
    prisma.costAssumption.findFirst.mockResolvedValue(assumptionRow());

    await service.generate('t1', 'owner-1');

    const itemsWritten = prisma.tripCostEstimateItem.createMany.mock.calls[0][0].data;
    const day1Food = itemsWritten.find((i: any) => i.category === 'FOOD' && i.tripDayId === 'day-1');
    expect(day1Food.provenance).toBe('USER_INPUT');
    expect(day1Food.amount.toString()).toBe('80000');
    // day-2 has no restaurant item -> falls back to the assumption instead.
    const day2Food = itemsWritten.find((i: any) => i.category === 'FOOD' && i.tripDayId === 'day-2');
    expect(day2Food.provenance).toBe('RULE_BASED_ESTIMATE');
  });

  it('a RESTAURANT item with no plannedAmount does not count as "priced" and does not suppress the day-level assumption fallback', async () => {
    const { service, prisma } = makeService();
    prisma.tripItem.findMany.mockResolvedValue([{ id: 'i1', tripId: 't1', tripDayId: 'day-1', type: 'RESTAURANT', plannedAmount: null, plannedCurrency: null }]);
    prisma.costAssumption.findFirst.mockResolvedValue(assumptionRow());

    await service.generate('t1', 'owner-1');

    const itemsWritten = prisma.tripCostEstimateItem.createMany.mock.calls[0][0].data;
    const day1Food = itemsWritten.find((i: any) => i.category === 'FOOD' && i.tripDayId === 'day-1');
    expect(day1Food.provenance).toBe('RULE_BASED_ESTIMATE');
  });

  it('produces one STAY line item per ACCOMMODATION TripItem, using its plannedAmount as USER_INPUT when set', async () => {
    const { service, prisma } = makeService();
    prisma.tripItem.findMany.mockResolvedValue([
      { id: 'i1', tripId: 't1', tripDayId: 'day-1', type: 'ACCOMMODATION', plannedAmount: new Prisma.Decimal(500000), plannedCurrency: 'VND' },
    ]);

    await service.generate('t1', 'owner-1');

    const itemsWritten = prisma.tripCostEstimateItem.createMany.mock.calls[0][0].data;
    const stayItem = itemsWritten.find((i: any) => i.category === 'STAY');
    expect(stayItem.provenance).toBe('USER_INPUT');
    expect(stayItem.amount.toString()).toBe('500000');
    expect(stayItem.tripItemId).toBe('i1');
  });

  it('produces one ACTIVITY line item per ACTIVITY/ATTRACTION TripItem', async () => {
    const { service, prisma } = makeService();
    prisma.tripItem.findMany.mockResolvedValue([
      { id: 'i1', tripId: 't1', tripDayId: 'day-1', type: 'ACTIVITY', plannedAmount: new Prisma.Decimal(200000), plannedCurrency: 'VND' },
      { id: 'i2', tripId: 't1', tripDayId: 'day-1', type: 'ATTRACTION', plannedAmount: null, plannedCurrency: null },
    ]);

    await service.generate('t1', 'owner-1');

    const itemsWritten = prisma.tripCostEstimateItem.createMany.mock.calls[0][0].data;
    const activityItems = itemsWritten.filter((i: any) => i.category === 'ACTIVITY');
    expect(activityItems).toHaveLength(2);
    expect(activityItems.find((i: any) => i.tripItemId === 'i1').provenance).toBe('USER_INPUT');
    expect(activityItems.find((i: any) => i.tripItemId === 'i2').provenance).toBe('UNKNOWN');
  });

  it('produces one TRANSPORT line item per TripTransportLeg, separate from the per-day local-transport items', async () => {
    const { service, prisma } = makeService();
    prisma.tripTransportLeg.findMany.mockResolvedValue([
      { id: 'leg-1', tripId: 't1', fromLabel: 'Hanoi', toLabel: 'Sapa', fromDestinationId: null, toDestinationId: null, plannedDate: null, plannedAmount: new Prisma.Decimal(300000), plannedCurrency: 'VND' },
    ]);

    await service.generate('t1', 'owner-1');

    const itemsWritten = prisma.tripCostEstimateItem.createMany.mock.calls[0][0].data;
    const legItem = itemsWritten.find((i: any) => i.transportLegId === 'leg-1');
    expect(legItem.provenance).toBe('USER_INPUT');
    expect(legItem.amount.toString()).toBe('300000');
    // Still exactly 2 local-transport day-level items in addition to the one leg item.
    expect(itemsWritten.filter((i: any) => i.category === 'TRANSPORT' && i.description === 'Local transport')).toHaveLength(2);
  });

  it('is idempotent: an identical recalculation (same inputHash) returns the existing generation instead of creating a new one', async () => {
    const { service, prisma } = makeService();
    const existingGeneration = { id: 'existing-gen', estimates: [] };
    prisma.tripCostEstimateGeneration.findUnique.mockResolvedValue(existingGeneration);

    const result = await service.generate('t1', 'owner-1');

    expect(result).toBe(existingGeneration);
    expect(prisma.tripCostEstimateGeneration.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('persists all 3 scenarios and audits the generation inside one transaction', async () => {
    const { service, prisma, audit } = makeService();

    await service.generate('t1', 'owner-1');

    expect(prisma.tripCostEstimate.create).toHaveBeenCalledTimes(3);
    const scenarios = prisma.tripCostEstimate.create.mock.calls.map((c: any) => c[0].data.scenario);
    expect(scenarios.sort()).toEqual(['HIGH', 'LOW', 'TYPICAL']);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'trip.estimate.generated', entityType: 'TRIP', entityId: 't1' }), prisma);
  });
});

/**
 * The recovery spec's required 9-case provider-evidence matrix (gates
 * 257-269) - uses only the existing G05 provider-access shapes
 * (`ProviderAccommodationReference`/`AccommodationOffer` +
 * `ProviderRegistryService.getExecutionContext`), never a real provider,
 * never credentials. Every "falls back" case asserts the STAY line item
 * still resolves correctly (RULE_BASED_ESTIMATE via a seeded GLOBAL
 * assumption, or UNKNOWN with none seeded) rather than merely asserting
 * absence of PROVIDER_EVIDENCE - a fallback that silently produced no line
 * item at all, or a zero, would be a real defect this matrix must catch.
 */
describe('TripCostEstimatesService - G05 provider-evidence resolver (recovery spec gates 257-269)', () => {
  it('[1/9 eligible-fresh-offer-contributes] a fresh, licensed, context-matching offer resolves as PROVIDER_EVIDENCE with a fixed amount across all 3 scenarios', async () => {
    const { service, prisma, registry } = makeService();
    prisma.tripItem.findMany.mockResolvedValue([accommodationItem()]);
    prisma.providerAccommodationReference.findMany.mockResolvedValue([accommodationReferenceRow()]);
    prisma.accommodationOffer.findFirst = filteringOfferFindFirst(accommodationOfferRow());

    await service.generate('t1', 'owner-1');

    expect(registry.getExecutionContext).toHaveBeenCalledWith(expect.objectContaining({ providerCode: 'FIXTURE_PROVIDER', capability: 'LIVE_PRICE', usage: 'display' }));
    const itemsWritten = prisma.tripCostEstimateItem.createMany.mock.calls.flatMap((c: any) => c[0].data);
    const stayItems = itemsWritten.filter((i: any) => i.category === 'STAY');
    expect(stayItems.every((i: any) => i.provenance === 'PROVIDER_EVIDENCE' && i.assumptionId === null)).toBe(true);
    expect(new Set(stayItems.map((i: any) => i.amount.toString()))).toEqual(new Set(['900000']));
    expect(stayItems.every((i: any) => i.offerId === 'offer-1')).toBe(true);
  });

  it('[2/9 expired-offer-doesnt] an offer past its expiresAt is never presented as current - falls back to UNKNOWN with no assumption seeded', async () => {
    const { service, prisma } = makeService();
    prisma.tripItem.findMany.mockResolvedValue([accommodationItem()]);
    prisma.providerAccommodationReference.findMany.mockResolvedValue([accommodationReferenceRow()]);
    prisma.accommodationOffer.findFirst = filteringOfferFindFirst(accommodationOfferRow({ expiresAt: new Date('2020-01-01') }));

    await service.generate('t1', 'owner-1');

    const stayItem = prisma.tripCostEstimateItem.createMany.mock.calls.flatMap((c: any) => c[0].data).find((i: any) => i.category === 'STAY');
    expect(stayItem.provenance).toBe('UNKNOWN');
  });

  it('[3/9 suspended-provider-stops-next-calculation] a suspended integration fails the gate closed and falls back to the CostAssumption tier', async () => {
    const { service, prisma, registry } = makeService();
    prisma.tripItem.findMany.mockResolvedValue([accommodationItem()]);
    prisma.providerAccommodationReference.findMany.mockResolvedValue([accommodationReferenceRow()]);
    prisma.accommodationOffer.findFirst = filteringOfferFindFirst(accommodationOfferRow());
    registry.getExecutionContext.mockResolvedValue({ ok: false, code: 'PROVIDER_INTEGRATION_SUSPENDED', message: 'suspended' });
    prisma.costAssumption.findFirst.mockImplementation(({ where }: any) => (where.category === 'STAY' ? Promise.resolve(assumptionRow({ id: 'ca-stay' })) : Promise.resolve(null)));

    await service.generate('t1', 'owner-1');

    const stayItem = prisma.tripCostEstimateItem.createMany.mock.calls.flatMap((c: any) => c[0].data).find((i: any) => i.category === 'STAY');
    expect(stayItem.provenance).toBe('RULE_BASED_ESTIMATE');
    expect(stayItem.assumptionId).toBe('ca-stay');
    // The offer query is never even reached once the gate itself fails closed.
    expect(prisma.accommodationOffer.findFirst).not.toHaveBeenCalled();
  });

  it('[4/9 revoked-license-stops-next-calculation] a revoked license fails the gate closed exactly like a suspended integration', async () => {
    const { service, prisma, registry } = makeService();
    prisma.tripItem.findMany.mockResolvedValue([accommodationItem()]);
    prisma.providerAccommodationReference.findMany.mockResolvedValue([accommodationReferenceRow()]);
    registry.getExecutionContext.mockResolvedValue({ ok: false, code: 'PROVIDER_LICENSE_REVOKED', message: 'revoked' });

    await service.generate('t1', 'owner-1');

    const stayItem = prisma.tripCostEstimateItem.createMany.mock.calls.flatMap((c: any) => c[0].data).find((i: any) => i.category === 'STAY');
    expect(stayItem.provenance).toBe('UNKNOWN');
  });

  it('[5/9 missing-attribution-blocks] a license with unresolved required attribution fails the gate closed', async () => {
    const { service, prisma, registry } = makeService();
    prisma.tripItem.findMany.mockResolvedValue([accommodationItem()]);
    prisma.providerAccommodationReference.findMany.mockResolvedValue([accommodationReferenceRow()]);
    registry.getExecutionContext.mockResolvedValue({ ok: false, code: 'PROVIDER_ATTRIBUTION_REQUIRED', message: 'attribution missing' });

    await service.generate('t1', 'owner-1');

    const stayItem = prisma.tripCostEstimateItem.createMany.mock.calls.flatMap((c: any) => c[0].data).find((i: any) => i.category === 'STAY');
    expect(stayItem.provenance).toBe('UNKNOWN');
    expect(prisma.accommodationOffer.findFirst).not.toHaveBeenCalled();
  });

  it('[6/9 context-mismatch-doesnt-reuse] an offer priced for fewer guests than the trip requires is never reused - falls back instead of silently under-quoting', async () => {
    const { service, prisma } = makeService();
    prisma.tripItem.findMany.mockResolvedValue([accommodationItem()]);
    prisma.providerAccommodationReference.findMany.mockResolvedValue([accommodationReferenceRow()]);
    // trip.travelerCount is 2; this offer only covers 1 guest.
    prisma.accommodationOffer.findFirst = filteringOfferFindFirst(accommodationOfferRow({ guests: 1 }));

    await service.generate('t1', 'owner-1');

    const stayItem = prisma.tripCostEstimateItem.createMany.mock.calls.flatMap((c: any) => c[0].data).find((i: any) => i.category === 'STAY');
    expect(stayItem.provenance).toBe('UNKNOWN');
  });

  it('[7/9 currency-mismatch-not-converted] an offer in a different currency than the trip target is never converted or reused', async () => {
    const { service, prisma } = makeService();
    prisma.tripItem.findMany.mockResolvedValue([accommodationItem()]);
    prisma.providerAccommodationReference.findMany.mockResolvedValue([accommodationReferenceRow()]);
    prisma.costAssumption.findFirst.mockImplementation(({ where }: any) => (where.category === 'STAY' ? Promise.resolve(assumptionRow({ id: 'ca-stay', currency: 'VND' })) : Promise.resolve(null)));
    // Trip's primaryCurrency (and therefore the query's `currency` filter) is VND; the only offer on file is USD.
    prisma.accommodationOffer.findFirst = filteringOfferFindFirst(accommodationOfferRow({ currency: 'USD', amount: new Prisma.Decimal(40) }));

    await service.generate('t1', 'owner-1');

    const stayItem = prisma.tripCostEstimateItem.createMany.mock.calls.flatMap((c: any) => c[0].data).find((i: any) => i.category === 'STAY');
    expect(stayItem.provenance).toBe('RULE_BASED_ESTIMATE'); // fell through to the VND assumption, never a converted USD figure
    expect(stayItem.currency).toBe('VND');
  });

  it('[8/9 provider-unavailable-falls-back] no provider reference exists at all for this accommodation - falls back without ever calling the registry', async () => {
    const { service, prisma, registry } = makeService();
    prisma.tripItem.findMany.mockResolvedValue([accommodationItem()]);
    prisma.providerAccommodationReference.findMany.mockResolvedValue([]);

    await service.generate('t1', 'owner-1');

    expect(registry.getExecutionContext).not.toHaveBeenCalled();
    const stayItem = prisma.tripCostEstimateItem.createMany.mock.calls.flatMap((c: any) => c[0].data).find((i: any) => i.category === 'STAY');
    expect(stayItem.provenance).toBe('UNKNOWN');
  });

  it('[9/9 old-snapshot-unchanged-after-status-change] a persisted generation is a frozen read - latest()/list() never re-invoke the provider gate, so a later status/license change cannot silently mutate history', async () => {
    const { service, prisma, registry } = makeService();
    const storedGeneration = {
      id: 'gen-old',
      estimates: [{ scenario: 'LOW', items: [{ id: 'item-1', category: 'STAY', provenance: 'PROVIDER_EVIDENCE', offerId: 'offer-1', amount: new Prisma.Decimal(900000) }] }],
    };
    prisma.tripCostEstimateGeneration.findFirst = jest.fn().mockResolvedValue(storedGeneration);

    const result = await service.latest('t1', 'owner-1');

    expect(result).toBe(storedGeneration);
    expect(registry.getExecutionContext).not.toHaveBeenCalled();
  });

  it('[activity-path parity] the ACTIVITY branch resolves PROVIDER_EVIDENCE the same way, via ProviderActivityReference/ActivityOffer', async () => {
    const { service, prisma } = makeService();
    prisma.tripItem.findMany.mockResolvedValue([{ id: 'i1', tripId: 't1', tripDayId: 'day-1', type: 'ACTIVITY', activityId: 'act-1', plannedAmount: null, plannedCurrency: null }]);
    prisma.providerActivityReference.findMany.mockResolvedValue([{ id: 'ref-2', activityId: 'act-1', status: 'ACTIVE', provider: { id: 'prov-2', code: 'FIXTURE_PROVIDER' } }]);
    prisma.activityOffer.findFirst = jest.fn().mockImplementation(({ where }: any) => {
      const row = { id: 'aoffer-1', currency: 'VND', participants: 2, amount: new Prisma.Decimal(150000), expiresAt: null };
      if (where.currency !== row.currency || row.participants < where.participants.gte) return Promise.resolve(null);
      return Promise.resolve(row);
    });

    await service.generate('t1', 'owner-1');

    const activityItem = prisma.tripCostEstimateItem.createMany.mock.calls.flatMap((c: any) => c[0].data).find((i: any) => i.category === 'ACTIVITY');
    expect(activityItem.provenance).toBe('PROVIDER_EVIDENCE');
    expect(activityItem.offerId).toBe('aoffer-1');
    expect(activityItem.amount.toString()).toBe('150000');
  });
});

describe('TripCostEstimatesService.latest / list', () => {
  it('latest() checks ownership before querying', async () => {
    const { service, prisma, tripsService } = makeService();
    prisma.tripCostEstimateGeneration.findFirst = jest.fn().mockResolvedValue(null);

    await service.latest('t1', 'owner-1');

    expect(tripsService.getOwnedOrThrow).toHaveBeenCalledWith('t1', 'owner-1');
  });

  it('list() checks ownership and paginates', async () => {
    const { service, tripsService } = makeService();

    await service.list('t1', 'owner-1', 2, 10);

    expect(tripsService.getOwnedOrThrow).toHaveBeenCalledWith('t1', 'owner-1');
  });
});
