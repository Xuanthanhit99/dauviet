import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CommunityStoryType, CommunityVerificationState, ModerationStatus } from '@prisma/client';
import { CommunityService } from './community.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MediaService } from '../media/media.service';

/**
 * Covers spec section 57 test #8: community content cannot silently become
 * verified historical knowledge. An author can attach a source, but only a
 * separate reviewer-gated method (enforced by @Roles at the controller) can
 * ever set VERIFIED_CONTRIBUTION.
 */
describe('CommunityService.setAuthorVerificationState', () => {
  let prisma: { communityStory: { findUnique: jest.Mock; update: jest.Mock } };
  let audit: { log: jest.Mock };
  let service: CommunityService;

  beforeEach(() => {
    prisma = { communityStory: { findUnique: jest.fn(), update: jest.fn() } };
    audit = { log: jest.fn() };
    service = new CommunityService(prisma as unknown as PrismaService, audit as unknown as AuditService, {} as any);
  });

  it('allows an author to mark their own story SOURCE_ATTACHED', async () => {
    prisma.communityStory.findUnique.mockResolvedValue({ id: 'story-1', authorId: 'author-1' });
    prisma.communityStory.update.mockResolvedValue({ id: 'story-1', verificationState: 'SOURCE_ATTACHED' });

    const result = await service.setAuthorVerificationState('story-1', 'author-1', CommunityVerificationState.SOURCE_ATTACHED);
    expect(result.verificationState).toBe('SOURCE_ATTACHED');
  });

  it('never allows an author to self-assign VERIFIED_CONTRIBUTION', async () => {
    prisma.communityStory.findUnique.mockResolvedValue({ id: 'story-1', authorId: 'author-1' });

    await expect(
      service.setAuthorVerificationState('story-1', 'author-1', CommunityVerificationState.VERIFIED_CONTRIBUTION),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.communityStory.update).not.toHaveBeenCalled();
  });

  it('never allows an author to self-assign UNDER_REVIEW', async () => {
    prisma.communityStory.findUnique.mockResolvedValue({ id: 'story-1', authorId: 'author-1' });

    await expect(
      service.setAuthorVerificationState('story-1', 'author-1', CommunityVerificationState.UNDER_REVIEW),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects a non-author from changing the state', async () => {
    prisma.communityStory.findUnique.mockResolvedValue({ id: 'story-1', authorId: 'author-1' });

    await expect(
      service.setAuthorVerificationState('story-1', 'someone-else', CommunityVerificationState.SOURCE_ATTACHED),
    ).rejects.toThrow(ForbiddenException);
  });
});

/** Spec section 41/42: separation of duties for review/moderation - an editor/moderator who is also the author is refused, holding the role never overrides being an interested party. */
describe('CommunityService review/moderation self-action boundary', () => {
  let prisma: any;
  let service: CommunityService;

  beforeEach(() => {
    prisma = { communityStory: { findUnique: jest.fn(), update: jest.fn() } };
    service = new CommunityService(prisma as unknown as PrismaService, { log: jest.fn() } as unknown as AuditService, {} as any);
  });

  it('refuses to let the author review their own story even if they hold HISTORIAN_REVIEWER', async () => {
    prisma.communityStory.findUnique.mockResolvedValue({ id: 'story-1', authorId: 'reviewer-1' });
    await expect(service.setReviewVerificationState('reviewer-1', 'story-1', CommunityVerificationState.VERIFIED_CONTRIBUTION)).rejects.toThrow(ForbiddenException);
    expect(prisma.communityStory.update).not.toHaveBeenCalled();
  });

  it('a different reviewer can set VERIFIED_CONTRIBUTION', async () => {
    prisma.communityStory.findUnique.mockResolvedValue({ id: 'story-1', authorId: 'author-1' });
    prisma.communityStory.update.mockResolvedValue({ id: 'story-1', verificationState: 'VERIFIED_CONTRIBUTION' });
    const result = await service.setReviewVerificationState('reviewer-1', 'story-1', CommunityVerificationState.VERIFIED_CONTRIBUTION);
    expect(result.verificationState).toBe('VERIFIED_CONTRIBUTION');
  });

  it('refuses to let the author restore/remove their own story even if they hold MODERATOR', async () => {
    prisma.communityStory.findUnique.mockResolvedValue({ id: 'story-1', authorId: 'mod-1' });
    await expect(service.setModerationStatus('mod-1', 'story-1', ModerationStatus.REMOVED)).rejects.toThrow(ForbiddenException);
    expect(prisma.communityStory.update).not.toHaveBeenCalled();
  });

  it('a different moderator can remove the story', async () => {
    prisma.communityStory.findUnique.mockResolvedValue({ id: 'story-1', authorId: 'author-1' });
    prisma.communityStory.update.mockResolvedValue({ id: 'story-1', moderationStatus: 'REMOVED' });
    const result = await service.setModerationStatus('mod-1', 'story-1', ModerationStatus.REMOVED, 'spam');
    expect(result.moderationStatus).toBe('REMOVED');
  });
});

/** Spec section 12/13: server-controlled authorship, safe content, and never accepting client-supplied moderation/verification fields. */
describe('CommunityService.create', () => {
  let prisma: any;
  let media: { assertOwnedByOrPrivileged: jest.Mock };
  let service: CommunityService;

  beforeEach(() => {
    prisma = {
      communityStory: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
      thenNowComparison: { findUnique: jest.fn() },
    };
    media = { assertOwnedByOrPrivileged: jest.fn() };
    service = new CommunityService(prisma as unknown as PrismaService, { log: jest.fn() } as unknown as AuditService, media as unknown as MediaService);
  });

  const actor = { id: 'author-1', roles: ['USER'] };
  const dto = () => ({ type: CommunityStoryType.MEMORY, translations: [{ locale: 'vi', title: 'Ky uc cua toi' }] });

  it('assigns authorId from the server-side actor, never from the request body', async () => {
    prisma.communityStory.create.mockResolvedValue({ id: 's1', translations: [] });
    await service.create(dto(), actor);
    expect(prisma.communityStory.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ authorId: 'author-1' }) }));
  });

  it('sets originalLocale from the canonical translation actually supplied', async () => {
    prisma.communityStory.create.mockResolvedValue({ id: 's1', translations: [] });
    await service.create(dto(), actor);
    expect(prisma.communityStory.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ originalLocale: 'vi' }) }));
  });

  it('rejects a title containing HTML markup', async () => {
    await expect(service.create({ ...dto(), translations: [{ locale: 'vi', title: '<b>bold</b>' }] }, actor)).rejects.toThrow(BadRequestException);
    expect(prisma.communityStory.create).not.toHaveBeenCalled();
  });

  it('checks heroMediaId ownership before creating', async () => {
    prisma.communityStory.create.mockResolvedValue({ id: 's1', translations: [] });
    await service.create({ ...dto(), heroMediaId: 'media-1' }, actor);
    expect(media.assertOwnedByOrPrivileged).toHaveBeenCalledWith('media-1', actor);
  });

  it('rejects thenNowComparisonId on a non-THEN_AND_NOW type', async () => {
    await expect(service.create({ ...dto(), thenNowComparisonId: 'cmp-1' }, actor)).rejects.toThrow(BadRequestException);
  });

  it('rejects a thenNowComparisonId the actor does not own', async () => {
    prisma.thenNowComparison.findUnique.mockResolvedValue({ id: 'cmp-1', createdById: 'someone-else' });
    await expect(
      service.create({ type: CommunityStoryType.THEN_AND_NOW, translations: dto().translations, thenNowComparisonId: 'cmp-1' }, actor),
    ).rejects.toThrow(ForbiddenException);
  });
});

