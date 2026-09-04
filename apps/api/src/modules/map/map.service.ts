import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, PlaceType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveTranslation } from '../../common/translation/resolve-translation.util';
import { DISCOVERY_ERROR_CODES } from '../../common/errors/discovery-error-codes';
import { MapFeaturesQueryDto } from './dto/map-query.dto';

const MAX_FEATURES = 500;

interface PlaceRow {
  id: string;
  canonicalSlug: string;
  type: PlaceType;
  historicalImportance: number;
  geojson: string;
}

interface TerritoryRow {
  id: string;
  canonicalSlug: string;
  type: string;
  geojson: string;
}

interface EventRow {
  id: string;
  canonicalSlug: string;
  importance: number;
  placeId: string;
  geojson: string;
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

interface ParsedBbox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
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

  /** Strict bbox validation (spec section 4) - never lets a malformed/out-of-range/NaN value reach SQL. */
  private parseBbox(bbox: string | undefined): ParsedBbox {
    if (!bbox) {
      throw new BadRequestException({
        code: DISCOVERY_ERROR_CODES.MAP_INVALID_BBOX,
        message: 'bbox is required, formatted as west,south,east,north (minLng,minLat,maxLng,maxLat).',
      });
    }
    const parts = bbox.split(',').map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
      throw new BadRequestException({ code: DISCOVERY_ERROR_CODES.MAP_INVALID_BBOX, message: 'bbox must be four finite numbers: west,south,east,north.' });
    }
    const [minLng, minLat, maxLng, maxLat] = parts;
    if (minLng < -180 || maxLng > 180 || minLat < -90 || maxLat > 90) {
      throw new BadRequestException({ code: DISCOVERY_ERROR_CODES.MAP_INVALID_BBOX, message: 'bbox coordinates out of range (lng in [-180,180], lat in [-90,90]).' });
    }
    if (minLng >= maxLng || minLat >= maxLat) {
      throw new BadRequestException({ code: DISCOVERY_ERROR_CODES.MAP_INVALID_BBOX, message: 'bbox must have west < east and south < north.' });
    }
    return { minLng, minLat, maxLng, maxLat };
  }

  async getFeatures(query: MapFeaturesQueryDto, locale: string) {
    const { minLng, minLat, maxLng, maxLat } = this.parseBbox(query.bbox);

    if (query.year !== undefined && (query.year < -6000 || query.year > 9999)) {
      throw new BadRequestException({ code: DISCOVERY_ERROR_CODES.MAP_INVALID_YEAR, message: 'year is out of a plausible historical range.' });
    }

    const types = query.types
      ? query.types.split(',').map((t) => t.trim())
      : undefined;
    if (types && types.some((t) => !Object.values(PlaceType).includes(t as PlaceType))) {
      throw new BadRequestException({ code: DISCOVERY_ERROR_CODES.MAP_INVALID_FILTER, message: `types must be a comma-separated list of valid PlaceType values.` });
    }

    const minImportance = minImportanceForZoom(query.zoom);
    const featureCap = query.zoom !== undefined && query.zoom <= 6 ? Math.min(MAX_FEATURES, 100) : MAX_FEATURES;

    const placeRows = await this.prisma.$queryRaw<PlaceRow[]>`
      SELECT p."id", p."canonicalSlug", p."type", p."historicalImportance",
             ST_AsGeoJSON(p."location") as geojson
      FROM "Place" p
      WHERE p."publicationStatus" = 'PUBLISHED'
        AND p."location" IS NOT NULL
        AND p."historicalImportance" >= ${minImportance}
        AND ST_Intersects(p."location", ST_MakeEnvelope(${minLng}, ${minLat}, ${maxLng}, ${maxLat}, 4326))
        ${types && types.length > 0 ? Prisma.sql`AND p."type"::text IN (${Prisma.join(types)})` : Prisma.sql``}
      ORDER BY p."historicalImportance" DESC
      LIMIT ${featureCap + 1}
    `;
    const placeTruncated = placeRows.length > featureCap;
    const boundedPlaceRows = placeRows.slice(0, featureCap);

    const placeIds = boundedPlaceRows.map((r) => r.id);
    const translations = placeIds.length
      ? await this.prisma.placeTranslation.findMany({ where: { placeId: { in: placeIds } } })
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
        },
      };
    });

    let territoryFeatures: any[] = [];
    if (query.year !== undefined) {
      const yearDate = new Date(Date.UTC(query.year, 0, 1));
      // geometryStatus = 'PUBLISHED' only - draft/in-review/sensitive
      // historical geometry must never leak through the generic bbox
      // endpoint (spec section 12/33).
      const territoryRows = await this.prisma.$queryRaw<TerritoryRow[]>`
        SELECT t."id", t."canonicalSlug", t."type"::text as type, ST_AsGeoJSON(t."geometry") as geojson
        FROM "Territory" t
        WHERE t."geometry" IS NOT NULL
          AND t."geometryStatus" = 'PUBLISHED'
          AND ST_Intersects(t."geometry", ST_MakeEnvelope(${minLng}, ${minLat}, ${maxLng}, ${maxLat}, 4326))
          AND (t."sortStart" IS NULL OR t."sortStart" <= ${yearDate})
          AND (t."sortEnd" IS NULL OR t."sortEnd" >= ${yearDate})
        LIMIT ${MAX_FEATURES}
      `;

      const territoryIds = territoryRows.map((r) => r.id);
      const territoryTranslations = territoryIds.length
        ? await this.prisma.territoryTranslation.findMany({ where: { territoryId: { in: territoryIds } } })
        : [];
      const byTerritory = new Map<string, typeof territoryTranslations>();
      for (const t of territoryTranslations) {
        const arr = byTerritory.get(t.territoryId) ?? [];
        arr.push(t);
        byTerritory.set(t.territoryId, arr);
      }

      territoryFeatures = territoryRows.map((row) => {
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
          },
        };
      });
    }

    // HistoricalEvent features (spec section 7) - only events that are
    // map-locatable (have >=1 EventPlace link with a resolvable Place point)
    // and, when provided, match the theme/era/year filters. One feature per
    // (event, place) pair - an event with several linked places renders at
    // each of them, never a single "average" point.
    const eventRows = await this.prisma.$queryRaw<EventRow[]>`
      SELECT e."id", e."canonicalSlug", e."importance", ep."placeId",
             ST_AsGeoJSON(p."location") as geojson
      FROM "HistoricalEvent" e
      JOIN "EventPlace" ep ON ep."eventId" = e."id"
      JOIN "Place" p ON p."id" = ep."placeId"
      ${query.theme ? Prisma.sql`JOIN "EventTheme" evt ON evt."eventId" = e."id" JOIN "Theme" th ON th."id" = evt."themeId" AND th."slug" = ${query.theme}` : Prisma.sql``}
      WHERE e."publicationStatus" = 'PUBLISHED'
        AND p."location" IS NOT NULL
        AND e."importance" >= ${minImportance}
        AND ST_Intersects(p."location", ST_MakeEnvelope(${minLng}, ${minLat}, ${maxLng}, ${maxLat}, 4326))
        ${query.eraId ? Prisma.sql`AND e."eraId" = ${query.eraId}` : Prisma.sql``}
        ${
          query.year !== undefined
            ? Prisma.sql`AND (e."dateSortStart" IS NOT NULL AND e."dateSortStart" <= ${new Date(Date.UTC(query.year, 11, 31, 23, 59, 59))} AND (e."dateSortEnd" IS NULL OR e."dateSortEnd" >= ${new Date(Date.UTC(query.year, 0, 1))}))`
            : Prisma.sql``
        }
      ORDER BY e."importance" DESC
      LIMIT ${MAX_FEATURES}
    `;

    const eventIds = [...new Set(eventRows.map((r) => r.id))];
    const eventTranslations = eventIds.length
      ? await this.prisma.historicalEventTranslation.findMany({ where: { eventId: { in: eventIds } } })
      : [];
    const byEvent = new Map<string, typeof eventTranslations>();
    for (const t of eventTranslations) {
      const arr = byEvent.get(t.eventId) ?? [];
      arr.push(t);
      byEvent.set(t.eventId, arr);
    }

    const eventFeatures = eventRows.map((row) => {
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
        },
      };
    });

    return {
      type: 'FeatureCollection' as const,
      features: [...placeFeatures, ...territoryFeatures, ...eventFeatures],
      meta: { truncated: placeTruncated, limit: featureCap, minImportance },
    };
  }
}
