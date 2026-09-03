import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CommunityVerificationState, ModerationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { resolveTranslation } from '../../common/translation/resolve-translation.util';
import { toSlug } from '../../common/util/slug.util';
import { CANONICAL_LOCALE } from '../../common/decorators/locale.decorator';
import { CreateCommunityStoryDto } from './dto/community-story.dto';

const AUTHOR_ALLOWED_STATES: CommunityVerificationState[] = [
  CommunityVerificationState.PERSONAL_MEMORY,
  CommunityVerificationState.COMMUNITY_SUBMISSION,
  CommunityVerificationState.SOURCE_ATTACHED,
];

@Injectable()
export class CommunityService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private async ensureUniqueSlug(base: string): Promise<string> {
    let slug = base;
    let suffix = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const existing = await this.prisma.communityStory.findUnique({ where: { canonicalSlug: slug } });
      if (!existing) return slug;
      suffix += 1;
      slug = `${base}-${suffix}`;
    }
  }

  async create(dto: CreateCommunityStoryDto, authorId: string) {
    const canonical = dto.translations.find((t) => t.locale === CANONICAL_LOCALE) ?? dto.translations[0];
    if (!canonical) throw new BadRequestException('At least one translation is required.');

    const canonicalSlug = await this.ensureUniqueSlug(toSlug(canonical.title));

    const story = await this.prisma.communityStory.create({
      data: {
        type: dto.type,
        authorId,
        eventDateStart: dto.eventDateStart ? new Date(dto.eventDateStart) : undefined,
        eventDatePrecision: dto.eventDatePrecision,
        eventDateLabel: dto.eventDateLabel,
        canonicalSlug,
        translations: { create: dto.translations.map((t) => ({ locale: t.locale, title: t.title, slug: toSlug(t.title), content: t.content })) },
      },
      include: { translations: true },
    });

    await this.audit.log({ actorId: authorId, action: 'communityStory.created', entityType: 'COMMUNITY_STORY', entityId: story.id });
    return story;
  }

  async linkPlace(storyId: string, placeId: string) {
    return this.prisma.communityStoryPlace.create({ data: { storyId, placeId } });
  }

  async linkPerson(storyId: string, personId: string) {
    return this.prisma.communityStoryPerson.create({ data: { storyId, personId } });
  }

  async linkEvent(storyId: string, eventId: string) {
    return this.prisma.communityStoryEvent.create({ data: { storyId, eventId } });
  }

  async linkEra(storyId: string, eraId: string) {
    return this.prisma.communityStoryEra.create({ data: { storyId, eraId } });
  }

  async findBySlug(slug: string, locale: string) {
    const story = await this.prisma.communityStory.findUnique({
      where: { canonicalSlug: slug },
      include: {
        translations: true,
        heroMedia: true,
        author: { select: { id: true, displayName: true } },
        placeLinks: { include: { place: { include: { translations: true } } } },
        personLinks: { include: { person: { include: { translations: true } } } },
        eventLinks: { include: { event: { include: { translations: true } } } },
      },
    });
    if (!story || story.moderationStatus === ModerationStatus.REMOVED) {
      throw new NotFoundException('Community story not found.');
    }

    const { translation, resolvedLocale, fallbackApplied } = resolveTranslation(story.translations, locale);
    return {
      id: story.id,
      slug: story.canonicalSlug,
      type: story.type,
      verificationState: story.verificationState,
      moderationStatus: story.moderationStatus,
      author: story.author,
      heroMedia: story.heroMedia,
      eventDate: {
        start: story.eventDateStart,
        precision: story.eventDatePrecision,
        label: story.eventDateLabel,
      },
      places: story.placeLinks.map((l) => ({ id: l.place.id, slug: l.place.canonicalSlug })),
      people: story.personLinks.map((l) => ({ id: l.person.id, slug: l.person.canonicalSlug })),
      events: story.eventLinks.map((l) => ({ id: l.event.id, slug: l.event.canonicalSlug })),
      translation,
      meta: { requestedLocale: locale, resolvedLocale, fallbackApplied },
    };
  }

  async list(params: { locale: string; type?: string; cursor?: string; limit: number }) {
    const stories = await this.prisma.communityStory.findMany({
      where: { moderationStatus: { not: ModerationStatus.REMOVED }, type: params.type as any },
      include: { translations: true },
      orderBy: { id: 'asc' },
      take: params.limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    });
    const hasMore = stories.length > params.limit;
    const page = stories.slice(0, params.limit).map((s) => {
      const { translation } = resolveTranslation(s.translations, params.locale);
      return { id: s.id, slug: s.canonicalSlug, type: s.type, verificationState: s.verificationState, title: translation?.title ?? s.canonicalSlug };
    });
    return { items: page, nextCursor: hasMore ? stories[params.limit].id : null, hasMore };
  }

  /**
   * Author-controlled transition: an author can only move their own story
   * through the pre-review states. SOURCE_ATTACHED still does not mean
   * historically verified (spec section 30).
   */
  async setAuthorVerificationState(storyId: string, authorId: string, state: CommunityVerificationState) {
    if (!AUTHOR_ALLOWED_STATES.includes(state)) {
      throw new ForbiddenException('Authors may only set PERSONAL_MEMORY, COMMUNITY_SUBMISSION, or SOURCE_ATTACHED.');
    }
    const story = await this.prisma.communityStory.findUnique({ where: { id: storyId } });
    if (!story) throw new NotFoundException('Community story not found.');
    if (story.authorId !== authorId) throw new ForbiddenException('Not the author of this story.');

    return this.prisma.communityStory.update({ where: { id: storyId }, data: { verificationState: state } });
  }

  /** Editorial-only transition to UNDER_REVIEW / VERIFIED_CONTRIBUTION - role gated at the controller. */
  async setReviewVerificationState(actorId: string, storyId: string, state: CommunityVerificationState) {
    const story = await this.prisma.communityStory.findUnique({ where: { id: storyId } });
    if (!story) throw new NotFoundException('Community story not found.');

    const updated = await this.prisma.communityStory.update({ where: { id: storyId }, data: { verificationState: state } });
    await this.audit.log({ actorId, action: 'communityStory.verificationState.changed', entityType: 'COMMUNITY_STORY', entityId: storyId, metadata: { state } });
    return updated;
  }

  async setModerationStatus(actorId: string, storyId: string, status: ModerationStatus) {
    const story = await this.prisma.communityStory.findUnique({ where: { id: storyId } });
    if (!story) throw new NotFoundException('Community story not found.');

    const updated = await this.prisma.communityStory.update({ where: { id: storyId }, data: { moderationStatus: status } });
    await this.audit.log({ actorId, action: 'communityStory.moderated', entityType: 'COMMUNITY_STORY', entityId: storyId, metadata: { status } });
    return updated;
  }
}
