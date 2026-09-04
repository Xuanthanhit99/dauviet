import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { BadgeType, ModerationStatus, UserStatus } from '@prisma/client';
import { UsersService } from './users.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';

/**
 * Covers spec Phase 02 section 21/24: admin privilege-safety (no
 * self-role-editing footgun) and account suspension immediately revoking
 * sessions rather than waiting for tokens to expire naturally.
 */
describe('UsersService', () => {
  let prisma: { user: { findUnique: jest.Mock; update: jest.Mock } };
  let audit: { log: jest.Mock };
  let authService: { revokeAllSessions: jest.Mock };
  let service: UsersService;

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn(), update: jest.fn() } };
    audit = { log: jest.fn() };
    authService = { revokeAllSessions: jest.fn() };
    service = new UsersService(prisma as unknown as PrismaService, audit as unknown as AuditService, authService as unknown as AuthService);
  });

  describe('setRoles', () => {
    it('refuses to let an admin change their own roles through this endpoint', async () => {
      await expect(service.setRoles('admin-1', 'admin-1', ['ADMIN'] as any)).rejects.toThrow(ForbiddenException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('404s on a nonexistent target user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.setRoles('admin-1', 'nobody', ['EDITOR'] as any)).rejects.toThrow(NotFoundException);
    });

    it('updates roles for a different user and audits the change', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-2', roles: ['USER'] });
      prisma.user.update.mockResolvedValue({ id: 'user-2', roles: ['EDITOR'] });

      await service.setRoles('admin-1', 'user-2', ['EDITOR'] as any);

      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'user-2' }, data: { roles: ['EDITOR'] } });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'user.roles.updated' }));
    });
  });

  describe('setStatus', () => {
    it('refuses to let an admin suspend/disable their own account through this endpoint', async () => {
      await expect(service.setStatus('admin-1', 'admin-1', UserStatus.SUSPENDED)).rejects.toThrow(ForbiddenException);
      expect(authService.revokeAllSessions).not.toHaveBeenCalled();
    });

    it('suspending a user immediately revokes all of their sessions', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-2', status: UserStatus.ACTIVE });
      prisma.user.update.mockResolvedValue({ id: 'user-2', status: UserStatus.SUSPENDED });

      await service.setStatus('admin-1', 'user-2', UserStatus.SUSPENDED);

      expect(authService.revokeAllSessions).toHaveBeenCalledWith('user-2', 'account_status_suspended');
    });

    it('reactivating a user does not revoke sessions', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-2', status: UserStatus.SUSPENDED });
      prisma.user.update.mockResolvedValue({ id: 'user-2', status: UserStatus.ACTIVE });

      await service.setStatus('admin-1', 'user-2', UserStatus.ACTIVE);

      expect(authService.revokeAllSessions).not.toHaveBeenCalled();
    });
  });
});

/**
 * Covers spec Phase 08 section 26/27/61-66: the public profile is a
 * privacy-safe, contribution-focused view - never email/sessions/moderation
 * notes, and visited places stay private unless the user opted in.
 */
describe('UsersService.publicProfile', () => {
  let prisma: any;
  let service: UsersService;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn() },
      communityStory: { findMany: jest.fn().mockResolvedValue([]), aggregate: jest.fn().mockResolvedValue({ _sum: { helpfulCount: 0 } }) },
      contribution: { count: jest.fn().mockResolvedValue(0) },
      userBadge: { findMany: jest.fn().mockResolvedValue([]) },
      placeVisit: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new UsersService(prisma as unknown as PrismaService, { log: jest.fn() } as unknown as AuditService, {} as unknown as AuthService);
  });

  it('404s for a nonexistent user', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.publicProfile('nobody')).rejects.toThrow(NotFoundException);
  });

  it('never includes email, status, or roles in the public profile response', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', displayName: 'Thanh', avatarMediaId: null, createdAt: new Date(), visitedPlacesPublic: false });
    const result = await service.publicProfile('u1');
    expect(result).not.toHaveProperty('email');
    expect(result).not.toHaveProperty('status');
    expect(result).not.toHaveProperty('roles');
    expect(result).not.toHaveProperty('sessions');
  });

  it('omits visited places entirely when the user has not opted in', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', displayName: 'Thanh', avatarMediaId: null, createdAt: new Date(), visitedPlacesPublic: false });
    const result = await service.publicProfile('u1');
    expect(result.visitedPlaces).toBeNull();
    expect(prisma.placeVisit.findMany).not.toHaveBeenCalled();
  });

  it('includes visited places once the user has opted in', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', displayName: 'Thanh', avatarMediaId: null, createdAt: new Date(), visitedPlacesPublic: true });
    prisma.placeVisit.findMany.mockResolvedValue([
      { placeId: 'p1', visitedAt: new Date(), place: { id: 'p1', canonicalSlug: 'co-do-hue', translations: [{ locale: 'vi', name: 'Co do Hue' }] } },
    ]);
    const result = await service.publicProfile('u1');
    expect(result.visitedPlaces?.count).toBe(1);
  });

  it('only counts helpful/community-story totals from publicly-visible stories, never REMOVED/UNDER_REVIEW ones', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', displayName: 'Thanh', avatarMediaId: null, createdAt: new Date(), visitedPlacesPublic: false });
    await service.publicProfile('u1');
    const where = prisma.communityStory.findMany.mock.calls[0][0].where;
    expect(where.moderationStatus.in).toEqual(expect.arrayContaining([ModerationStatus.VISIBLE, ModerationStatus.LIMITED, ModerationStatus.LOCKED]));
    expect(where.moderationStatus.in).not.toContain(ModerationStatus.REMOVED);
    expect(where.moderationStatus.in).not.toContain(ModerationStatus.UNDER_REVIEW);
  });
});

/** Covers spec section 28: badges are rule/editorial-based, never self-awarded - only reachable via the ADMIN-gated service methods. */
describe('UsersService badges', () => {
  let prisma: any;
  let service: UsersService;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn() },
      userBadge: { upsert: jest.fn(), findUnique: jest.fn(), delete: jest.fn() },
    };
    service = new UsersService(prisma as unknown as PrismaService, { log: jest.fn() } as unknown as AuditService, {} as unknown as AuthService);
  });

  it('404s granting a badge to a nonexistent user', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.grantBadge('admin-1', 'nobody', BadgeType.EXPLORER)).rejects.toThrow(NotFoundException);
  });

  it('grants a badge, recording who granted it', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-2' });
    prisma.userBadge.upsert.mockResolvedValue({ id: 'b1', userId: 'user-2', type: BadgeType.EXPLORER });
    await service.grantBadge('admin-1', 'user-2', BadgeType.EXPLORER, 'Visited 10 places');
    expect(prisma.userBadge.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ userId: 'user-2', type: BadgeType.EXPLORER, grantedById: 'admin-1' }) }),
    );
  });

  it('404s revoking a badge the user does not have', async () => {
    prisma.userBadge.findUnique.mockResolvedValue(null);
    await expect(service.revokeBadge('admin-1', 'user-2', BadgeType.EXPLORER)).rejects.toThrow(NotFoundException);
  });
});
