import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityKind, ModerationStatus, PublicationStatus, StoryEditorialStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { decodeCursor, encodeCursor } from '../../common/pagination/cursor.util';
import { assertSafeUserContent } from '../../common/util/content-safety.util';
import { COMMUNITY_ERROR_CODES } from '../../common/errors/community-error-codes';
import { PUBLIC_VISIBLE_STATUSES, TOMBSTONE_STATUSES } from '../../common/moderation/public-visible-statuses.util';

/** Comment depth is 0-indexed; MAX_DEPTH=2 allows three visual nesting levels (0, 1, 2) per spec section 31. A reply to a depth-2 comment would be depth 3 and is rejected. */
const MAX_DEPTH = 2;

/** Entity types comments actually support (spec section 29) - everything else is rejected, never silently accepted. */
const COMMENTABLE_TYPES = new Set<EntityKind>([
  EntityKind.PLACE,
  EntityKind.PERSON,
  EntityKind.EVENT,
  EntityKind.STORY,
  EntityKind.COMMUNITY_STORY,
  EntityKind.JOURNEY,
  EntityKind.SOURCE,
]);

@Injectable()
export class CommentsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  /**
   * Validates a comment target exists and is publicly commentable (spec
   * section 54/55) - never trusts `targetType`+`targetId` from the client.
   * Returns whether the target itself is locked to new top-level comments.
   */
  private async assertTargetAvailable(targetType: EntityKind, targetId: string): Promise<{ locked: boolean }> {
    if (!COMMENTABLE_TYPES.has(targetType)) {
      throw new BadRequestException({ code: COMMUNITY_ERROR_CODES.COMMENT_TARGET_NOT_AVAILABLE, message: `${targetType} is not a commentable entity type.` });
    }

    switch (targetType) {
      case EntityKind.PLACE: {
        const row = await this.prisma.place.findUnique({ where: { id: targetId } });
        if (!row || row.publicationStatus !== PublicationStatus.PUBLISHED) break;
        return { locked: false };
      }
      case EntityKind.PERSON: {
        const row = await this.prisma.person.findUnique({ where: { id: targetId } });
        if (!row || row.publicationStatus !== PublicationStatus.PUBLISHED) break;
        return { locked: false };
      }
      case EntityKind.EVENT: {
        const row = await this.prisma.historicalEvent.findUnique({ where: { id: targetId } });
        if (!row || row.publicationStatus !== PublicationStatus.PUBLISHED) break;
        return { locked: false };
      }
      case EntityKind.STORY: {
        const row = await this.prisma.story.findUnique({ where: { id: targetId } });
        if (!row || row.editorialStatus !== StoryEditorialStatus.PUBLISHED) break;
        return { locked: false };
      }
      case EntityKind.JOURNEY: {
        const row = await this.prisma.journey.findUnique({ where: { id: targetId } });
        if (!row || row.editorialStatus !== PublicationStatus.PUBLISHED) break;
        return { locked: false };
      }
      case EntityKind.SOURCE: {
        const row = await this.prisma.source.findUnique({ where: { id: targetId } });
        if (!row) break;
        return { locked: false };
      }
      case EntityKind.COMMUNITY_STORY: {
        const row = await this.prisma.communityStory.findUnique({ where: { id: targetId } });
        if (!row || !PUBLIC_VISIBLE_STATUSES.includes(row.moderationStatus)) break;
        return { locked: row.moderationStatus === ModerationStatus.LOCKED };
      }
    }
    throw new BadRequestException({ code: COMMUNITY_ERROR_CODES.COMMENT_TARGET_NOT_AVAILABLE, message: 'This target does not exist or is not currently open to comments.' });
  }

  /** Bounded to MAX_DEPTH levels via nested `include` - never an unbounded recursive fetch (spec section 32). */
  async list(targetType: EntityKind, targetId: string, pagination: { cursor?: string; limit: number }) {
    const cursor = decodeCursor<{ id: string }>(pagination.cursor);
    const comments = await this.prisma.comment.findMany({
      where: { targetType, targetId, parentId: null },
      orderBy: { createdAt: 'desc' },
      take: pagination.limit + 1,
      ...(cursor ? { cursor: { id: cursor.id }, skip: 1 } : {}),
      include: this.repliesInclude(),
    });

    const hasMore = comments.length > pagination.limit;
    const page = comments.slice(0, pagination.limit);
    return {
      items: page.map((c) => this.toPublicComment(c)),
      nextCursor: hasMore ? encodeCursor({ id: page[page.length - 1].id }) : null,
      hasMore,
    };
  }

  /** Nested `include`, MAX_DEPTH levels deep - matches the depth the create() path can ever produce, so no reply is ever silently dropped from the tree. */
  private repliesInclude(): any {
    const authorSelect = { select: { id: true, displayName: true, avatarMediaId: true } };
    let include: any = { author: authorSelect };
    for (let i = 0; i < MAX_DEPTH; i++) {
      include = { author: authorSelect, replies: { orderBy: { createdAt: 'asc' as const }, include } };
    }
    return include;
  }

  /** REMOVED/UNDER_REVIEW comments are tombstoned (body/author redacted) rather than dropped, so their replies keep their place in the thread (spec section 34). */
  private toPublicComment(comment: any): any {
    const tombstoned = TOMBSTONE_STATUSES.includes(comment.status);
    return {
      id: comment.id,
      parentId: comment.parentId,
      depth: comment.depth,
      status: comment.status,
      body: tombstoned ? null : comment.body,
      author: tombstoned ? null : comment.author,
      score: comment.score,
      editedAt: comment.editedAt,
      createdAt: comment.createdAt,
      replies: (comment.replies ?? []).map((r: any) => this.toPublicComment(r)),
    };
  }

  async create(authorId: string, targetType: EntityKind, targetId: string, body: string, parentId?: string) {
    assertSafeUserContent(body);
    const { locked: targetLocked } = await this.assertTargetAvailable(targetType, targetId);

    let depth = 0;
    if (parentId) {
      const parent = await this.prisma.comment.findUnique({ where: { id: parentId } });
      if (!parent || parent.targetType !== targetType || parent.targetId !== targetId) {
        throw new BadRequestException('Parent comment does not belong to this target.');
      }
      if (parent.status === ModerationStatus.LOCKED) {
        throw new ForbiddenException({ code: COMMUNITY_ERROR_CODES.COMMENT_THREAD_LOCKED, message: 'This comment is locked and cannot receive new replies.' });
      }
      if (parent.depth >= MAX_DEPTH) {
        throw new BadRequestException({ code: COMMUNITY_ERROR_CODES.COMMENT_MAX_DEPTH, message: `Replies cannot nest more than ${MAX_DEPTH + 1} levels deep.` });
      }
      depth = parent.depth + 1;
    } else if (targetLocked) {
      throw new ForbiddenException({ code: COMMUNITY_ERROR_CODES.COMMENT_THREAD_LOCKED, message: 'This discussion is locked and cannot receive new comments.' });
    }

    return this.prisma.comment.create({
      data: { authorId, targetType, targetId, body, parentId, depth },
    });
  }

  /** Self-voting is disallowed; a removed/under-review comment cannot receive new public votes (spec section 35). */
  async vote(userId: string, commentId: string, value: 1 | -1) {
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) throw new NotFoundException({ code: COMMUNITY_ERROR_CODES.COMMENT_NOT_FOUND, message: 'Comment not found.' });
    if (comment.authorId === userId) {
      throw new ForbiddenException({ code: COMMUNITY_ERROR_CODES.VOTE_SELF_NOT_ALLOWED, message: 'Cannot vote your own comment.' });
    }
    if (TOMBSTONE_STATUSES.includes(comment.status)) {
      throw new BadRequestException({ code: COMMUNITY_ERROR_CODES.VOTE_TARGET_NOT_AVAILABLE, message: 'This comment cannot receive votes right now.' });
    }

    const existing = await this.prisma.commentVote.findUnique({
      where: { commentId_userId: { commentId, userId } },
    });

    await this.prisma.$transaction(async (tx) => {
      if (existing) {
        if (existing.value === value) {
          await tx.commentVote.delete({ where: { id: existing.id } });
          await tx.comment.update({ where: { id: commentId }, data: { score: { decrement: value } } });
          return;
        }
        await tx.commentVote.update({ where: { id: existing.id }, data: { value } });
        await tx.comment.update({ where: { id: commentId }, data: { score: { increment: value * 2 } } });
        return;
      }
      await tx.commentVote.create({ data: { commentId, userId, value } });
      await tx.comment.update({ where: { id: commentId }, data: { score: { increment: value } } });
    });

    return { voted: true };
  }

  async moderate(actorId: string, commentId: string, status: ModerationStatus, reason?: string) {
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) throw new NotFoundException({ code: COMMUNITY_ERROR_CODES.COMMENT_NOT_FOUND, message: 'Comment not found.' });
    if (comment.authorId === actorId) {
      throw new ForbiddenException({ code: COMMUNITY_ERROR_CODES.MODERATION_FORBIDDEN, message: 'Cannot moderate your own comment.' });
    }
    const updated = await this.prisma.comment.update({ where: { id: commentId }, data: { status } });
    await this.audit.log({
      actorId,
      action: 'comment.moderated',
      entityType: EntityKind.COMMENT,
      entityId: commentId,
      metadata: { status, reason },
    });
    return updated;
  }

  /** Author self-edit (spec section 33) - never touches score/authorId/target/status. */
  async update(userId: string, commentId: string, body: string) {
    assertSafeUserContent(body);
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) throw new NotFoundException({ code: COMMUNITY_ERROR_CODES.COMMENT_NOT_FOUND, message: 'Comment not found.' });
    if (comment.authorId !== userId) {
      throw new ForbiddenException({ code: COMMUNITY_ERROR_CODES.COMMENT_NOT_EDITABLE, message: 'Not the author of this comment.' });
    }
    return this.prisma.comment.update({ where: { id: commentId }, data: { body, editedAt: new Date() } });
  }

  /** Soft-delete/tombstone (spec section 34) - replies are untouched and keep their place in the tree via `toPublicComment`'s status-based redaction. */
  async remove(userId: string, commentId: string) {
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) throw new NotFoundException({ code: COMMUNITY_ERROR_CODES.COMMENT_NOT_FOUND, message: 'Comment not found.' });
    if (comment.authorId !== userId) throw new ForbiddenException('Not the author of this comment.');
    return this.prisma.comment.update({ where: { id: commentId }, data: { status: ModerationStatus.REMOVED } });
  }
}
