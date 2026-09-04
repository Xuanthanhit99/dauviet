import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EntityKind, ModerationStatus, PublicationStatus, StoryEditorialStatus } from '@prisma/client';
import { CommentsService } from './comments.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * Spec Phase 08 section 29/54/55: comments must never trust a client-supplied
 * `targetType`+`targetId` - every target is resolved and its publication
 * state checked before a comment/reply is allowed.
 */
describe('CommentsService target validation', () => {
  let prisma: any;
  let service: CommentsService;

  beforeEach(() => {
    prisma = {
      place: { findUnique: jest.fn() },
      person: { findUnique: jest.fn() },
      historicalEvent: { findUnique: jest.fn() },
      story: { findUnique: jest.fn() },
      journey: { findUnique: jest.fn() },
      source: { findUnique: jest.fn() },
      communityStory: { findUnique: jest.fn() },
      comment: { findUnique: jest.fn(), create: jest.fn() },
    };
    service = new CommentsService(prisma as unknown as PrismaService, { log: jest.fn() } as unknown as AuditService);
  });

  it('rejects an entity type comments do not support at all (e.g. FACT)', async () => {
    await expect(service.create('u1', EntityKind.FACT, 'fact-1', 'hello')).rejects.toThrow(BadRequestException);
  });

  it('rejects a comment on a DRAFT Place', async () => {
    prisma.place.findUnique.mockResolvedValue({ id: 'p1', publicationStatus: PublicationStatus.DRAFT });
    await expect(service.create('u1', EntityKind.PLACE, 'p1', 'hello')).rejects.toThrow(BadRequestException);
  });

  it('rejects a comment on a nonexistent Place', async () => {
    prisma.place.findUnique.mockResolvedValue(null);
    await expect(service.create('u1', EntityKind.PLACE, 'missing', 'hello')).rejects.toThrow(BadRequestException);
  });

  it('allows a comment on a PUBLISHED Place', async () => {
    prisma.place.findUnique.mockResolvedValue({ id: 'p1', publicationStatus: PublicationStatus.PUBLISHED });
    prisma.comment.create.mockResolvedValue({ id: 'c1' });
    await service.create('u1', EntityKind.PLACE, 'p1', 'hello');
    expect(prisma.comment.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ depth: 0 }) }));
  });

  it('rejects a comment on a draft editorial Story (editorialStatus != PUBLISHED)', async () => {
    prisma.story.findUnique.mockResolvedValue({ id: 's1', editorialStatus: StoryEditorialStatus.DRAFT });
    await expect(service.create('u1', EntityKind.STORY, 's1', 'hello')).rejects.toThrow(BadRequestException);
  });

  it('rejects a comment on an unpublished Journey', async () => {
    prisma.journey.findUnique.mockResolvedValue({ id: 'j1', editorialStatus: PublicationStatus.DRAFT });
    await expect(service.create('u1', EntityKind.JOURNEY, 'j1', 'hello')).rejects.toThrow(BadRequestException);
  });

  it('rejects a comment on a hidden (UNDER_REVIEW) CommunityStory', async () => {
    prisma.communityStory.findUnique.mockResolvedValue({ id: 'cs1', moderationStatus: ModerationStatus.UNDER_REVIEW });
    await expect(service.create('u1', EntityKind.COMMUNITY_STORY, 'cs1', 'hello')).rejects.toThrow(BadRequestException);
  });

  it('rejects a comment on a REMOVED CommunityStory', async () => {
    prisma.communityStory.findUnique.mockResolvedValue({ id: 'cs1', moderationStatus: ModerationStatus.REMOVED });
    await expect(service.create('u1', EntityKind.COMMUNITY_STORY, 'cs1', 'hello')).rejects.toThrow(BadRequestException);
  });

  it('allows a comment on a VISIBLE CommunityStory', async () => {
    prisma.communityStory.findUnique.mockResolvedValue({ id: 'cs1', moderationStatus: ModerationStatus.VISIBLE });
    prisma.comment.create.mockResolvedValue({ id: 'c1' });
    await expect(service.create('u1', EntityKind.COMMUNITY_STORY, 'cs1', 'hello')).resolves.toBeDefined();
  });

  it('rejects a new top-level comment on a LOCKED CommunityStory thread', async () => {
    prisma.communityStory.findUnique.mockResolvedValue({ id: 'cs1', moderationStatus: ModerationStatus.LOCKED });
    await expect(service.create('u1', EntityKind.COMMUNITY_STORY, 'cs1', 'hello')).rejects.toThrow(ForbiddenException);
  });
});

