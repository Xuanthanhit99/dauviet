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
import { CreatePersonDto } from './dto/person.dto';

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
        birthEndYear: birth.endYear,
        birthEndMonth: birth.endMonth,
        birthEndDay: birth.endDay,
        birthLabel: birth.label,
        birthSortStart: birth.sortStart,
        birthSortEnd: birth.sortEnd,
        deathYear: death.year,
        deathMonth: death.month,
        deathDay: death.day,
        deathPrecision: death.precision,
        deathQualifier: death.qualifier,
        deathEndYear: death.endYear,
        deathEndMonth: death.endMonth,
        deathEndDay: death.endDay,
        deathLabel: death.label,
        deathSortStart: death.sortStart,
        deathSortEnd: death.sortEnd,
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

  async findBySlug(slug: string, locale: string) {
    const person = await this.prisma.person.findUnique({
      where: { canonicalSlug: slug },
      include: { translations: true, heroMedia: true },
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
          endYear: person.birthEndYear,
          endMonth: person.birthEndMonth,
          endDay: person.birthEndDay,
          label: person.birthLabel,
          sortStart: person.birthSortStart,
          sortEnd: person.birthSortEnd,
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
          endYear: person.deathEndYear,
          endMonth: person.deathEndMonth,
          endDay: person.deathEndDay,
          label: person.deathLabel,
          sortStart: person.deathSortStart,
          sortEnd: person.deathSortEnd,
        },
        locale,
      ),
      heroMedia: person.heroMedia,
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
              endYear: l.event.dateEndYear,
              endMonth: l.event.dateEndMonth,
              endDay: l.event.dateEndDay,
              label: l.event.dateLabel,
              sortStart: l.event.dateSortStart,
              sortEnd: l.event.dateSortEnd,
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
