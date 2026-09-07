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
  let service: CountriesService;

  beforeEach(() => {
    prisma = {
      country: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn() },
      countryTranslation: { upsert: jest.fn() },
      $transaction: jest.fn(),
    };
    audit = { log: jest.fn() };
    service = new CountriesService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      {} as any,
      {} as any,
      {} as any,
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
});
