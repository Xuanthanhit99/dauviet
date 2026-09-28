import { BadRequestException, Injectable } from '@nestjs/common';
import { DateEra, Prisma, PlaceType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveTranslation } from '../../common/translation/resolve-translation.util';
import { DISCOVERY_ERROR_CODES } from '../../common/errors/discovery-error-codes';
import { toChronologyYearStart } from '../../common/historical-date/historical-date.util';
import { MapFeaturesQueryDto } from './dto/map-query.dto';
import { parseBbox } from '../../common/geo/bbox.util';
import { resolvePeriod } from '../search/search-period.util';

const MAX_FEATURES = 500;

interface PlaceRow {
  id: string;
  canonicalSlug: string;
  type: PlaceType;
  historicalImportance: number;
  geojson: string;
}

/** Hard upper bound on the whole response, whatever the per-layer caps add up to (spec 48/76). */
const MAX_TOTAL_FEATURES = 1000;

/**
 * Per-layer feature cap by zoom: world/national zoom stays small, close zoom may return more,
 * always bounded (`MAX_FEATURES`). Fractional zoom (as sent by map libraries) is accepted.
 */
function featureCapForZoom(zoom: number | undefined): number {
  if (zoom === undefined) return MAX_FEATURES;
  if (zoom <= 6) return Math.min(MAX_FEATURES, 100);
  if (zoom <= 9) return Math.min(MAX_FEATURES, 250);
  return MAX_FEATURES;
}

/** Response-only Douglas-Peucker tolerance in degrees for Territory polygons; the canonical geometry is never altered. */
function simplifyToleranceForZoom(zoom: number | undefined): number {
  if (zoom === undefined) return 0;
  if (zoom <= 4) return 0.5;
  if (zoom <= 6) return 0.1;
  if (zoom <= 8) return 0.02;
  if (zoom <= 10) return 0.005;
  return 0;
}

const MAP_KINDS = ['PLACE', 'EVENT', 'TERRITORY', 'COUNTRY', 'REGION', 'CITY', 'DESTINATION'] as const;
type MapKind = (typeof MAP_KINDS)[number];

interface GeographyLayer {
  kind: 'COUNTRY' | 'REGION' | 'CITY' | 'DESTINATION';
  table: string;
  translationModel: string;
  translationFk: string;
  hasImportance: boolean;
}

/** Allowlist of the current-geography tables (G01). Nothing here is ever built from user input. */
const GEOGRAPHY_LAYERS: readonly GeographyLayer[] = [
  { kind: 'COUNTRY', table: 'Country', translationModel: 'countryTranslation', translationFk: 'countryId', hasImportance: false },
  { kind: 'REGION', table: 'Region', translationModel: 'regionTranslation', translationFk: 'regionId', hasImportance: false },
  { kind: 'CITY', table: 'City', translationModel: 'cityTranslation', translationFk: 'cityId', hasImportance: true },
  { kind: 'DESTINATION', table: 'Destination', translationModel: 'destinationTranslation', translationFk: 'destinationId', hasImportance: true },
];

/** Density: countries only at national/world zoom, regions at regional zoom, cities/destinations from regional to street zoom. */
function zoomAllowsGeography(kind: GeographyLayer['kind'], zoom: number | undefined): boolean {
  if (zoom === undefined) return true;
  switch (kind) {
    case 'COUNTRY':
      return zoom <= 7;
    case 'REGION':
      return zoom >= 3 && zoom <= 10;
    default:
      return zoom >= 5;
  }
}

interface TerritoryRow {
  id: string;
  canonicalSlug: string;
  type: string;
  geojson: string;
  chronologyStart: number | null;
  chronologyEnd: number | null;
  dateLabel: string | null;
}

interface EventRow {
  id: string;
  canonicalSlug: string;
  importance: number;
  placeId: string;
  geojson: string;
  chronologyStart?: number | null;
  chronologyEnd?: number | null;
}

