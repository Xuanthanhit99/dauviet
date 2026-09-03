import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityKind, ModerationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { decodeCursor, encodeCursor } from '../../common/pagination/cursor.util';

const VISIBLE_STATUSES: ModerationStatus[] = [ModerationStatus.VISIBLE, ModerationStatus.LIMITED];

@Injectable()
export class CommentsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list(targetType: EntityKind, targetId: string, pagination: { cursor?: string; limit: number }) {
    const cursor = decodeCursor<{ id: string }>(pagination.cursor);
    const comments = await this.prisma.comment.findMany({
      where: { targetType, targetId, status: { in: VISIBLE_STATUSES }, parentId: null },
      orderBy: { createdAt: 'desc' },
      take: pagination.limit + 1,
      ...(cursor ? { cursor: { id: cursor.id }, skip: 1 } : {}),
      include: {
        author: { select: { id: true, displayName: true, avatarMediaId: true } },
        replies: {
          where: { status: { in: VISIBLE_STATUSES } },
          orderBy: { createdAt: 'asc' },
          include: { author: { select: { id: true, displayName: true, avatarMediaId: true } } },
        },
      },
    });

    const hasMore = comments.length > pagination.limit;
    const page = comments.slice(0, pagination.limit);
    return {
      items: page,
      nextCursor: hasMore ? encodeCursor({ id: page[page.length - 1].id }) : null,
      hasMore,
    };
  }

  async create(authorId: string, targetType: EntityKind, targetId: string, body: string, parentId?: string) {
    if (parentId) {
      const parent = await this.prisma.comment.findUnique({ where: { id: parentId } });
      if (!parent || parent.targetType !== targetType || parent.targetId !== targetId) {
        throw new BadRequestException('Parent comment does not belong to this target.');
      }
    }
    return this.prisma.comment.create({
      data: { authorId, targetType, targetId, body, parentId },
    });
  }

  async vote(userId: string, commentId: string, value: 1 | -1) {
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) throw new NotFoundException('Comment not found.');

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

  async moderate(actorId: string, commentId: string, status: ModerationStatus) {
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) throw new NotFoundException('Comment not found.');
    const updated = await this.prisma.comment.update({ where: { id: commentId }, data: { status } });
    await this.audit.log({
      actorId,
      action: 'comment.moderated',
      entityType: EntityKind.COMMENT,
      entityId: commentId,
      metadata: { status },
    });
    return updated;
  }

  async remove(userId: string, commentId: string) {
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) throw new NotFoundException('Comment not found.');
    if (comment.authorId !== userId) throw new ForbiddenException('Not the author of this comment.');
    return this.prisma.comment.update({ where: { id: commentId }, data: { status: ModerationStatus.REMOVED } });
  }
}
