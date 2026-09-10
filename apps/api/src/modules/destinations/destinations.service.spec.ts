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
  let media: { findPublicById: jest.Mock };
  let service: DestinationsService;

  beforeEach(() => {
    prisma = {
      country: { findUnique: jest.fn() },
      region: { findUnique: jest.fn() },
      city: { findUnique: jest.fn() },
      destination: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), update: jest.fn() },
      destinationTranslation: { upsert: jest.fn() },
      $transaction: jest.fn(),
    };
    audit = { log: jest.fn() };
    media = { findPublicById: jest.fn() };
    service = new DestinationsService(prisma as unknown as PrismaService, audit as unknown as AuditService, media as any);
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
      heroMediaId: null,
      importance: 0,
      themeLinks: [],
      placeLinks: [],
      storyLinks: [],
      journeyLinks: [],
      eventLinks: [],
      countryId: 'country-jp',
      regionId: null,
      cityId: 'city-kyoto',
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

  describe('setPlaces (G04 composition)', () => {
    beforeEach(() => {
      prisma.destination.findUnique.mockResolvedValue({ id: 'd1', countryId: 'country-jp' });
      prisma.place = { findMany: jest.fn() };
      prisma.destinationPlace = { deleteMany: jest.fn(), create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'dp1', ...data })) };
      prisma.$transaction.mockImplementation((cb: any) => (typeof cb === 'function' ? cb(prisma) : Promise.all(cb)));
    });

    it('rejects a duplicate placeId within the same request', async () => {
      await expect(service.setPlaces('d1', { places: [{ placeId: 'p1' }, { placeId: 'p1' }] } as any, 'actor-1')).rejects.toThrow(BadRequestException);
    });

    it('rejects a placeId that does not exist', async () => {
      prisma.place.findMany.mockResolvedValue([]);
      await expect(service.setPlaces('d1', { places: [{ placeId: 'p1' }] } as any, 'actor-1')).rejects.toThrow(NotFoundException);
    });

    it('rejects a Place whose currentCountryId differs from the Destination country (spec 15/45)', async () => {
      prisma.place.findMany.mockResolvedValue([{ id: 'p1', currentCountryId: 'country-vn' }]);
      await expect(service.setPlaces('d1', { places: [{ placeId: 'p1' }] } as any, 'actor-1')).rejects.toThrow(BadRequestException);
    });

    it('allows a Place with no currentCountryId set (fail-safe: never blocks on absent data)', async () => {
      prisma.place.findMany.mockResolvedValue([{ id: 'p1', currentCountryId: null }]);
      await expect(service.setPlaces('d1', { places: [{ placeId: 'p1', role: 'CORE' }] } as any, 'actor-1')).resolves.toBeDefined();
      expect(prisma.destinationPlace.deleteMany).toHaveBeenCalledWith({ where: { destinationId: 'd1' } });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'destination.places.set' }), prisma);
    });

    it('runs the replace inside $transaction (spec section 42 - atomic delete+recreate+audit)', async () => {
      prisma.place.findMany.mockResolvedValue([{ id: 'p1', currentCountryId: null }]);
      await service.setPlaces('d1', { places: [{ placeId: 'p1' }] } as any, 'actor-1');
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('getRelated (G04 - deterministic, self-excluded)', () => {
    it('excludes the source destination from its own related pool via the where clause', async () => {
      prisma.destination.findUnique.mockResolvedValue({ id: 'd1', countryId: 'country-jp', cityId: null, regionId: null, themeLinks: [] });
      prisma.destination.findMany.mockResolvedValue([
        { id: 'd2', canonicalSlug: 'nara', countryId: 'country-jp', cityId: null, regionId: null, importance: 5, themeLinks: [], translations: [] },
      ]);
      const result = await service.getRelated('d1', 'vi');
      expect(prisma.destination.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: { not: 'd1' } }) }),
      );
      expect(result.every((r) => r.id !== 'd1')).toBe(true);
    });

    it('is deterministic for a tie (same score) - tie-break by canonicalSlug ASC', async () => {
      prisma.destination.findUnique.mockResolvedValue({ id: 'd1', countryId: 'country-jp', cityId: null, regionId: null, themeLinks: [] });
      prisma.destination.findMany.mockResolvedValue([
        { id: 'd3', canonicalSlug: 'zzz', countryId: 'country-jp', cityId: null, regionId: null, importance: 5, themeLinks: [], translations: [] },
        { id: 'd2', canonicalSlug: 'aaa', countryId: 'country-jp', cityId: null, regionId: null, importance: 5, themeLinks: [], translations: [] },
      ]);
      const first = await service.getRelated('d1', 'vi');
      const second = await service.getRelated('d1', 'vi');
      expect(first.map((r) => r.slug)).toEqual(['aaa', 'zzz']);
      expect(first.map((r) => r.slug)).toEqual(second.map((r) => r.slug));
    });
  });
});
