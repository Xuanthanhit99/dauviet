import { BadRequestException } from '@nestjs/common';
import { EntityKind, ModerationStatus } from '@prisma/client';
import { ModerationService } from './moderation.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ReportsService } from '../reports/reports.service';
import { CommunityService } from '../community/community.service';
import { CommentsService } from '../comments/comments.service';

/**
 * Spec Phase 08 section 40/47/48/69: a single, audited moderator entrypoint
 * that delegates to (not reimplements) the existing per-domain setters, so
 * every guarantee those already carry (self-moderation refusal, audit
 * logging) stays true through this new surface too.
 */
describe('ModerationService.action', () => {
  let community: { setModerationStatus: jest.Mock };
  let comments: { moderate: jest.Mock };
  let service: ModerationService;

  beforeEach(() => {
    community = { setModerationStatus: jest.fn() };
    comments = { moderate: jest.fn() };
    service = new ModerationService(
      {} as unknown as PrismaService,
      {} as unknown as ReportsService,
      community as unknown as CommunityService,
      comments as unknown as CommentsService,
    );
  });

  it('rejects a target type with no moderation detail view', async () => {
    await expect(service.action('mod-1', EntityKind.PLACE, 'p1', 'REMOVE')).rejects.toThrow(BadRequestException);
  });

  it('REMOVE on a CommunityStory delegates to CommunityService.setModerationStatus with REMOVED', async () => {
    await service.action('mod-1', EntityKind.COMMUNITY_STORY, 's1', 'REMOVE', 'spam');
    expect(community.setModerationStatus).toHaveBeenCalledWith('mod-1', 's1', ModerationStatus.REMOVED, 'spam');
  });

  it('RESTORE on a CommunityStory delegates with VISIBLE', async () => {
    await service.action('mod-1', EntityKind.COMMUNITY_STORY, 's1', 'RESTORE');
    expect(community.setModerationStatus).toHaveBeenCalledWith('mod-1', 's1', ModerationStatus.VISIBLE, undefined);
  });

  it('LOCK on a Comment delegates to CommentsService.moderate with LOCKED', async () => {
    await service.action('mod-1', EntityKind.COMMENT, 'c1', 'LOCK');
    expect(comments.moderate).toHaveBeenCalledWith('mod-1', 'c1', ModerationStatus.LOCKED, undefined);
  });

  it('MARK_UNDER_REVIEW maps to UNDER_REVIEW', async () => {
    await service.action('mod-1', EntityKind.COMMUNITY_STORY, 's1', 'MARK_UNDER_REVIEW');
    expect(community.setModerationStatus).toHaveBeenCalledWith('mod-1', 's1', ModerationStatus.UNDER_REVIEW, undefined);
  });
});

describe('ModerationService.detail', () => {
  let prisma: any;
  let reports: { forTarget: jest.Mock };
  let service: ModerationService;

  beforeEach(() => {
    prisma = {
      auditLog: { findMany: jest.fn().mockResolvedValue([]) },
      communityStory: { findUnique: jest.fn() },
      comment: { findUnique: jest.fn() },
    };
    reports = { forTarget: jest.fn().mockResolvedValue([]) };
    service = new ModerationService(
      prisma as unknown as PrismaService,
      reports as unknown as ReportsService,
      {} as unknown as CommunityService,
      {} as unknown as CommentsService,
    );
  });

  it('rejects a target type with no moderation detail view', async () => {
    await expect(service.detail(EntityKind.PLACE, 'p1')).rejects.toThrow(BadRequestException);
  });

  it('only selects a safe author subset (id/displayName/status/roles) - never password/email/sessions', async () => {
    prisma.communityStory.findUnique.mockResolvedValue({
      id: 's1',
      author: { id: 'u1', displayName: 'Thanh', status: 'ACTIVE', roles: ['USER'] },
    });
    const result = await service.detail(EntityKind.COMMUNITY_STORY, 's1');
    expect(result.author).not.toHaveProperty('email');
    expect(result.author).not.toHaveProperty('password');
    expect(result.author).not.toHaveProperty('passwordHash');
    const includeArg = prisma.communityStory.findUnique.mock.calls[0][0].include.author.select;
    expect(includeArg).not.toHaveProperty('email');
  });
});
