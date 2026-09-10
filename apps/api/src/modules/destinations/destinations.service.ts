import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DestinationType, Prisma, PublicationStatus, StoryEditorialStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MediaService } from '../media/media.service';
import { resolveTranslation } from '../../common/translation/resolve-translation.util';
import { toSlug } from '../../common/util/slug.util';
import { GEOGRAPHY_ERROR_CODES } from '../../common/errors/geography-error-codes';
import { assertSameCountry } from '../../common/geography/geography-consistency.util';
import { toHistoricalDateResponse } from '../../common/historical-date/historical-date.util';
import { CreateDestinationDto, UpdateDestinationDto, UpsertDestinationTranslationDto } from './dto/destination.dto';
import { SetDestinationEventsDto, SetDestinationJourneysDto, SetDestinationPlacesDto, SetDestinationStoriesDto, SetDestinationThemesDto } from './dto/destination-composition.dto';

export interface DestinationListFilter {
  countryId?: string;
  regionId?: string;
  cityId?: string;
  type?: DestinationType;
  themeId?: string;
  locale: string;
  page: number;
  pageSize: number;
}

/**
 * Bounded section sizes for detail composition (spec section 30/94/95) -
 * "detail may return richer bounded sections", never an unbounded graph
 * traversal. Deliberately small, documented constants rather than magic
 * numbers scattered through the method bodies below.
 */
const DETAIL_PLACES_LIMIT = 30;
const DETAIL_STORIES_LIMIT = 10;
const DETAIL_JOURNEYS_LIMIT = 10;
const DETAIL_EVENTS_LIMIT = 12;
const RELATED_DESTINATIONS_LIMIT = 6;