/**
 * Zoom-based density (spec section 9): at low zoom, the national map shows
 * only high-importance anchors; each tier down lowers the importance floor
 * until every published point is eligible at close zoom. Deliberately a
 * small, explicit threshold table - not a hardcoded id list - so any
 * editorially-important Place (including Hoang Sa/Truong Sa, see section
 * 11) is visible purely by carrying a real `historicalImportance` value,
 * the same mechanism as every other Place.
 */
function minImportanceForZoom(zoom: number | undefined): number {
  if (zoom === undefined) return 0;
  if (zoom <= 6) return 7; // national view: only major anchors
  if (zoom <= 10) return 4; // regional view: notable sites
  return 0; // city/street view: everything published
}

/**
 * GeoJSON map contract (spec Phase 03 section 24, hardened Phase 07). Every
 * query is bbox-scoped and capped at MAX_FEATURES - this deliberately never
 * returns "every point in Vietnam" for an unscoped request. All spatial SQL
 * is parameterized (`$queryRaw` tagged templates / `Prisma.sql`) - no raw
 * string interpolation of user input ever reaches a query. See
 * docs/backend/DISCOVERY_ARCHITECTURE.md for the full contract.
 */
@Injectable()
export class MapService {
  constructor(private readonly prisma: PrismaService) {}

  async getFeatures(query: MapFeaturesQueryDto, locale: string) {
    const { minLng, minLat, maxLng, maxLat } = parseBbox(query.bbox, DISCOVERY_ERROR_CODES.MAP_INVALID_BBOX);

    if (query.year !== undefined && (query.year < -6000 || query.year > 9999)) {
      throw new BadRequestException({ code: DISCOVERY_ERROR_CODES.MAP_INVALID_YEAR, message: 'year is out of a plausible historical range.' });
    }

    const types = query.types
      ? query.types.split(',').map((t) => t.trim())
      : undefined;
    if (types && types.some((t) => !Object.values(PlaceType).includes(t as PlaceType))) {
      throw new BadRequestException({ code: DISCOVERY_ERROR_CODES.MAP_INVALID_FILTER, message: `types must be a comma-separated list of valid PlaceType values.` });
    }

    // G11 opt-ins. `kinds` selects layers; `fromYear/toYear` is the STRICT, era-aware period filter.
    const requestedKinds = this.parseKinds(query.kinds);
    let period: ReturnType<typeof resolvePeriod>;
    try {
      period = resolvePeriod(query);
    } catch (err) {
      throw new BadRequestException({ code: DISCOVERY_ERROR_CODES.MAP_INVALID_YEAR, message: err instanceof BadRequestException ? String((err.getResponse() as any).message) : 'invalid period.' });
    }
    // Custom plans, transaction-local: Prisma's cached prepared statements can switch PostgreSQL to a GENERIC plan that ignores the
    // actual bbox (measured: whole-world bbox p95 646 ms generic vs 66 ms custom). Validation above runs before any DB access.
    return this.prisma.$transaction(async (db) => {
      await db.$executeRaw`SELECT set_config('plan_cache_mode', 'force_custom_plan', true)`;
      return this.loadFeatures(db, query, locale, { minLng, minLat, maxLng, maxLat }, types, requestedKinds, period);
    });
  }

