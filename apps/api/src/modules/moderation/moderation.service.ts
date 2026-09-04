import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityKind, ModerationStatus, ReportCategory, ReportStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ReportsService } from '../reports/reports.service';
import { CommunityService } from '../community/community.service';
import { CommentsService } from '../comments/comments.service';

/** The unified `POST /admin/moderation/actions` verb set (spec section 40/69) - each maps to the same ModerationStatus values the individual PATCH endpoints already use, so both entrypoints stay consistent. */
export type ModerationActionVerb = 'REMOVE' | 'RESTORE' | 'LIMIT' | 'LOCK' | 'UNLOCK' | 'MARK_UNDER_REVIEW';

const ACTION_TO_STATUS: Record<ModerationActionVerb, ModerationStatus> = {
  REMOVE: ModerationStatus.REMOVED,
  RESTORE: ModerationStatus.VISIBLE,
  LIMIT: ModerationStatus.LIMITED,
  LOCK: ModerationStatus.LOCKED,
  UNLOCK: ModerationStatus.VISIBLE,
  MARK_UNDER_REVIEW: ModerationStatus.UNDER_REVIEW,
};

const MODERATABLE_TYPES = new Set<EntityKind>([EntityKind.COMMUNITY_STORY, EntityKind.COMMENT]);

/**
 * Thin coordination layer over the existing per-domain moderation setters
 * (`CommunityService.setModerationStatus`, `CommentsService.moderate`) - it
 * does not reimplement their logic (author-cannot-self-moderate, audit
 * logging), just gives moderators one queryable, unified entrypoint per spec
 * section 47/48/69 on top of what already existed.
 */
@Injectable()
export class ModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly community: CommunityService,
    private readonly comments: CommentsService,
  ) {}

  async queue(filters: { status?: ReportStatus; targetType?: EntityKind; category?: ReportCategory; from?: string; to?: string }) {
    return this.reports.queue({
      status: filters.status,
      targetType: filters.targetType,
      category: filters.category,
      from: filters.from ? new Date(filters.from) : undefined,
      to: filters.to ? new Date(filters.to) : undefined,
    });
  }

  /**
   * Moderator-only inspection view (spec section 48) - target content,
   * reports, and prior moderation actions. Never includes the author's
   * password/sessions/email - only the same safe subset a public profile
   * would show, plus `status`/`roles` since a moderator needs to know if the
   * account is already suspended.
   */
  async detail(targetType: EntityKind, targetId: string) {
    if (!MODERATABLE_TYPES.has(targetType)) {
      throw new BadRequestException(`${targetType} has no moderation detail view.`);
    }

    const [reports, previousActions] = await Promise.all([
      this.reports.forTarget(targetType, targetId),
      this.prisma.auditLog.findMany({
        where: { entityType: targetType, entityId: targetId, action: { in: ['communityStory.moderated', 'communityStory.withdrawn', 'comment.moderated'] } },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { actor: { select: { id: true, displayName: true } } },
      }),
    ]);

    let content: unknown;
    let author: { id: string; displayName: string; status: string; roles: string[] } | null = null;

    if (targetType === EntityKind.COMMUNITY_STORY) {
      const story = await this.prisma.communityStory.findUnique({
        where: { id: targetId },
        include: { translations: true, author: { select: { id: true, displayName: true, status: true, roles: true } }, heroMedia: true },
      });
      if (!story) throw new NotFoundException('Community story not found.');
      author = story.author;
      content = story;
    } else {
      const comment = await this.prisma.comment.findUnique({
        where: { id: targetId },
        include: { author: { select: { id: true, displayName: true, status: true, roles: true } } },
      });
      if (!comment) throw new NotFoundException('Comment not found.');
      author = comment.author;
      content = comment;
    }

    return { content, author, reports, previousActions };
  }

  async action(actorId: string, targetType: EntityKind, targetId: string, verb: ModerationActionVerb, reason?: string) {
    if (!MODERATABLE_TYPES.has(targetType)) {
      throw new BadRequestException(`${targetType} cannot be moderated through this endpoint.`);
    }
    const status = ACTION_TO_STATUS[verb];
    if (targetType === EntityKind.COMMUNITY_STORY) {
      return this.community.setModerationStatus(actorId, targetId, status, reason);
    }
    return this.comments.moderate(actorId, targetId, status, reason);
  }
}
