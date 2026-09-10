import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PublicationStatus, RegionType } from '@prisma/client';
import { RegionsService } from './regions.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * G01 spec section 30/42 (REGION coverage): country consistency, parent
 * hierarchy, cycle prevention, cross-country parent rejection.
 */
describe('RegionsService', () => {
  let prisma: any;
  let audit: { log: jest.Mock };
  let service: RegionsService;

  beforeEach(() => {
    prisma = {
      country: { findUnique: jest.fn(), findFirst: jest.fn() },
      region: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      regionTranslation: { upsert: jest.fn() },
      $transaction: jest.fn((ops: any[]) => Promise.all(ops)),
    };
    audit = { log: jest.fn() };
    service = new RegionsService(prisma as unknown as PrismaService, audit as unknown as AuditService);
  });

  const dto = {
    countryId: 'country-vn',
    type: RegionType.METROPOLITAN_CITY,
    translations: [{ locale: 'vi', name: 'Hà Nội' }],
  } as any;

  describe('create', () => {
    it('rejects a region whose countryId does not exist', async () => {
      prisma.country.findUnique.mockResolvedValue(null);
      await expect(service.create(dto, 'actor-1')).rejects.toThrow(NotFoundException);
    });

    it('rejects a parentRegionId belonging to a different country', async () => {
      prisma.country.findUnique.mockResolvedValue({ id: 'country-vn' });
      prisma.region.findUnique.mockResolvedValue({ id: 'parent-jp', countryId: 'country-jp', parentRegionId: null });
      await expect(service.create({ ...dto, parentRegionId: 'parent-jp' }, 'actor-1')).rejects.toThrow(BadRequestException);
    });

    it('creates a top-level region and logs an audit entry when no parent is given', async () => {
      prisma.country.findUnique.mockResolvedValue({ id: 'country-vn' });
      prisma.region.findUnique.mockResolvedValue(null); // slug collision check: free
      prisma.region.create.mockResolvedValue({ id: 'r1', canonicalSlug: 'ha-noi', translations: [] });

      const result = await service.create(dto, 'actor-1');

      expect(result.id).toBe('r1');
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'region.created', entityType: 'REGION' }));
    });
  });

  describe('update - parent cycle prevention', () => {
    it('rejects setting a region as its own parent (direct self-cycle)', async () => {
      prisma.region.findUnique
        .mockResolvedValueOnce({ id: 'r1', countryId: 'country-vn' }) // the region being updated
        .mockResolvedValueOnce({ id: 'r1', countryId: 'country-vn', parentRegionId: null }); // parent lookup for same-country check
      await expect(service.update('r1', { parentRegionId: 'r1' } as any, 'actor-1')).rejects.toThrow(BadRequestException);
    });

    it('rejects a multi-level cycle (r1 -> r2 -> r1)', async () => {
      prisma.region.findUnique.mockImplementation(({ where }: any) => {
        if (where.id === 'r1') return Promise.resolve({ id: 'r1', countryId: 'country-vn', parentRegionId: null });
        if (where.id === 'r2') return Promise.resolve({ id: 'r2', countryId: 'country-vn', parentRegionId: 'r1' });
        return Promise.resolve(null);
      });
      // Attempting to set r1's parent to r2, while r2's parent is already r1 -> cycle.
      await expect(service.update('r1', { parentRegionId: 'r2' } as any, 'actor-1')).rejects.toThrow(BadRequestException);
    });

    it('allows a valid, acyclic parent reassignment within the same country', async () => {
      prisma.region.findUnique.mockImplementation(({ where }: any) => {
        if (where.id === 'r1') return Promise.resolve({ id: 'r1', countryId: 'country-vn', parentRegionId: null });
        if (where.id === 'r2') return Promise.resolve({ id: 'r2', countryId: 'country-vn', parentRegionId: null });
        return Promise.resolve(null);
      });
      prisma.region.update.mockResolvedValue({ id: 'r1', parentRegionId: 'r2' });

      const result = await service.update('r1', { parentRegionId: 'r2' } as any, 'actor-1');
      expect(result.parentRegionId).toBe('r2');
    });
  });

  describe('findBySlug (public visibility)', () => {
    const base = {
      id: 'r1',
      canonicalSlug: 'ha-noi',
      type: RegionType.METROPOLITAN_CITY,
      code: null,
      latitude: 21.0,
      longitude: 105.8,
      country: { id: 'country-vn', canonicalSlug: 'viet-nam', iso2: 'VN' },
      parentRegion: null,
      translations: [{ locale: 'vi', name: 'Hà Nội' }],
    };

    it('404s a DRAFT region on the public path', async () => {
      prisma.region.findUnique.mockResolvedValue({ ...base, status: PublicationStatus.DRAFT });
      await expect(service.findBySlug('ha-noi', 'vi')).rejects.toThrow(NotFoundException);
    });

    it('returns a PUBLISHED region', async () => {
      prisma.region.findUnique.mockResolvedValue({ ...base, status: PublicationStatus.PUBLISHED });
      const result = await service.findBySlug('ha-noi', 'vi');
      expect(result.slug).toBe('ha-noi');
      expect(result.country.slug).toBe('viet-nam');
    });
  });

  /**
   * Post-G04 API consistency hardening regression (see
   * docs/backend/POST_G04_API_CONSISTENCY_HARDENING.md): `RegionsController
   * .list()` used to pass `?country=`/`?parentRegion=` straight through as
   * `countryId`/`parentRegionId`, so a real public slug silently matched
   * nothing. `listPublic` is the fix.
   */
  describe('listPublic (post-G04 API consistency hardening)', () => {
    const baseArgs = { locale: 'vi', page: 1, pageSize: 20 };

    it('resolves a country canonicalSlug to countryId', async () => {
      prisma.country.findFirst.mockResolvedValue({ id: 'country-vn' });
      await service.listPublic({ country: 'viet-nam', ...baseArgs });
      expect(prisma.country.findFirst).toHaveBeenCalledWith({
        where: { status: PublicationStatus.PUBLISHED, OR: [{ canonicalSlug: 'viet-nam' }, { iso2: 'viet-nam' }, { iso3: 'viet-nam' }, { id: 'viet-nam' }] },
      });
      expect(prisma.region.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ countryId: 'country-vn' }) }));
    });

    it('resolves a country ISO2 code to countryId', async () => {
      prisma.country.findFirst.mockResolvedValue({ id: 'country-vn' });
      await service.listPublic({ country: 'VN', ...baseArgs });
      expect(prisma.region.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ countryId: 'country-vn' }) }));
    });

    it('resolves a country ISO3 code to countryId', async () => {
      prisma.country.findFirst.mockResolvedValue({ id: 'country-vn' });
      await service.listPublic({ country: 'VNM', ...baseArgs });
      expect(prisma.region.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ countryId: 'country-vn' }) }));
    });

    it('resolves a parentRegion canonicalSlug to parentRegionId', async () => {
      prisma.region.findFirst.mockResolvedValue({ id: 'region-hanoi' });
      await service.listPublic({ parentRegion: 'ha-noi', ...baseArgs });
      expect(prisma.region.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ parentRegionId: 'region-hanoi' }) }));
    });

    it('ID fallback: also accepts the raw internal id', async () => {
      prisma.country.findFirst.mockResolvedValue({ id: 'country-vn' });
      await service.listPublic({ country: 'country-vn', ...baseArgs });
      expect(prisma.region.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ countryId: 'country-vn' }) }));
    });

    it('combined filters: country + parentRegion both resolve and both apply', async () => {
      prisma.country.findFirst.mockResolvedValue({ id: 'country-vn' });
      prisma.region.findFirst.mockResolvedValue({ id: 'region-hanoi' });
      await service.listPublic({ country: 'viet-nam', parentRegion: 'ha-noi', ...baseArgs });
      expect(prisma.region.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ countryId: 'country-vn', parentRegionId: 'region-hanoi' }) }),
      );
    });

    it('an unresolvable country throws 404 COUNTRY_NOT_FOUND - never silently broadens or empties', async () => {
      prisma.country.findFirst.mockResolvedValue(null);
      await expect(service.listPublic({ country: 'not-a-real-country', ...baseArgs })).rejects.toThrow(NotFoundException);
      expect(prisma.region.findMany).not.toHaveBeenCalled();
    });

    it('an unresolvable parentRegion throws 404 REGION_NOT_FOUND', async () => {
      prisma.region.findFirst.mockResolvedValue(null);
      await expect(service.listPublic({ parentRegion: 'not-a-real-region', ...baseArgs })).rejects.toThrow(NotFoundException);
    });

    it('no filters at all: queries with no constraint', async () => {
      await service.listPublic({ ...baseArgs });
      expect(prisma.country.findFirst).not.toHaveBeenCalled();
      expect(prisma.region.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ countryId: undefined, parentRegionId: undefined }) }),
      );
    });
  });
});