  private async loadFeatures(
    db: Prisma.TransactionClient,
    query: MapFeaturesQueryDto,
    locale: string,
    { minLng, minLat, maxLng, maxLat }: { minLng: number; minLat: number; maxLng: number; maxLat: number },
    types: string[] | undefined,
    requestedKinds: Set<MapKind> | undefined,
    period: ReturnType<typeof resolvePeriod>,
  ) {
    // Default layer set is exactly the pre-G11 one: PLACE + EVENT (+ TERRITORY when `year` is given).
    // A strict period only justifies temporally-modelled layers (TERRITORY, EVENT) - never current geography
    // and never undated sites (no extrapolation, spec 53/79).
    const wants = (kind: MapKind) => (requestedKinds ? requestedKinds.has(kind) : kind === 'PLACE' || kind === 'EVENT' || (kind === 'TERRITORY' && (query.year !== undefined || period !== null)));
    const layerAllowed = (kind: MapKind) => wants(kind) && (period === null || kind === 'TERRITORY' || kind === 'EVENT');

    const minImportance = minImportanceForZoom(query.zoom);
    const featureCap = featureCapForZoom(query.zoom);

    const placeRows = !layerAllowed('PLACE')
      ? []
      : await db.$queryRaw<PlaceRow[]>`
      SELECT p."id", p."canonicalSlug", p."type", p."historicalImportance",
             ST_AsGeoJSON(p."location") as geojson
      FROM "Place" p
      WHERE p."publicationStatus" = 'PUBLISHED'
        AND p."location" IS NOT NULL
        AND p."historicalImportance" >= ${minImportance}
        AND ST_Intersects(p."location", ST_MakeEnvelope(${minLng}, ${minLat}, ${maxLng}, ${maxLat}, 4326))
        ${types && types.length > 0 ? Prisma.sql`AND p."type"::text IN (${Prisma.join(types)})` : Prisma.sql``}
      ORDER BY p."historicalImportance" DESC, p."id"
      LIMIT ${featureCap + 1}
    `;
    const placeTruncated = placeRows.length > featureCap;
    const boundedPlaceRows = placeRows.slice(0, featureCap);

    const placeIds = boundedPlaceRows.map((r) => r.id);
    const translations = placeIds.length
      ? await db.placeTranslation.findMany({ where: { placeId: { in: placeIds } } })
      : [];
    const translationsByPlace = new Map<string, typeof translations>();
    for (const t of translations) {
      const arr = translationsByPlace.get(t.placeId) ?? [];
      arr.push(t);
      translationsByPlace.set(t.placeId, arr);
    }

    const placeFeatures = boundedPlaceRows.map((row) => {
      const { translation, resolvedLocale, fallbackApplied } = resolveTranslation(translationsByPlace.get(row.id) ?? [], locale);
      return {
        type: 'Feature' as const,
        id: row.id,
        geometry: JSON.parse(row.geojson),
        properties: {
          entityType: 'PLACE' as const,
          id: row.id,
          slug: row.canonicalSlug,
          placeType: row.type,
          historicalImportance: row.historicalImportance,
          name: translation?.name ?? row.canonicalSlug,
          locale,
          actualLocale: resolvedLocale,
          fallbackUsed: fallbackApplied,
          layer: 'HISTORICAL_KNOWLEDGE_SITE' as const,
          trustClass: 'CANONICAL' as const,
          markerSemantic: 'HISTORICAL_SITE' as const,
        },
      };
    });

    let territoryFeatures: any[] = [];
    let territoryTruncated = false;
    if (layerAllowed('TERRITORY')) {
      // Legacy `year` keeps its accepted G03 semantics (an undated Territory matches). The NEW strict
      // period requires a KNOWN chronologyStart and never matches an undated one (spec 79).
      // G03: filters on the authoritative chronologyStart/chronologyEnd
      // ordinal, NOT the legacy sortStart/sortEnd DateTime pair. This
      // matters specifically for a KNOWN BCE Territory: its legacy
      // sortStart/sortEnd are intentionally NULL (see
      // historical-date.util.ts "Legacy timestamp policy" - never a
      // fabricated CE-era timestamp), and NULL there reads as "unknown -
      // always match" below, which would incorrectly surface a BCE
      // Territory in an unrelated CE year query. chronologyStart/End are
      // populated for ANY known date regardless of era, so NULL there
      // means what it should: genuinely undated. `query.year` itself has
      // no era param (pre-existing map contract, unchanged) - it is always
      // interpreted as CE; era-aware filtering is the new strict period.
      const yearOrdinal = query.year !== undefined ? toChronologyYearStart(query.year, DateEra.CE) : null;
      const tolerance = simplifyToleranceForZoom(query.zoom);
      // geometryStatus = 'PUBLISHED' only - draft/in-review/sensitive
      // historical geometry must never leak through the generic bbox
      // endpoint (spec section 12/33). The response geometry may be
      // SIMPLIFIED at low zoom (payload size); the canonical geometry is never modified.
      const territoryRows = await db.$queryRaw<TerritoryRow[]>`
        SELECT t."id", t."canonicalSlug", t."type"::text as type,
               ${tolerance > 0 ? Prisma.sql`ST_AsGeoJSON(ST_SimplifyPreserveTopology(t."geometry", ${tolerance}), 6)` : Prisma.sql`ST_AsGeoJSON(t."geometry")`} as geojson,
               t."chronologyStart", t."chronologyEnd", t."dateLabel"
        FROM "Territory" t
        WHERE t."geometry" IS NOT NULL
          AND t."geometryStatus" = 'PUBLISHED'
          AND ST_Intersects(t."geometry", ST_MakeEnvelope(${minLng}, ${minLat}, ${maxLng}, ${maxLat}, 4326))
          AND (${yearOrdinal === null}::boolean OR ((t."chronologyStart" IS NULL OR t."chronologyStart" <= ${yearOrdinal ?? 0})
          AND (t."chronologyEnd" IS NULL OR t."chronologyEnd" >= ${yearOrdinal ?? 0})))
          ${period ? Prisma.sql`AND t."chronologyStart" IS NOT NULL AND t."chronologyStart" <= ${period.endOrdinal} AND COALESCE(t."chronologyEnd", t."chronologyStart") >= ${period.startOrdinal}` : Prisma.sql``}
        ORDER BY t."id"
        LIMIT ${featureCap + 1}
      `;
      territoryTruncated = territoryRows.length > featureCap;
      const boundedTerritories = territoryRows.slice(0, featureCap);

      const territoryIds = boundedTerritories.map((r) => r.id);
      const territoryTranslations = territoryIds.length
        ? await db.territoryTranslation.findMany({ where: { territoryId: { in: territoryIds } } })
        : [];
      const byTerritory = new Map<string, typeof territoryTranslations>();
      for (const t of territoryTranslations) {
        const arr = byTerritory.get(t.territoryId) ?? [];
        arr.push(t);
        byTerritory.set(t.territoryId, arr);
      }

      territoryFeatures = boundedTerritories.map((row) => {
        const { translation } = resolveTranslation(byTerritory.get(row.id) ?? [], locale);
        return {
          type: 'Feature' as const,
          id: row.id,
          geometry: JSON.parse(row.geojson),
          properties: {
            entityType: 'TERRITORY' as const,
            id: row.id,
            slug: row.canonicalSlug,
            territoryType: row.type,
            name: translation?.name ?? row.canonicalSlug,
            year: query.year,
            layer: 'HISTORICAL' as const,
            trustClass: 'CANONICAL' as const,
            markerSemantic: 'HISTORICAL_TERRITORY' as const,
            // Temporal context as stored (null = unknown); a boundary is interpretive and is never
            // presented as an exact surveyed border. Geometry may be generalized at low zoom.
            chronologyStart: row.chronologyStart,
            chronologyEnd: row.chronologyEnd,
            dateLabel: row.dateLabel,
            geometryGeneralized: tolerance > 0,
          },
        };
      });
    }

    // HistoricalEvent features (spec section 7) - only events that are
    // map-locatable (have >=1 EventPlace link with a resolvable Place point)
    // and, when provided, match the theme/era/year filters. One feature per
    // (event, place) pair - an event with several linked places renders at
    // each of them, never a single "average" point.
    const eventRows = !layerAllowed('EVENT')
      ? []
      : await db.$queryRaw<EventRow[]>`
      SELECT e."id", e."canonicalSlug", e."importance", ep."placeId",
             e."dateChronologyStart" as "chronologyStart", e."dateChronologyEnd" as "chronologyEnd",
             ST_AsGeoJSON(p."location") as geojson
      FROM "HistoricalEvent" e
      JOIN "EventPlace" ep ON ep."eventId" = e."id"
      JOIN "Place" p ON p."id" = ep."placeId"
      ${query.theme ? Prisma.sql`JOIN "EventTheme" evt ON evt."eventId" = e."id" JOIN "Theme" th ON th."id" = evt."themeId" AND th."slug" = ${query.theme}` : Prisma.sql``}
      WHERE e."publicationStatus" = 'PUBLISHED'
        AND p."location" IS NOT NULL
        AND p."publicationStatus" = 'PUBLISHED'
        AND e."importance" >= ${minImportance}
        AND ST_Intersects(p."location", ST_MakeEnvelope(${minLng}, ${minLat}, ${maxLng}, ${maxLat}, 4326))
        ${query.eraId ? Prisma.sql`AND e."eraId" = ${query.eraId}` : Prisma.sql``}
        ${
          query.year !== undefined
            ? Prisma.sql`AND (e."dateSortStart" IS NOT NULL AND e."dateSortStart" <= ${new Date(Date.UTC(query.year, 11, 31, 23, 59, 59))} AND (e."dateSortEnd" IS NULL OR e."dateSortEnd" >= ${new Date(Date.UTC(query.year, 0, 1))}))`
            : Prisma.sql``
        }
        ${period ? Prisma.sql`AND e."dateChronologyStart" IS NOT NULL AND e."dateChronologyStart" <= ${period.endOrdinal} AND COALESCE(e."dateChronologyEnd", e."dateChronologyStart") >= ${period.startOrdinal}` : Prisma.sql``}
      ORDER BY e."importance" DESC, e."id", ep."placeId"
      LIMIT ${featureCap + 1}
    `;
    const eventTruncated = eventRows.length > featureCap;
    const boundedEventRows = eventRows.slice(0, featureCap);

    const eventIds = [...new Set(boundedEventRows.map((r) => r.id))];
    const eventTranslations = eventIds.length
      ? await db.historicalEventTranslation.findMany({ where: { eventId: { in: eventIds } } })
      : [];
    const byEvent = new Map<string, typeof eventTranslations>();
    for (const t of eventTranslations) {
      const arr = byEvent.get(t.eventId) ?? [];
      arr.push(t);
      byEvent.set(t.eventId, arr);
    }

    const eventFeatures = boundedEventRows.map((row) => {
      const { translation, resolvedLocale, fallbackApplied } = resolveTranslation(byEvent.get(row.id) ?? [], locale);
      return {
        type: 'Feature' as const,
        id: `${row.id}:${row.placeId}`,
        geometry: JSON.parse(row.geojson),
        properties: {
          entityType: 'EVENT' as const,
          id: row.id,
          slug: row.canonicalSlug,
          importance: row.importance,
          placeId: row.placeId,
          title: translation?.title ?? row.canonicalSlug,
          locale,
          actualLocale: resolvedLocale,
          fallbackUsed: fallbackApplied,
          layer: 'HISTORICAL_KNOWLEDGE_SITE' as const,
          trustClass: 'CANONICAL' as const,
          markerSemantic: 'HISTORICAL_EVENT' as const,
          chronologyStart: row.chronologyStart ?? null,
          chronologyEnd: row.chronologyEnd ?? null,
        },
      };
    });

    // Current geography (G01): plain stored latitude/longitude -> Point. A representative point is
    // display-only: it is NOT a territory, a border or a jurisdiction claim (spec 44/51).
    const geographyFeatures: any[] = [];
    const geographyTruncated: boolean[] = [];
    for (const spec of GEOGRAPHY_LAYERS) {
      if (!layerAllowed(spec.kind) || !zoomAllowsGeography(spec.kind, query.zoom)) continue;
      const { features, truncated } = await this.geographyLayer(db, spec, { minLng, minLat, maxLng, maxLat }, minImportance, featureCap, locale);
      geographyFeatures.push(...features);
      geographyTruncated.push(truncated);
    }

    const all = [...placeFeatures, ...territoryFeatures, ...eventFeatures, ...geographyFeatures];
    const overTotal = all.length > MAX_TOTAL_FEATURES;
    return {
      type: 'FeatureCollection' as const,
      features: overTotal ? all.slice(0, MAX_TOTAL_FEATURES) : all,
      meta: {
        truncated: placeTruncated || territoryTruncated || eventTruncated || geographyTruncated.some(Boolean) || overTotal,
        limit: featureCap,
        minImportance,
        maxFeatures: MAX_TOTAL_FEATURES,
        periodApplied: period !== null,
      },
    };
  }

