import { BadRequestException } from '@nestjs/common';
import { EntityKind, ModerationStatus } from '@prisma/client';
import { BookmarksService } from './bookmarks.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Spec Phase 08 section 24: a Bookmark must never reference a nonexistent or
 * unsupported target - `targetType`+`targetId` are always resolved
 * server-side before a bookmark is created.
 */
describe('BookmarksService.add target validation', () => {
  let prisma: any;
  let service: BookmarksService;

  beforeEach(() => {
    prisma = {
      place: { findUnique: jest.fn() },
      story: { findUnique: jest.fn() },
      journey: { findUnique: jest.fn() },
      communityStory: { findUnique: jest.fn() },
      bookmark: { upsert: jest.fn() },
    };
    service = new BookmarksService(prisma as unknown as PrismaService);
  });

  it('rejects an entity type that cannot be bookmarked (e.g. PERSON)', async () => {
    await expect(service.add('u1', EntityKind.PERSON, 'person-1')).rejects.toThrow(BadRequestException);
    expect(prisma.bookmark.upsert).not.toHaveBeenCalled();
  });

  it('rejects a Place id that does not exist', async () => {
    prisma.place.findUnique.mockResolvedValue(null);
    await expect(service.add('u1', EntityKind.PLACE, 'nonexistent')).rejects.toThrow(BadRequestException);
  });

  it('allows bookmarking a real Place', async () => {
    prisma.place.findUnique.mockResolvedValue({ id: 'place-1' });
    prisma.bookmark.upsert.mockResolvedValue({ id: 'b1' });
    await expect(service.add('u1', EntityKind.PLACE, 'place-1')).resolves.toBeDefined();
  });

  it('rejects bookmarking a REMOVED CommunityStory', async () => {
    prisma.communityStory.findUnique.mockResolvedValue({ id: 'cs1', moderationStatus: ModerationStatus.REMOVED });
    await expect(service.add('u1', EntityKind.COMMUNITY_STORY, 'cs1')).rejects.toThrow(BadRequestException);
  });

  it('allows bookmarking a VISIBLE CommunityStory', async () => {
    prisma.communityStory.findUnique.mockResolvedValue({ id: 'cs1', moderationStatus: ModerationStatus.VISIBLE });
    prisma.bookmark.upsert.mockResolvedValue({ id: 'b1' });
    await expect(service.add('u1', EntityKind.COMMUNITY_STORY, 'cs1')).resolves.toBeDefined();
  });
});
