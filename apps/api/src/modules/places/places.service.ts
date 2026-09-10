import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PlaceType, Prisma, PublicationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { resolveTranslation } from '../../common/translation/resolve-translation.util';
import { toSlug } from '../../common/util/slug.util';
import { toHistoricalDateResponse } from '../../common/historical-date/historical-date.util';
import { getPublicSourcesForEntity } from '../facts/fact-sources.util';
import { StoriesService } from '../stories/stories.service';
import { JourneysService } from '../journeys/journeys.service';
import { DISCOVERY_ERROR_CODES } from '../../common/errors/discovery-error-codes';
import { PUBLIC_VISIBLE_STATUSES } from '../../common/moderation/public-visible-statuses.util';
import { CreatePlaceDto, UpdatePlaceDto } from './dto/place.dto';
import { NearbyPlacesQueryDto } from './dto/nearby-query.dto';
import { CANONICAL_LOCALE } from '../../common/decorators/locale.decorator';
import { GEOGRAPHY_ERROR_CODES } from '../../common/errors/geography-error-codes';
import { assertSameCountry } from '../../common/geography/geography-consistency.util';

const MAX_NEARBY_RADIUS_METERS = 50_000;
const DEFAULT_NEARBY_RADIUS_METERS = 5_000;
const DEFAULT_NEARBY_LIMIT = 20;

interface NearbyRow {
  id: string;
  canonicalSlug: string;
  type: PlaceType;
  historicalImportance: number;
  distanceMeters: number;
}

