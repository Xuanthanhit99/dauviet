import { NotFoundException } from '@nestjs/common';
import { PublicationStatus } from '@prisma/client';
import { RestaurantsService } from './restaurants.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ProviderRegistryService } from '../providers/provider-registry.service';

describe('RestaurantsService', () => {
  let prisma: any;
  let audit: { log: jest.Mock };
  let registry: { getExecutionContext: jest.Mock };
  let service: RestaurantsService;

  beforeEach(() => {
    prisma = {
      country: { findUnique: jest.fn(), findFirst: jest.fn() },
      region: { findUnique: jest.fn(), findFirst: jest.fn() },
      city: { findUnique: jest.fn(), findFirst: jest.fn() },
      cuisine: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
      restaurant: { findUnique: jest.fn(), create: jest.fn(), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      restaurantTranslation: { upsert: jest.fn() },
      restaurantCuisine: { deleteMany: jest.fn(), createMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      providerRestaurantReference: { upsert: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      $transaction: jest.fn((arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma))),
    };
    audit = { log: jest.fn() };
    registry = { getExecutionContext: jest.fn() };
    service = new RestaurantsService(prisma as unknown as PrismaService, audit as unknown as AuditService, registry as unknown as ProviderRegistryService);
  });

  it('creates and audits with entityType RESTAURANT', async () => {
    prisma.country.findUnique.mockResolvedValue({ id: 'country-vn' });
    prisma.restaurant.create.mockResolvedValue({ id: 'r-1' });
    await service.create({ countryId: 'country-vn', translations: [{ locale: 'vi', name: 'Quán Test' }] } as any, 'actor-1');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'restaurant.created', entityType: 'RESTAURANT' }));
  });

  it('upsertProviderReference propagates a failed gate as the same error code', async () => {
    registry.getExecutionContext.mockResolvedValue({ ok: false, code: 'PROVIDER_NOT_ACTIVE', message: 'not active' });
    await expect(service.upsertProviderReference({ providerCode: 'X', externalEntityId: 'e1' } as any, 'actor-1')).rejects.toThrow(NotFoundException);
  });

  it('getOperationalSnapshot 404s for a non-PUBLISHED restaurant', async () => {
    prisma.restaurant.findUnique.mockResolvedValue({ id: 'r-1', status: PublicationStatus.DRAFT, providerReferences: [] });
    await expect(service.getOperationalSnapshot('quan-test')).rejects.toThrow(NotFoundException);
  });

  it('getOperationalSnapshot skips a provider whose gate fails, isolating the failure', async () => {
    prisma.restaurant.findUnique.mockResolvedValue({
      id: 'r-1',
      status: PublicationStatus.PUBLISHED,
      providerReferences: [{ id: 'ref-1', provider: { code: 'X' }, operationalSnapshots: [{ fetchedAt: new Date(), expiresAt: null }] }],
    });
    registry.getExecutionContext.mockResolvedValue({ ok: false, code: 'PROVIDER_INTEGRATION_SUSPENDED', message: 'suspended' });
    const result = await service.getOperationalSnapshot('quan-test');
    expect(result.snapshots).toEqual([]);
  });
});
