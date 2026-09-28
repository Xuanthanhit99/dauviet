import { BadRequestException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { MapService } from './map.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MapFeaturesQueryDto } from './dto/map-query.dto';

/** G11 map extensions (spec 41-58, 76-80). Legacy behavior stays covered, unmodified, in map.service.spec.ts. */
describe('MapService G11 extensions', () => {
  let prisma: any;
  let service: MapService;

  beforeEach(() => {
    prisma = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      $executeRaw: jest.fn().mockResolvedValue(1),
      placeTranslation: { findMany: jest.fn().mockResolvedValue([]) },
      territoryTranslation: { findMany: jest.fn().mockResolvedValue([]) },
      historicalEventTranslation: { findMany: jest.fn().mockResolvedValue([]) },
      countryTranslation: { findMany: jest.fn().mockResolvedValue([]) },
      regionTranslation: { findMany: jest.fn().mockResolvedValue([]) },
      cityTranslation: { findMany: jest.fn().mockResolvedValue([]) },
      destinationTranslation: { findMany: jest.fn().mockResolvedValue([]) },
    };
    prisma.$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(prisma));
    service = new MapService(prisma as unknown as PrismaService);
  });

  const dto = (o: Partial<MapFeaturesQueryDto> = {}): MapFeaturesQueryDto => ({ bbox: '100,5,120,25', ...o });
  const sqlOf = (call: any[]) => (call[0] as string[]).join('?');
  // Static template text plus every interpolated raw/Prisma.sql fragment (e.g. the allowlisted table name).
  const fragmentsOf = (call: any[]) => call.slice(1).map((v: any) => (v && typeof v === 'object' && 'sql' in v ? v.sql : '')).join(' ');
  const allSql = () => prisma.$queryRaw.mock.calls.map((c: any[]) => `${sqlOf(c)} ${fragmentsOf(c)}`).join('\n');

  describe('DTO', () => {
    it('accepts a fractional zoom (map libraries send map.getZoom() = 4.4)', async () => {
      const errors = await validate(plainToInstance(MapFeaturesQueryDto, { bbox: '100,5,120,25', zoom: '4.4', locale: 'vi' }));
      expect(errors).toHaveLength(0);
    });

    it('still rejects an out-of-range or non-numeric zoom', async () => {
      expect(await validate(plainToInstance(MapFeaturesQueryDto, { zoom: '23' }))).not.toHaveLength(0);
      expect(await validate(plainToInstance(MapFeaturesQueryDto, { zoom: 'abc' }))).not.toHaveLength(0);
    });

    it('rejects an unsupported locale', async () => {
      expect(await validate(plainToInstance(MapFeaturesQueryDto, { locale: 'fr' }))).not.toHaveLength(0);
    });
  });

  describe('planning (custom plans)', () => {
    it('runs every map query inside one transaction with a transaction-local custom-plan setting', async () => {
      await service.getFeatures(dto({ zoom: 6 }), 'vi');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const set = prisma.$executeRaw.mock.calls[0][0].join('?');
      expect(set).toContain("set_config('plan_cache_mode', 'force_custom_plan', true)");
    });

    it('validation errors never open a transaction or touch the database', async () => {
      await expect(service.getFeatures(dto({ bbox: '10,10,5,20' }), 'vi')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });
  });

  describe('layers (kinds)', () => {
    it('keeps the pre-G11 default layer set: no current-geography query unless requested', async () => {
      await service.getFeatures(dto({ zoom: 12 }), 'vi');
      expect(allSql()).not.toContain('"Country"');
      expect(allSql()).not.toContain('"City"');
      expect(allSql()).not.toContain('"Destination"');
    });

    it('rejects an unknown layer and injection-shaped kinds before any SQL', async () => {
      await expect(service.getFeatures(dto({ kinds: 'PLACE,NOPE' }), 'vi')).rejects.toMatchObject({ response: { code: 'MAP_INVALID_FILTER' } });
      await expect(service.getFeatures(dto({ kinds: 'CITY"; DROP TABLE "City"; --' }), 'vi')).rejects.toThrow(BadRequestException);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('queries current geography only for the requested layers, from the constant table allowlist', async () => {
      await service.getFeatures(dto({ zoom: 12, kinds: 'CITY' }), 'vi');
      const sql = allSql();
      expect(sql).toContain('"City"');
      expect(sql).not.toContain('"Country"');
      expect(sql).not.toContain('FROM "Place"');
      expect(sql).toContain(`g."status" = 'PUBLISHED'`);
    });

    it('geography is display-only points in SRID 4326 (no territory/jurisdiction inference)', async () => {
      await service.getFeatures(dto({ zoom: 12, kinds: 'CITY' }), 'vi');
      expect(allSql()).toContain('ST_MakePoint(g."longitude", g."latitude"), 4326');
    });
  });

  describe('zoom density (spec 48/76)', () => {
    it('never returns countries at street zoom nor cities at world zoom', async () => {
      await service.getFeatures(dto({ zoom: 12, kinds: 'COUNTRY' }), 'vi');
      expect(allSql()).not.toContain('"Country"');
      prisma.$queryRaw.mockClear();
      await service.getFeatures(dto({ zoom: 2, kinds: 'CITY' }), 'vi');
      expect(allSql()).not.toContain('"City"');
    });

    it.each([
      [3, 101],
      [8, 251],
      [14, 501],
    ])('bounds each layer: zoom %s asks for at most %s rows (cap + 1 to detect truncation)', async (zoom, limitPlusOne) => {
      await service.getFeatures(dto({ zoom }), 'vi');
      const placeCall = prisma.$queryRaw.mock.calls.find((c: any[]) => sqlOf(c).includes('FROM "Place"'));
      expect(placeCall.slice(1)).toContain(limitPlusOne);
    });

    it('caps the whole response and reports truncation', async () => {
      const many = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, canonicalSlug: `s${i}`, type: 'PALACE', historicalImportance: 9, geojson: '{"type":"Point","coordinates":[105,21]}' }));
      prisma.$queryRaw.mockResolvedValueOnce(many(501)).mockResolvedValue([]);
      const res = await service.getFeatures(dto({ zoom: 14 }), 'vi');
      expect(res.features.length).toBeLessThanOrEqual(res.meta.maxFeatures);
      expect(res.meta.truncated).toBe(true);
    });
  });

  describe('strict period (spec 53/78-80)', () => {
    it('uses chronology ordinals, never JavaScript Date, and requires a KNOWN start', async () => {
      await service.getFeatures(dto({ fromYear: 300, fromEra: 'BCE' as any, toYear: 100, toEra: 'BCE' as any }), 'vi');
      const territoryOrEvent = prisma.$queryRaw.mock.calls.map((c: any[]) => c.slice(1).map((v) => (v && typeof v === 'object' && 'sql' in v ? v.sql : ''))).flat().join('\n');
      expect(territoryOrEvent).toContain('"chronologyStart" IS NOT NULL');
      expect(territoryOrEvent).toContain('"dateChronologyStart" IS NOT NULL');
      expect(territoryOrEvent).toContain('COALESCE(');
    });

    it('a strict period returns only temporally-modelled layers - no undated sites, no current geography', async () => {
      await service.getFeatures(dto({ fromYear: 1200, toYear: 1300, kinds: 'PLACE,CITY,TERRITORY,EVENT' }), 'vi');
      const sql = allSql();
      expect(sql).not.toContain('FROM "Place" p');
      expect(sql).not.toContain('"City"');
      expect(sql).toContain('"Territory"');
      expect(sql).toContain('"HistoricalEvent"');
    });

    it('rejects an inverted period with a map error code', async () => {
      await expect(service.getFeatures(dto({ fromYear: 1300, toYear: 1200 }), 'vi')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('reports whether a period was applied', async () => {
      expect((await service.getFeatures(dto({ fromYear: 1200 }), 'vi')).meta.periodApplied).toBe(true);
      expect((await service.getFeatures(dto(), 'vi')).meta.periodApplied).toBe(false);
    });
  });

  describe('geometry payload (spec 77)', () => {
    it('generalizes Territory geometry in the RESPONSE at low zoom only; canonical geometry is never modified', async () => {
      await service.getFeatures(dto({ zoom: 4, year: 1200 }), 'vi');
      const territoryCall = prisma.$queryRaw.mock.calls.find((c: any[]) => sqlOf(c).includes('"Territory"'));
      const fragments = territoryCall.slice(1).map((v: any) => (v && typeof v === 'object' && 'sql' in v ? v.sql : ''));
      expect(fragments.join(' ')).toContain('ST_SimplifyPreserveTopology');
      expect(allSql()).not.toMatch(/UPDATE|DELETE|INSERT/);
    });

    it('does not simplify at street zoom', async () => {
      await service.getFeatures(dto({ zoom: 14, year: 1200 }), 'vi');
      const territoryCall = prisma.$queryRaw.mock.calls.find((c: any[]) => sqlOf(c).includes('"Territory"'));
      const fragments = territoryCall.slice(1).map((v: any) => (v && typeof v === 'object' && 'sql' in v ? v.sql : ''));
      expect(fragments.join(' ')).not.toContain('ST_SimplifyPreserveTopology');
    });
  });

  describe('feature semantics (spec 45/50/52)', () => {
    it('labels layer, trust class and a semantic marker - never CSS or pixel values', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([{ id: 'p1', canonicalSlug: 'hoi-an', type: 'ANCIENT_TOWN', historicalImportance: 8, geojson: '{"type":"Point","coordinates":[108.3,15.9]}' }]).mockResolvedValue([]);
      const res = await service.getFeatures(dto({ zoom: 14 }), 'vi');
      const props = res.features[0].properties as any;
      expect(props).toMatchObject({ layer: 'HISTORICAL_KNOWLEDGE_SITE', trustClass: 'CANONICAL', markerSemantic: 'HISTORICAL_SITE' });
      expect(JSON.stringify(res)).not.toMatch(/px|color|#[0-9a-f]{6}|size|icon/i);
    });

    it('current-geography features are labeled CURRENT_GEOGRAPHY, distinct from HISTORICAL territory', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([{ id: 'c1', canonicalSlug: 'ha-noi', importance: 9, geojson: '{"type":"Point","coordinates":[105.8,21.0]}' }])
        .mockResolvedValue([]);
      const res = await service.getFeatures(dto({ zoom: 12, kinds: 'CITY' }), 'vi');
      expect(res.features[0].properties).toMatchObject({ entityType: 'CITY', layer: 'CURRENT_GEOGRAPHY', trustClass: 'CANONICAL', markerSemantic: 'CITY' });
    });
  });

  describe('determinism (spec 88)', () => {
    it('every ordered query ends in a stable id tie-break', async () => {
      await service.getFeatures(dto({ zoom: 14, year: 1200, kinds: 'PLACE,EVENT,TERRITORY,CITY,COUNTRY,REGION,DESTINATION' }), 'vi');
      const orderBys = allSql().match(/ORDER BY[^\n]+/g) ?? [];
      expect(orderBys.length).toBeGreaterThan(0);
      for (const clause of orderBys) expect(clause).toMatch(/"id"|placeId/);
    });
  });
});
