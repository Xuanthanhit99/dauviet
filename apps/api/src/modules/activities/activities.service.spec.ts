import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PublicationStatus } from '@prisma/client';
import { ActivitiesService } from './activities.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ProviderRegistryService } from '../providers/provider-registry.service';

describe('ActivitiesService', () => {
  let prisma: any;
  let audit: { log: jest.Mock };
  let registry: { getExecutionContext: jest.Mock };
  let service: ActivitiesService;

  beforeEach(() => {
    prisma = {
      country: { findUnique: jest.fn(), findFirst: jest.fn() },
      attraction: { findUnique: jest.fn() },
      destination: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
      activity: { findUnique: jest.fn(), create: jest.fn(), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      activityTranslation: { upsert: jest.fn() },
      destinationActivity: { deleteMany: jest.fn(), createMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      providerActivityReference: { upsert: jest.fn(), findUnique: jest.fn() },
      activityOffer: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma))),
    };
    audit = { log: jest.fn() };
    registry = { getExecutionContext: jest.fn() };
    service = new ActivitiesService(prisma as unknown as PrismaService, audit as unknown as AuditService, registry as unknown as ProviderRegistryService);
  });

  const dto = { countryId: 'country-vn', translations: [{ locale: 'vi', name: 'Tour Test' }] } as any;

  it('rejects an attractionId that does not exist', async () => {
    prisma.country.findUnique.mockResolvedValue({ id: 'country-vn' });
    prisma.attraction.findUnique.mockResolvedValue(null);
    await expect(service.create({ ...dto, attractionId: 'missing-attraction' }, 'actor-1')).rejects.toThrow(NotFoundException);
  });

  it('creates fine with no attractionId (Activity mapping is optional, spec section 43)', async () => {
    prisma.country.findUnique.mockResolvedValue({ id: 'country-vn' });
    prisma.activity.create.mockResolvedValue({ id: 'act-1' });
    await service.create(dto, 'actor-1');
    expect(prisma.attraction.findUnique).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'activity.created', entityType: 'ACTIVITY' }));
  });

  describe('getOffers', () => {
    it('rejects zero participants', async () => {
      await expect(service.getOffers('tour', { date: '2026-12-05', participants: 0, currency: 'USD' })).rejects.toThrow(BadRequestException);
    });

    it('excludes an expired offer, never presenting it as current', async () => {
      prisma.activity.findUnique.mockResolvedValue({ id: 'act-1', status: PublicationStatus.PUBLISHED, providerReferences: [{ id: 'ref-1', provider: { code: 'X' } }] });
      registry.getExecutionContext.mockResolvedValue({ ok: true, context: { attribution: { requirement: 'NOT_REQUIRED', displayText: null, logoRequired: false } } });
      prisma.activityOffer.findMany.mockResolvedValue([
        { currency: 'USD', amount: { toString: () => '30' }, durationMinutes: 60, availability: 'AVAILABLE', expiresAt: new Date(Date.now() - 1000), fetchedAt: new Date(), bookingUrl: null },
      ]);
      const result = await service.getOffers('tour', { date: '2026-12-05', participants: 2, currency: 'USD' });
      expect(result.offers).toEqual([]);
    });
  });
});
