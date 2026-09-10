import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PublicationStatus } from '@prisma/client';
import { AccommodationsService } from './accommodations.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ProviderRegistryService } from '../providers/provider-registry.service';

describe('AccommodationsService', () => {
  let prisma: any;
  let audit: { log: jest.Mock };
  let registry: { getExecutionContext: jest.Mock };
  let service: AccommodationsService;

  beforeEach(() => {
    prisma = {
      country: { findUnique: jest.fn(), findFirst: jest.fn() },
      region: { findUnique: jest.fn(), findFirst: jest.fn() },
      city: { findUnique: jest.fn(), findFirst: jest.fn() },
      destination: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
      accommodation: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), create: jest.fn(), update: jest.fn() },
      accommodationTranslation: { upsert: jest.fn() },
      destinationAccommodation: { deleteMany: jest.fn(), createMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      providerAccommodationReference: { upsert: jest.fn(), findUnique: jest.fn() },
      accommodationOffer: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma))),
    };
    audit = { log: jest.fn() };
    registry = { getExecutionContext: jest.fn() };
    service = new AccommodationsService(prisma as unknown as PrismaService, audit as unknown as AuditService, registry as unknown as ProviderRegistryService);
  });

  const dto = { countryId: 'country-vn', type: 'HOTEL', translations: [{ locale: 'vi', name: 'Khách sạn Test' }] } as any;

  describe('create - hierarchy consistency', () => {
    it('rejects a countryId that does not exist', async () => {
      prisma.country.findUnique.mockResolvedValue(null);
      await expect(service.create(dto, 'actor-1')).rejects.toThrow(NotFoundException);
    });

    it('rejects a cityId belonging to a different country', async () => {
      prisma.country.findUnique.mockResolvedValue({ id: 'country-vn' });
      prisma.city.findUnique.mockResolvedValue({ id: 'city-tokyo', countryId: 'country-jp' });
      await expect(service.create({ ...dto, cityId: 'city-tokyo' }, 'actor-1')).rejects.toThrow(BadRequestException);
    });

    it('creates with a consistent Country -> Region -> City chain', async () => {
      prisma.country.findUnique.mockResolvedValue({ id: 'country-vn' });
      prisma.city.findUnique.mockResolvedValue({ id: 'city-hanoi', countryId: 'country-vn' });
      prisma.region.findUnique.mockResolvedValue({ id: 'region-hanoi', countryId: 'country-vn' });
      prisma.accommodation.create.mockResolvedValue({ id: 'acc-1' });
      await service.create({ ...dto, cityId: 'city-hanoi', regionId: 'region-hanoi' }, 'actor-1');
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'accommodation.created', entityType: 'ACCOMMODATION' }));
    });
  });

  describe('setDestinations - replace-style composition', () => {
    it('404s if the accommodation does not exist', async () => {
      prisma.accommodation.findUnique.mockResolvedValue(null);
      await expect(service.setDestinations('acc-1', ['dest-1'], 'actor-1')).rejects.toThrow(NotFoundException);
    });

    it('404s if a destinationId does not exist', async () => {
      prisma.accommodation.findUnique.mockResolvedValue({ id: 'acc-1' });
      prisma.destination.findMany.mockResolvedValue([]);
      await expect(service.setDestinations('acc-1', ['dest-missing'], 'actor-1')).rejects.toThrow(NotFoundException);
    });

    it('replaces the full set transactionally and audits it', async () => {
      prisma.accommodation.findUnique.mockResolvedValue({ id: 'acc-1' });
      prisma.destination.findMany.mockResolvedValue([{ id: 'dest-1' }]);
      await service.setDestinations('acc-1', ['dest-1'], 'actor-1');
      expect(prisma.destinationAccommodation.deleteMany).toHaveBeenCalledWith({ where: { accommodationId: 'acc-1' } });
      expect(prisma.destinationAccommodation.createMany).toHaveBeenCalledWith({ data: [{ destinationId: 'dest-1', accommodationId: 'acc-1', sortOrder: 0 }] });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'accommodation.destinations.set' }), expect.anything());
    });
  });

  describe('getOffers - date/occupancy/currency validation', () => {
    beforeEach(() => {
      prisma.accommodation.findUnique.mockResolvedValue({ id: 'acc-1', status: PublicationStatus.PUBLISHED, providerReferences: [] });
    });

    it('rejects checkOut <= checkIn', async () => {
      await expect(service.getOffers('hotel', { checkIn: '2026-12-03', checkOut: '2026-12-01', guests: 2, rooms: 1, currency: 'USD' })).rejects.toThrow(BadRequestException);
    });

    it('rejects zero guests', async () => {
      await expect(service.getOffers('hotel', { checkIn: '2026-12-01', checkOut: '2026-12-03', guests: 0, rooms: 1, currency: 'USD' })).rejects.toThrow(BadRequestException);
    });

    it('404s for a non-PUBLISHED accommodation', async () => {
      prisma.accommodation.findUnique.mockResolvedValue({ id: 'acc-1', status: PublicationStatus.DRAFT, providerReferences: [] });
      await expect(service.getOffers('hotel', { checkIn: '2026-12-01', checkOut: '2026-12-03', guests: 2, rooms: 1, currency: 'USD' })).rejects.toThrow(NotFoundException);
    });

    it('skips a provider reference whose gate fails (failure isolation) instead of throwing', async () => {
      prisma.accommodation.findUnique.mockResolvedValue({
        id: 'acc-1',
        status: PublicationStatus.PUBLISHED,
        providerReferences: [{ id: 'ref-1', provider: { code: 'SOME_PROVIDER' } }],
      });
      registry.getExecutionContext.mockResolvedValue({ ok: false, code: 'PROVIDER_INTEGRATION_SUSPENDED', message: 'suspended' });
      const result = await service.getOffers('hotel', { checkIn: '2026-12-01', checkOut: '2026-12-03', guests: 2, rooms: 1, currency: 'USD' });
      expect(result.offers).toEqual([]);
      expect(prisma.accommodationOffer.findMany).not.toHaveBeenCalled();
    });

    it('excludes an expired offer even when the provider gate passes', async () => {
      prisma.accommodation.findUnique.mockResolvedValue({
        id: 'acc-1',
        status: PublicationStatus.PUBLISHED,
        providerReferences: [{ id: 'ref-1', provider: { code: 'SOME_PROVIDER' } }],
      });
      registry.getExecutionContext.mockResolvedValue({
        ok: true,
        context: { attribution: { requirement: 'NOT_REQUIRED', displayText: null, logoRequired: false } },
      });
      prisma.accommodationOffer.findMany.mockResolvedValue([
        { id: 'offer-expired', currency: 'USD', amount: { toString: () => '100' }, availability: 'AVAILABLE', expiresAt: new Date(Date.now() - 1000), fetchedAt: new Date() },
        { id: 'offer-fresh', currency: 'USD', amount: { toString: () => '150' }, availability: 'AVAILABLE', expiresAt: new Date(Date.now() + 1000 * 60 * 60), fetchedAt: new Date() },
      ]);
      const result = await service.getOffers('hotel', { checkIn: '2026-12-01', checkOut: '2026-12-03', guests: 2, rooms: 1, currency: 'USD' });
      expect(result.offers).toHaveLength(1);
      expect((result.offers[0] as any).amount).toBe('150');
    });
  });

  describe('listPublic - slug/id resolution (post-G04-hardening pattern)', () => {
    it('resolves a country canonicalSlug/ISO/id and delegates to the id-based list()', async () => {
      prisma.country.findFirst.mockResolvedValue({ id: 'country-vn' });
      await service.listPublic({ country: 'viet-nam', locale: 'vi', page: 1, pageSize: 20 });
      expect(prisma.accommodation.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ countryId: 'country-vn' }) }));
    });

    it('an unresolvable country 404s - never silently broadens or empties', async () => {
      prisma.country.findFirst.mockResolvedValue(null);
      await expect(service.listPublic({ country: 'not-a-real-country', locale: 'vi', page: 1, pageSize: 20 })).rejects.toThrow(NotFoundException);
      expect(prisma.accommodation.findMany).not.toHaveBeenCalled();
    });
  });
});
