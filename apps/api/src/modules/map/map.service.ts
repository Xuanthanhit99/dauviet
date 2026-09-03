import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, PlaceType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveTranslation } from '../../common/translation/resolve-translation.util';
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

/**
 * GeoJSON map contract (spec section 24). Every query is bbox-scoped and
 * capped at MAX_FEATURES - this deliberately never returns "every point in
 * Vietnam" for an unscoped request.
 */
@Injectable()
export class MapService {
  constructor(private readonly prisma: PrismaService) {}

  async getFeatures(query: MapFeaturesQueryDto, locale: string) {
    if (!query.bbox) {
      throw new BadRequestException('bbox is required, formatted as minLng,minLat,maxLng,maxLat.');
    }
    const [minLng, minLat, maxLng, maxLat] = query.bbox.split(',').map(Number);
    if ([minLng, minLat, maxLng, maxLat].some((n) => Number.isNaN(n))) {
      throw new BadRequestException('Invalid bbox.');
    }

    const types = query.types
      ? query.types.split(',').filter((t): t is PlaceType => Object.values(PlaceType).includes(t as PlaceType))
      : undefined;

    const placeRows = await this.prisma.$queryRaw<PlaceRow[]>`
      SELECT p."id", p."canonicalSlug", p."type", p."historicalImportance",
             ST_AsGeoJSON(p."location") as geojson
      FROM "Place" p
      WHERE p."publicationStatus" = 'PUBLISHED'
        AND p."location" IS NOT NULL
        AND ST_Intersects(p."location", ST_MakeEnvelope(${minLng}, ${minLat}, ${maxLng}, ${maxLat}, 4326))
        ${types && types.length > 0 ? Prisma.sql`AND p."type"::text IN (${Prisma.join(types)})` : Prisma.sql``}
      ORDER BY p."historicalImportance" DESC
      LIMIT ${MAX_FEATURES}
    `;

    const placeIds = placeRows.map((r) => r.id);
    const translations = placeIds.length
      ? await this.prisma.placeTranslation.findMany({ where: { placeId: { in: placeIds } } })
      : [];
    const translationsByPlace = new Map<string, typeof translations>();
    for (const t of translations) {
      const arr = translationsByPlace.get(t.placeId) ?? [];
      arr.push(t);
      translationsByPlace.set(t.placeId, arr);
    }

    const placeFeatures = placeRows.map((row) => {
      const { translation } = resolveTranslation(translationsByPlace.get(row.id) ?? [], locale);
      return {
        type: 'Feature' as const,
        geometry: JSON.parse(row.geojson),
        properties: {
          entityType: 'PLACE',
          id: row.id,
          slug: row.canonicalSlug,
          placeType: row.type,
          historicalImportance: row.historicalImportance,
          name: translation?.name ?? row.canonicalSlug,
        },
      };
    });

    let territoryFeatures: any[] = [];
    if (query.year !== undefined) {
      const yearDate = new Date(Date.UTC(query.year, 0, 1));
      // geometryStatus = 'PUBLISHED' only - draft/in-review/sensitive
      // historical geometry must never leak through the generic bbox
      // endpoint (spec section 33).
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
          geometry: JSON.parse(row.geojson),
          properties: {
            entityType: 'TERRITORY',
            id: row.id,
            slug: row.canonicalSlug,
            territoryType: row.type,
            name: translation?.name ?? row.canonicalSlug,
            year: query.year,
          },
        };
      });
    }

    return {
      type: 'FeatureCollection' as const,
      features: [...placeFeatures, ...territoryFeatures],
    };
  }
}
