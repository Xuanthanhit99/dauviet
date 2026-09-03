import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PublicationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { resolveTranslation } from '../../common/translation/resolve-translation.util';
import { toSlug } from '../../common/util/slug.util';
import { CANONICAL_LOCALE } from '../../common/decorators/locale.decorator';
import { CreateEventDto } from './dto/event.dto';

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

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

  async create(dto: CreateEventDto, actorId: string) {
    const canonical = dto.translations.find((t) => t.locale === CANONICAL_LOCALE) ?? dto.translations[0];
    if (!canonical) throw new BadRequestException('At least one translation is required.');

    const canonicalSlug = await this.ensureUniqueSlug(toSlug(canonical.title));

    const event = await this.prisma.historicalEvent.create({
      data: {
        canonicalSlug,
        eraId: dto.eraId,
        territoryId: dto.territoryId,
        dateStart: dto.dateStart ? new Date(dto.dateStart) : undefined,
        dateEnd: dto.dateEnd ? new Date(dto.dateEnd) : undefined,
        datePrecision: dto.datePrecision,
        dateLabel: dto.dateLabel,
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
      },
      include: { translations: true },
    });

    await this.audit.log({ actorId, action: 'event.created', entityType: 'EVENT', entityId: event.id });
    return event;
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
      },
    });
    if (!event || event.publicationStatus !== PublicationStatus.PUBLISHED) {
      throw new NotFoundException('Event not found.');
    }

    const { translation, resolvedLocale, fallbackApplied } = resolveTranslation(event.translations, locale);

    return {
      id: event.id,
      slug: event.canonicalSlug,
      dateStart: event.dateStart,
      dateEnd: event.dateEnd,
      datePrecision: event.datePrecision,
      dateLabel: event.dateLabel,
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
      return { id: e.id, slug: e.canonicalSlug, title: translation?.title ?? e.canonicalSlug, dateStart: e.dateStart };
    });
    return { items: page, nextCursor: hasMore ? events[limit].id : null, hasMore };
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