describe('CommentsService reply depth', () => {
  let prisma: any;
  let service: CommentsService;

  beforeEach(() => {
    prisma = {
      place: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', publicationStatus: PublicationStatus.PUBLISHED }) },
      comment: { findUnique: jest.fn(), create: jest.fn().mockResolvedValue({ id: 'new' }) },
    };
    service = new CommentsService(prisma as unknown as PrismaService, { log: jest.fn() } as unknown as AuditService);
  });

  it('a reply to a depth-0 comment is created at depth 1', async () => {
    prisma.comment.findUnique.mockResolvedValue({ id: 'parent', targetType: EntityKind.PLACE, targetId: 'p1', depth: 0, status: ModerationStatus.VISIBLE });
    await service.create('u1', EntityKind.PLACE, 'p1', 'reply', 'parent');
    expect(prisma.comment.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ depth: 1 }) }));
  });

  it('a reply to a depth-2 comment (the maximum) is rejected, not silently created deeper', async () => {
    prisma.comment.findUnique.mockResolvedValue({ id: 'parent', targetType: EntityKind.PLACE, targetId: 'p1', depth: 2, status: ModerationStatus.VISIBLE });
    await expect(service.create('u1', EntityKind.PLACE, 'p1', 'reply', 'parent')).rejects.toThrow(BadRequestException);
    expect(prisma.comment.create).not.toHaveBeenCalled();
  });

  it('rejects a reply whose parent belongs to a different target', async () => {
    prisma.comment.findUnique.mockResolvedValue({ id: 'parent', targetType: EntityKind.PLACE, targetId: 'other-place', depth: 0, status: ModerationStatus.VISIBLE });
    await expect(service.create('u1', EntityKind.PLACE, 'p1', 'reply', 'parent')).rejects.toThrow(BadRequestException);
  });

  it('rejects a reply to a LOCKED parent comment', async () => {
    prisma.comment.findUnique.mockResolvedValue({ id: 'parent', targetType: EntityKind.PLACE, targetId: 'p1', depth: 0, status: ModerationStatus.LOCKED });
    await expect(service.create('u1', EntityKind.PLACE, 'p1', 'reply', 'parent')).rejects.toThrow(ForbiddenException);
  });
});