describe('CommunityService.update/withdraw', () => {
  let prisma: any;
  let service: CommunityService;

  beforeEach(() => {
    prisma = {
      communityStory: { findUnique: jest.fn(), update: jest.fn() },
      communityStoryTranslation: { deleteMany: jest.fn(), create: jest.fn() },
      $transaction: jest.fn(async (cb: any) => cb(prisma)),
    };
    service = new CommunityService(prisma as unknown as PrismaService, { log: jest.fn() } as unknown as AuditService, {} as any);
  });

  it('a non-author cannot edit someone else\'s story', async () => {
    prisma.communityStory.findUnique.mockResolvedValue({ id: 's1', authorId: 'author-1' });
    await expect(service.update('s1', { id: 'someone-else', roles: ['USER'] }, {})).rejects.toThrow(ForbiddenException);
  });

  it('the author can edit their own story, stamping editedAt', async () => {
    prisma.communityStory.findUnique.mockResolvedValue({ id: 's1', authorId: 'author-1' });
    prisma.communityStory.update.mockResolvedValue({ id: 's1' });
    await service.update('s1', { id: 'author-1', roles: ['USER'] }, { eventDateLabel: 'khoang 1968' });
    expect(prisma.communityStory.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ editedAt: expect.any(Date) }) }),
    );
  });

  it('an EDITOR can edit someone else\'s story', async () => {
    prisma.communityStory.findUnique.mockResolvedValue({ id: 's1', authorId: 'author-1' });
    prisma.communityStory.update.mockResolvedValue({ id: 's1' });
    await expect(service.update('s1', { id: 'editor-1', roles: ['EDITOR'] }, {})).resolves.toBeDefined();
  });

  it('the update DTO has no verificationState/moderationStatus field to even accidentally pass through', async () => {
    prisma.communityStory.findUnique.mockResolvedValue({ id: 's1', authorId: 'author-1' });
    prisma.communityStory.update.mockResolvedValue({ id: 's1' });
    await service.update('s1', { id: 'author-1', roles: ['USER'] }, { verificationState: 'VERIFIED_CONTRIBUTION' } as any);
    const data = prisma.communityStory.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('verificationState');
    expect(data).not.toHaveProperty('moderationStatus');
  });

  it('a non-author cannot withdraw someone else\'s story', async () => {
    prisma.communityStory.findUnique.mockResolvedValue({ id: 's1', authorId: 'author-1' });
    await expect(service.withdraw('s1', 'someone-else')).rejects.toThrow(ForbiddenException);
  });

  it('the author withdrawing sets moderationStatus to REMOVED, not a hard delete', async () => {
    prisma.communityStory.findUnique.mockResolvedValue({ id: 's1', authorId: 'author-1' });
    prisma.communityStory.update.mockResolvedValue({ id: 's1', moderationStatus: 'REMOVED' });
    const result = await service.withdraw('s1', 'author-1');
    expect(result.moderationStatus).toBe('REMOVED');
    expect(prisma.communityStory.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { moderationStatus: ModerationStatus.REMOVED } });
  });
});

