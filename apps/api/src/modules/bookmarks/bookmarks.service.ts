import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityKind } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { COMMUNITY_ERROR_CODES } from '../../common/errors/community-error-codes';
import { PUBLIC_VISIBLE_STATUSES } from '../../common/moderation/public-visible-statuses.util';

/** Allowed bookmark targets (spec Phase 08 section 24) - deliberately not every EntityKind, so a bookmark can never point at, say, a raw Fact or a Comment. */
const BOOKMARKABLE_TYPES = new Set<EntityKind>([EntityKind.PLACE, EntityKind.STORY, EntityKind.JOURNEY, EntityKind.COMMUNITY_STORY]);

@Injectable()
export class BookmarksService {
  constructor(private readonly prisma: PrismaService) {}

  /** Never trusts `targetType`+`targetId` from the client - confirms the target actually exists (spec section 24/54). */
  private async assertTargetExists(targetType: EntityKind, targetId: string) {
    if (!BOOKMARKABLE_TYPES.has(targetType)) {
      throw new BadRequestException({ code: COMMUNITY_ERROR_CODES.BOOKMARK_INVALID_TARGET, message: `${targetType} cannot be bookmarked.` });
    }
    const exists = await (
      targetType === EntityKind.PLACE
        ? this.prisma.place.findUnique({ where: { id: targetId } })
        : targetType === EntityKind.STORY
          ? this.prisma.story.findUnique({ where: { id: targetId } })
          : targetType === EntityKind.JOURNEY
            ? this.prisma.journey.findUnique({ where: { id: targetId } })
            : this.prisma.communityStory.findUnique({ where: { id: targetId } })
    );
    if (!exists) {
      throw new BadRequestException({ code: COMMUNITY_ERROR_CODES.BOOKMARK_INVALID_TARGET, message: 'Bookmark target does not exist.' });
    }
    if (targetType === EntityKind.COMMUNITY_STORY && !PUBLIC_VISIBLE_STATUSES.includes((exists as { moderationStatus: string }).moderationStatus as any)) {
      throw new BadRequestException({ code: COMMUNITY_ERROR_CODES.BOOKMARK_INVALID_TARGET, message: 'This community story is not currently available.' });
    }
  }

  async add(userId: string, targetType: EntityKind, targetId: string) {
    await this.assertTargetExists(targetType, targetId);
    return this.prisma.bookmark.upsert({
      where: { userId_targetType_targetId: { userId, targetType, targetId } },
      update: {},
      create: { userId, targetType, targetId },
    });
  }

  async remove(userId: string, targetType: EntityKind, targetId: string) {
    const existing = await this.prisma.bookmark.findUnique({
      where: { userId_targetType_targetId: { userId, targetType, targetId } },
    });
    if (!existing) throw new NotFoundException('Bookmark not found.');
    await this.prisma.bookmark.delete({ where: { id: existing.id } });
    return { removed: true };
  }

  /** Private by default - only the owning user's own bookmarks are ever returned; there is no public bookmark listing route (spec section 27). */
  async list(userId: string, targetType?: EntityKind) {
    return this.prisma.bookmark.findMany({
      where: { userId, targetType },
      orderBy: { createdAt: 'desc' },
    });
  }
}
