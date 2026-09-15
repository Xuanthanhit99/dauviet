import { resolveAssumptionCandidates } from './resolve-assumption-candidates';
import { PrismaService } from '../../prisma/prisma.service';

function makePrismaStub() {
  return { costAssumption: { findFirst: jest.fn() } } as any;
}

describe('resolveAssumptionCandidates (spec section 33/79/98)', () => {
  it('queries only the scope levels for which a context id was provided, plus GLOBAL always', async () => {
    const prisma = makePrismaStub();
    prisma.costAssumption.findFirst.mockResolvedValue(null);

    await resolveAssumptionCandidates(prisma as unknown as PrismaService, 'FOOD', '2026-06-15', { cityId: 'city-1' });

    // DESTINATION (no id) and REGION/COUNTRY (no id) must be skipped - only CITY and GLOBAL queried.
    expect(prisma.costAssumption.findFirst).toHaveBeenCalledTimes(2);
    const scopesQueried = prisma.costAssumption.findFirst.mock.calls.map((c: any) => c[0].where.scope);
    expect(scopesQueried).toEqual(['CITY', 'GLOBAL']);
  });

  it('returns candidates ordered most-specific-first: DESTINATION, CITY, REGION, COUNTRY, GLOBAL', async () => {
    const prisma = makePrismaStub();
    prisma.costAssumption.findFirst.mockImplementation(({ where }: any) => {
      return Promise.resolve({ id: `ca-${where.scope}`, scope: where.scope });
    });

    const result = await resolveAssumptionCandidates(prisma as unknown as PrismaService, 'STAY', '2026-06-15', {
      destinationId: 'dest-1',
      cityId: 'city-1',
      regionId: 'region-1',
      countryId: 'country-1',
    });

    expect(result.map((r) => r.id)).toEqual(['ca-DESTINATION', 'ca-CITY', 'ca-REGION', 'ca-COUNTRY', 'ca-GLOBAL']);
  });

  it('skips a scope level with no eligible row instead of leaving a gap', async () => {
    const prisma = makePrismaStub();
    prisma.costAssumption.findFirst.mockImplementation(({ where }: any) => {
      if (where.scope === 'CITY') return Promise.resolve(null);
      return Promise.resolve({ id: `ca-${where.scope}`, scope: where.scope });
    });

    const result = await resolveAssumptionCandidates(prisma as unknown as PrismaService, 'ACTIVITY', '2026-06-15', {
      destinationId: 'dest-1',
      cityId: 'city-1',
    });

    expect(result.map((r) => r.id)).toEqual(['ca-DESTINATION', 'ca-GLOBAL']);
  });

  it('filters to ACTIVE status and a date range covering tripDate, ordered by newest effectiveFrom then highest version', async () => {
    const prisma = makePrismaStub();
    prisma.costAssumption.findFirst.mockResolvedValue(null);

    await resolveAssumptionCandidates(prisma as unknown as PrismaService, 'TRANSPORT', '2026-06-15', { countryId: 'country-1' });

    const call = prisma.costAssumption.findFirst.mock.calls.find((c: any) => c[0].where.scope === 'COUNTRY')[0];
    expect(call.where.status).toBe('ACTIVE');
    expect(call.where.effectiveFrom).toEqual({ lte: new Date('2026-06-15') });
    expect(call.where.OR).toEqual([{ effectiveTo: null }, { effectiveTo: { gt: new Date('2026-06-15') } }]);
    expect(call.orderBy).toEqual([{ effectiveFrom: 'desc' }, { version: 'desc' }]);
  });

  it('GLOBAL scope always queries with scopeId: null, even if unrelated context ids are present', async () => {
    const prisma = makePrismaStub();
    prisma.costAssumption.findFirst.mockResolvedValue(null);

    await resolveAssumptionCandidates(prisma as unknown as PrismaService, 'FOOD', '2026-06-15', { destinationId: 'dest-1' });

    const globalCall = prisma.costAssumption.findFirst.mock.calls.find((c: any) => c[0].where.scope === 'GLOBAL')[0];
    expect(globalCall.where.scopeId).toBeNull();
  });

  it('returns an empty array when no context ids are given and no GLOBAL assumption exists either', async () => {
    const prisma = makePrismaStub();
    prisma.costAssumption.findFirst.mockResolvedValue(null);

    const result = await resolveAssumptionCandidates(prisma as unknown as PrismaService, 'OTHER', '2026-06-15', {});

    expect(result).toEqual([]);
    expect(prisma.costAssumption.findFirst).toHaveBeenCalledTimes(1); // only GLOBAL
  });
});
