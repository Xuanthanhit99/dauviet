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
import { CreatePersonDto, PersonPlaceLinkInputDto } from './dto/person.dto';

@Injectable()
export class PeopleService {
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
      const existing = await this.prisma.person.findUnique({ where: { canonicalSlug: slug } });
      if (!existing) return slug;
      suffix += 1;
      slug = `${base}-${suffix}`;
    }
  }

  async create(dto: CreatePersonDto, actorId: string) {
    const canonical = dto.translations.find((t) => t.locale === CANONICAL_LOCALE) ?? dto.translations[0];
    if (!canonical) throw new BadRequestException('At least one translation is required.');

    const canonicalSlug = await this.ensureUniqueSlug(toSlug(canonical.displayName));
    const birth = buildHistoricalDateColumns(dto.birth);
    const death = buildHistoricalDateColumns(dto.death);

    const person = await this.prisma.person.create({
      data: {
        canonicalSlug,
        birthYear: birth.year,
        birthMonth: birth.month,
        birthDay: birth.day,
        birthPrecision: birth.precision,
        birthQualifier: birth.qualifier,
        birthEra: birth.era,
        birthEndYear: birth.endYear,
        birthEndMonth: birth.endMonth,
        birthEndDay: birth.endDay,
        birthLabel: birth.label,
        birthSortStart: birth.sortStart,
        birthSortEnd: birth.sortEnd,
        birthChronologyStart: birth.chronologyStart,
        birthChronologyEnd: birth.chronologyEnd,
        deathYear: death.year,
        deathMonth: death.month,
        deathDay: death.day,
        deathPrecision: death.precision,
        deathQualifier: death.qualifier,
        deathEra: death.era,
        deathEndYear: death.endYear,
        deathEndMonth: death.endMonth,
        deathEndDay: death.endDay,
        deathLabel: death.label,
        deathSortStart: death.sortStart,
        deathSortEnd: death.sortEnd,
        deathChronologyStart: death.chronologyStart,
        deathChronologyEnd: death.chronologyEnd,
        translations: {
          create: dto.translations.map((t) => ({
            locale: t.locale,
            displayName: t.displayName,
            slug: toSlug(t.displayName),
            alternateNames: t.alternateNames,
            summary: t.summary,
            description: t.description,
            method: t.method ?? 'ORIGINAL',
          })),
        },
      },
      include: { translations: true },
    });

    await this.audit.log({ actorId, action: 'person.created', entityType: 'PERSON', entityId: person.id });
    return person;
  }

  /** Rejects any placeId that does not reference an existing Place (G03 - PersonPlace is a real M:N). */
  private async assertPlacesExist(placeIds: string[]): Promise<void> {
    if (placeIds.length === 0) return;
    const found = await this.prisma.place.findMany({ where: { id: { in: placeIds } }, select: { id: true } });
    const foundIds = new Set(found.map((p) => p.id));
    const missing = placeIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new NotFoundException(`No Place with id ${missing.join(', ')}.`);
    }
  }

  /** Replaces the full PersonPlace set for this person (G03) - mirrors the EventsService/ErasService setCountries setter pattern. Not a nationality field - see PersonPlaceRole doc comment. */
  async setPlaces(personId: string, places: PersonPlaceLinkInputDto[], actorId: string) {
    const person = await this.prisma.person.findUnique({ where: { id: personId } });
    if (!person) throw new NotFoundException('Person not found.');
    await this.assertPlacesExist(places.map((p) => p.placeId));

    await this.prisma.$transaction([
      this.prisma.personPlace.deleteMany({ where: { personId } }),
      ...(places.length > 0
        ? [this.prisma.personPlace.createMany({ data: places.map((p) => ({ personId, placeId: p.placeId, role: p.role })) })]
        : []),
    ]);

    await this.audit.log({ actorId, action: 'person.places.changed', entityType: 'PERSON', entityId: personId, metadata: { places } });
    return this.prisma.personPlace.findMany({ where: { personId }, include: { place: true } });
  }

  async findBySlug(slug: string, locale: string) {
    const person = await this.prisma.person.findUnique({
      where: { canonicalSlug: slug },
      include: { translations: true, heroMedia: true, placeLinks: { include: { place: { include: { translations: true } } } } },
    });
    if (!person || person.publicationStatus !== PublicationStatus.PUBLISHED) {
      throw new NotFoundException('Person not found.');
    }

    const { translation, resolvedLocale, fallbackApplied } = resolveTranslation(person.translations, locale);
    return {
      id: person.id,
      slug: person.canonicalSlug,
      birth: toHistoricalDateResponse(
        {
          year: person.birthYear,
          month: person.birthMonth,
          day: person.birthDay,
          precision: person.birthPrecision,
          qualifier: person.birthQualifier,
          era: person.birthEra,
          endYear: person.birthEndYear,
          endMonth: person.birthEndMonth,
          endDay: person.birthEndDay,
          label: person.birthLabel,
          sortStart: person.birthSortStart,
          sortEnd: person.birthSortEnd,
          chronologyStart: person.birthChronologyStart,
          chronologyEnd: person.birthChronologyEnd,
        },
        locale,
      ),
      death: toHistoricalDateResponse(
        {
          year: person.deathYear,
          month: person.deathMonth,
          day: person.deathDay,
          precision: person.deathPrecision,
          qualifier: person.deathQualifier,
          era: person.deathEra,
          endYear: person.deathEndYear,
          endMonth: person.deathEndMonth,
          endDay: person.deathEndDay,
          label: person.deathLabel,
          sortStart: person.deathSortStart,
          sortEnd: person.deathSortEnd,
          chronologyStart: person.deathChronologyStart,
          chronologyEnd: person.deathChronologyEnd,
        },
        locale,
      ),
      heroMedia: person.heroMedia,
      places: person.placeLinks.map((l) => {
        const { translation: pt } = resolveTranslation(l.place.translations, locale);
        return { id: l.place.id, slug: l.place.canonicalSlug, name: pt?.name, role: l.role };
      }),
      translation,
      meta: { requestedLocale: locale, resolvedLocale, fallbackApplied },
    };
  }

  async list(locale: string, cursor?: string, limit = 20) {
    const people = await this.prisma.person.findMany({
      where: { publicationStatus: PublicationStatus.PUBLISHED },
      include: { translations: true },
      orderBy: { id: 'asc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = people.length > limit;
    const page = people.slice(0, limit).map((p) => {
      const { translation } = resolveTranslation(p.translations, locale);
      return { id: p.id, slug: p.canonicalSlug, displayName: translation?.displayName ?? p.canonicalSlug };
    });
    return { items: page, nextCursor: hasMore ? people[limit].id : null, hasMore };
  }

  async getSources(slug: string) {
    const person = await this.prisma.person.findUnique({ where: { canonicalSlug: slug } });
    if (!person || person.publicationStatus !== PublicationStatus.PUBLISHED) {
      throw new NotFoundException('Person not found.');
    }
    return getPublicSourcesForEntity(this.prisma, 'person', person.id);
  }

  /** Editorial Stories about this Person (spec section 42) - PUBLISHED only. */
  async getStories(slug: string, locale: string) {
    const person = await this.prisma.person.findUnique({ where: { canonicalSlug: slug } });
    if (!person || person.publicationStatus !== PublicationStatus.PUBLISHED) {
      throw new NotFoundException('Person not found.');
    }
    return this.stories.listForEntity('person', person.id, locale);
  }

  /** Chronological events for a Person (spec Phase 07 section 29) - same pattern as `PlacesService.getTimeline`, PUBLISHED events only. */
  async getTimeline(slug: string, locale: string) {
    const person = await this.prisma.person.findUnique({ where: { canonicalSlug: slug } });
    if (!person || person.publicationStatus !== PublicationStatus.PUBLISHED) {
      throw new NotFoundException('Person not found.');
    }
    const links = await this.prisma.eventPerson.findMany({
      where: { personId: person.id },
      include: { event: { include: { translations: true } } },
      orderBy: { event: { dateSortStart: 'asc' } },
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

  async setPublicationStatus(id: string, status: PublicationStatus, actorId: string) {
    const person = await this.prisma.person.findUnique({ where: { id }, include: { translations: true } });
    if (!person) throw new NotFoundException('Person not found.');
    if (status === PublicationStatus.PUBLISHED && person.translations.length === 0) {
      throw new BadRequestException('Cannot publish a person with no translations.');
    }
    const updated = await this.prisma.person.update({ where: { id }, data: { publicationStatus: status } });
    await this.audit.log({ actorId, action: 'person.publicationStatus.changed', entityType: 'PERSON', entityId: id, metadata: { status } });
    return updated;
  }
}
