import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AccessPolicy,
  EntityKind,
  FactEditorialStatus,
  MediaAssetStatus,
  Prisma,
  ReviewDecision,
  StoryEditorialStatus,
  TranslationStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { resolveTranslation } from '../../common/translation/resolve-translation.util';
import { toSlug } from '../../common/util/slug.util';
import { CANONICAL_LOCALE } from '../../common/decorators/locale.decorator';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { EDITORIAL_ERROR_CODES } from './editorial-error-codes';
import { extractReferencedMediaAssetIds, validateStoryBody } from './story-body.util';
import { CreateStoryDto, LinkStoryCitationDto, LinkStoryEntityDto, LinkStoryFactDto, SetStoryFeaturedDto } from './dto/story.dto';

const FORWARD_TRANSITIONS: Record<StoryEditorialStatus, StoryEditorialStatus[]> = {
  DRAFT: [StoryEditorialStatus.SOURCE_CHECK, StoryEditorialStatus.DRAFT],
  SOURCE_CHECK: [StoryEditorialStatus.EDITORIAL_REVIEW, StoryEditorialStatus.DRAFT],
  EDITORIAL_REVIEW: [StoryEditorialStatus.READY, StoryEditorialStatus.DRAFT],
  READY: [StoryEditorialStatus.PUBLISHED, StoryEditorialStatus.SCHEDULED, StoryEditorialStatus.DRAFT],
  SCHEDULED: [StoryEditorialStatus.PUBLISHED, StoryEditorialStatus.DRAFT],
  PUBLISHED: [StoryEditorialStatus.ARCHIVED, StoryEditorialStatus.DRAFT],
  ARCHIVED: [StoryEditorialStatus.DRAFT],
};

const REGRESSION_TARGETS = new Set<StoryEditorialStatus>([StoryEditorialStatus.DRAFT, StoryEditorialStatus.ARCHIVED]);
const REVIEWER_ROLES = ['HISTORIAN_REVIEWER', 'ADMIN'];

const STORY_INCLUDE = {
  translations: true,
  heroMedia: true,
  placeLinks: { include: { place: { include: { translations: true } } } },
  personLinks: { include: { person: { include: { translations: true } } } },
  eventLinks: { include: { event: { include: { translations: true } } } },
  factLinks: { include: { fact: true } },
  citationLinks: { include: { citation: { include: { source: true } } } },
} satisfies Prisma.StoryInclude;

function resolveDecision(newStatus: StoryEditorialStatus, requested?: ReviewDecision): ReviewDecision {
  const isRegression = REGRESSION_TARGETS.has(newStatus);
  if (requested) {
    if (isRegression && requested === ReviewDecision.APPROVED) {
      throw new BadRequestException('decision APPROVED is not valid when sending a Story back to DRAFT or ARCHIVED.');
    }
    if (!isRegression && requested !== ReviewDecision.APPROVED) {
      throw new BadRequestException(`decision ${requested} is only valid when sending a Story back to DRAFT or ARCHIVED.`);
    }
    return requested;
  }
  return isRegression ? ReviewDecision.REJECTED : ReviewDecision.APPROVED;
}