describe('CommunityService entity link ownership', () => {
  let prisma: any;
  let service: CommunityService;

  beforeEach(() => {
    prisma = {
      communityStory: { findUnique: jest.fn() },
      place: { findUnique: jest.fn() },
      communityStoryPlace: { create: jest.fn() },
    };
    service = new CommunityService(prisma as unknown as PrismaService, { log: jest.fn() } as unknown as AuditService, {} as any);
  });

  it('rejects linking a Place to a story the caller does not own', async () => {
    prisma.communityStory.findUnique.mockResolvedValue({ id: 's1', authorId: 'author-1' });
    await expect(service.linkPlace('s1', 'place-1', { id: 'someone-else', roles: ['USER'] })).rejects.toThrow(ForbiddenException);
    expect(prisma.communityStoryPlace.create).not.toHaveBeenCalled();
  });

  it('rejects linking a Place that does not exist', async () => {
    prisma.communityStory.findUnique.mockResolvedValue({ id: 's1', authorId: 'author-1' });
    prisma.place.findUnique.mockResolvedValue(null);
    await expect(service.linkPlace('s1', 'nonexistent', { id: 'author-1', roles: ['USER'] })).rejects.toThrow(BadRequestException);
  });

  it('allows the author to link a real Place', async () => {
    prisma.communityStory.findUnique.mockResolvedValue({ id: 's1', authorId: 'author-1' });
    prisma.place.findUnique.mockResolvedValue({ id: 'place-1' });
    prisma.communityStoryPlace.create.mockResolvedValue({ id: 'link-1' });
    await expect(service.linkPlace('s1', 'place-1', { id: 'author-1', roles: ['USER'] })).resolves.toBeDefined();
  });
});

