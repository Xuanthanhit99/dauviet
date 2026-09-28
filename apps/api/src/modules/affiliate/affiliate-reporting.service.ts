import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ListAffiliateConversionsQueryDto } from './dto/affiliate-admin.dto';

/**
 * ADMIN-only commercial reporting (spec section 50/61) - trip role grants
 * no access here (spec section 49); a normal `USER`/trip `OWNER`/`EDITOR`/
 * `VIEWER` cannot reach any method on this service (enforced by
 * `@Roles(Role.ADMIN)` at the controller, live-proven in the authorization
 * matrix e2e test). No implicit FX anywhere - every aggregate is grouped by
 * currency, never summed across currencies.
 */
@Injectable()
export class AffiliateReportingService {
  constructor(private readonly prisma: PrismaService) {}

  async listConversions(query: ListAffiliateConversionsQueryDto) {
    const where = {
      ...(query.providerCode ? { provider: { code: query.providerCode } } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.currency ? { OR: [{ bookingCurrency: query.currency }, { commissionCurrency: query.currency }] } : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.affiliateConversion.count({ where }),
      this.prisma.affiliateConversion.findMany({
        where,
        include: { provider: { select: { code: true, name: true } } },
        orderBy: [{ ingestedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  /** Clicks/conversions/confirmed-commission grouped by provider and currency (spec section 61) - never combined across currencies. */
  async summary() {
    const [clicksByProvider, conversionsByProviderStatus, commissionRows] = await Promise.all([
      this.prisma.affiliateClick.groupBy({ by: ['providerId', 'surface'], _count: { _all: true } }),
      this.prisma.affiliateConversion.groupBy({ by: ['providerId', 'status'], _count: { _all: true } }),
      this.prisma.affiliateConversion.groupBy({
        by: ['providerId', 'commissionCurrency'],
        where: { status: 'CONFIRMED', commissionCurrency: { not: null } },
        _sum: { commissionAmount: true },
      }),
    ]);

    const providerIds = [...new Set([...clicksByProvider.map((c) => c.providerId), ...conversionsByProviderStatus.map((c) => c.providerId), ...commissionRows.map((c) => c.providerId)])];
    const providers = await this.prisma.externalProvider.findMany({ where: { id: { in: providerIds } }, select: { id: true, code: true, name: true } });
    const providerById = new Map(providers.map((p) => [p.id, p]));

    return {
      clicksByProviderAndSurface: clicksByProvider.map((c) => ({ provider: providerById.get(c.providerId) ?? null, surface: c.surface, count: c._count._all })),
      conversionsByProviderAndStatus: conversionsByProviderStatus.map((c) => ({ provider: providerById.get(c.providerId) ?? null, status: c.status, count: c._count._all })),
      confirmedCommissionByProviderAndCurrency: commissionRows.map((c) => ({ provider: providerById.get(c.providerId) ?? null, currency: c.commissionCurrency, totalAmount: c._sum.commissionAmount })),
    };
  }
}
