import { BadRequestException } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchMetricsService } from './search-metrics.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SearchQueryDto } from './dto/search-query.dto';
import { cursorFingerprint, encodeCursor } from './search-cursor.util';

/** Unit-level contract of the search pipeline. Real FTS/trigram/PostGIS behavior is proven in test/search-map.e2e-spec.ts against PostgreSQL. */
describe('SearchService', () => {
  let prisma: any;
  let service: SearchService;

  const row = (over: Record<string, unknown> = {}) => ({
    entityKind: 'PLACE',
    entityId: 'p1',
    canonicalSlug: 'hoi-an',
    trustClass: 'CANONICAL',
    subtype: 'ANCIENT_TOWN',
    importance: 8,
    titles: { vi: 'Hội An', en: 'Hoi An' },
    summaries: { vi: 'Phố cổ ven sông Thu Bồn.' },
    tier: 1,
    comm: 0,
    name_miss: 0,
    neg_imp: -8,
    locale_miss: 0,
    kind_order: 5,
    ...over,
  });
  const dto = (over: Partial<SearchQueryDto> = {}): SearchQueryDto => ({ q: 'hoi an', ...over }) as SearchQueryDto;
  const lastSql = () => prisma.$queryRaw.mock.calls[prisma.$queryRaw.mock.calls.length - 1][0] as { sql: string; values: unknown[] };

  beforeEach(() => {
    prisma = { $queryRaw: jest.fn().mockResolvedValue([]), $executeRaw: jest.fn().mockResolvedValue(1) };
    prisma.$transaction = jest.fn((fn: any) => fn(prisma));
    service = new SearchService(prisma as unknown as PrismaService, new SearchMetricsService());
  });

  describe('validation (spec 37/38)', () => {
    it('rejects an empty / whitespace-only query and never touches the database (no corpus enumeration)', async () => {
      await expect(service.search(dto({ q: '' }), 'vi')).rejects.toMatchObject({ response: { code: 'SEARCH_QUERY_REQUIRED' } });
      await expect(service.search(dto({ q: '   ' }), 'vi')).rejects.toThrow(BadRequestException);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('rejects a query over the max length', async () => {
      await expect(service.search(dto({ q: 'a'.repeat(201) }), 'vi')).rejects.toMatchObject({ response: { code: 'SEARCH_QUERY_TOO_LONG' } });
    });

    it('rejects an invalid entity type filter, including SQL-shaped values', async () => {
      await expect(service.search(dto({ types: 'NOT_A_TYPE' }), 'vi')).rejects.toMatchObject({ response: { code: 'SEARCH_INVALID_TYPE' } });
      await expect(service.search(dto({ types: "PLACE'; DROP TABLE \"Place\"; --" }), 'vi')).rejects.toThrow(BadRequestException);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('accepts every corpus kind, including the G11 geography kinds', async () => {
      await service.search(dto({ types: 'COUNTRY,REGION,CITY,DESTINATION,TERRITORY,THEME,DYNASTY' }), 'vi');
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('a punctuation-only query is a valid request with no possible match (no DB call)', async () => {
      const res = await service.search(dto({ q: '---!!!' }), 'vi');
      expect(res.results).toEqual([]);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('rejects an antimeridian-crossing or out-of-range bbox with SEARCH_INVALID_BBOX', async () => {
      await expect(service.search(dto({ bbox: '170,-10,-170,10' }), 'vi')).rejects.toMatchObject({ response: { code: 'SEARCH_INVALID_BBOX' } });
      await expect(service.search(dto({ bbox: '-200,-100,200,100' }), 'vi')).rejects.toMatchObject({ response: { code: 'SEARCH_INVALID_BBOX' } });
    });

    it('rejects an inverted period and a period era without a year', async () => {
      await expect(service.search(dto({ fromYear: 1300, toYear: 1200 }), 'vi')).rejects.toMatchObject({ response: { code: 'SEARCH_INVALID_PERIOD' } });
      await expect(service.search(dto({ fromEra: 'BCE' } as any), 'vi')).rejects.toMatchObject({ response: { code: 'SEARCH_INVALID_PERIOD' } });
    });
  });

  describe('SQL safety (spec 40/109)', () => {
    it('binds every user value; the SQL text never contains the query', async () => {
      await service.search(dto({ q: "'; DROP TABLE \"Place\"; --", countryId: "x' OR '1'='1" }), 'vi');
      const { sql, values } = lastSql();
      expect(sql).not.toContain('DROP TABLE');
      expect(sql).not.toContain("OR '1'='1");
      expect(values).toContain("x' OR '1'='1");
      expect(values).toContain('drop table place');
    });

    it('builds the tsquery only from sanitized tokens (no operator can reach to_tsquery)', async () => {
      await service.search(dto({ q: "a' | b & !c :* <-> (d) \\" }), 'vi');
      const tsq = lastSql().values.find((v) => typeof v === 'string' && v.includes(':*')) as string;
      expect(tsq).toBe('a & b & c & d:*');
    });

    it('ORDER BY is a fixed, constant list (nothing user-controlled)', async () => {
      await service.search(dto({ q: 'hoi an', types: 'PLACE' }), 'vi');
      expect(lastSql().sql).toContain('ORDER BY r.tier, r.comm, r.name_miss, r.neg_imp, r.locale_miss, r.kind_order, r."entityId"');
    });
  });

  describe('fuzzy threshold (spec 39)', () => {
    it('does not run trigram search for a one or two character query', async () => {
      await service.search(dto({ q: 'a' }), 'vi');
      expect(lastSql().sql).not.toContain('similarity(');
      await service.search(dto({ q: 'hà' }), 'vi');
      expect(lastSql().sql).not.toContain('similarity(');
    });

    it('runs trigram search from three normalized characters, only as a top-up when few strong candidates exist', async () => {
      await service.search(dto({ q: 'hue' }), 'vi');
      const sql = lastSql().sql;
      expect(sql).toContain('similarity(');
      expect(sql).toContain('(SELECT count(*) FROM strong) <');
      expect(lastSql().values).toContain(10);
    });

    it('applies the raised trigram threshold and custom plans transaction-locally (never globally)', async () => {
      await service.search(dto({ q: 'hue' }), 'vi');
      const setConfig = prisma.$executeRaw.mock.calls[0][0].join('?');
      expect(setConfig).toContain("set_config('plan_cache_mode', 'force_custom_plan', true)");
      expect(setConfig).toContain("set_config('pg_trgm.similarity_threshold'");
      expect(prisma.$executeRaw.mock.calls[0][1]).toBe('0.5');
      expect(setConfig.match(/true\)/g)).toHaveLength(2); // both settings are is_local = true
    });

    it('skips full-text search for a 1-2 character query (the prefix branch covers it) but keeps it from 3 characters', async () => {
      await service.search(dto({ q: 'ha' }), 'vi');
      expect(lastSql().sql).not.toContain('to_tsvector');
      await service.search(dto({ q: 'hai' }), 'vi');
      expect(lastSql().sql).toContain('to_tsvector');
    });

    it('every query (also short ones without fuzzy) runs under custom plans so wide bbox/period values are never mis-planned', async () => {
      await service.search(dto({ q: 'hà' }), 'vi');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.$executeRaw.mock.calls[0][0].join('?')).toContain('force_custom_plan');
    });
  });

  describe('pipeline shape (spec 25/26/33)', () => {
    it('orders by relevance tier first and ends the total order with the entity id', async () => {
      await service.search(dto(), 'vi');
      const sql = lastSql().sql;
      expect(sql.indexOf('ORDER BY r.tier')).toBeGreaterThan(-1);
      expect(sql).toMatch(/r\.kind_order, r\."entityId"\s+LIMIT/);
    });

    it('applies the publication boundary structurally: it only ever reads the projection tables', async () => {
      await service.search(dto(), 'vi');
      const sql = lastSql().sql;
      expect(sql).toContain('"SearchDocument"');
      for (const forbidden of ['"Trip', 'Affiliate', 'Ingestion', 'Provider', '"Place"', '"CommunityStory"', 'Expense', 'Location']) {
        expect(sql).not.toContain(forbidden);
      }
    });

    it('uses the C-collation range for prefix lookups (index-usable with parameterized plans)', async () => {
      await service.search(dto(), 'vi');
      expect(lastSql().sql).toContain('COLLATE "C"');
    });

    it('clamps the page size to the maximum and never exposes an unbounded page', async () => {
      await service.search(dto({ limit: 500 } as any), 'vi');
      expect(lastSql().values).toContain(51);
    });
  });

  describe('cursor pagination (spec 32)', () => {
    it('rejects garbage, foreign or tampered cursors', async () => {
      await expect(service.search(dto({ cursor: 'not-a-cursor' }), 'vi')).rejects.toMatchObject({ response: { code: 'SEARCH_INVALID_CURSOR' } });
      const foreign = encodeCursor(cursorFingerprint({ nq: 'something else' }), { tier: 1, comm: 0, nameMiss: 0, negImportance: 0, localeMiss: 0, kindOrder: 1, entityId: 'x' });
      await expect(service.search(dto({ cursor: foreign }), 'vi')).rejects.toMatchObject({ response: { code: 'SEARCH_INVALID_CURSOR' } });
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('returns hasMore + a cursor only when another row exists, and the cursor resumes the same query', async () => {
      const rows = Array.from({ length: 3 }, (_, i) => row({ entityId: `p${i}`, neg_imp: -(9 - i) }));
      prisma.$queryRaw.mockResolvedValueOnce(rows);
      const first = await service.search(dto({ limit: 2 }), 'vi');
      expect(first.results).toHaveLength(2);
      expect(first.hasMore).toBe(true);
      expect(first.nextCursor).toEqual(expect.any(String));

      prisma.$queryRaw.mockResolvedValueOnce([rows[2]]);
      const second = await service.search(dto({ limit: 2, cursor: first.nextCursor! }), 'vi');
      expect(second.hasMore).toBe(false);
      expect(second.nextCursor).toBeNull();
      expect(lastSql().sql).toContain('(r.tier, r.comm, r.name_miss, r.neg_imp, r.locale_miss, r.kind_order, r."entityId") >');
    });
  });

  describe('result DTO (spec 22/28/34/84/86)', () => {
    it('reports requested vs resolved locale and never fabricates a translation', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([row({ titles: { vi: 'Hội An' }, summaries: {} })]);
      const { results } = await service.search(dto(), 'en');
      expect(results[0]).toMatchObject({ title: 'Hội An', locale: 'en', actualLocale: 'vi', fallbackUsed: true, summary: null });
    });

    it('uses the requested-locale text when it exists', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([row()]);
      const { results } = await service.search(dto(), 'en');
      expect(results[0]).toMatchObject({ title: 'Hoi An', actualLocale: 'en', fallbackUsed: false });
    });

    it('locale-less content (a Source title) is not reported as a fallback', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([row({ entityKind: 'SOURCE', titles: { '': 'Annals' }, summaries: {} })]);
      const { results } = await service.search(dto(), 'vi');
      expect(results[0]).toMatchObject({ title: 'Annals', actualLocale: null, fallbackUsed: false });
    });

    it('exposes tier-derived labels, trust class and an opaque score - never a raw database rank', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([row({ tier: 1 }), row({ entityId: 'p2', tier: 3 }), row({ entityId: 'p3', tier: 6, trustClass: 'COMMUNITY', entityKind: 'COMMUNITY_STORY' })]);
      const { results } = await service.search(dto(), 'vi');
      expect(results.map((r) => r.matchTier)).toEqual(['EXACT_CANONICAL', 'EXACT_ALIAS', 'FUZZY']);
      expect(results[1].matchedOn).toBe('alias');
      expect(results[2].trustClass).toBe('COMMUNITY');
      expect(results.map((r) => r.score)).toEqual([1, 0.667, 0.167]);
      expect(Object.keys(results[0]).sort()).toEqual(
        ['actualLocale', 'entityType', 'fallbackUsed', 'id', 'locale', 'matchTier', 'matchedOn', 'score', 'slug', 'subtype', 'summary', 'title', 'trustClass'].sort(),
      );
    });

    it('truncates the snippet taken from stored canonical text', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([row({ summaries: { vi: 'x'.repeat(1000) } })]);
      const { results } = await service.search(dto(), 'vi');
      expect(results[0].summary).toHaveLength(240);
    });
  });

  describe('suggest', () => {
    it('returns an empty list for an empty query without touching the database', async () => {
      expect(await service.suggest('   ', 'vi')).toEqual({ query: '', suggestions: [] });
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('rejects an over-long query', async () => {
      await expect(service.suggest('a'.repeat(201), 'vi')).rejects.toThrow(BadRequestException);
    });

    it('caps suggestions at the requested limit and returns the minimal payload', async () => {
      prisma.$queryRaw.mockResolvedValueOnce(Array.from({ length: 3 }, (_, i) => row({ entityId: `p${i}` })));
      const res = await service.suggest('hoi', 'vi', 3);
      expect(res.suggestions).toHaveLength(3);
      expect(Object.keys(res.suggestions[0]).sort()).toEqual(['entityType', 'id', 'slug', 'title']);
    });
  });

  it('records operational metrics without any query text', async () => {
    const metrics = new SearchMetricsService();
    const svc = new SearchService(prisma as unknown as PrismaService, metrics);
    await svc.search(dto({ q: 'secret personal query' }), 'vi');
    const snap = JSON.stringify(metrics.snapshot());
    expect(snap).toContain('"search"');
    expect(snap).not.toContain('secret');
  });
});