describe('CommentsService content safety', () => {
  let prisma: any;
  let service: CommentsService;

  beforeEach(() => {
    prisma = { place: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', publicationStatus: PublicationStatus.PUBLISHED }) }, comment: { create: jest.fn() } };
    service = new CommentsService(prisma as unknown as PrismaService, { log: jest.fn() } as unknown as AuditService);
  });

  it('rejects a comment body containing an HTML/script payload', async () => {
    await expect(service.create('u1', EntityKind.PLACE, 'p1', '<script>alert(1)</script>')).rejects.toThrow(BadRequestException);
    expect(prisma.comment.create).not.toHaveBeenCalled();
  });

  it('rejects a comment with too many links', async () => {
    const body = Array.from({ length: 6 }, (_, i) => `http://example.com/${i}`).join(' ');
    await expect(service.create('u1', EntityKind.PLACE, 'p1', body)).rejects.toThrow(BadRequestException);
  });
});

describe('CommentsService.vote', () => {
  let prisma: any;
  let service: CommentsService;

  beforeEach(() => {
    prisma = {
      comment: { findUnique: jest.fn(), update: jest.fn() },
      commentVote: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
      $transaction: jest.fn(async (cb: any) => cb(prisma)),
    };
    service = new CommentsService(prisma as unknown as PrismaService, { log: jest.fn() } as unknown as AuditService);
  });

  it('rejects self-voting your own comment', async () => {
    prisma.comment.findUnique.mockResolvedValue({ id: 'c1', authorId: 'u1', status: ModerationStatus.VISIBLE });
    await expect(service.vote('u1', 'c1', 1)).rejects.toThrow(ForbiddenException);
  });

  it('rejects voting on a REMOVED comment', async () => {
    prisma.comment.findUnique.mockResolvedValue({ id: 'c1', authorId: 'someone-else', status: ModerationStatus.REMOVED });
    await expect(service.vote('u1', 'c1', 1)).rejects.toThrow(BadRequestException);
  });

  it('404s voting on a nonexistent comment', async () => {
    prisma.comment.findUnique.mockResolvedValue(null);
    await expect(service.vote('u1', 'c1', 1)).rejects.toThrow(NotFoundException);
  });

  it('allows voting on another user\'s VISIBLE comment', async () => {
    prisma.comment.findUnique.mockResolvedValue({ id: 'c1', authorId: 'someone-else', status: ModerationStatus.VISIBLE });
    prisma.commentVote.findUnique.mockResolvedValue(null);
    const result = await service.vote('u1', 'c1', 1);
    expect(result.voted).toBe(true);
  });
});

/** Spec section 34: replies must survive parent removal; a REMOVED/UNDER_REVIEW comment is tombstoned (body/author redacted), never dropped from the tree. */
describe('CommentsService.list tombstoning', () => {
  let prisma: any;
  let service: CommentsService;

  beforeEach(() => {
    prisma = { comment: { findMany: jest.fn() } };
    service = new CommentsService(prisma as unknown as PrismaService, { log: jest.fn() } as unknown as AuditService);
  });

  it('a REMOVED top-level comment stays in the list with its replies intact, but its body/author are redacted', async () => {
    prisma.comment.findMany.mockResolvedValue([
      {
        id: 'parent',
        parentId: null,
        depth: 0,
        status: ModerationStatus.REMOVED,
        body: 'deleted content',
        author: { id: 'u1', displayName: 'Someone' },
        score: 0,
        editedAt: null,
        createdAt: new Date(),
        replies: [
          {
            id: 'child',
            parentId: 'parent',
            depth: 1,
            status: ModerationStatus.VISIBLE,
            body: 'still here',
            author: { id: 'u2', displayName: 'Reply Author' },
            score: 0,
            editedAt: null,
            createdAt: new Date(),
            replies: [],
          },
        ],
      },
    ]);

    const result = await service.list(EntityKind.PLACE, 'p1', { limit: 20 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].body).toBeNull();
    expect(result.items[0].author).toBeNull();
    expect(result.items[0].replies).toHaveLength(1);
    expect(result.items[0].replies[0].body).toBe('still here');
  });
});

describe('CommentsService.moderate', () => {
  let prisma: any;
  let service: CommentsService;

  beforeEach(() => {
    prisma = { comment: { findUnique: jest.fn(), update: jest.fn() } };
    service = new CommentsService(prisma as unknown as PrismaService, { log: jest.fn() } as unknown as AuditService);
  });

  it('refuses to let a moderator moderate their own comment', async () => {
    prisma.comment.findUnique.mockResolvedValue({ id: 'c1', authorId: 'mod-1' });
    await expect(service.moderate('mod-1', 'c1', ModerationStatus.REMOVED)).rejects.toThrow(ForbiddenException);
    expect(prisma.comment.update).not.toHaveBeenCalled();
  });
});

describe('CommentsService.remove/update', () => {
  let prisma: any;
  let service: CommentsService;

  beforeEach(() => {
    prisma = { comment: { findUnique: jest.fn(), update: jest.fn() } };
    service = new CommentsService(prisma as unknown as PrismaService, { log: jest.fn() } as unknown as AuditService);
  });

  it('a non-author cannot edit someone else\'s comment', async () => {
    prisma.comment.findUnique.mockResolvedValue({ id: 'c1', authorId: 'author-1' });
    await expect(service.update('someone-else', 'c1', 'edited')).rejects.toThrow(ForbiddenException);
  });

  it('the author can edit their own comment, stamping editedAt', async () => {
    prisma.comment.findUnique.mockResolvedValue({ id: 'c1', authorId: 'author-1' });
    prisma.comment.update.mockResolvedValue({ id: 'c1' });
    await service.update('author-1', 'c1', 'edited');
    expect(prisma.comment.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { body: 'edited', editedAt: expect.any(Date) } });
  });

  it('a non-author cannot remove someone else\'s comment', async () => {
    prisma.comment.findUnique.mockResolvedValue({ id: 'c1', authorId: 'author-1' });
    await expect(service.remove('someone-else', 'c1')).rejects.toThrow(ForbiddenException);
  });
});
