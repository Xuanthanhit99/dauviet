import { AffiliateReportingService } from './affiliate-reporting.service';
import { PrismaService } from '../../prisma/prisma.service';

function makeHarness() {
  const prisma: any = {
    affiliateConversion: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]) },
    affiliateClick: { groupBy: jest.fn().mockResolvedValue([]) },
    externalProvider: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((arg: unknown) => Promise.all(arg as Promise<unknown>[])),
  };
  const service = new AffiliateReportingService(prisma as unknown as PrismaService);
  return { service, prisma };
}

describe('AffiliateReportingService.listConversions (spec section 50)', () => {
  it('filters by providerCode/status/currency when supplied', async () => {
    const { service, prisma } = makeHarness();
    await service.listConversions({ page: 1, pageSize: 20, providerCode: 'X', status: 'CONFIRMED', currency: 'USD' } as any);
    expect(prisma.affiliateConversion.count).toHaveBeenCalledWith({
      where: { provider: { code: 'X' }, status: 'CONFIRMED', OR: [{ bookingCurrency: 'USD' }, { commissionCurrency: 'USD' }] },
    });
  });

  it('paginates deterministically with no filters', async () => {
    const { service, prisma } = makeHarness();
    await service.listConversions({ page: 2, pageSize: 10 } as any);
    expect(prisma.affiliateConversion.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {}, skip: 10, take: 10 }));
  });
});

describe('AffiliateReportingService.summary (spec section 61 - grouped by currency, no implicit FX)', () => {
  it('groups confirmed commission by provider AND currency, never combining currencies', async () => {
    const { service, prisma } = makeHarness();
    prisma.affiliateConversion.groupBy
      .mockResolvedValueOnce([{ providerId: 'p1', status: 'CONFIRMED', _count: { _all: 3 } }])
      .mockResolvedValueOnce([
        { providerId: 'p1', commissionCurrency: 'USD', _sum: { commissionAmount: '40.00' } },
        { providerId: 'p1', commissionCurrency: 'VND', _sum: { commissionAmount: '900000.00' } },
      ]);
    prisma.externalProvider.findMany.mockResolvedValue([{ id: 'p1', code: 'FIXTURE', name: 'Fixture' }]);

    const result = await service.summary();
    expect(result.confirmedCommissionByProviderAndCurrency).toHaveLength(2);
    expect(result.confirmedCommissionByProviderAndCurrency.map((r) => r.currency).sort()).toEqual(['USD', 'VND']);
  });

  it('only aggregates CONFIRMED conversions for commission totals', async () => {
    const { service, prisma } = makeHarness();
    await service.summary();
    expect(prisma.affiliateConversion.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'CONFIRMED' }) }),
    );
  });
});