describe('CommunityService.vote/unvote', () => {
  let prisma: any;
  let service: CommunityService;

  beforeEach(() => {
    prisma = {
      communityStory: { findUnique: jest.fn(), update: jest.fn() },
      storyVote: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
      $transaction: jest.fn(async (ops: any) => Promise.all(ops)),
    };
    service = new CommunityService(prisma as unknown as PrismaService, { log: jest.fn() } as unknown as AuditService, {} as any);
  });

  it('rejects voting your own story helpful', async () => {
    prisma.communityStory.findUnique.mockResolvedValue({ id: 's1', authorId: 'author-1', moderationStatus: ModerationStatus.VISIBLE });
    await expect(service.vote('author-1', 's1')).rejects.toThrow(ForbiddenException);
  });

  it('rejects voting on a REMOVED story', async () => {
    prisma.communityStory.findUnique.mockResolvedValue({ id: 's1', authorId: 'author-1', moderationStatus: ModerationStatus.REMOVED });
    await expect(service.vote('someone-else', 's1')).rejects.toThrow(BadRequestException);
  });

  it('is idempotent - voting twice does not double-count', async () => {
    prisma.communityStory.findUnique.mockResolvedValue({ id: 's1', authorId: 'author-1', moderationStatus: ModerationStatus.VISIBLE });
    prisma.storyVote.findUnique.mockResolvedValue({ id: 'vote-1' });
    const result = await service.vote('someone-else', 's1');
    expect(result.voted).toBe(true);
    expect(prisma.storyVote.create).not.toHaveBeenCalled();
  });

  it('unvoting when no vote exists is a safe no-op', async () => {
    prisma.storyVote.findUnique.mockResolvedValue(null);
    const result = await service.unvote('someone-else', 's1');
    expect(result.voted).toBe(false);
    expect(prisma.storyVote.delete).not.toHaveBeenCalled();
  });
});

describe('CommunityService.list / findBySlug moderation visibility', () => {
  let prisma: any;
  let service: CommunityService;

  beforeEach(() => {
    prisma = {
      communityStory: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      comment: { count: jest.fn().mockResolvedValue(0) },
    };
    service = new CommunityService(prisma as unknown as PrismaService, { log: jest.fn() } as unknown as AuditService, {} as any);
  });

  it('404s a REMOVED story on the public detail path', async () => {
    prisma.communityStory.findUnique.mockResolvedValue({ id: 's1', moderationStatus: ModerationStatus.REMOVED, translations: [] });
    await expect(service.findBySlug('withdrawn-story', 'vi')).rejects.toThrow(NotFoundException);
  });

  it('404s an UNDER_REVIEW story on the public detail path', async () => {
    prisma.communityStory.findUnique.mockResolvedValue({ id: 's1', moderationStatus: ModerationStatus.UNDER_REVIEW, translations: [] });
    await expect(service.findBySlug('flagged-story', 'vi')).rejects.toThrow(NotFoundException);
  });

  it('the public list only ever queries the public-visible moderation statuses', async () => {
    await service.list({ locale: 'vi', limit: 20 });
    const where = prisma.communityStory.findMany.mock.calls[0][0].where;
    expect(where.moderationStatus.in).toEqual([ModerationStatus.VISIBLE, ModerationStatus.LIMITED, ModerationStatus.LOCKED]);
  });
});
