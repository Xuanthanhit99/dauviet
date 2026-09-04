import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CommunityStoryType, CommunityVerificationState, EntityKind, ModerationStatus, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MediaService } from '../media/media.service';
import { resolveTranslation } from '../../common/translation/resolve-translation.util';
import { toSlug } from '../../common/util/slug.util';
import { assertSafeUserContent } from '../../common/util/content-safety.util';
import { CANONICAL_LOCALE } from '../../common/decorators/locale.decorator';
import { COMMUNITY_ERROR_CODES } from '../../common/errors/community-error-codes';
import { PUBLIC_VISIBLE_STATUSES } from '../../common/moderation/public-visible-statuses.util';
import { CreateCommunityStoryDto, UpdateCommunityStoryDto } from './dto/community-story.dto';

const AUTHOR_ALLOWED_STATES: CommunityVerificationState[] = [
  CommunityVerificationState.PERSONAL_MEMORY,
  CommunityVerificationState.COMMUNITY_SUBMISSION,
  CommunityVerificationState.SOURCE_ATTACHED,
];

const PRIVILEGED_ROLES = new Set<string>([Role.EDITOR, Role.HISTORIAN_REVIEWER, Role.MODERATOR, Role.ADMIN]);

@Injectable()
export class CommunityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
  ) {}

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

  private validateTranslations(translations: { title: string; content?: string }[]): void {
    for (const t of translations) {
      assertSafeUserContent(t.title, { maxLinks: 0 });
      if (t.content) assertSafeUserContent(t.content);
    }
  }

  /** A caller may act on a story if they are its author, or hold an editorial/moderation role (spec section 13/40-42). */
  private isPrivileged(actor: { roles: string[] }): boolean {
    return actor.roles.some((r) => PRIVILEGED_ROLES.has(r));
  }

  private async assertCanEdit(storyId: string, actor: { id: string; roles: string[] }) {
    const story = await this.prisma.communityStory.findUnique({ where: { id: storyId } });
    if (!story) throw new NotFoundException({ code: COMMUNITY_ERROR_CODES.COMMUNITY_STORY_NOT_FOUND, message: 'Community story not found.' });
    if (story.authorId !== actor.id && !this.isPrivileged(actor)) {
      throw new ForbiddenException({ code: COMMUNITY_ERROR_CODES.COMMUNITY_STORY_NOT_EDITABLE, message: 'Not the author of this story.' });
    }
    return story;
  }

  async create(dto: CreateCommunityStoryDto, actor: { id: string; roles: string[] }) {
    const canonical = dto.translations.find((t) => t.locale === CANONICAL_LOCALE) ?? dto.translations[0];
    if (!canonical) throw new BadRequestException('At least one translation is required.');
    this.validateTranslations(dto.translations);

    if (dto.heroMediaId) {
      await this.media.assertOwnedByOrPrivileged(dto.heroMediaId, actor);
    }

    let thenNowComparisonId: string | undefined;
    if (dto.thenNowComparisonId) {
      if (dto.type !== CommunityStoryType.THEN_AND_NOW) {
        throw new BadRequestException({ code: COMMUNITY_ERROR_CODES.COMMUNITY_INVALID_ENTITY_LINK, message: 'thenNowComparisonId is only valid for type THEN_AND_NOW.' });
      }
      const comparison = await this.prisma.thenNowComparison.findUnique({ where: { id: dto.thenNowComparisonId } });
      if (!comparison) throw new NotFoundException('Then & Now comparison not found.');
      if (comparison.createdById !== actor.id && !this.isPrivileged(actor)) {
        throw new ForbiddenException({ code: COMMUNITY_ERROR_CODES.COMMUNITY_MEDIA_NOT_OWNED, message: 'Not the creator of this Then & Now comparison.' });
      }
      thenNowComparisonId = dto.thenNowComparisonId;
    }

    const canonicalSlug = await this.ensureUniqueSlug(toSlug(canonical.title));

    const story = await this.prisma.communityStory.create({
      data: {
        type: dto.type,
        authorId: actor.id,
        heroMediaId: dto.heroMediaId,
        thenNowComparisonId,
        originalLocale: canonical.locale,
        eventDateYear: dto.eventDateYear,
        eventDateMonth: dto.eventDateMonth,
        eventDateDay: dto.eventDateDay,
        eventDatePrecision: dto.eventDatePrecision,
        eventDateLabel: dto.eventDateLabel,
        canonicalSlug,
        translations: { create: dto.translations.map((t) => ({ locale: t.locale, title: t.title, slug: toSlug(t.title), content: t.content })) },
      },
      include: { translations: true },
    });

    await this.audit.log({ actorId: actor.id, action: 'communityStory.created', entityType: 'COMMUNITY_STORY', entityId: story.id });
    return story;
  }

  /** Author (or EDITOR+) edit (spec section 13) - never touches verificationState/moderationStatus, which have their own gated setters. */
  async update(storyId: string, actor: { id: string; roles: string[] }, dto: UpdateCommunityStoryDto) {
    await this.assertCanEdit(storyId, actor);
    if (dto.translations) this.validateTranslations(dto.translations);
    if (dto.heroMediaId) await this.media.assertOwnedByOrPrivileged(dto.heroMediaId, actor);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.translations) {
        await tx.communityStoryTranslation.deleteMany({ where: { storyId } });
        for (const t of dto.translations) {
          await tx.communityStoryTranslation.create({ data: { storyId, locale: t.locale, title: t.title, slug: toSlug(t.title), content: t.content } });
        }
      }
      return tx.communityStory.update({
        where: { id: storyId },
        data: {
          eventDateYear: dto.eventDateYear,
          eventDateMonth: dto.eventDateMonth,
          eventDateDay: dto.eventDateDay,
          eventDatePrecision: dto.eventDatePrecision,
          eventDateLabel: dto.eventDateLabel,
          heroMediaId: dto.heroMediaId,
          editedAt: new Date(),
        },
        include: { translations: true },
      });
    });

    await this.audit.log({ actorId: actor.id, action: 'communityStory.edited', entityType: 'COMMUNITY_STORY', entityId: storyId });
    return updated;
  }

  /** Author self-withdraw (spec section 14) - soft delete, moderation/audit history is preserved. */
  async withdraw(storyId: string, actorId: string) {
    const story = await this.prisma.communityStory.findUnique({ where: { id: storyId } });
    if (!story) throw new NotFoundException({ code: COMMUNITY_ERROR_CODES.COMMUNITY_STORY_NOT_FOUND, message: 'Community story not found.' });
    if (story.authorId !== actorId) {
      throw new ForbiddenException({ code: COMMUNITY_ERROR_CODES.COMMUNITY_STORY_NOT_EDITABLE, message: 'Not the author of this story.' });
    }

    const updated = await this.prisma.communityStory.update({ where: { id: storyId }, data: { moderationStatus: ModerationStatus.REMOVED } });
    await this.audit.log({ actorId, action: 'communityStory.withdrawn', entityType: 'COMMUNITY_STORY', entityId: storyId });
    return updated;
  }

  private async assertLinkTargetExists(kind: 'place' | 'person' | 'event' | 'era', entityId: string) {
    const row = await (
      kind === 'place'
        ? this.prisma.place.findUnique({ where: { id: entityId } })
        : kind === 'person'
          ? this.prisma.person.findUnique({ where: { id: entityId } })
          : kind === 'event'
            ? this.prisma.historicalEvent.findUnique({ where: { id: entityId } })
            : this.prisma.historicalEra.findUnique({ where: { id: entityId } })
    );
    if (!row) {
      throw new BadRequestException({ code: COMMUNITY_ERROR_CODES.COMMUNITY_INVALID_ENTITY_LINK, message: `${kind} ${entityId} does not exist.` });
    }
  }

  async linkPlace(storyId: string, placeId: string, actor: { id: string; roles: string[] }) {
    await this.assertCanEdit(storyId, actor);
    await this.assertLinkTargetExists('place', placeId);
    return this.prisma.communityStoryPlace.create({ data: { storyId, placeId } });
  }

  async linkPerson(storyId: string, personId: string, actor: { id: string; roles: string[] }) {
    await this.assertCanEdit(storyId, actor);
    await this.assertLinkTargetExists('person', personId);
    return this.prisma.communityStoryPerson.create({ data: { storyId, personId } });
  }

  async linkEvent(storyId: string, eventId: string, actor: { id: string; roles: string[] }) {
    await this.assertCanEdit(storyId, actor);
    await this.assertLinkTargetExists('event', eventId);
    return this.prisma.communityStoryEvent.create({ data: { storyId, eventId } });
  }

  async linkEra(storyId: string, eraId: string, actor: { id: string; roles: string[] }) {
    await this.assertCanEdit(storyId, actor);
    await this.assertLinkTargetExists('era', eraId);
    return this.prisma.communityStoryEra.create({ data: { storyId, eraId } });
  }

  /** "My stories" (spec section 67) - every status, not just public ones, so an author can see their own withdrawn/removed/under-review work. */
  async listMine(authorId: string) {
    const stories = await this.prisma.communityStory.findMany({
      where: { authorId },
      include: { translations: true },
      orderBy: { createdAt: 'desc' },
    });
    return stories.map((s) => {
      const { translation } = resolveTranslation(s.translations, 'vi');
      return {
        id: s.id,
        slug: s.canonicalSlug,
        type: s.type,
        verificationState: s.verificationState,
        moderationStatus: s.moderationStatus,
        helpfulCount: s.helpfulCount,
        title: translation?.title ?? s.canonicalSlug,
      };
    });
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
    if (!story || !PUBLIC_VISIBLE_STATUSES.includes(story.moderationStatus)) {
      throw new NotFoundException({ code: COMMUNITY_ERROR_CODES.COMMUNITY_STORY_NOT_FOUND, message: 'Community story not found.' });
    }

    const commentCount = await this.prisma.comment.count({
      where: { targetType: EntityKind.COMMUNITY_STORY, targetId: story.id, status: { in: [ModerationStatus.VISIBLE, ModerationStatus.LIMITED, ModerationStatus.LOCKED] } },
    });

    const { translation, resolvedLocale, fallbackApplied } = resolveTranslation(story.translations, locale);
    return {
      id: story.id,
      slug: story.canonicalSlug,
      type: story.type,
      // Structured provenance state, not final UI copy (spec section 11) -
      // the client decides how/whether to render an "unverified" notice from
      // these two fields.
      verificationState: story.verificationState,
      moderationStatus: story.moderationStatus,
      originalLocale: story.originalLocale,
      author: story.author,
      heroMedia: story.heroMedia,
      thenNowComparisonId: story.thenNowComparisonId,
      helpfulCount: story.helpfulCount,
      commentCount,
      editedAt: story.editedAt,
      createdAt: story.createdAt,
      eventDate: {
        year: story.eventDateYear,
        month: story.eventDateMonth,
        day: story.eventDateDay,
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

  async list(params: { locale: string; type?: string; placeId?: string; sort?: 'NEW' | 'HELPFUL'; cursor?: string; limit: number }) {
    const stories = await this.prisma.communityStory.findMany({
      where: {
        moderationStatus: { in: PUBLIC_VISIBLE_STATUSES },
        type: params.type as any,
        placeLinks: params.placeId ? { some: { placeId: params.placeId } } : undefined,
      },
      include: { translations: true },
      orderBy: params.sort === 'HELPFUL' ? [{ helpfulCount: 'desc' }, { id: 'asc' }] : [{ createdAt: 'desc' }, { id: 'asc' }],
      take: params.limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    });
    const hasMore = stories.length > params.limit;
    const page = stories.slice(0, params.limit).map((s) => {
      const { translation } = resolveTranslation(s.translations, params.locale);
      return { id: s.id, slug: s.canonicalSlug, type: s.type, verificationState: s.verificationState, helpfulCount: s.helpfulCount, title: translation?.title ?? s.canonicalSlug };
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

  /**
   * Editorial-only transition to UNDER_REVIEW / VERIFIED_CONTRIBUTION - role
   * gated at the controller. Separately, an editor who happens to be the
   * story's own author is refused (spec section 41/42 "author cannot change
   * verification state") - holding a reviewer role never overrides being an
   * interested party in your own submission, the same separation-of-duties
   * principle as Fact review (docs/backend/TRUST_MODEL.md section 7).
   */
  async setReviewVerificationState(actorId: string, storyId: string, state: CommunityVerificationState) {
    const story = await this.prisma.communityStory.findUnique({ where: { id: storyId } });
    if (!story) throw new NotFoundException('Community story not found.');
    if (story.authorId === actorId) {
      throw new ForbiddenException({ code: COMMUNITY_ERROR_CODES.MODERATION_FORBIDDEN, message: 'Cannot review your own community story.' });
    }

    const updated = await this.prisma.communityStory.update({ where: { id: storyId }, data: { verificationState: state } });
    await this.audit.log({ actorId, action: 'communityStory.verificationState.changed', entityType: 'COMMUNITY_STORY', entityId: storyId, metadata: { state } });
    return updated;
  }

  /** Moderator-only status change - role gated at the controller. A moderator who is also the author is refused (spec section 41/42), same reasoning as review above. */
  async setModerationStatus(actorId: string, storyId: string, status: ModerationStatus, reason?: string) {
    const story = await this.prisma.communityStory.findUnique({ where: { id: storyId } });
    if (!story) throw new NotFoundException('Community story not found.');
    if (story.authorId === actorId) {
      throw new ForbiddenException({ code: COMMUNITY_ERROR_CODES.MODERATION_FORBIDDEN, message: 'Cannot moderate your own community story.' });
    }

    const updated = await this.prisma.communityStory.update({ where: { id: storyId }, data: { moderationStatus: status } });
    await this.audit.log({ actorId, action: 'communityStory.moderated', entityType: 'COMMUNITY_STORY', entityId: storyId, metadata: { status, reason } });
    return updated;
  }

  /** Idempotent "helpful" vote (spec section 22/23). Self-voting is disallowed; a removed/flagged story cannot receive new votes. A repeat vote from the same user is a safe no-op, not a second row (DB @@unique is the source of truth). */
  async vote(userId: string, storyId: string) {
    const story = await this.prisma.communityStory.findUnique({ where: { id: storyId } });
    if (!story) throw new NotFoundException({ code: COMMUNITY_ERROR_CODES.COMMUNITY_STORY_NOT_FOUND, message: 'Community story not found.' });
    if (story.authorId === userId) {
      throw new ForbiddenException({ code: COMMUNITY_ERROR_CODES.VOTE_SELF_NOT_ALLOWED, message: 'Cannot vote your own story helpful.' });
    }
    if (!PUBLIC_VISIBLE_STATUSES.includes(story.moderationStatus)) {
      throw new BadRequestException({ code: COMMUNITY_ERROR_CODES.VOTE_TARGET_NOT_AVAILABLE, message: 'This story cannot receive votes right now.' });
    }

    const existing = await this.prisma.storyVote.findUnique({ where: { storyId_userId: { storyId, userId } } });
    if (existing) return { voted: true };

    await this.prisma.$transaction([
      this.prisma.storyVote.create({ data: { storyId, userId } }),
      this.prisma.communityStory.update({ where: { id: storyId }, data: { helpfulCount: { increment: 1 } } }),
    ]);
    return { voted: true };
  }

  /** Idempotent un-vote - a no-op if the user hadn't voted (spec section 22 "toggle/remove"). */
  async unvote(userId: string, storyId: string) {
    const existing = await this.prisma.storyVote.findUnique({ where: { storyId_userId: { storyId, userId } } });
    if (!existing) return { voted: false };

    await this.prisma.$transaction([
      this.prisma.storyVote.delete({ where: { id: existing.id } }),
      this.prisma.communityStory.update({ where: { id: storyId }, data: { helpfulCount: { decrement: 1 } } }),
    ]);
    return { voted: false };
  }
}
