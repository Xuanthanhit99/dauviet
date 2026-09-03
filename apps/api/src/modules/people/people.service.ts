import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PublicationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { resolveTranslation } from '../../common/translation/resolve-translation.util';
import { toSlug } from '../../common/util/slug.util';
import { CANONICAL_LOCALE } from '../../common/decorators/locale.decorator';
import { CreatePersonDto } from './dto/person.dto';

@Injectable()
export class PeopleService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

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

    const person = await this.prisma.person.create({
      data: {
        canonicalSlug,
        birthDateStart: dto.birthDateStart ? new Date(dto.birthDateStart) : undefined,
        birthDatePrecision: dto.birthDatePrecision,
        birthDateLabel: dto.birthDateLabel,
        deathDateStart: dto.deathDateStart ? new Date(dto.deathDateStart) : undefined,
        deathDatePrecision: dto.deathDatePrecision,
        deathDateLabel: dto.deathDateLabel,
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
      birth: {
        start: person.birthDateStart,
        precision: person.birthDatePrecision,
        label: person.birthDateLabel,
      },
      death: {
        start: person.deathDateStart,
        precision: person.deathDatePrecision,
        label: person.deathDateLabel,
      },
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
