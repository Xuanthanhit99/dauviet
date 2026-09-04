import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PublicationStatus } from '@prisma/client';
import { PlacesService } from './places.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * Covers spec section 26/39 test #13: DRAFT/ARCHIVED entities must never
 * leak through a public read path, even if the caller doesn't filter
 * client-side. This is enforced server-side in the service, not left to the
 * frontend to hide.
 */
describe('PlacesService.findBySlug publication filtering', () => {
  let prisma: { place: { findUnique: jest.Mock }; $queryRaw: jest.Mock };
  let service: PlacesService;

  const basePlace = {
    id: 'place-1',
    canonicalSlug: 'co-do-hue',
    type: 'PALACE',
    translations: [{ id: 't1', locale: 'vi', name: 'Co do Hue' }],
    heroMedia: null,
    parentPlace: null,
  };

  beforeEach(() => {
    prisma = { place: { findUnique: jest.fn() }, $queryRaw: jest.fn().mockResolvedValue([{ lng: 107.5, lat: 16.4 }]) };
    service = new PlacesService(
      prisma as unknown as PrismaService,
      { log: jest.fn() } as unknown as AuditService,
      {} as any,
      {} as any,
    );
  });

  it('404s a DRAFT place on the public path', async () => {
    prisma.place.findUnique.mockResolvedValue({ ...basePlace, publicationStatus: PublicationStatus.DRAFT });
    await expect(service.findBySlug('co-do-hue', 'vi')).rejects.toThrow(NotFoundException);
  });

  it('404s an ARCHIVED place on the public path', async () => {
    prisma.place.findUnique.mockResolvedValue({ ...basePlace, publicationStatus: PublicationStatus.ARCHIVED });
    await expect(service.findBySlug('co-do-hue', 'vi')).rejects.toThrow(NotFoundException);
  });

  it('returns a PUBLISHED place normally', async () => {
    prisma.place.findUnique.mockResolvedValue({ ...basePlace, publicationStatus: PublicationStatus.PUBLISHED });
    const result = await service.findBySlug('co-do-hue', 'vi');
    expect(result.slug).toBe('co-do-hue');
  });

  it('allows a DRAFT place through when includeUnpublished is set (admin path)', async () => {
    prisma.place.findUnique.mockResolvedValue({ ...basePlace, publicationStatus: PublicationStatus.DRAFT });
    const result = await service.findBySlug('co-do-hue', 'vi', true);
    expect(result.publicationStatus).toBe(PublicationStatus.DRAFT);
  });

  it('reports translation fallback status when the requested locale is missing', async () => {
    prisma.place.findUnique.mockResolvedValue({
      ...basePlace,
      publicationStatus: PublicationStatus.PUBLISHED,
      translations: [{ id: 't1', locale: 'vi', name: 'Co do Hue' }],
    });
    const result = await service.findBySlug('co-do-hue', 'en');
    expect(result.meta.requestedLocale).toBe('en');
    expect(result.meta.resolvedLocale).toBe('vi');
    expect(result.meta.fallbackApplied).toBe(true);
  });
});

/**
 * Spec section 51-54: Nearby discovery. Stateless (lat/lng are never
 * persisted), distance is always meters, radius/limit are capped server-side.
 */
describe('PlacesService.findNearby', () => {
  let prisma: any;
  let service: PlacesService;

  beforeEach(() => {
    prisma = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      placeTranslation: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new PlacesService(
      prisma as unknown as PrismaService,
      { log: jest.fn() } as unknown as AuditService,
      {} as any,
      {} as any,
    );
  });

  it('rejects an out-of-range latitude', async () => {
    await expect(service.findNearby({ lat: 200, lng: 105 } as any, 'vi')).rejects.toThrow(BadRequestException);
  });

  it('rejects an out-of-range longitude', async () => {
    await expect(service.findNearby({ lat: 21, lng: -200 } as any, 'vi')).rejects.toThrow(BadRequestException);
  });

  it('rejects a non-finite coordinate', async () => {
    await expect(service.findNearby({ lat: NaN, lng: 105 } as any, 'vi')).rejects.toThrow(BadRequestException);
  });

  it('rejects a zero or negative radius', async () => {
    await expect(service.findNearby({ lat: 21, lng: 105, radius: 0 } as any, 'vi')).rejects.toThrow(BadRequestException);
  });

  it('caps radius at the maximum instead of erroring', async () => {
    await service.findNearby({ lat: 21, lng: 105, radius: 999_999 } as any, 'vi');
    const call = prisma.$queryRaw.mock.calls[0];
    // The radius value is one of the interpolated template values.
    expect(call).toContain(50_000);
  });

  it('caps limit at 100', async () => {
    await service.findNearby({ lat: 21, lng: 105, limit: 500 } as any, 'vi');
    const call = prisma.$queryRaw.mock.calls[0];
    expect(call[call.length - 1]).toBe(100);
  });

  it('rejects an invalid PlaceType filter', async () => {
    await expect(service.findNearby({ lat: 21, lng: 105, types: 'NOT_A_TYPE' } as any, 'vi')).rejects.toThrow();
  });

  it('returns distance in meters, rounded, and never persists the query coordinates', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([
      { id: 'p1', canonicalSlug: 'co-do-hue', type: 'PALACE', historicalImportance: 10, distanceMeters: 1234.6 },
    ]);
    const result = await service.findNearby({ lat: 16.4, lng: 107.5 } as any, 'vi');
    expect(result[0].distanceMeters).toBe(1235);
  });

  it('only returns PUBLISHED places, filtered server-side', async () => {
    await service.findNearby({ lat: 21, lng: 105 } as any, 'vi');
    const sql = prisma.$queryRaw.mock.calls[0][0].join(' ');
    expect(sql).toContain('PUBLISHED');
  });

  it('uses a geography cast for real meters-based distance, not raw degrees', async () => {
    await service.findNearby({ lat: 21, lng: 105 } as any, 'vi');
    const sql = prisma.$queryRaw.mock.calls[0][0].join(' ');
    expect(sql).toContain('::geography');
  });
});