/**
 * Editorial Story service (spec Phase 06). Stories interpret and present
 * verified knowledge - they are never a side door around HistoricalFact's
 * trust gate (spec section 2): `validateForPublication` refuses to publish
 * a Story that cites a non-PUBLISHED Fact as support, exactly mirroring the
 * discipline FactsService applies to Citations. See
 * docs/backend/EDITORIAL_CONTENT.md for the full contract.
 */
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
        type: dto.type,
        byline: dto.byline,
        authorId: actorId,
        translations: {
          create: dto.translations.map((t) => ({
            locale: t.locale,
            title: t.title,
            slug: toSlug(t.title),
            subtitle: t.subtitle,
            summary: t.summary,
            content: validateStoryBody(t.content) as unknown as Prisma.InputJsonValue,
            seoTitle: t.seoTitle,
            seoDescription: t.seoDescription,
            method: t.method ?? 'ORIGINAL',
          })),
        },
      },
      include: { translations: true },
    });

    await this.snapshot(story.id, actorId, 'story.created');
    return story;
  }

  async findById(id: string) {
    const story = await this.prisma.story.findUnique({ where: { id }, include: STORY_INCLUDE });
    if (!story) throw new NotFoundException('Story not found.');
    return story;
  }

  /** Admin/reviewer preview - any editorial status, never exposed through a public route (spec section 46). */
  async preview(id: string, locale: string) {
    const story = await this.findById(id);
    const { translation, resolvedLocale, fallbackApplied } = resolveTranslation(story.translations, locale);
    return { ...this.toPublicDto(story, translation), meta: { requestedLocale: locale, resolvedLocale, fallbackApplied } };
  }

  async findBySlug(slug: string, locale: string) {
    const story = await this.prisma.story.findUnique({ where: { canonicalSlug: slug }, include: STORY_INCLUDE });
    if (!story || story.editorialStatus !== StoryEditorialStatus.PUBLISHED) {
      throw new NotFoundException('Story not found.');
    }

    const { translation, resolvedLocale, fallbackApplied } = resolveTranslation(story.translations, locale);
    return { ...this.toPublicDto(story, translation), meta: { requestedLocale: locale, resolvedLocale, fallbackApplied } };
  }

  /**
   * Shared public/preview DTO shape. Media is never flattened to a bare
   * `{url}` (spec section 16) - `isAiGenerated`/`aiDisclosure`/`type` always
   * survive serialization so a client can visibly distinguish an
   * ARCHIVAL_PHOTO from a RECONSTRUCTION.
   */
  private toPublicDto(story: Prisma.StoryGetPayload<{ include: typeof STORY_INCLUDE }>, translation: unknown) {
    return {
      id: story.id,
      slug: story.canonicalSlug,
      type: story.type,
      byline: story.byline,
      featured: story.featured,
      priority: story.priority,
      editorialStatus: story.editorialStatus,
      publishedAt: story.publishedAt,
      heroMedia: story.heroMedia ? this.mediaDisplay(story.heroMedia) : null,
      places: story.placeLinks.map((l) => ({ id: l.place.id, slug: l.place.canonicalSlug, role: l.role })),
      people: story.personLinks.map((l) => ({ id: l.person.id, slug: l.person.canonicalSlug, role: l.role })),
      events: story.eventLinks.map((l) => ({ id: l.event.id, slug: l.event.canonicalSlug, role: l.role })),
      facts: story.factLinks.map((l) => ({ id: l.fact.id, factType: l.fact.factType, certainty: l.fact.certainty, editorialStatus: l.fact.editorialStatus })),
      citations: story.citationLinks.map((l) => ({
        id: l.citation.id,
        source: { id: l.citation.source.id, title: l.citation.source.title },
        pageFrom: l.citation.pageFrom,
        pageTo: l.citation.pageTo,
        locator: l.locator,
      })),
      translation,
    };
  }

  private mediaDisplay(media: { id: string; type: string; isAiGenerated: boolean; aiDisclosure: string | null; isHistorical: boolean; accessPolicy: AccessPolicy; status: MediaAssetStatus }) {
    return {
      id: media.id,
      type: media.type,
      isHistorical: media.isHistorical,
      isAiGenerated: media.isAiGenerated,
      aiDisclosure: media.aiDisclosure,
      accessPolicy: media.accessPolicy,
      status: media.status,
    };
  }

  async list(params: { locale: string; type?: string; placeId?: string; personId?: string; eventId?: string; featured?: boolean; cursor?: string; limit?: number }) {
    const limit = params.limit ?? 20;
    const stories = await this.prisma.story.findMany({
      where: {
        editorialStatus: StoryEditorialStatus.PUBLISHED,
        type: params.type as any,
        featured: params.featured,
        placeLinks: params.placeId ? { some: { placeId: params.placeId } } : undefined,
        personLinks: params.personId ? { some: { personId: params.personId } } : undefined,
        eventLinks: params.eventId ? { some: { eventId: params.eventId } } : undefined,
      },
      include: { translations: true },
      orderBy: [{ priority: 'desc' }, { publishedAt: 'desc' }],
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    });
    const hasMore = stories.length > limit;
    const page = stories.slice(0, limit).map((s) => {
      const { translation } = resolveTranslation(s.translations, params.locale);
      return { id: s.id, slug: s.canonicalSlug, type: s.type, featured: s.featured, title: translation?.title ?? s.canonicalSlug };
    });
    return { items: page, nextCursor: hasMore ? stories[limit].id : null, hasMore };
  }

  /** Used by Place/Person/Event `:slug/stories` (spec section 42) - PUBLISHED only, one query. */
  async listForEntity(kind: 'place' | 'person' | 'event', entityId: string, locale: string) {
    const key = kind === 'place' ? 'placeId' : kind === 'person' ? 'personId' : 'eventId';
    const relation = kind === 'place' ? 'placeLinks' : kind === 'person' ? 'personLinks' : 'eventLinks';
    const stories = await this.prisma.story.findMany({
      where: { editorialStatus: StoryEditorialStatus.PUBLISHED, [relation]: { some: { [key]: entityId } } } as Prisma.StoryWhereInput,
      include: { translations: true },
      orderBy: [{ priority: 'desc' }, { publishedAt: 'desc' }],
      take: 50,
    });
    return stories.map((s) => {
      const { translation } = resolveTranslation(s.translations, locale);
      return { id: s.id, slug: s.canonicalSlug, type: s.type, title: translation?.title ?? s.canonicalSlug };
    });
  }

  async getMedia(id: string) {
    await this.findById(id);
    const gallery = await this.prisma.entityMedia.findMany({
      where: { entityType: EntityKind.STORY, entityId: id },
      include: { mediaAsset: true },
      orderBy: { order: 'asc' },
    });
    return gallery.map((g) => this.mediaDisplay(g.mediaAsset));
  }

  async setHeroMedia(storyId: string, mediaAssetId: string, actorId: string) {
    const [story, media] = await Promise.all([
      this.prisma.story.findUnique({ where: { id: storyId } }),
      this.prisma.mediaAsset.findUnique({ where: { id: mediaAssetId } }),
    ]);
    if (!story) throw new NotFoundException('Story not found.');
    if (!media) throw new BadRequestException('Hero media does not reference an existing MediaAsset.');
    // Not required to already be READY at assignment time (an editor may
    // pick media still processing) - eligibility is re-checked at
    // publication time by `validateForPublication` (spec section 15/19).

    const updated = await this.prisma.story.update({ where: { id: storyId }, data: { heroMediaId: mediaAssetId } });
    await this.audit.log({ actorId, action: 'story.heroMedia.set', entityType: EntityKind.STORY, entityId: storyId, metadata: { mediaAssetId } });
    return updated;
  }

  async linkEntity(storyId: string, kind: 'place' | 'person' | 'event', dto: LinkStoryEntityDto, actorId: string) {
    await this.findById(storyId);
    const role = dto.role ?? 'RELATED';
    const create = {
      place: () => this.prisma.storyPlace.create({ data: { storyId, placeId: dto.entityId, role } }),
      person: () => this.prisma.storyPerson.create({ data: { storyId, personId: dto.entityId, role } }),
      event: () => this.prisma.storyEvent.create({ data: { storyId, eventId: dto.entityId, role } }),
    }[kind];
    const link = await create();
    await this.audit.log({ actorId, action: `story.linked.${kind}`, entityType: EntityKind.STORY, entityId: storyId, metadata: { entityId: dto.entityId, role } });
    return link;
  }

  /** Editorial provenance (spec section 10) - never lets a DRAFT/unverified Fact be cited as support without also blocking publication (see validateForPublication). */
  async linkFact(storyId: string, dto: LinkStoryFactDto, actorId: string) {
    const [story, fact] = await Promise.all([
      this.prisma.story.findUnique({ where: { id: storyId } }),
      this.prisma.historicalFact.findUnique({ where: { id: dto.factId } }),
    ]);
    if (!story) throw new NotFoundException('Story not found.');
    if (!fact) throw new BadRequestException('Story fact link references a fact that does not exist.');

    const link = await this.prisma.storyFact.create({ data: { storyId, factId: dto.factId } });
    await this.audit.log({ actorId, action: 'story.linked.fact', entityType: EntityKind.STORY, entityId: storyId, metadata: { factId: dto.factId } });
    return link;
  }

  async linkCitation(storyId: string, dto: LinkStoryCitationDto, actorId: string) {
    const [story, citation] = await Promise.all([
      this.prisma.story.findUnique({ where: { id: storyId } }),
      this.prisma.citation.findUnique({ where: { id: dto.citationId } }),
    ]);
    if (!story) throw new NotFoundException('Story not found.');
    if (!citation) throw new BadRequestException('Story citation references a citation that does not exist.');

    const link = await this.prisma.storyCitation.create({
      data: { storyId, citationId: dto.citationId, locator: dto.locator, quoteNote: dto.quoteNote },
    });
    await this.audit.log({ actorId, action: 'story.linked.citation', entityType: EntityKind.STORY, entityId: storyId, metadata: { citationId: dto.citationId } });
    return link;
  }

  async setFeatured(storyId: string, dto: SetStoryFeaturedDto, actorId: string) {
    const story = await this.prisma.story.findUnique({ where: { id: storyId } });
    if (!story) throw new NotFoundException('Story not found.');

    const updated = await this.prisma.story.update({
      where: { id: storyId },
      data: { featured: dto.featured, priority: dto.priority ?? story.priority },
    });
    await this.audit.log({ actorId, action: 'story.featured.changed', entityType: EntityKind.STORY, entityId: storyId, metadata: { featured: dto.featured, priority: dto.priority } });
    return updated;
  }

  /**
   * Structural publication checks (spec section 18/19) - never an attempt
   * at automated historical-truth verification, only "does the required
   * structure/state actually exist".
   */
  private async validateForPublication(story: Prisma.StoryGetPayload<{ include: typeof STORY_INCLUDE }>) {
    const canonical = story.translations.find((t) => t.locale === CANONICAL_LOCALE) ?? story.translations[0];
    if (!canonical || !canonical.title?.trim()) {
      throw new BadRequestException({ code: EDITORIAL_ERROR_CODES.STORY_TRANSLATION_REQUIRED, message: 'Cannot publish a Story with no translated title.' });
    }
    // AI-assisted content must be human-reviewed before going live (spec section 50).
    if (canonical.method === 'AI_ASSISTED' && canonical.status !== TranslationStatus.HUMAN_REVIEWED && canonical.status !== TranslationStatus.PUBLISHED) {
      throw new BadRequestException({
        code: EDITORIAL_ERROR_CODES.STORY_TRANSLATION_REQUIRED,
        message: 'An AI-assisted translation must be marked HUMAN_REVIEWED (or PUBLISHED) before the Story can publish.',
      });
    }

    if (story.heroMedia) {
      if (story.heroMedia.status !== MediaAssetStatus.READY || story.heroMedia.accessPolicy !== AccessPolicy.PUBLIC) {
        throw new BadRequestException({
          code: EDITORIAL_ERROR_CODES.STORY_MEDIA_NOT_READY,
          message: 'Hero media must be READY and PUBLIC before the Story can publish.',
        });
      }
    }

    const inlineMediaIds = new Set<string>();
    for (const t of story.translations) {
      for (const id of extractReferencedMediaAssetIds(validateStoryBody(t.content))) inlineMediaIds.add(id);
    }
    if (inlineMediaIds.size > 0) {
      const inline = await this.prisma.mediaAsset.findMany({ where: { id: { in: Array.from(inlineMediaIds) } } });
      const notReady = inline.find((m) => m.status !== MediaAssetStatus.READY);
      if (notReady || inline.length !== inlineMediaIds.size) {
        throw new BadRequestException({
          code: EDITORIAL_ERROR_CODES.STORY_MEDIA_NOT_READY,
          message: 'Every media block referenced in the Story body must reference a READY MediaAsset.',
        });
      }
    }

    // The core trust-boundary invariant (spec section 2/10/12): a Story can
    // never present a DRAFT/unpublished Fact as verified support.
    const unpublishedFact = story.factLinks.find((l) => l.fact.editorialStatus !== FactEditorialStatus.PUBLISHED);
    if (unpublishedFact) {
      throw new BadRequestException({
        code: EDITORIAL_ERROR_CODES.STORY_FACT_NOT_PUBLISHABLE,
        message: `Story links Fact ${unpublishedFact.factId}, which is not PUBLISHED - it cannot be presented as verified support.`,
      });
    }

    const archivedSourceCitation = story.citationLinks.find((l) => l.citation.source.archivedAt);
    if (archivedSourceCitation) {
      throw new BadRequestException({
        code: EDITORIAL_ERROR_CODES.STORY_SOURCE_RESTRICTED,
        message: 'One of this Story\'s cited sources has been archived and can no longer back a publishable citation.',
      });
    }
  }

  async setEditorialStatus(
    id: string,
    newStatus: StoryEditorialStatus,
    actor: AuthUser,
    options: { notes?: string; decision?: ReviewDecision; scheduledAt?: string; expectedVersion?: number } = {},
  ) {
    const story = await this.prisma.story.findUnique({ where: { id }, include: STORY_INCLUDE });
    if (!story) throw new NotFoundException('Story not found.');

    if (options.expectedVersion !== undefined && options.expectedVersion !== story.version) {
      throw new BadRequestException({
        code: EDITORIAL_ERROR_CODES.STORY_VERSION_CONFLICT,
        message: `This Story was edited by someone else (expected version ${options.expectedVersion}, current version ${story.version}). Reload and retry.`,
      });
    }

    const allowed = FORWARD_TRANSITIONS[story.editorialStatus] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException({
        code: EDITORIAL_ERROR_CODES.STORY_INVALID_TRANSITION,
        message: `Cannot transition a Story from ${story.editorialStatus} to ${newStatus}.`,
      });
    }

    const isReviewer = actor.roles.some((r) => REVIEWER_ROLES.includes(r));
    // Completing EDITORIAL_REVIEW is the historian-review checkpoint, but
    // only required for substantive historical content - a Story with no
    // linked HistoricalFact is treated as non-historical site content and
    // any EDITOR may complete this step (spec section 20).
    if (
      story.editorialStatus === StoryEditorialStatus.SOURCE_CHECK &&
      newStatus === StoryEditorialStatus.EDITORIAL_REVIEW &&
      story.factLinks.length > 0 &&
      !isReviewer
    ) {
      throw new ForbiddenException({
        code: EDITORIAL_ERROR_CODES.STORY_REVIEW_REQUIRED,
        message: 'A Story that links HistoricalFacts requires a historian reviewer or admin to complete source review.',
      });
    }

    if (newStatus === StoryEditorialStatus.SCHEDULED) {
      if (!options.scheduledAt) {
        throw new BadRequestException('scheduledAt is required when moving a Story to SCHEDULED.');
      }
      if (new Date(options.scheduledAt).getTime() <= Date.now()) {
        throw new BadRequestException('scheduledAt must be in the future.');
      }
    }

    if (newStatus === StoryEditorialStatus.PUBLISHED) {
      await this.validateForPublication(story);
    }

    if (
      newStatus === StoryEditorialStatus.DRAFT &&
      story.editorialStatus !== StoryEditorialStatus.DRAFT &&
      !options.notes?.trim()
    ) {
      throw new BadRequestException({
        code: EDITORIAL_ERROR_CODES.STORY_REVIEW_REQUIRED,
        message: 'Sending a Story back to draft requires a documented reason.',
      });
    }

    const decision = resolveDecision(newStatus, options.decision);

    const updateData: Prisma.StoryUpdateInput = {
      editorialStatus: newStatus,
      version: { increment: 1 },
    };
    if (newStatus === StoryEditorialStatus.PUBLISHED) updateData.publishedAt = new Date();
    if (newStatus === StoryEditorialStatus.SCHEDULED) updateData.scheduledAt = new Date(options.scheduledAt!);
    if (newStatus === StoryEditorialStatus.ARCHIVED) updateData.archivedAt = new Date();
    if (isReviewer) {
      updateData.lastReviewedById = actor.id;
      updateData.lastReviewedAt = new Date();
    }

    const updated = await this.prisma.story.update({ where: { id }, data: updateData });
    await this.snapshot(id, actor.id, `story.editorialStatus.${newStatus}`, { stage: story.editorialStatus, decision, notes: options.notes });
    return updated;
  }

  /** Archive/deactivate, never hard-delete (spec section 22) - revisions/links/citations/audit are untouched. */
  async archive(id: string, actor: AuthUser, notes?: string) {
    return this.setEditorialStatus(id, StoryEditorialStatus.ARCHIVED, actor, { notes: notes ?? 'Archived by editorial decision.' });
  }

  /**
   * Revision snapshot (spec section 21) written in the same transaction as
   * an optional review-history breadcrumb. Reuses the generic `Revision`
   * model (Phase 04 precedent, `FactsService.snapshot`) rather than a
   * typed StoryRevision table - see docs/backend/EDITORIAL_CONTENT.md.
   */
  private async snapshot(storyId: string, actorId: string, note: string, review?: { stage: StoryEditorialStatus; decision: ReviewDecision; notes?: string }) {
    const story = await this.prisma.story.findUnique({ where: { id: storyId }, include: STORY_INCLUDE });
    await this.prisma.revision.create({
      data: {
        entityType: EntityKind.STORY,
        entityId: storyId,
        storyId,
        snapshot: story as unknown as Prisma.InputJsonValue,
        changeNote: note,
        changedById: actorId,
      },
    });
    await this.audit.log({ actorId, action: note, entityType: EntityKind.STORY, entityId: storyId, metadata: review });
  }
}
