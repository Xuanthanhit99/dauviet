import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PublicationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { resolveTranslation } from '../../common/translation/resolve-translation.util';
import { toSlug } from '../../common/util/slug.util';
import { CANONICAL_LOCALE } from '../../common/decorators/locale.decorator';
import { CreateStoryDto } from './dto/story.dto';

@Injectable()
export class StoriesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private async ensureUniqueSlug(base: string): Promise<string> {
    let slug = base;
    let suffix = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const existing = await this.prisma.story.findUnique({ where: { canonicalSlug: slug } });
      if (!existing) return slug;
      suffix += 1;
      slug = `${base}-${suffix}`;
    }
  }

  async create(dto: CreateStoryDto, actorId: string) {
    const canonical = dto.translations.find((t) => t.locale === CANONICAL_LOCALE) ?? dto.translations[0];
    if (!canonical) throw new BadRequestException('At least one translation is required.');

    const canonicalSlug = await this.ensureUniqueSlug(toSlug(canonical.title));

    const story = await this.prisma.story.create({
      data: {
        canonicalSlug,
        authorId: actorId,
        translations: {
          create: dto.translations.map((t) => ({
            locale: t.locale,
            title: t.title,
            slug: toSlug(t.title),
            summary: t.summary,
            content: t.content,
            method: t.method ?? 'ORIGINAL',
          })),
        },
      },
      include: { translations: true },
    });

    await this.audit.log({ actorId, action: 'story.created', entityType: 'STORY', entityId: story.id });
    return story;
  }

  async linkPlace(storyId: string, placeId: string) {
    return this.prisma.storyPlace.create({ data: { storyId, placeId } });
  }

  async linkPerson(storyId: string, personId: string) {
    return this.prisma.storyPerson.create({ data: { storyId, personId } });
  }

  async linkEvent(storyId: string, eventId: string) {
    return this.prisma.storyEvent.create({ data: { storyId, eventId } });
  }

  async linkCitation(storyId: string, citationId: string) {
    return this.prisma.storyCitation.create({ data: { storyId, citationId } });
  }

  async findBySlug(slug: string, locale: string) {
    const story = await this.prisma.story.findUnique({
      where: { canonicalSlug: slug },
      include: {
        translations: true,
        heroMedia: true,
        placeLinks: { include: { place: { include: { translations: true } } } },
        personLinks: { include: { person: { include: { translations: true } } } },
        eventLinks: { include: { event: { include: { translations: true } } } },
        citationLinks: { include: { citation: { include: { source: true } } } },
      },
    });
    if (!story || story.editorialStatus !== PublicationStatus.PUBLISHED) {
      throw new NotFoundException('Story not found.');
    }

    const { translation, resolvedLocale, fallbackApplied } = resolveTranslation(story.translations, locale);
    return {
      id: story.id,
      slug: story.canonicalSlug,
      heroMedia: story.heroMedia,
      publishedAt: story.publishedAt,
      places: story.placeLinks.map((l) => ({ id: l.place.id, slug: l.place.canonicalSlug })),
      people: story.personLinks.map((l) => ({ id: l.person.id, slug: l.person.canonicalSlug })),
      events: story.eventLinks.map((l) => ({ id: l.event.id, slug: l.event.canonicalSlug })),
      citations: story.citationLinks.map((l) => ({
        id: l.citation.id,
        source: { id: l.citation.source.id, title: l.citation.source.title },
        pageFrom: l.citation.pageFrom,
        pageTo: l.citation.pageTo,
      })),
      translation,
      meta: { requestedLocale: locale, resolvedLocale, fallbackApplied },
    };
  }

  async list(locale: string, cursor?: string, limit = 20) {
    const stories = await this.prisma.story.findMany({
      where: { editorialStatus: PublicationStatus.PUBLISHED },
      include: { translations: true },
      orderBy: { publishedAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = stories.length > limit;
    const page = stories.slice(0, limit).map((s) => {
      const { translation } = resolveTranslation(s.translations, locale);
      return { id: s.id, slug: s.canonicalSlug, title: translation?.title ?? s.canonicalSlug };
    });
    return { items: page, nextCursor: hasMore ? stories[limit].id : null, hasMore };
  }

  async setEditorialStatus(id: string, status: PublicationStatus, actorId: string) {
    const story = await this.prisma.story.findUnique({ where: { id }, include: { translations: true, citationLinks: true } });
    if (!story) throw new NotFoundException('Story not found.');
    if (status === PublicationStatus.PUBLISHED) {
      if (story.translations.length === 0) throw new BadRequestException('Cannot publish a story with no translations.');
    }
    const updated = await this.prisma.story.update({
      where: { id },
      data: { editorialStatus: status, publishedAt: status === PublicationStatus.PUBLISHED ? new Date() : story.publishedAt },
    });
    await this.audit.log({ actorId, action: 'story.editorialStatus.changed', entityType: 'STORY', entityId: id, metadata: { status } });
    return updated;
  }
}
