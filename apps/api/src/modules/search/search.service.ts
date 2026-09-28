import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, SearchEntityKind } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DISCOVERY_ERROR_CODES } from '../../common/errors/discovery-error-codes';
import { CANONICAL_LOCALE } from '../../common/decorators/locale.decorator';
import { parseBbox } from '../../common/geo/bbox.util';
import { buildPrefixTsQuery, normalizeSearchText } from '../../common/search/search-normalization.util';
import { cursorFingerprint, decodeCursor, encodeCursor, KIND_ORDER, SortKey } from './search-cursor.util';
import { resolvePeriod } from './search-period.util';
import { SEARCH_DEFAULT_LIMIT, SEARCH_MAX_LIMIT, SEARCH_MAX_QUERY_LENGTH, SearchQueryDto } from './dto/search-query.dto';
import { SearchMatchTier, SearchResponse, SearchResultItem } from './search-result.dto';
import { SearchMetricsService } from './search-metrics.service';

interface Row {
  entityKind: SearchEntityKind;
  entityId: string;
  canonicalSlug: string;
  trustClass: SearchResultItem['trustClass'];
  subtype: string | null;
  importance: number;
  titles: Record<string, string>;
  summaries: Record<string, string>;
  tier: number;
  comm: number;
  name_miss: number;
  neg_imp: number;
  locale_miss: number;
  kind_order: number;
}

/** Below this many normalized characters, trigram fuzzy matching is never run (pathological short queries). */
export const FUZZY_MIN_LENGTH = 3;
export const MAX_TYPES = Object.keys(KIND_ORDER).length;
const PREFIX_CANDIDATES = 1000;
const FTS_CANDIDATES = 1000;
const FUZZY_CANDIDATES = 300;
/** Trigram fuzzy matching only runs when fewer than this many STRONG (tier 1-5) candidates exist. The count is identical on every page of one query, so pagination stays deterministic and a strong match can never be displaced. */
export const FUZZY_FILL_THRESHOLD = 10;
/** Minimum trigram similarity for a fuzzy candidate. Raising pg_trgm's 0.3 default to 0.5 cut the measured GIN scan from ~140 ms to ~21 ms at 78k documents (docs/backend/G11_PERFORMANCE_REPORT.md); a one-character typo in a normal-length name still scores well above it. Set transaction-locally, never globally. */
export const FUZZY_SIMILARITY_THRESHOLD = '0.5';
const SUMMARY_MAX_CHARS = 240;
/** Highest code point: upper bound of a byte-order (COLLATE "C") prefix range. */
const PREFIX_RANGE_END = '\u{10FFFF}';
const VALID_KINDS = new Set<string>(Object.keys(KIND_ORDER));
const KIND_ORDER_SQL = Prisma.raw(`CASE d."entityKind"::text ${Object.entries(KIND_ORDER).map(([k, n]) => `WHEN '${k}' THEN ${n}`).join(' ')} ELSE 99 END`);

const TIER_LABEL: Record<number, SearchMatchTier> = { 1: 'EXACT_CANONICAL', 2: 'EXACT_LOCALIZED', 3: 'EXACT_ALIAS', 4: 'PREFIX', 5: 'TEXT', 6: 'FUZZY' };

interface Filters {
  kinds?: string[];
  countryId?: string;
  regionId?: string;
  cityId?: string;
  period: ReturnType<typeof resolvePeriod>;
  bbox?: ReturnType<typeof parseBbox>;
}

/** Same rule as `resolveTranslation`: requested locale -> canonical vi -> any (deterministic), reporting the fallback. */
function resolveText(map: Record<string, string>, requested: string): { text: string | null; actualLocale: string | null; fallbackUsed: boolean } {
  if (map[requested] !== undefined) return { text: map[requested], actualLocale: requested, fallbackUsed: false };
  if (map[CANONICAL_LOCALE] !== undefined) return { text: map[CANONICAL_LOCALE], actualLocale: CANONICAL_LOCALE, fallbackUsed: true };
  const first = Object.keys(map).sort()[0];
  if (first === undefined) return { text: null, actualLocale: null, fallbackUsed: false };
  return { text: map[first], actualLocale: first === '' ? null : first, fallbackUsed: first !== '' };
}