@Injectable()
export class PlacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly stories: StoriesService,
    private readonly journeys: JourneysService,
  ) {}

  private async ensureUniqueCanonicalSlug(base: string): Promise<string> {
    let slug = base;
    let suffix = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const existing = await this.prisma.place.findUnique({ where: { canonicalSlug: slug } });
      if (!existing) return slug;
      suffix += 1;
      slug = `${base}-${suffix}`;
    }
  }

  /**
   * Current-geography consistency (G03, mirrors G01's
   * DestinationsService.assertHierarchyConsistency): a Place's
   * current-day country/region/city is inherently 1:1, so these are direct
   * nullable FKs rather than join tables. countryId is optional overall
   * (most historical Places have none of the three), but becomes required
   * and authoritative the moment a regionId/cityId is supplied.
   */
  private async assertCurrentGeographyConsistency(countryId?: string | null, regionId?: string | null, cityId?: string | null) {
    if (!countryId) {
      if (regionId || cityId) {
        throw new BadRequestException({
          code: GEOGRAPHY_ERROR_CODES.GEOGRAPHY_COUNTRY_MISMATCH,
          message: 'currentCountryId is required when currentRegionId or currentCityId is given.',
        });
      }
      return;
    }

    const country = await this.prisma.country.findUnique({ where: { id: countryId } });
    if (!country) {
      throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.COUNTRY_NOT_FOUND, message: `No Country with id ${countryId}.` });
    }

    let city: { id: string; countryId: string; regionId: string | null } | null = null;
    if (cityId) {
      city = await this.prisma.city.findUnique({ where: { id: cityId } });
      if (!city) {
        throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.CITY_NOT_FOUND, message: `No City with id ${cityId}.` });
      }
      assertSameCountry(city, countryId, 'currentCityId must belong to the same country as currentCountryId.');
    }

    if (regionId) {
      const region = await this.prisma.region.findUnique({ where: { id: regionId } });
      if (!region) {
        throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.REGION_NOT_FOUND, message: `No Region with id ${regionId}.` });
      }
      assertSameCountry(region, countryId, 'currentRegionId must belong to the same country as currentCountryId.');

      if (city?.regionId && city.regionId !== regionId) {
        throw new BadRequestException({
          code: GEOGRAPHY_ERROR_CODES.GEOGRAPHY_REGION_CITY_MISMATCH,
          message: "currentRegionId does not match the current city's own region.",
        });
      }
    }
  }

  async create(dto: CreatePlaceDto, actorId: string) {
    const canonical = dto.translations.find((t) => t.locale === CANONICAL_LOCALE) ?? dto.translations[0];
    if (!canonical) throw new BadRequestException('At least one translation is required.');

    await this.assertCurrentGeographyConsistency(dto.currentCountryId, dto.currentRegionId, dto.currentCityId);

    const canonicalSlug = await this.ensureUniqueCanonicalSlug(toSlug(canonical.name));

    const place = await this.prisma.place.create({
      data: {
        type: dto.type,
        canonicalSlug,
        parentPlaceId: dto.parentPlaceId,
        currentCountryId: dto.currentCountryId,
        currentRegionId: dto.currentRegionId,
        currentCityId: dto.currentCityId,
        publicationStatus: PublicationStatus.DRAFT,
        translations: {
          create: dto.translations.map((t) => ({
            locale: t.locale,
            name: t.name,
            slug: toSlug(t.name),
            summary: t.summary,
            description: t.description,
            method: t.method ?? 'ORIGINAL',
          })),
        },
      },
      include: { translations: true },
    });

    if (dto.latitude !== undefined && dto.longitude !== undefined) {
      await this.setLocation(place.id, dto.latitude, dto.longitude);
    }

    await this.audit.log({ actorId, action: 'place.created', entityType: 'PLACE', entityId: place.id });
    return place;
  }

  async setLocation(placeId: string, latitude: number, longitude: number) {
    await this.prisma.$executeRaw`
      UPDATE "Place"
      SET "location" = ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)
      WHERE "id" = ${placeId}
    `;
  }

  async findBySlug(slug: string, locale: string, includeUnpublished = false) {
    const place = await this.prisma.place.findUnique({
      where: { canonicalSlug: slug },
      include: {
        translations: true,
        heroMedia: true,
        parentPlace: { include: { translations: true } },
        currentCountry: true,
        currentRegion: true,
        currentCity: true,
      },
    });
    if (!place) throw new NotFoundException('Place not found.');
    if (!includeUnpublished && place.publicationStatus !== PublicationStatus.PUBLISHED) {
      throw new NotFoundException('Place not found.');
    }

    const { translation, resolvedLocale, fallbackApplied } = resolveTranslation(place.translations, locale);
    const [lngLat] = await this.prisma.$queryRaw<{ lng: number | null; lat: number | null }[]>`
      SELECT ST_X("location") as lng, ST_Y("location") as lat FROM "Place" WHERE "id" = ${place.id}
    `;

    return {
      id: place.id,
      slug: place.canonicalSlug,
      currentCountry: place.currentCountry ? { id: place.currentCountry.id, slug: place.currentCountry.canonicalSlug, iso2: place.currentCountry.iso2 } : null,
      currentRegion: place.currentRegion ? { id: place.currentRegion.id, slug: place.currentRegion.canonicalSlug } : null,
      currentCity: place.currentCity ? { id: place.currentCity.id, slug: place.currentCity.canonicalSlug } : null,
      type: place.type,
      publicationStatus: place.publicationStatus,
      parentPlace: place.parentPlace
        ? { id: place.parentPlace.id, slug: place.parentPlace.canonicalSlug }
        : null,
      heroMedia: place.heroMedia,
      location: lngLat?.lat != null ? { latitude: lngLat.lat, longitude: lngLat.lng } : null,
      translation,
      meta: { requestedLocale: locale, resolvedLocale, fallbackApplied },
    };
  }

  async list(params: { type?: string; locale: string; cursor?: string; limit: number }) {
    const { type, locale, cursor, limit } = params;
    const places = await this.prisma.place.findMany({
      where: {
        publicationStatus: PublicationStatus.PUBLISHED,
        type: type as any,
      },
      include: { translations: true },
      orderBy: { id: 'asc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = places.length > limit;
    const page = places.slice(0, limit).map((p) => {
      const { translation } = resolveTranslation(p.translations, locale);
      return { id: p.id, slug: p.canonicalSlug, type: p.type, name: translation?.name ?? p.canonicalSlug };
    });

    return { items: page, nextCursor: hasMore ? places[limit].id : null, hasMore };
  }

  async update(id: string, dto: UpdatePlaceDto, actorId: string) {
    const place = await this.prisma.place.findUnique({ where: { id } });
    if (!place) throw new NotFoundException('Place not found.');

    const nextCountryId = dto.currentCountryId === undefined ? place.currentCountryId : dto.currentCountryId;
    const nextRegionId = dto.currentRegionId === undefined ? place.currentRegionId : dto.currentRegionId;
    const nextCityId = dto.currentCityId === undefined ? place.currentCityId : dto.currentCityId;
    if (dto.currentCountryId !== undefined || dto.currentRegionId !== undefined || dto.currentCityId !== undefined) {
      await this.assertCurrentGeographyConsistency(nextCountryId, nextRegionId, nextCityId);
    }

    const updated = await this.prisma.place.update({
      where: { id },
      data: {
        type: dto.type,
        currentCountryId: nextCountryId,
        currentRegionId: nextRegionId,
        currentCityId: nextCityId,
      },
    });

    if (dto.latitude !== undefined && dto.longitude !== undefined) {
      await this.setLocation(id, dto.latitude, dto.longitude);
    }

    await this.audit.log({ actorId, action: 'place.updated', entityType: 'PLACE', entityId: id });
    return updated;
  }

  async setPublicationStatus(id: string, status: PublicationStatus, actorId: string) {
    const place = await this.prisma.place.findUnique({ where: { id }, include: { translations: true } });
    if (!place) throw new NotFoundException('Place not found.');

    if (status === PublicationStatus.PUBLISHED && place.translations.length === 0) {
      throw new BadRequestException('Cannot publish a place with no translations.');
    }

    const updated = await this.prisma.place.update({ where: { id }, data: { publicationStatus: status } });
    await this.audit.log({
      actorId,
      action: 'place.publicationStatus.changed',
      entityType: 'PLACE',
      entityId: id,
      metadata: { status },
    });
    return updated;
  }

  async getTimeline(slug: string, locale: string) {
    const place = await this.getPublishedIdBySlug(slug);
    const links = await this.prisma.eventPlace.findMany({
      where: { placeId: place.id },
      include: { event: { include: { translations: true } } },
    });
    return links
      .filter((l) => l.event.publicationStatus === PublicationStatus.PUBLISHED)
      .map((l) => {
        const { translation } = resolveTranslation(l.event.translations, locale);
        return {
          id: l.event.id,
          slug: l.event.canonicalSlug,
          title: translation?.title ?? l.event.canonicalSlug,
          date: toHistoricalDateResponse(
            {
              year: l.event.dateYear,
              month: l.event.dateMonth,
              day: l.event.dateDay,
              precision: l.event.datePrecision,
              qualifier: l.event.dateQualifier,
              era: l.event.dateEra,
              endYear: l.event.dateEndYear,
              endMonth: l.event.dateEndMonth,
              endDay: l.event.dateEndDay,
              label: l.event.dateLabel,
              sortStart: l.event.dateSortStart,
              sortEnd: l.event.dateSortEnd,
              chronologyStart: l.event.dateChronologyStart,
              chronologyEnd: l.event.dateChronologyEnd,
            },
            locale,
          ),
        };
      });
  }

  /**
   * "Kham pha quanh toi" foundation (spec Phase 07 section 51-54).
   * Stateless - `lat`/`lng` are request parameters only, never persisted
   * (spec section 52); no precise-location logging is added beyond normal
   * infrastructure request logs. Distance is always meters (spec section
   * 53), computed via a geography cast so `ST_DWithin`/`ST_Distance` return
   * real great-circle distances rather than raw degree units.
   */
  async findNearby(query: NearbyPlacesQueryDto, locale: string) {
    if (query.lat < -90 || query.lat > 90 || query.lng < -180 || query.lng > 180 || !Number.isFinite(query.lat) || !Number.isFinite(query.lng)) {
      throw new BadRequestException({ code: DISCOVERY_ERROR_CODES.NEARBY_INVALID_COORDINATES, message: 'lat must be in [-90,90] and lng in [-180,180].' });
    }
    const radius = Math.min(query.radius ?? DEFAULT_NEARBY_RADIUS_METERS, MAX_NEARBY_RADIUS_METERS);
    if (radius <= 0) {
      throw new BadRequestException({ code: DISCOVERY_ERROR_CODES.NEARBY_INVALID_RADIUS, message: 'radius must be a positive number of meters.' });
    }
    const limit = Math.min(query.limit ?? DEFAULT_NEARBY_LIMIT, 100);

    const types = query.types
      ? query.types.split(',').map((t) => t.trim())
      : undefined;
    if (types && types.some((t) => !Object.values(PlaceType).includes(t as PlaceType))) {
      throw new BadRequestException('types must be a comma-separated list of valid PlaceType values.');
    }

    const rows = await this.prisma.$queryRaw<NearbyRow[]>`
      SELECT p."id", p."canonicalSlug", p."type", p."historicalImportance",
             ST_Distance(p."location"::geography, ST_SetSRID(ST_MakePoint(${query.lng}, ${query.lat}), 4326)::geography) as "distanceMeters"
      FROM "Place" p
      WHERE p."publicationStatus" = 'PUBLISHED'
        AND p."location" IS NOT NULL
        AND ST_DWithin(p."location"::geography, ST_SetSRID(ST_MakePoint(${query.lng}, ${query.lat}), 4326)::geography, ${radius})
        ${types && types.length > 0 ? Prisma.sql`AND p."type"::text IN (${Prisma.join(types)})` : Prisma.sql``}
      ORDER BY "distanceMeters" ASC
      LIMIT ${limit}
    `;

    const placeIds = rows.map((r) => r.id);
    const translations = placeIds.length
      ? await this.prisma.placeTranslation.findMany({ where: { placeId: { in: placeIds } } })
      : [];
    const byPlace = new Map<string, typeof translations>();
    for (const t of translations) {
      const arr = byPlace.get(t.placeId) ?? [];
      arr.push(t);
      byPlace.set(t.placeId, arr);
    }

    return rows.map((row) => {
      const { translation, resolvedLocale, fallbackApplied } = resolveTranslation(byPlace.get(row.id) ?? [], locale);
      return {
        id: row.id,
        slug: row.canonicalSlug,
        type: row.type,
        historicalImportance: row.historicalImportance,
        name: translation?.name ?? row.canonicalSlug,
        distanceMeters: Math.round(row.distanceMeters),
        meta: { requestedLocale: locale, resolvedLocale, fallbackApplied },
      };
    });
  }

  async getSources(slug: string) {
    const place = await this.getPublishedIdBySlug(slug);
    return getPublicSourcesForEntity(this.prisma, 'place', place.id);
  }

  /** Editorial Stories about this Place (spec section 42) - PUBLISHED only. */
  async getStories(slug: string, locale: string) {
    const place = await this.getPublishedIdBySlug(slug);
    return this.stories.listForEntity('place', place.id, locale);
  }

  /** Journeys that stop at this Place (spec section 43) - PUBLISHED only. */
  async getJourneys(slug: string, locale: string) {
    const place = await this.getPublishedIdBySlug(slug);
    return this.journeys.listForPlace(place.id, locale);
  }

  async getMedia(slug: string) {
    const place = await this.getPublishedIdBySlug(slug);
    const gallery = await this.prisma.entityMedia.findMany({
      where: { entityType: 'PLACE', entityId: place.id },
      include: { mediaAsset: true },
      orderBy: { order: 'asc' },
    });
    return gallery.map((g) => g.mediaAsset);
  }

  async getCommunityStories(slug: string, locale: string) {
    const place = await this.getPublishedIdBySlug(slug);
    const links = await this.prisma.communityStoryPlace.findMany({
      where: { placeId: place.id },
      include: { story: { include: { translations: true } } },
    });
    return links
      .filter((l) => PUBLIC_VISIBLE_STATUSES.includes(l.story.moderationStatus))
      .map((l) => {
        const { translation } = resolveTranslation(l.story.translations, locale);
        return {
          id: l.story.id,
          slug: l.story.canonicalSlug,
          type: l.story.type,
          verificationState: l.story.verificationState,
          title: translation?.title ?? l.story.canonicalSlug,
        };
      });
  }

  private async getPublishedIdBySlug(slug: string) {
    const place = await this.prisma.place.findUnique({ where: { canonicalSlug: slug } });
    if (!place || place.publicationStatus !== PublicationStatus.PUBLISHED) {
      throw new NotFoundException('Place not found.');
    }
    return place;
  }

  async recordVisit(userId: string, slug: string, note?: string) {
    const place = await this.getPublishedIdBySlug(slug);
    return this.prisma.placeVisit.create({ data: { userId, placeId: place.id, note } });
  }
}
