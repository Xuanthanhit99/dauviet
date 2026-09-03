import { ForbiddenException } from '@nestjs/common';
import { CommunityVerificationState } from '@prisma/client';
import { CommunityService } from './community.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

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
    service = new CommunityService(prisma as unknown as PrismaService, audit as unknown as AuditService);
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