  private parseKinds(kinds: string | undefined): Set<MapKind> | undefined {
    if (!kinds) return undefined;
    const parsed = kinds.split(',').map((k) => k.trim().toUpperCase()).filter(Boolean);
    if (parsed.length === 0 || parsed.length > MAP_KINDS.length || parsed.some((k) => !(MAP_KINDS as readonly string[]).includes(k))) {
      throw new BadRequestException({ code: DISCOVERY_ERROR_CODES.MAP_INVALID_FILTER, message: `kinds must be a comma-separated list of: ${MAP_KINDS.join(', ')}.` });
    }
    return new Set(parsed as MapKind[]);
  }

  private async geographyLayer(db: Prisma.TransactionClient, spec: GeographyLayer, box: { minLng: number; minLat: number; maxLng: number; maxLat: number }, minImportance: number, cap: number, locale: string) {
    // Table/column names come from the constant GEOGRAPHY_LAYERS allowlist, never from user input.
    const table = Prisma.raw(`"${spec.table}"`);
    const importanceCol = spec.hasImportance ? Prisma.raw(`g."importance"`) : Prisma.raw('0::int');
    const rows = await db.$queryRaw<Array<{ id: string; canonicalSlug: string; importance: number; geojson: string }>>`
      SELECT g."id", g."canonicalSlug", ${importanceCol} AS importance, ST_AsGeoJSON(ST_SetSRID(ST_MakePoint(g."longitude", g."latitude"), 4326)) AS geojson
      FROM ${table} g
      WHERE g."status" = 'PUBLISHED'
        AND g."latitude" IS NOT NULL AND g."longitude" IS NOT NULL
        AND ${importanceCol} >= ${spec.hasImportance ? minImportance : 0}
        AND ST_SetSRID(ST_MakePoint(g."longitude", g."latitude"), 4326) && ST_MakeEnvelope(${box.minLng}, ${box.minLat}, ${box.maxLng}, ${box.maxLat}, 4326)
      ORDER BY ${importanceCol} DESC, g."id"
      LIMIT ${cap + 1}
    `;
    const truncated = rows.length > cap;
    const bounded = rows.slice(0, cap);
    const ids = bounded.map((r) => r.id);
    const translations: Array<{ locale: string; name: string }> & Array<any> = ids.length ? await (db as any)[spec.translationModel].findMany({ where: { [spec.translationFk]: { in: ids } } }) : [];
    const byId = new Map<string, any[]>();
    for (const t of translations) {
      const key = (t as any)[spec.translationFk] as string;
      byId.set(key, [...(byId.get(key) ?? []), t]);
    }
    const features = bounded.map((row) => {
      const { translation, resolvedLocale, fallbackApplied } = resolveTranslation(byId.get(row.id) ?? [], locale);
      return {
        type: 'Feature' as const,
        id: row.id,
        geometry: JSON.parse(row.geojson),
        properties: {
          entityType: spec.kind,
          id: row.id,
          slug: row.canonicalSlug,
          name: translation?.name ?? row.canonicalSlug,
          importance: Number(row.importance),
          locale,
          actualLocale: resolvedLocale,
          fallbackUsed: fallbackApplied,
          layer: 'CURRENT_GEOGRAPHY' as const,
          trustClass: 'CANONICAL' as const,
          markerSemantic: spec.kind,
        },
      };
    });
    return { features, truncated };
  }
}
