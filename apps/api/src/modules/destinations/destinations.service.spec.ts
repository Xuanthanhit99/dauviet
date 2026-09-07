import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DestinationType, PublicationStatus } from '@prisma/client';
import { DestinationsService } from './destinations.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * G01 spec section 11/30/42 (DESTINATION coverage): country required,
 * optional city/region, cross-entity consistency validation, type,
 * localization, publication.
 */
describe('DestinationsService', () => {
  let prisma: any;
  let audit: { log: jest.Mock };
  let service: DestinationsService;

  beforeEach(() => {
    prisma = {
      country: { findUnique: jest.fn() },
      region: { findUnique: jest.fn() },
      city: { findUnique: jest.fn() },
      destination: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      destinationTranslation: { upsert: jest.fn() },
      $transaction: jest.fn(),
    };
    audit = { log: jest.fn() };
    service = new DestinationsService(prisma as unknown as PrismaService, audit as unknown as AuditService);
  });

  const dto = {
    countryId: 'country-jp',
    type: DestinationType.HISTORIC_DISTRICT,
    translations: [{ locale: 'vi', name: 'Gion' }],
  } as any;

  describe('create - hierarchy consistency', () => {
    it('rejects a countryId that does not exist', async () => {
      prisma.country.findUnique.mockResolvedValue(null);
      await expect(service.create(dto, 'actor-1')).rejects.toThrow(NotFoundException);
    });

    it('creates a destination with only Country (no Region/City) - "Country -> Destination" shape', async () => {
      prisma.country.findUnique.mockResolvedValue({ id: 'country-jp' });
      prisma.destination.findUnique.mockResolvedValue(null); // slug free
      prisma.destination.create.mockResolvedValue({ id: 'd1', canonicalSlug: 'gion', translations: [] });

      const result = await service.create(dto, 'actor-1');
      expect(result.id).toBe('d1');
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'destination.created', entityType: 'DESTINATION' }));
    });

    it('rejects a regionId belonging to a different country', async () => {
      prisma.country.findUnique.mockResolvedValue({ id: 'country-jp' });
      prisma.region.findUnique.mockResolvedValue({ id: 'region-vn', countryId: 'country-vn' });
      await expect(service.create({ ...dto, regionId: 'region-vn' }, 'actor-1')).rejects.toThrow(BadRequestException);
    });

    it('rejects a cityId belonging to a different country', async () => {
      prisma.country.findUnique.mockResolvedValue({ id: 'country-jp' });
      prisma.city.findUnique.mockResolvedValue({ id: 'city-hanoi', countryId: 'country-vn', regionId: null });
      await expect(service.create({ ...dto, cityId: 'city-hanoi' }, 'actor-1')).rejects.toThrow(BadRequestException);
    });

    it("rejects a regionId that contradicts the given city's own region", async () => {
      prisma.country.findUnique.mockResolvedValue({ id: 'country-jp' });
      prisma.city.findUnique.mockResolvedValue({ id: 'city-kyoto', countryId: 'country-jp', regionId: 'region-kyoto-pref' });
      prisma.region.findUnique.mockResolvedValue({ id: 'region-tokyo', countryId: 'country-jp' });

      await expect(
        service.create({ ...dto, cityId: 'city-kyoto', regionId: 'region-tokyo' }, 'actor-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows a consistent Country -> Region -> City -> Destination chain', async () => {
      prisma.country.findUnique.mockResolvedValue({ id: 'country-jp' });
      prisma.city.findUnique.mockResolvedValue({ id: 'city-kyoto', countryId: 'country-jp', regionId: 'region-kyoto-pref' });
      prisma.region.findUnique.mockResolvedValue({ id: 'region-kyoto-pref', countryId: 'country-jp' });
      prisma.destination.findUnique.mockResolvedValue(null);
      prisma.destination.create.mockResolvedValue({ id: 'd1', canonicalSlug: 'gion', translations: [] });

      await expect(
        service.create({ ...dto, cityId: 'city-kyoto', regionId: 'region-kyoto-pref' }, 'actor-1'),
      ).resolves.toBeDefined();
    });
  });

  describe('setStatus', () => {
    it('refuses to publish a destination with no translations', async () => {
      prisma.destination.findUnique.mockResolvedValue({ id: 'd1', translations: [] });
      await expect(service.setStatus('d1', PublicationStatus.PUBLISHED, 'actor-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('findBySlug (public visibility)', () => {
    const base = {
      id: 'd1',
      canonicalSlug: 'gion',
      type: DestinationType.HISTORIC_DISTRICT,
      latitude: 35.0037,
      longitude: 135.7752,
      country: { id: 'country-jp', canonicalSlug: 'nhat-ban', iso2: 'JP' },
      region: null,
      city: { id: 'city-kyoto', canonicalSlug: 'kyoto' },
      translations: [{ locale: 'vi', name: 'Gion' }],
    };

    it('404s a DRAFT destination on the public path', async () => {
      prisma.destination.findUnique.mockResolvedValue({ ...base, status: PublicationStatus.DRAFT });
      await expect(service.findBySlug('gion', 'vi')).rejects.toThrow(NotFoundException);
    });

    it('returns a PUBLISHED destination with its type and city', async () => {
      prisma.destination.findUnique.mockResolvedValue({ ...base, status: PublicationStatus.PUBLISHED });
      const result = await service.findBySlug('gion', 'vi');
      expect(result.type).toBe(DestinationType.HISTORIC_DISTRICT);
      expect(result.city?.slug).toBe('kyoto');
    });
  });
});
