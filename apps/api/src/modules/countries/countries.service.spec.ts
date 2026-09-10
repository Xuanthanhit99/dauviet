import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, PublicationStatus } from '@prisma/client';
import { CountriesService } from './countries.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * G01 spec section 42 (COUNTRY coverage): ISO uniqueness, translation
 * uniqueness/upsert, public-only-PUBLISHED, locale fallback, slug
 * resolution (auto-suffix collision, same mechanism as Place.canonicalSlug).
 */
describe('CountriesService', () => {
  let prisma: any;
  let audit: { log: jest.Mock };
  let regions: { list: jest.Mock; listPublic: jest.Mock };
  let cities: { list: jest.Mock; listPublic: jest.Mock };
  let destinations: { list: jest.Mock; listPublic: jest.Mock };
  let service: CountriesService;

  beforeEach(() => {
    prisma = {
      country: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn() },
      countryTranslation: { upsert: jest.fn() },
      $transaction: jest.fn(),
    };
    audit = { log: jest.fn() };
    regions = { list: jest.fn(), listPublic: jest.fn() };
    cities = { list: jest.fn(), listPublic: jest.fn() };
    destinations = { list: jest.fn(), listPublic: jest.fn() };
    service = new CountriesService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      regions as any,
      cities as any,
      destinations as any,
    );
  });

  describe('create', () => {
    const dto = {
      iso2: 'VN',
      iso3: 'VNM',
      defaultLocale: 'vi',
      defaultCurrency: 'VND',
      translations: [{ locale: 'vi', name: 'Việt Nam' }],
    } as any;

    it('creates a DRAFT country, auto-suffixing the slug on collision, and logs an audit entry', async () => {
      prisma.country.findUnique
        .mockResolvedValueOnce({ id: 'existing' }) // slug collision on first try
        .mockResolvedValueOnce(null); // second try free
      prisma.country.create.mockResolvedValue({ id: 'c1', canonicalSlug: 'viet-nam-2', translations: [] });

      const result = await service.create(dto, 'actor-1');

      expect(prisma.country.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: PublicationStatus.DRAFT, canonicalSlug: 'viet-nam-2' }) }),
      );
      expect(result.id).toBe('c1');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: 'actor-1', action: 'country.created', entityType: 'COUNTRY' }),
      );
    });

    it('maps a duplicate iso2/iso3 (Prisma P2002) to COUNTRY_ISO_CONFLICT', async () => {
      prisma.country.findUnique.mockResolvedValue(null);
      prisma.country.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '5.20.0', meta: { target: ['iso2'] } }),
      );

      await expect(service.create(dto, 'actor-1')).rejects.toThrow(ConflictException);
    });

    it('rejects a country submitted with zero translations', async () => {
      await expect(service.create({ ...dto, translations: [] }, 'actor-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('findBySlug (public visibility)', () => {
    const base = {
      id: 'c1',
      canonicalSlug: 'nhat-ban',
      iso2: 'JP',
      iso3: 'JPN',
      defaultLocale: 'ja',
      defaultCurrency: 'JPY',
      latitude: 36.2,
      longitude: 138.25,
      translations: [{ locale: 'vi', name: 'Nhật Bản' }],
    };

    it('404s a DRAFT country on the public path', async () => {
      prisma.country.findUnique.mockResolvedValue({ ...base, status: PublicationStatus.DRAFT });
      await expect(service.findBySlug('nhat-ban', 'vi')).rejects.toThrow(NotFoundException);
    });

    it('returns a PUBLISHED country and reports locale fallback honestly', async () => {
      prisma.country.findUnique.mockResolvedValue({ ...base, status: PublicationStatus.PUBLISHED });
      const result = await service.findBySlug('nhat-ban', 'en');
      expect(result.slug).toBe('nhat-ban');
      expect(result.meta.requestedLocale).toBe('en');
      expect(result.meta.resolvedLocale).toBe('vi');
      expect(result.meta.fallbackApplied).toBe(true);
    });

    it('allows a DRAFT country through when includeUnpublished is set (admin path)', async () => {
      prisma.country.findUnique.mockResolvedValue({ ...base, status: PublicationStatus.DRAFT });
      const result = await service.findBySlug('nhat-ban', 'vi', true);
      expect(result.status).toBe(PublicationStatus.DRAFT);
    });
  });

  describe('setStatus', () => {
    it('refuses to publish a country with no translations', async () => {
      prisma.country.findUnique.mockResolvedValue({ id: 'c1', translations: [] });
      await expect(service.setStatus('c1', PublicationStatus.PUBLISHED, 'actor-1')).rejects.toThrow(BadRequestException);
    });

    it('publishes and audits when at least one translation exists', async () => {
      prisma.country.findUnique.mockResolvedValue({ id: 'c1', translations: [{ locale: 'vi' }] });
      prisma.country.update.mockResolvedValue({ id: 'c1', status: PublicationStatus.PUBLISHED });
      await service.setStatus('c1', PublicationStatus.PUBLISHED, 'actor-1');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'country.status.changed', metadata: { status: PublicationStatus.PUBLISHED } }),
      );
    });
  });

  describe('list', () => {
    it('only ever queries PUBLISHED countries', async () => {
      prisma.$transaction.mockResolvedValue([0, []]);
      await service.list({ locale: 'vi', page: 1, pageSize: 20 });
      expect(prisma.country.count).toHaveBeenCalledWith({ where: { status: PublicationStatus.PUBLISHED } });
    });
  });

  /**
   * Post-G04 API consistency hardening (see
   * docs/backend/POST_G04_API_CONSISTENCY_HARDENING.md): `getCities`/
   * `getDestinations`' `region`/`city` query params used to be forwarded
   * straight through as `regionId`/`cityId` to the id-based `cities.list()`/
   * `destinations.list()` - a real public slug silently matched nothing.
   * Fixed by delegating to `cities.listPublic()`/`destinations.listPublic()`
   * instead, passing the already-resolved `country.id` through the same
   * resolver's id-fallback branch (one resolution boundary, not two
   * different calling conventions for the same method).
   */
  describe('getRegions/getCities/getDestinations (post-G04 API consistency hardening)', () => {
    beforeEach(() => {
      prisma.country.findUnique.mockResolvedValue({ id: 'country-vn', status: PublicationStatus.PUBLISHED });
    });

    it('getRegions resolves the country by slug and delegates to the id-based regions.list()', async () => {
      await service.getRegions('viet-nam', 'vi', 1, 20, 'PROVINCE' as any);
      expect(regions.list).toHaveBeenCalledWith({ countryId: 'country-vn', type: 'PROVINCE', locale: 'vi', page: 1, pageSize: 20 });
    });

    it('getCities delegates to cities.listPublic() (not the id-based list()) so a real region slug resolves', async () => {
      await service.getCities('viet-nam', 'vi', 1, 20, 'ha-noi');
      expect(cities.listPublic).toHaveBeenCalledWith({ country: 'country-vn', region: 'ha-noi', locale: 'vi', page: 1, pageSize: 20 });
      expect(cities.list).not.toHaveBeenCalled();
    });

    it('getDestinations delegates to destinations.listPublic() (not the id-based list()) so real region/city slugs resolve', async () => {
      await service.getDestinations('viet-nam', 'vi', 1, 20, 'ha-noi', 'ha-noi', 'HISTORIC_DISTRICT' as any);
      expect(destinations.listPublic).toHaveBeenCalledWith({
        country: 'country-vn',
        region: 'ha-noi',
        city: 'ha-noi',
        type: 'HISTORIC_DISTRICT',
        locale: 'vi',
        page: 1,
        pageSize: 20,
      });
      expect(destinations.list).not.toHaveBeenCalled();
    });

    it('404s before delegating if the country slug itself does not resolve', async () => {
      prisma.country.findUnique.mockResolvedValue(null);
      await expect(service.getCities('not-a-real-country', 'vi', 1, 20)).rejects.toThrow(NotFoundException);
      expect(cities.listPublic).not.toHaveBeenCalled();
    });
  });
});
