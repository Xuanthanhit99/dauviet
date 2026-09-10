import { BadRequestException } from '@nestjs/common';
import { DateEra } from '@prisma/client';
import { MapService } from './map.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MapFeaturesQueryDto } from './dto/map-query.dto';
import { toChronologyYearStart } from '../../common/historical-date/historical-date.util';

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

  /**
   * G03 (fix, 3rd architecture review): the Territory year filter was
   * switched from the legacy sortStart/sortEnd DateTime pair to the
   * authoritative chronologyStart/chronologyEnd ordinal pair specifically
   * because "known BCE date, legacy field intentionally NULL" must NOT be
   * treated the same as "genuinely unknown date, always match" - the old
   * sortStart/sortEnd-based predicate could not tell the two apart. Event's
   * WHERE clause (unaffected, left as-is per instruction) still requires
   * dateSortStart IS NOT NULL, which already safely excludes a BCE event
   * rather than mis-including it - a different, already-correct mechanism,
   * not touched here.
   */
  it('the Territory year filter now uses chronologyStart/chronologyEnd, not the legacy sortStart/sortEnd pair', async () => {
    await service.getFeatures(dto({ bbox: '105,20,106,21', year: 1200 }), 'vi');
    const territoryCall = prisma.$queryRaw.mock.calls.find((c: any) => c[0].join(' ').includes('Territory'));
    const territorySql = territoryCall[0].join(' ');
    expect(territorySql).toContain('chronologyStart" IS NULL OR');
    expect(territorySql).toContain('chronologyEnd" IS NULL OR');
    expect(territorySql).not.toContain('"sortStart"');
    expect(territorySql).not.toContain('"sortEnd"');
  });

  it("Event's year filter is unchanged (still dateSortStart IS NOT NULL) - BCE events are excluded, not mis-included", async () => {
    await service.getFeatures(dto({ bbox: '105,20,106,21', year: 1200 }), 'vi');
    const eventCall = prisma.$queryRaw.mock.calls.find((c: any) => c[0].join(' ').includes('HistoricalEvent'));
    // The year-conditional clause is a Prisma.sql fragment interpolated as a
    // VALUE (not static template text) - it must be found in the call's
    // interpolated-values slice, same pattern as the existing "joins
    // EventTheme only when a theme filter is provided" test above.
    const yearFragment = eventCall.slice(1).find((v: any) => v && typeof v.sql === 'string' && v.sql.includes('dateSortStart'));
    expect(yearFragment).toBeDefined();
    expect(yearFragment.sql).toContain('dateSortStart" IS NOT NULL');
  });
});

/**
 * G03 (3rd architecture review) - pure-arithmetic proof of the Territory
 * year-filter predicate's three required behaviors. This mirrors the SQL
 * `WHERE (chronologyStart IS NULL OR chronologyStart <= :yearOrdinal) AND
 * (chronologyEnd IS NULL OR chronologyEnd >= :yearOrdinal)` clause exactly
 * (see map.service.ts), the same "transcribe-and-compare" approach used by
 * chronology-backfill-parity.spec.ts, since $queryRaw is always mocked in
 * this file and cannot exercise real Postgres row-filtering. The
 * corresponding LIVE proof (a real BCE Territory row through real Postgres)
 * is Migration Path A/B live QA, not a unit test.
 */
describe('Territory year-filter predicate (matches map.service.ts SQL exactly)', () => {
  function matchesYearFilter(chronologyStart: number | null, chronologyEnd: number | null, yearOrdinal: number): boolean {
    const startOk = chronologyStart === null || chronologyStart <= yearOrdinal;
    const endOk = chronologyEnd === null || chronologyEnd >= yearOrdinal;
    return startOk && endOk;
  }

  it('an UNKNOWN (undated) Territory always matches, preserving existing behavior', () => {
    expect(matchesYearFilter(null, null, toChronologyYearStart(1200, DateEra.CE))).toBe(true);
    expect(matchesYearFilter(null, null, toChronologyYearStart(2024, DateEra.CE))).toBe(true);
  });

  it('a known CE Territory filters normally: matches inside its span, not outside it', () => {
    const start = toChronologyYearStart(1428, DateEra.CE);
    const end = toChronologyYearStart(1527, DateEra.CE);
    expect(matchesYearFilter(start, end, toChronologyYearStart(1450, DateEra.CE))).toBe(true);
    expect(matchesYearFilter(start, end, toChronologyYearStart(1600, DateEra.CE))).toBe(false);
    expect(matchesYearFilter(start, end, toChronologyYearStart(1400, DateEra.CE))).toBe(false);
  });

  it('a known BCE Territory can NOT match an arbitrary CE year filter', () => {
    const start = toChronologyYearStart(300, DateEra.BCE);
    const end = toChronologyYearStart(200, DateEra.BCE);
    expect(matchesYearFilter(start, end, toChronologyYearStart(1200, DateEra.CE))).toBe(false);
    expect(matchesYearFilter(start, end, toChronologyYearStart(2024, DateEra.CE))).toBe(false);
    // It DOES still correctly match a query for its own (BCE) period, proving this isn't a blanket exclusion.
    expect(matchesYearFilter(start, end, toChronologyYearStart(250, DateEra.BCE))).toBe(true);
  });
});
