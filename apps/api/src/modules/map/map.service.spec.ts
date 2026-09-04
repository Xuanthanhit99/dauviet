import { BadRequestException } from '@nestjs/common';
import { MapService } from './map.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MapFeaturesQueryDto } from './dto/map-query.dto';

/**
 * Spec section 4/9/11: bbox validation, zoom-based density, and the
 * non-special-cased Hoang Sa/Truong Sa visibility regression.
 */
describe('MapService.getFeatures', () => {
  let prisma: any;
  let service: MapService;

  const makePrisma = () => ({
    $queryRaw: jest.fn().mockResolvedValue([]),
    placeTranslation: { findMany: jest.fn().mockResolvedValue([]) },
    territoryTranslation: { findMany: jest.fn().mockResolvedValue([]) },
    historicalEventTranslation: { findMany: jest.fn().mockResolvedValue([]) },
  });

  beforeEach(() => {
    prisma = makePrisma();
    service = new MapService(prisma as unknown as PrismaService);
  });

  const dto = (overrides: Partial<MapFeaturesQueryDto> = {}): MapFeaturesQueryDto => ({ ...overrides });

  it('rejects a missing bbox', async () => {
    await expect(service.getFeatures(dto(), 'vi')).rejects.toThrow(BadRequestException);
  });

  it('rejects a malformed bbox (wrong number of parts)', async () => {
    await expect(service.getFeatures(dto({ bbox: '1,2,3' }), 'vi')).rejects.toThrow(BadRequestException);
  });

  it('rejects a non-numeric / SQL-injection-shaped bbox instead of ever reaching SQL', async () => {
    await expect(
      service.getFeatures(dto({ bbox: "0,0,1,1); DROP TABLE \"Place\"; --" }), 'vi'),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('rejects out-of-range coordinates', async () => {
    await expect(service.getFeatures(dto({ bbox: '-200,-100,200,100' }), 'vi')).rejects.toThrow(BadRequestException);
  });

  it('rejects an inverted bbox (west >= east)', async () => {
    await expect(service.getFeatures(dto({ bbox: '10,10,5,20' }), 'vi')).rejects.toThrow(BadRequestException);
  });

  it('rejects an implausible year', async () => {
    await expect(service.getFeatures(dto({ bbox: '105,20,106,21', year: 99999 }), 'vi')).rejects.toThrow(BadRequestException);
  });

  it('rejects an invalid PlaceType filter', async () => {
    await expect(service.getFeatures(dto({ bbox: '105,20,106,21', types: 'NOT_A_TYPE' }), 'vi')).rejects.toThrow(BadRequestException);
  });

  it('applies a high importance floor at national zoom (<=6)', async () => {
    const result = await service.getFeatures(dto({ bbox: '102,8,110,24', zoom: 3 }), 'vi');
    expect(result.meta.minImportance).toBe(7);
  });

  it('lowers the importance floor to 0 at close/street zoom', async () => {
    const result = await service.getFeatures(dto({ bbox: '105.8,21.0,105.9,21.1', zoom: 18 }), 'vi');
    expect(result.meta.minImportance).toBe(0);
  });

  it('does not special-case any place id/slug - Hoang Sa/Truong Sa visibility is governed only by historicalImportance, same as every other place', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([
      { id: 'p-hoang-sa', canonicalSlug: 'hoang-sa', type: 'ARCHIPELAGO', historicalImportance: 9, geojson: '{"type":"Point","coordinates":[112,17]}' },
    ]);
    const result = await service.getFeatures(dto({ bbox: '100,5,120,25', zoom: 3 }), 'vi');
    const feature = result.features.find((f: any) => f.properties.slug === 'hoang-sa');
    expect(feature).toBeDefined();
    expect(feature.properties.placeType).toBe('ARCHIPELAGO');
    // The query itself only filtered on historicalImportance >= floor, never on id/slug.
    const sql = prisma.$queryRaw.mock.calls[0][0].join(' ');
    expect(sql).not.toMatch(/hoang-sa|truong-sa/i);
  });

  it('only returns PUBLISHED Territory geometry, filtered server-side (WHERE clause), never leaking draft geometry', async () => {
    await service.getFeatures(dto({ bbox: '105,20,106,21', year: 1975 }), 'vi');
    const territoryCall = prisma.$queryRaw.mock.calls.find((c: any) => c[0].join(' ').includes('Territory'));
    expect(territoryCall).toBeDefined();
    expect(territoryCall[0].join(' ')).toContain('geometryStatus');
  });

  it('returns a well-formed GeoJSON FeatureCollection', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([
      { id: 'p1', canonicalSlug: 'co-do-hue', type: 'PALACE', historicalImportance: 10, geojson: '{"type":"Point","coordinates":[107.5,16.4]}' },
    ]);
    const result = await service.getFeatures(dto({ bbox: '100,5,120,25' }), 'vi');
    expect(result.type).toBe('FeatureCollection');
    expect(result.features[0].type).toBe('Feature');
    expect(result.features[0].geometry).toEqual({ type: 'Point', coordinates: [107.5, 16.4] });
  });

  it('caps results and reports truncation via meta', async () => {
    const many = Array.from({ length: 101 }, (_, i) => ({
      id: `p${i}`,
      canonicalSlug: `place-${i}`,
      type: 'PALACE',
      historicalImportance: 8,
      geojson: '{"type":"Point","coordinates":[105,21]}',
    }));
    prisma.$queryRaw.mockResolvedValueOnce(many);
    const result = await service.getFeatures(dto({ bbox: '100,5,120,25', zoom: 3 }), 'vi');
    expect(result.meta.truncated).toBe(true);
    expect(result.features.length).toBeLessThanOrEqual(result.meta.limit);
  });

  it('joins EventTheme only when a theme filter is provided', async () => {
    await service.getFeatures(dto({ bbox: '105,20,106,21', theme: 'resistance' }), 'vi');
    const eventCall = prisma.$queryRaw.mock.calls.find((c: any) => c[0].join(' ').includes('HistoricalEvent'));
    const themeFragment = eventCall.slice(1).find((v: any) => v && typeof v.sql === 'string' && v.sql.includes('EventTheme'));
    expect(themeFragment).toBeDefined();
  });
});
