import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PublicationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { resolveTranslation } from '../../common/translation/resolve-translation.util';
import { toSlug } from '../../common/util/slug.util';
import { CANONICAL_LOCALE } from '../../common/decorators/locale.decorator';
import { buildHistoricalDateColumns, toHistoricalDateResponse } from '../../common/historical-date/historical-date.util';
import { getPublicSourcesForEntity } from '../facts/fact-sources.util';
import { StoriesService } from '../stories/stories.service';
import { CreateEventDto, EventCountryLinkInputDto } from './dto/event.dto';
import { GEOGRAPHY_ERROR_CODES } from '../../common/errors/geography-error-codes';

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly stories: StoriesService,
  ) {}

  private async ensureUniqueSlug(base: string): Promise<string> {
    let slug = base;
    let suffix = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const existing = await this.prisma.historicalEvent.findUnique({ where: { canonicalSlug: slug } });
      if (!existing) return slug;
      suffix += 1;
      slug = `${base}-${suffix}`;
    }
  }

  /** Rejects any countryId that does not reference an existing G01 Country (G03 section 30-ish - EventCountry is a real M:N, not a 1:1 FK). */
  private async assertCountriesExist(countryIds: string[]): Promise<void> {
    if (countryIds.length === 0) return;
    const found = await this.prisma.country.findMany({ where: { id: { in: countryIds } }, select: { id: true } });
    const foundIds = new Set(found.map((c) => c.id));
    const missing = countryIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.COUNTRY_NOT_FOUND, message: `No Country with id ${missing.join(', ')}.` });
    }
  }

  async create(dto: CreateEventDto, actorId: string) {
    const canonical = dto.translations.find((t) => t.locale === CANONICAL_LOCALE) ?? dto.translations[0];
    if (!canonical) throw new BadRequestException('At least one translation is required.');

    const countries: EventCountryLinkInputDto[] = dto.countries ?? [];
    await this.assertCountriesExist(countries.map((c) => c.countryId));

    const canonicalSlug = await this.ensureUniqueSlug(toSlug(canonical.title));
    const date = buildHistoricalDateColumns(dto.date);

    const event = await this.prisma.historicalEvent.create({
      data: {
        canonicalSlug,
        eraId: dto.eraId,
        territoryId: dto.territoryId,
        dateYear: date.year,
        dateMonth: date.month,
        dateDay: date.day,
        datePrecision: date.precision,
        dateQualifier: date.qualifier,
        dateEra: date.era,
        dateEndYear: date.endYear,
        dateEndMonth: date.endMonth,
        dateEndDay: date.endDay,
        dateLabel: date.label,
        dateSortStart: date.sortStart,
        dateSortEnd: date.sortEnd,
        dateChronologyStart: date.chronologyStart,
        dateChronologyEnd: date.chronologyEnd,
        translations: {
          create: dto.translations.map((t) => ({
            locale: t.locale,
            title: t.title,
            slug: toSlug(t.title),
            summary: t.summary,
            description: t.description,
            method: t.method ?? 'ORIGINAL',
          })),
        },
        countryLinks: countries.length > 0 ? { create: countries.map((c) => ({ countryId: c.countryId, role: c.role })) } : undefined,
      },
      include: { translations: true },
    });

    await this.audit.log({ actorId, action: 'event.created', entityType: 'EVENT', entityId: event.id });
    return event;
  }

  /** Replaces the full EventCountry set for this event (G03) - mirrors the era/dynasty "setParent"-style setter pattern used elsewhere in this module. */
  async setCountries(eventId: string, countries: EventCountryLinkInputDto[], actorId: string) {
    const event = await this.prisma.historicalEvent.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Event not found.');
    await this.assertCountriesExist(countries.map((c) => c.countryId));

    await this.prisma.$transaction([
      this.prisma.eventCountry.deleteMany({ where: { eventId } }),
      ...(countries.length > 0
        ? [this.prisma.eventCountry.createMany({ data: countries.map((c) => ({ eventId, countryId: c.countryId, role: c.role })) })]
        : []),
    ]);

    await this.audit.log({ actorId, action: 'event.countries.changed', entityType: 'EVENT', entityId: eventId, metadata: { countries } });
    return this.prisma.eventCountry.findMany({ where: { eventId }, include: { country: true } });
  }

  async findBySlug(slug: string, locale: string) {
    const event = await this.prisma.historicalEvent.findUnique({
      where: { canonicalSlug: slug },
      include: {
        translations: true,
        heroMedia: true,
        era: { include: { translations: true } },
        territory: { include: { translations: true } },
        placeLinks: { include: { place: { include: { translations: true } } } },
        personLinks: { include: { person: { include: { translations: true } } } },
        themeLinks: { include: { theme: { include: { translations: true } } } },
        countryLinks: { include: { country: true } },
      },
    });
    if (!event || event.publicationStatus !== PublicationStatus.PUBLISHED) {
      throw new NotFoundException('Event not found.');
    }

    const { translation, resolvedLocale, fallbackApplied } = resolveTranslation(event.translations, locale);

    return {
      id: event.id,
      slug: event.canonicalSlug,
      date: toHistoricalDateResponse(
        {
          year: event.dateYear,
          month: event.dateMonth,
          day: event.dateDay,
          precision: event.datePrecision,
          qualifier: event.dateQualifier,
          era: event.dateEra,
          endYear: event.dateEndYear,
          endMonth: event.dateEndMonth,
          endDay: event.dateEndDay,
          label: event.dateLabel,
          sortStart: event.dateSortStart,
          sortEnd: event.dateSortEnd,
          chronologyStart: event.dateChronologyStart,
          chronologyEnd: event.dateChronologyEnd,
        },
        locale,
      ),
      heroMedia: event.heroMedia,
      era: event.era ? { id: event.era.id, slug: event.era.canonicalSlug } : null,
      territory: event.territory ? { id: event.territory.id, slug: event.territory.canonicalSlug } : null,
      places: event.placeLinks.map((l) => {
        const { translation: pt } = resolveTranslation(l.place.translations, locale);
        return { id: l.place.id, slug: l.place.canonicalSlug, name: pt?.name };
      }),
      people: event.personLinks.map((l) => {
        const { translation: pt } = resolveTranslation(l.person.translations, locale);
        return { id: l.person.id, slug: l.person.canonicalSlug, displayName: pt?.displayName };
      }),
      themes: event.themeLinks.map((l) => {
        const { translation: tt } = resolveTranslation(l.theme.translations, locale);
        return { id: l.theme.id, slug: l.theme.slug, category: l.theme.category, name: tt?.name ?? l.theme.slug };
      }),
      countries: event.countryLinks.map((l) => ({ id: l.country.id, slug: l.country.canonicalSlug, iso2: l.country.iso2, role: l.role })),
      translation,
      meta: { requestedLocale: locale, resolvedLocale, fallbackApplied },
    };
  }

  async list(locale: string, cursor?: string, limit = 20) {
    const events = await this.prisma.historicalEvent.findMany({
      where: { publicationStatus: PublicationStatus.PUBLISHED },
      include: { translations: true },
      orderBy: { id: 'asc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = events.length > limit;
    const page = events.slice(0, limit).map((e) => {
      const { translation } = resolveTranslation(e.translations, locale);
      return {
        id: e.id,
        slug: e.canonicalSlug,
        title: translation?.title ?? e.canonicalSlug,
        date: toHistoricalDateResponse(
          {
            year: e.dateYear,
            month: e.dateMonth,
            day: e.dateDay,
            precision: e.datePrecision,
            qualifier: e.dateQualifier,
            era: e.dateEra,
            endYear: e.dateEndYear,
            endMonth: e.dateEndMonth,
            endDay: e.dateEndDay,
            label: e.dateLabel,
            sortStart: e.dateSortStart,
            sortEnd: e.dateSortEnd,
            chronologyStart: e.dateChronologyStart,
            chronologyEnd: e.dateChronologyEnd,
          },
          locale,
        ),
      };
    });
    return { items: page, nextCursor: hasMore ? events[limit].id : null, hasMore };
  }

  async getSources(slug: string) {
    const event = await this.prisma.historicalEvent.findUnique({ where: { canonicalSlug: slug } });
    if (!event || event.publicationStatus !== PublicationStatus.PUBLISHED) {
      throw new NotFoundException('Event not found.');
    }
    return getPublicSourcesForEntity(this.prisma, 'event', event.id);
  }

  /** Editorial Stories about this Event (spec section 42) - PUBLISHED only. */
  async getStories(slug: string, locale: string) {
    const event = await this.prisma.historicalEvent.findUnique({ where: { canonicalSlug: slug } });
    if (!event || event.publicationStatus !== PublicationStatus.PUBLISHED) {
      throw new NotFoundException('Event not found.');
    }
    return this.stories.listForEntity('event', event.id, locale);
  }

  async setPublicationStatus(id: string, status: PublicationStatus, actorId: string) {
    const event = await this.prisma.historicalEvent.findUnique({ where: { id }, include: { translations: true } });
    if (!event) throw new NotFoundException('Event not found.');
    if (status === PublicationStatus.PUBLISHED && event.translations.length === 0) {
      throw new BadRequestException('Cannot publish an event with no translations.');
    }
    const updated = await this.prisma.historicalEvent.update({ where: { id }, data: { publicationStatus: status } });
    await this.audit.log({ actorId, action: 'event.publicationStatus.changed', entityType: 'EVENT', entityId: id, metadata: { status } });
    return updated;
  }
}