/**
 * G11 public search over the rebuildable `SearchDocument`/`SearchTerm` projection (PostgreSQL only).
 *
 * Deterministic pipeline: validate -> normalize -> parse filters -> exact canonical / exact localized
 * / exact alias -> prefix -> FTS -> controlled fuzzy -> rank -> keyset page -> locale resolution -> DTO.
 * Text relevance tier is ALWAYS the primary order; importance/locale/kind only break ties inside a
 * tier, and the final key is the entity id, so the same projection state + query + filters + locale
 * always returns the same order. All values are bound parameters; the only dynamic SQL fragments are
 * built from constants in this file (never from user input).
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: SearchMetricsService,
  ) {}

  async search(query: SearchQueryDto, locale: string): Promise<SearchResponse> {
    const started = process.hrtime.bigint();
    try {
      const response = await this.execute(query, locale);
      this.metrics.record('search', Number(process.hrtime.bigint() - started) / 1e6, response.results.length, false);
      return response;
    } catch (err) {
      this.metrics.record('search', Number(process.hrtime.bigint() - started) / 1e6, 0, !(err instanceof BadRequestException));
      throw err;
    }
  }

  /** Lightweight variant for a suggestions dropdown: same pipeline, same publication/trust boundaries, minimal payload. */
  async suggest(q: string, locale: string, limit = 8) {
    const started = process.hrtime.bigint();
    const trimmed = q.trim();
    if (!trimmed) return { query: trimmed, suggestions: [] };
    if (trimmed.length > SEARCH_MAX_QUERY_LENGTH) {
      throw new BadRequestException({ code: DISCOVERY_ERROR_CODES.SEARCH_QUERY_TOO_LONG, message: `q must be at most ${SEARCH_MAX_QUERY_LENGTH} characters.` });
    }
    const { results } = await this.execute({ q: trimmed, limit } as SearchQueryDto, locale);
    this.metrics.record('suggest', Number(process.hrtime.bigint() - started) / 1e6, results.length, false);
    return {
      query: trimmed,
      suggestions: results.slice(0, limit).map((r) => ({ entityType: r.entityType, id: r.id, slug: r.slug, title: r.title })),
    };
  }

  private parseKinds(types: string | undefined): string[] | undefined {
    if (!types) return undefined;
    const kinds = [...new Set(types.split(',').map((t) => t.trim().toUpperCase()).filter(Boolean))];
    if (kinds.length === 0 || kinds.length > MAX_TYPES || kinds.some((k) => !VALID_KINDS.has(k))) {
      throw new BadRequestException({ code: DISCOVERY_ERROR_CODES.SEARCH_INVALID_TYPE, message: `types must be a comma-separated list of: ${Object.keys(KIND_ORDER).join(', ')}.` });
    }
    return kinds.sort();
  }

  private docFilter(f: Filters): Prisma.Sql {
    const c: Prisma.Sql[] = [];
    if (f.kinds) c.push(Prisma.sql`d."entityKind"::text = ANY(${f.kinds}::text[])`);
    if (f.countryId) c.push(Prisma.sql`${f.countryId}::text = ANY(d."countryIds")`);
    if (f.regionId) c.push(Prisma.sql`${f.regionId}::text = ANY(d."regionIds")`);
    if (f.cityId) c.push(Prisma.sql`${f.cityId}::text = ANY(d."cityIds")`);
    if (f.period) {
      // Unknown chronology (NULL start) never matches; a NULL end means an instant (no extrapolation).
      c.push(Prisma.sql`(d."chronologyStart" IS NOT NULL AND d."chronologyStart" <= ${f.period.endOrdinal} AND COALESCE(d."chronologyEnd", d."chronologyStart") >= ${f.period.startOrdinal})`);
    }
    if (f.bbox) {
      c.push(Prisma.sql`(d."geom" IS NOT NULL AND ST_Intersects(d."geom", ST_MakeEnvelope(${f.bbox.minLng}, ${f.bbox.minLat}, ${f.bbox.maxLng}, ${f.bbox.maxLat}, 4326)))`);
    }
    return c.length > 0 ? Prisma.join(c, ' AND ') : Prisma.sql`TRUE`;
  }

  private async execute(query: SearchQueryDto, locale: string): Promise<SearchResponse> {
    const q = (query.q ?? '').trim();
    if (!q) throw new BadRequestException({ code: DISCOVERY_ERROR_CODES.SEARCH_QUERY_REQUIRED, message: 'q is required.' });
    if (q.length > SEARCH_MAX_QUERY_LENGTH) {
      throw new BadRequestException({ code: DISCOVERY_ERROR_CODES.SEARCH_QUERY_TOO_LONG, message: `q must be at most ${SEARCH_MAX_QUERY_LENGTH} characters.` });
    }
    const limit = Math.min(Math.max(query.limit ?? SEARCH_DEFAULT_LIMIT, 1), SEARCH_MAX_LIMIT);

    const filters: Filters = {
      kinds: this.parseKinds(query.types),
      countryId: query.countryId,
      regionId: query.regionId,
      cityId: query.cityId,
      period: resolvePeriod(query),
      bbox: query.bbox ? parseBbox(query.bbox, DISCOVERY_ERROR_CODES.SEARCH_INVALID_BBOX) : undefined,
    };

    const nq = normalizeSearchText(q);
    // Punctuation-only input normalizes to nothing: a valid request with no possible match.
    if (!nq) return { query: q, results: [], nextCursor: null, hasMore: false };

    const fingerprint = cursorFingerprint({ nq, locale, f: { ...filters, bbox: filters.bbox ?? null, period: filters.period ?? null } });
    const after: SortKey | undefined = query.cursor ? decodeCursor(query.cursor, fingerprint) : undefined;

    const tsq = buildPrefixTsQuery(nq);
    const filter = this.docFilter(filters);
    const parts: Prisma.Sql[] = [
      Prisma.sql`
        SELECT t."documentId" AS id,
               MIN(CASE t."termKind"::text WHEN 'CANONICAL_TITLE' THEN 1 WHEN 'LOCALIZED_TITLE' THEN 2 ELSE 3 END) AS tier,
               BOOL_OR(t."locale" = ${locale}) AS locale_hit
        FROM "SearchTerm" t JOIN "SearchDocument" d ON d."id" = t."documentId"
        WHERE t."normalizedText" COLLATE "C" = ${nq} AND ${filter}
        GROUP BY t."documentId"`,
      Prisma.sql`
        SELECT p.id, 4 AS tier, p.locale_hit FROM (
          SELECT t."documentId" AS id, BOOL_OR(t."locale" = ${locale}) AS locale_hit, d."importance" AS imp
          FROM "SearchTerm" t JOIN "SearchDocument" d ON d."id" = t."documentId"
          WHERE t."termKind"::text IN ('CANONICAL_TITLE', 'LOCALIZED_TITLE')
            AND t."normalizedText" COLLATE "C" >= ${nq} AND t."normalizedText" COLLATE "C" < ${nq + PREFIX_RANGE_END}
            AND ${filter}
          GROUP BY t."documentId", d."importance"
          ORDER BY d."importance" DESC, t."documentId"
          LIMIT ${PREFIX_CANDIDATES}
        ) p`,
    ];
    // A 1-2 character query is fully served by the prefix branch; FTS on such a token only adds ~100 ms (measured) of heap fetches.
    const useFts = tsq !== null && nq.length >= FUZZY_MIN_LENGTH;
    if (useFts) {
      parts.push(Prisma.sql`
        SELECT d."id" AS id, 5 AS tier, false AS locale_hit
        FROM "SearchDocument" d
        WHERE to_tsvector('simple', d."normalizedSearchText") @@ to_tsquery('simple', ${tsq}) AND ${filter}
        ORDER BY d."importance" DESC, d."id"
        LIMIT ${FTS_CANDIDATES}`);
    }
    const fuzzyPart =
      nq.length >= FUZZY_MIN_LENGTH
        ? Prisma.sql`
          SELECT f.id, 6 AS tier, false AS locale_hit FROM (
            SELECT t."documentId" AS id, MAX(similarity(t."normalizedText", ${nq})) AS sim
            FROM "SearchTerm" t JOIN "SearchDocument" d ON d."id" = t."documentId"
            WHERE (SELECT count(*) FROM strong) < ${FUZZY_FILL_THRESHOLD}
              AND t."normalizedText" % ${nq} AND ${filter}
            GROUP BY t."documentId"
            ORDER BY sim DESC, t."documentId"
            LIMIT ${FUZZY_CANDIDATES}
          ) f`
        : null;

    const nameHit = useFts ? Prisma.sql`to_tsvector('simple', d."normalizedNames") @@ to_tsquery('simple', ${tsq})` : Prisma.sql`TRUE`;
    const keyset = after
      ? Prisma.sql`WHERE (r.tier, r.comm, r.name_miss, r.neg_imp, r.locale_miss, r.kind_order, r."entityId") > (${after.tier}, ${after.comm}, ${after.nameMiss}, ${after.negImportance}, ${after.localeMiss}, ${after.kindOrder}, ${after.entityId})`
      : Prisma.empty;

    const query_ = Prisma.sql`
      WITH strong AS (
        SELECT u.id, MIN(u.tier) AS tier, BOOL_OR(u.locale_hit) AS locale_hit
        FROM (${Prisma.join(parts.map((part) => Prisma.sql`(${part})`), ' UNION ALL ')}) u
        GROUP BY u.id
      ),
      cand AS (
        SELECT id, MIN(tier) AS tier, BOOL_OR(locale_hit) AS locale_hit FROM (
          SELECT id, tier, locale_hit FROM strong
          ${fuzzyPart ? Prisma.sql`UNION ALL (${fuzzyPart})` : Prisma.empty}
        ) all_cand
        GROUP BY id
      )
      SELECT * FROM (
        SELECT d."entityKind"::text AS "entityKind", d."entityId", d."canonicalSlug", d."trustClass"::text AS "trustClass",
               d."subtype", d."importance", d."titles", d."summaries",
               c.tier::int AS tier,
               (CASE WHEN d."trustClass"::text = 'COMMUNITY' THEN 1 ELSE 0 END) AS comm,
               (CASE WHEN c.tier = 5 AND NOT (${nameHit}) THEN 1 ELSE 0 END) AS name_miss,
               (-d."importance") AS neg_imp,
               (CASE WHEN c.locale_hit THEN 0 ELSE 1 END) AS locale_miss,
               (${KIND_ORDER_SQL}) AS kind_order
        FROM cand c JOIN "SearchDocument" d ON d."id" = c.id
      ) r
      ${keyset}
      ORDER BY r.tier, r.comm, r.name_miss, r.neg_imp, r.locale_miss, r.kind_order, r."entityId"
      LIMIT ${limit + 1}
    `;
    // Custom plans + the raised trigram threshold, transaction-local only. Prisma caches prepared statements, and after a few
    // executions PostgreSQL may switch to a GENERIC plan that ignores the actual bbox/period values (measured on the map queries:
    // p95 646 ms generic vs 66 ms custom); a custom plan is planned with the real parameter values every time.
    const rows = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('plan_cache_mode', 'force_custom_plan', true), set_config('pg_trgm.similarity_threshold', ${FUZZY_SIMILARITY_THRESHOLD}, true)`;
      return tx.$queryRaw<Row[]>(query_);
    });

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeCursor(fingerprint, {
            tier: Number(last.tier),
            comm: Number(last.comm),
            nameMiss: Number(last.name_miss),
            negImportance: Number(last.neg_imp),
            localeMiss: Number(last.locale_miss),
            kindOrder: Number(last.kind_order),
            entityId: last.entityId,
          })
        : null;

    return {
      query: q,
      results: page.map((row) => this.toItem(row, locale)),
      nextCursor,
      hasMore,
    };
  }

  private toItem(row: Row, locale: string): SearchResultItem {
    const title = resolveText(row.titles ?? {}, locale);
    const summary = resolveText(row.summaries ?? {}, locale);
    const tier = Number(row.tier);
    return {
      entityType: row.entityKind,
      id: row.entityId,
      slug: row.canonicalSlug,
      title: title.text ?? row.canonicalSlug,
      summary: summary.text ? summary.text.slice(0, SUMMARY_MAX_CHARS) : null,
      matchedOn: tier === 3 ? 'alias' : 'name',
      matchTier: TIER_LABEL[tier] ?? 'FUZZY',
      // Opaque, tier-derived ordering hint (NOT a database relevance score).
      score: Number((1 - (tier - 1) / 6).toFixed(3)),
      trustClass: row.trustClass,
      subtype: row.subtype,
      locale,
      actualLocale: title.actualLocale,
      fallbackUsed: title.fallbackUsed,
    };
  }
}