@Injectable()
export class DestinationsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly media: MediaService) {}

  private async ensureUniqueCanonicalSlug(base: string): Promise<string> {
    let slug = base;
    let suffix = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const existing = await this.prisma.destination.findUnique({ where: { canonicalSlug: slug } });
      if (!existing) return slug;
      suffix += 1;
      slug = `${base}-${suffix}`;
    }
  }

  /**
   * Cross-entity consistency (spec section 11/30): countryId is required and
   * authoritative; regionId/cityId are optional but, when present, must
   * belong to the same country, and when both are present must not
   * contradict each other (a City's own Region, if it has one, must match).
   */
  private async assertHierarchyConsistency(countryId: string, regionId?: string | null, cityId?: string | null) {
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
      assertSameCountry(city, countryId, 'cityId must belong to the same country as countryId.');
    }

    if (regionId) {
      const region = await this.prisma.region.findUnique({ where: { id: regionId } });
      if (!region) {
        throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.REGION_NOT_FOUND, message: `No Region with id ${regionId}.` });
      }
      assertSameCountry(region, countryId, 'regionId must belong to the same country as countryId.');

      if (city?.regionId && city.regionId !== regionId) {
        throw new BadRequestException({
          code: GEOGRAPHY_ERROR_CODES.GEOGRAPHY_REGION_CITY_MISMATCH,
          message: "regionId does not match the city's own region.",
        });
      }
    }
  }

  async create(dto: CreateDestinationDto, actorId: string) {
    await this.assertHierarchyConsistency(dto.countryId, dto.regionId, dto.cityId);

    const canonical = dto.translations.find((t) => t.locale === 'vi') ?? dto.translations[0];
    if (!canonical) throw new BadRequestException('At least one translation is required.');
    const canonicalSlug = await this.ensureUniqueCanonicalSlug(toSlug(canonical.name));

    const destination = await this.prisma.destination.create({
      data: {
        countryId: dto.countryId,
        regionId: dto.regionId,
        cityId: dto.cityId,
        type: dto.type,
        latitude: dto.latitude,
        longitude: dto.longitude,
        heroMediaId: dto.heroMediaId,
        canonicalSlug,
        status: PublicationStatus.DRAFT,
        translations: {
          create: dto.translations.map((t) => ({
            locale: t.locale,
            name: t.name,
            slug: toSlug(t.name),
            summary: t.summary,
            description: t.description,
            tagline: t.tagline,
            whyVisit: t.whyVisit,
            seoTitle: t.seoTitle,
            seoDescription: t.seoDescription,
            method: t.method ?? 'ORIGINAL',
          })),
        },
      },
      include: { translations: true },
    });

    await this.audit.log({ actorId, action: 'destination.created', entityType: 'DESTINATION', entityId: destination.id });
    return destination;
  }

  async update(id: string, dto: UpdateDestinationDto, actorId: string) {
    const destination = await this.prisma.destination.findUnique({ where: { id } });
    if (!destination) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.DESTINATION_NOT_FOUND, message: 'Destination not found.' });

    const nextRegionId = dto.regionId === undefined ? destination.regionId : dto.regionId;
    const nextCityId = dto.cityId === undefined ? destination.cityId : dto.cityId;
    if (dto.regionId !== undefined || dto.cityId !== undefined) {
      await this.assertHierarchyConsistency(destination.countryId, nextRegionId, nextCityId);
    }

    const updated = await this.prisma.destination.update({
      where: { id },
      data: {
        regionId: nextRegionId,
        cityId: nextCityId,
        type: dto.type,
        latitude: dto.latitude,
        longitude: dto.longitude,
        heroMediaId: dto.heroMediaId === undefined ? undefined : dto.heroMediaId,
      },
    });

    await this.audit.log({ actorId, action: 'destination.updated', entityType: 'DESTINATION', entityId: id });
    return updated;
  }

  async upsertTranslation(id: string, locale: string, dto: UpsertDestinationTranslationDto, actorId: string) {
    const destination = await this.prisma.destination.findUnique({ where: { id } });
    if (!destination) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.DESTINATION_NOT_FOUND, message: 'Destination not found.' });

    const translation = await this.prisma.destinationTranslation.upsert({
      where: { destinationId_locale: { destinationId: id, locale } },
      update: {
        name: dto.name,
        slug: toSlug(dto.name),
        summary: dto.summary,
        description: dto.description,
        tagline: dto.tagline,
        whyVisit: dto.whyVisit,
        seoTitle: dto.seoTitle,
        seoDescription: dto.seoDescription,
        method: dto.method ?? 'ORIGINAL',
      },
      create: {
        destinationId: id,
        locale,
        name: dto.name,
        slug: toSlug(dto.name),
        summary: dto.summary,
        description: dto.description,
        tagline: dto.tagline,
        whyVisit: dto.whyVisit,
        seoTitle: dto.seoTitle,
        seoDescription: dto.seoDescription,
        method: dto.method ?? 'ORIGINAL',
      },
    });

    await this.audit.log({ actorId, action: 'destination.translation.upserted', entityType: 'DESTINATION', entityId: id, metadata: { locale } });
    return translation;
  }

  async setStatus(id: string, status: PublicationStatus, actorId: string) {
    const destination = await this.prisma.destination.findUnique({ where: { id }, include: { translations: true } });
    if (!destination) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.DESTINATION_NOT_FOUND, message: 'Destination not found.' });

    if (status === PublicationStatus.PUBLISHED && destination.translations.length === 0) {
      throw new BadRequestException({
        code: GEOGRAPHY_ERROR_CODES.GEOGRAPHY_CANNOT_PUBLISH_WITHOUT_TRANSLATION,
        message: 'Cannot publish a destination with no translations.',
      });
    }

    const updated = await this.prisma.destination.update({ where: { id }, data: { status } });
    await this.audit.log({ actorId, action: 'destination.status.changed', entityType: 'DESTINATION', entityId: id, metadata: { status } });
    return updated;
  }

  // -----------------------------------------------------------------------
  // G04 - composition mutations (spec section 13/42/43). Every one is
  // "replace style" (delete the existing set, recreate the supplied one) in
  // ONE $transaction, with the audit row written through the same
  // transaction client (post-G03 fix - see AuditService.log doc comment) so
  // a failure partway through never leaves a partial relation set with a
  // success audit row.
  // -----------------------------------------------------------------------

  /**
   * spec section 15/45: rejects a Place whose OWN `currentCountryId` (G03)
   * is explicitly set and differs from this Destination's country. A Place
   * with no `currentCountryId` set at all is allowed (fail-safe means never
   * blocking on the ABSENCE of geography data - most V1 Places predate G03
   * and have not had current-geography backfilled) - this is a real FK
   * check, never fuzzy name matching, and never a historical-sovereignty
   * inference (spec section 14 - the relation created here is editorial
   * association only).
   */
  async setPlaces(destinationId: string, dto: SetDestinationPlacesDto, actorId: string) {
    const destination = await this.prisma.destination.findUnique({ where: { id: destinationId } });
    if (!destination) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.DESTINATION_NOT_FOUND, message: 'Destination not found.' });

    const placeIds = dto.places.map((l) => l.placeId);
    if (new Set(placeIds).size !== placeIds.length) {
      throw new BadRequestException('Duplicate placeId in request.');
    }
    const places = await this.prisma.place.findMany({ where: { id: { in: placeIds } }, select: { id: true, currentCountryId: true } });
    const foundIds = new Set(places.map((p) => p.id));
    for (const id of placeIds) {
      if (!foundIds.has(id)) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.DESTINATION_PLACE_NOT_FOUND, message: `Place ${id} not found.` });
    }
    for (const place of places) {
      if (place.currentCountryId && place.currentCountryId !== destination.countryId) {
        throw new BadRequestException({
          code: GEOGRAPHY_ERROR_CODES.DESTINATION_PLACE_COUNTRY_MISMATCH,
          message: `Place ${place.id} belongs to a different current country than this Destination - cross-country membership is not permitted by default (spec section 45).`,
        });
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.destinationPlace.deleteMany({ where: { destinationId } });
      const created = await Promise.all(
        dto.places.map((link) =>
          tx.destinationPlace.create({
            data: {
              destinationId,
              placeId: link.placeId,
              role: link.role ?? 'CONTEXTUAL',
              sortOrder: link.sortOrder ?? 0,
              isFeatured: link.isFeatured ?? false,
              editorialNote: link.editorialNote,
            },
          }),
        ),
      );
      await this.audit.log({ actorId, action: 'destination.places.set', entityType: 'DESTINATION', entityId: destinationId, metadata: { count: created.length } }, tx);
      return created;
    });
  }

  async setThemes(destinationId: string, dto: SetDestinationThemesDto, actorId: string) {
    const destination = await this.prisma.destination.findUnique({ where: { id: destinationId } });
    if (!destination) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.DESTINATION_NOT_FOUND, message: 'Destination not found.' });

    const themeIds = dto.themeIds;
    if (new Set(themeIds).size !== themeIds.length) throw new BadRequestException('Duplicate themeId in request.');
    const themes = await this.prisma.theme.findMany({ where: { id: { in: themeIds } }, select: { id: true } });
    const foundIds = new Set(themes.map((t) => t.id));
    for (const id of themeIds) {
      if (!foundIds.has(id)) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.DESTINATION_THEME_NOT_FOUND, message: `Theme ${id} not found.` });
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.destinationTheme.deleteMany({ where: { destinationId } });
      const created = await Promise.all(themeIds.map((themeId) => tx.destinationTheme.create({ data: { destinationId, themeId } })));
      await this.audit.log({ actorId, action: 'destination.themes.set', entityType: 'DESTINATION', entityId: destinationId, metadata: { count: created.length } }, tx);
      return created;
    });
  }

  async setStories(destinationId: string, dto: SetDestinationStoriesDto, actorId: string) {
    const destination = await this.prisma.destination.findUnique({ where: { id: destinationId } });
    if (!destination) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.DESTINATION_NOT_FOUND, message: 'Destination not found.' });

    const storyIds = dto.stories.map((s) => s.id);
    if (new Set(storyIds).size !== storyIds.length) throw new BadRequestException('Duplicate story id in request.');
    const stories = await this.prisma.story.findMany({ where: { id: { in: storyIds } }, select: { id: true } });
    const foundIds = new Set(stories.map((s) => s.id));
    for (const id of storyIds) {
      if (!foundIds.has(id)) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.DESTINATION_STORY_NOT_FOUND, message: `Story ${id} not found.` });
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.destinationStory.deleteMany({ where: { destinationId } });
      const created = await Promise.all(
        dto.stories.map((link) => tx.destinationStory.create({ data: { destinationId, storyId: link.id, sortOrder: link.sortOrder ?? 0 } })),
      );
      await this.audit.log({ actorId, action: 'destination.stories.set', entityType: 'DESTINATION', entityId: destinationId, metadata: { count: created.length } }, tx);
      return created;
    });
  }

  async setJourneys(destinationId: string, dto: SetDestinationJourneysDto, actorId: string) {
    const destination = await this.prisma.destination.findUnique({ where: { id: destinationId } });
    if (!destination) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.DESTINATION_NOT_FOUND, message: 'Destination not found.' });

    const journeyIds = dto.journeys.map((j) => j.id);
    if (new Set(journeyIds).size !== journeyIds.length) throw new BadRequestException('Duplicate journey id in request.');
    const journeys = await this.prisma.journey.findMany({ where: { id: { in: journeyIds } }, select: { id: true } });
    const foundIds = new Set(journeys.map((j) => j.id));
    for (const id of journeyIds) {
      if (!foundIds.has(id)) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.DESTINATION_JOURNEY_NOT_FOUND, message: `Journey ${id} not found.` });
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.destinationJourney.deleteMany({ where: { destinationId } });
      const created = await Promise.all(
        dto.journeys.map((link) => tx.destinationJourney.create({ data: { destinationId, journeyId: link.id, sortOrder: link.sortOrder ?? 0 } })),
      );
      await this.audit.log({ actorId, action: 'destination.journeys.set', entityType: 'DESTINATION', entityId: destinationId, metadata: { count: created.length } }, tx);
      return created;
    });
  }

  async setEvents(destinationId: string, dto: SetDestinationEventsDto, actorId: string) {
    const destination = await this.prisma.destination.findUnique({ where: { id: destinationId } });
    if (!destination) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.DESTINATION_NOT_FOUND, message: 'Destination not found.' });

    const eventIds = dto.events.map((e) => e.eventId);
    if (new Set(eventIds).size !== eventIds.length) throw new BadRequestException('Duplicate eventId in request.');
    const events = await this.prisma.historicalEvent.findMany({ where: { id: { in: eventIds } }, select: { id: true } });
    const foundIds = new Set(events.map((e) => e.id));
    for (const id of eventIds) {
      if (!foundIds.has(id)) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.DESTINATION_EVENT_NOT_FOUND, message: `Event ${id} not found.` });
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.destinationEvent.deleteMany({ where: { destinationId } });
      const created = await Promise.all(
        dto.events.map((link) => tx.destinationEvent.create({ data: { destinationId, eventId: link.eventId, sortOrder: link.sortOrder ?? 0, role: link.role } })),
      );
      await this.audit.log({ actorId, action: 'destination.events.set', entityType: 'DESTINATION', entityId: destinationId, metadata: { count: created.length } }, tx);
      return created;
    });
  }

  // -----------------------------------------------------------------------
  // Public read composition
  // -----------------------------------------------------------------------

  async findBySlug(slug: string, locale: string, includeUnpublished = false) {
    const destination = await this.prisma.destination.findUnique({
      where: { canonicalSlug: slug },
      include: {
        translations: true,
        country: { include: { translations: true } },
        region: { include: { translations: true } },
        city: { include: { translations: true } },
        themeLinks: { include: { theme: { include: { translations: true } } } },
        placeLinks: {
          orderBy: { sortOrder: 'asc' },
          take: DETAIL_PLACES_LIMIT,
          include: { place: { include: { translations: true } } },
        },
        storyLinks: { orderBy: { sortOrder: 'asc' }, take: DETAIL_STORIES_LIMIT, include: { story: { include: { translations: true } } } },
        journeyLinks: { orderBy: { sortOrder: 'asc' }, take: DETAIL_JOURNEYS_LIMIT, include: { journey: { include: { translations: true } } } },
        eventLinks: { orderBy: { sortOrder: 'asc' }, take: DETAIL_EVENTS_LIMIT, include: { event: { include: { translations: true } } } },
      },
    });
    if (!destination) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.DESTINATION_NOT_FOUND, message: 'Destination not found.' });
    if (!includeUnpublished && destination.status !== PublicationStatus.PUBLISHED) {
      throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.DESTINATION_NOT_FOUND, message: 'Destination not found.' });
    }

    const { translation, resolvedLocale, fallbackApplied } = resolveTranslation(destination.translations, locale);

    let heroMedia: { id: string; url: string | null } | null = null;
    if (destination.heroMediaId) {
      try {
        const resolved = await this.media.findPublicById(destination.heroMediaId);
        heroMedia = { id: resolved.id, url: (resolved as { url: string | null }).url };
      } catch {
        heroMedia = null; // not READY / not public - never leaked (spec section 88/89)
      }
    }

    const themes = destination.themeLinks.map((link) => {
      const { translation: themeTranslation } = resolveTranslation(link.theme.translations, locale);
      return { id: link.theme.id, slug: link.theme.slug, category: link.theme.category, name: themeTranslation?.name ?? link.theme.slug };
    });

    const places = destination.placeLinks
      .filter((link) => link.place.publicationStatus === PublicationStatus.PUBLISHED || includeUnpublished)
      .map((link) => {
        const { translation: placeTranslation } = resolveTranslation(link.place.translations, locale);
        return {
          id: link.place.id,
          slug: link.place.canonicalSlug,
          type: link.place.type,
          name: placeTranslation?.name ?? link.place.canonicalSlug,
          role: link.role,
          isFeatured: link.isFeatured,
          sortOrder: link.sortOrder,
        };
      });

    const stories = destination.storyLinks
      .filter((link) => link.story.editorialStatus === StoryEditorialStatus.PUBLISHED || includeUnpublished)
      .map((link) => {
        const { translation: storyTranslation } = resolveTranslation(link.story.translations, locale);
        return { id: link.story.id, slug: link.story.canonicalSlug, title: storyTranslation?.title ?? link.story.canonicalSlug, summary: storyTranslation?.summary ?? null };
      });

    const journeys = destination.journeyLinks
      .filter((link) => link.journey.editorialStatus === PublicationStatus.PUBLISHED || includeUnpublished)
      .map((link) => {
        const { translation: journeyTranslation } = resolveTranslation(link.journey.translations, locale);
        return { id: link.journey.id, slug: link.journey.canonicalSlug, title: journeyTranslation?.title ?? link.journey.canonicalSlug };
      });

    // "How X Became X" (spec section 101) - only PUBLISHED events, only the
    // display-formatted date (never chronologyStart/End/sortStart/sortEnd -
    // spec section 66/68).
    const historicalTurningPoints = destination.eventLinks
      .filter((link) => link.event.publicationStatus === PublicationStatus.PUBLISHED || includeUnpublished)
      .map((link) => {
        const { translation: eventTranslation } = resolveTranslation(link.event.translations, locale);
        return {
          id: link.event.id,
          slug: link.event.canonicalSlug,
          title: eventTranslation?.title ?? link.event.canonicalSlug,
          date: toHistoricalDateResponse(
            {
              year: link.event.dateYear,
              month: link.event.dateMonth,
              day: link.event.dateDay,
              precision: link.event.datePrecision,
              qualifier: link.event.dateQualifier,
              era: link.event.dateEra,
              endYear: link.event.dateEndYear,
              endMonth: link.event.dateEndMonth,
              endDay: link.event.dateEndDay,
              label: link.event.dateLabel,
              sortStart: link.event.dateSortStart,
              sortEnd: link.event.dateSortEnd,
              chronologyStart: link.event.dateChronologyStart,
              chronologyEnd: link.event.dateChronologyEnd,
            },
            locale,
          ),
          role: link.role,
          sortOrder: link.sortOrder,
        };
      });

    const related = await this.getRelated(destination.id, locale);

    return {
      id: destination.id,
      slug: destination.canonicalSlug,
      type: destination.type,
      status: destination.status,
      importance: destination.importance,
      country: { id: destination.country.id, slug: destination.country.canonicalSlug, iso2: destination.country.iso2 },
      region: destination.region ? { id: destination.region.id, slug: destination.region.canonicalSlug } : null,
      city: destination.city ? { id: destination.city.id, slug: destination.city.canonicalSlug } : null,
      location: destination.latitude != null ? { latitude: destination.latitude, longitude: destination.longitude } : null,
      heroMedia,
      translation,
      themes,
      places,
      stories,
      journeys,
      historicalTurningPoints,
      related,
      meta: { requestedLocale: locale, resolvedLocale, fallbackApplied },
    };
  }

  /**
   * Lightweight summary list (spec section 94/95: list stays lightweight,
   * detail carries the richer bounded sections). Deterministic ordering -
   * `importance DESC, canonicalSlug ASC, id ASC` (spec section 26 example
   * formula, adapted to what this schema actually has: `importance` IS the
   * existing editorial-priority field, so no redundant/fabricated score
   * column was added - see docs/backend/G04_DESTINATION_DISCOVERY.md
   * "Discovery ranking" for the full reasoning and documented future
   * extension point for a completeness-weighted composite score).
   */
  async list(filter: DestinationListFilter) {
    const { countryId, regionId, cityId, type, themeId, locale, page, pageSize } = filter;
    const where: Prisma.DestinationWhereInput = {
      status: PublicationStatus.PUBLISHED,
      countryId,
      regionId,
      cityId,
      type,
      themeLinks: themeId ? { some: { themeId } } : undefined,
    };

    const [total, destinations] = await this.prisma.$transaction([
      this.prisma.destination.count({ where }),
      this.prisma.destination.findMany({
        where,
        include: {
          translations: true,
          _count: { select: { placeLinks: true, storyLinks: true } },
        },
        orderBy: [{ importance: 'desc' }, { canonicalSlug: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const items = destinations.map((d) => {
      const { translation } = resolveTranslation(d.translations, locale);
      return {
        id: d.id,
        slug: d.canonicalSlug,
        type: d.type,
        name: translation?.name ?? d.canonicalSlug,
        tagline: translation?.tagline ?? null,
        importance: d.importance,
        placeCount: d._count.placeLinks,
        storyCount: d._count.storyLinks,
      };
    });

    return { items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
  }

  /**
   * Related destinations (spec section 34/50/51/93) - deliberately COMPUTED
   * at query time, never a persisted relation table. Section 35 explicitly
   * warns that a persisted "HISTORICALLY_CONNECTED"-style relation is
   * itself a historical claim requiring its own trust model - computing
   * from safe, already-trustworthy signals (shared Theme, same City/Region/
   * Country, editorial importance) avoids introducing that risk entirely
   * while still being fully deterministic and explainable (component scores
   * below, matching section 93's explainability requirement).
   *
   * score = sharedThemeCount * 100 + (sameCity ? 40 : 0) + (sameRegion ? 20
   *         : 0) + importance
   * tie-break: canonicalSlug ASC, id ASC
   *
   * Bounded to same-country candidates only (fail-safe: never proposes a
   * cross-country pairing as "related" without an explicit editorial
   * decision, consistent with the DestinationPlace cross-country rule).
   */
  async getRelated(destinationId: string, locale: string, limit = RELATED_DESTINATIONS_LIMIT) {
    const source = await this.prisma.destination.findUnique({
      where: { id: destinationId },
      include: { themeLinks: { select: { themeId: true } } },
    });
    if (!source) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.DESTINATION_NOT_FOUND, message: 'Destination not found.' });

    const sourceThemeIds = new Set(source.themeLinks.map((t) => t.themeId));

    const candidates = await this.prisma.destination.findMany({
      where: { countryId: source.countryId, status: PublicationStatus.PUBLISHED, id: { not: source.id } },
      include: { translations: true, themeLinks: { select: { themeId: true } } },
    });

    const scored = candidates.map((c) => {
      const sharedThemeCount = c.themeLinks.filter((t) => sourceThemeIds.has(t.themeId)).length;
      const sameCity = source.cityId != null && c.cityId === source.cityId;
      const sameRegion = source.regionId != null && c.regionId === source.regionId;
      const score = sharedThemeCount * 100 + (sameCity ? 40 : 0) + (sameRegion ? 20 : 0) + c.importance;
      return { c, score, sharedThemeCount, sameCity, sameRegion };
    });

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.c.canonicalSlug !== b.c.canonicalSlug) return a.c.canonicalSlug < b.c.canonicalSlug ? -1 : 1;
      return a.c.id < b.c.id ? -1 : a.c.id > b.c.id ? 1 : 0;
    });

    return scored.slice(0, limit).map(({ c, score, sharedThemeCount, sameCity, sameRegion }) => {
      const { translation } = resolveTranslation(c.translations, locale);
      return {
        id: c.id,
        slug: c.canonicalSlug,
        type: c.type,
        name: translation?.name ?? c.canonicalSlug,
        relatedScore: score,
        relatedComponents: { sharedThemeCount, sameCity, sameRegion },
      };
    });
  }
}
