import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BadgeType, Role, UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { resolveTranslation } from '../../common/translation/resolve-translation.util';
import { PUBLIC_VISIBLE_STATUSES } from '../../common/moderation/public-visible-statuses.util';

const SUSPENDING_STATUSES: UserStatus[] = [UserStatus.SUSPENDED, UserStatus.DISABLED, UserStatus.DELETED];

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly authService: AuthService,
  ) {}

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarMediaId: true,
        roles: true,
        status: true,
        locale: true,
        visitedPlacesPublic: true,
        emailVerifiedAt: true,
        createdAt: true,
      },
    });
    if (!user) throw new NotFoundException('User not found.');
    return user;
  }

  /**
   * Public community profile (spec Phase 08 section 26/27) - focuses on
   * contribution, not vanity metrics. Never exposes email, sessions,
   * moderation notes, or precise location. Visited places are only included
   * when the user has opted in (`visitedPlacesPublic`); bookmarks/saves are
   * never included at all - they have no public-read path anywhere in this
   * API (spec section 27).
   */
  async publicProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, displayName: true, avatarMediaId: true, createdAt: true, visitedPlacesPublic: true },
    });
    if (!user) throw new NotFoundException('User not found.');

    const [stories, helpfulAgg, contributionCount, badges, visitedPlaces] = await Promise.all([
      this.prisma.communityStory.findMany({
        where: { authorId: userId, moderationStatus: { in: PUBLIC_VISIBLE_STATUSES } },
        include: { translations: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.communityStory.aggregate({
        where: { authorId: userId, moderationStatus: { in: PUBLIC_VISIBLE_STATUSES } },
        _sum: { helpfulCount: true },
      }),
      this.prisma.contribution.count({ where: { contributorId: userId } }),
      this.prisma.userBadge.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
      user.visitedPlacesPublic
        ? this.prisma.placeVisit.findMany({
            where: { userId },
            include: { place: { include: { translations: true } } },
            orderBy: { visitedAt: 'desc' },
            take: 100,
          })
        : Promise.resolve(null),
    ]);

    return {
      id: user.id,
      displayName: user.displayName,
      avatarMediaId: user.avatarMediaId,
      createdAt: user.createdAt,
      communityStories: stories.map((s) => {
        const { translation } = resolveTranslation(s.translations, 'vi');
        return { id: s.id, slug: s.canonicalSlug, type: s.type, title: translation?.title ?? s.canonicalSlug };
      }),
      contributionCount,
      helpfulReceived: helpfulAgg._sum.helpfulCount ?? 0,
      badges: badges.map((b) => ({ type: b.type, grantedAt: b.createdAt })),
      visitedPlaces: visitedPlaces
        ? {
            count: visitedPlaces.length,
            places: visitedPlaces.map((v) => {
              const { translation } = resolveTranslation(v.place.translations, 'vi');
              return { id: v.place.id, slug: v.place.canonicalSlug, name: translation?.name ?? v.place.canonicalSlug, visitedAt: v.visitedAt };
            }),
          }
        : null,
    };
  }

  /** Private - only the caller's own visited places (spec section 67 "my visited places"), regardless of their `visitedPlacesPublic` setting. */
  async myVisitedPlaces(userId: string) {
    const visits = await this.prisma.placeVisit.findMany({
      where: { userId },
      include: { place: { include: { translations: true } } },
      orderBy: { visitedAt: 'desc' },
    });
    return visits.map((v) => {
      const { translation } = resolveTranslation(v.place.translations, 'vi');
      return { id: v.place.id, slug: v.place.canonicalSlug, name: translation?.name ?? v.place.canonicalSlug, visitedAt: v.visitedAt, note: v.note };
    });
  }

  async updateProfile(userId: string, data: { displayName?: string; locale?: string; avatarMediaId?: string; visitedPlacesPublic?: boolean }) {
    return this.prisma.user.update({ where: { id: userId }, data });
  }

  async setRoles(actorId: string, targetUserId: string, roles: Role[]) {
    if (roles.length === 0) throw new BadRequestException('A user must retain at least one role.');
    if (actorId === targetUserId) {
      throw new ForbiddenException('Admins cannot change their own roles through this endpoint.');
    }

    const target = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) throw new NotFoundException('User not found.');

    const updated = await this.prisma.user.update({
      where: { id: targetUserId },
      data: { roles },
    });
    await this.audit.log({
      actorId,
      action: 'user.roles.updated',
      metadata: { targetUserId, previousRoles: target.roles, roles },
    });
    return updated;
  }

  /**
   * Suspend/disable/reactivate an account (spec Phase 02 section 24). Moving
   * into SUSPENDED/DISABLED/DELETED immediately revokes every active
   * session, so already-issued access tokens stop working on their very
   * next request (JwtStrategy re-checks status) rather than lingering until
   * they naturally expire. This is also how Phase 08's "suspended/disabled
   * users cannot create CommunityStory/Comment/Vote/Report" requirement
   * (spec section 56) is satisfied - a suspended user simply cannot
   * authenticate any request at all, so every community-write path is
   * already unreachable to them without a separate check in each service.
   */
  async setStatus(actorId: string, targetUserId: string, status: UserStatus) {
    if (actorId === targetUserId) {
      throw new ForbiddenException('Admins cannot change their own account status through this endpoint.');
    }

    const target = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) throw new NotFoundException('User not found.');

    const updated = await this.prisma.user.update({ where: { id: targetUserId }, data: { status } });

    if (SUSPENDING_STATUSES.includes(status)) {
      await this.authService.revokeAllSessions(targetUserId, `account_status_${status.toLowerCase()}`);
    }

    await this.audit.log({
      actorId,
      action: 'user.status.updated',
      metadata: { targetUserId, previousStatus: target.status, status },
    });
    return updated;
  }

  /** Rule/editorial-based badge grant (spec section 28) - ADMIN only, never self-service. */
  async grantBadge(actorId: string, targetUserId: string, type: BadgeType, reason?: string) {
    const target = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) throw new NotFoundException('User not found.');

    const badge = await this.prisma.userBadge.upsert({
      where: { userId_type: { userId: targetUserId, type } },
      update: {},
      create: { userId: targetUserId, type, grantedById: actorId, reason },
    });
    await this.audit.log({ actorId, action: 'user.badge.granted', metadata: { targetUserId, type, reason } });
    return badge;
  }

  async revokeBadge(actorId: string, targetUserId: string, type: BadgeType) {
    const badge = await this.prisma.userBadge.findUnique({ where: { userId_type: { userId: targetUserId, type } } });
    if (!badge) throw new NotFoundException('Badge not found.');
    await this.prisma.userBadge.delete({ where: { id: badge.id } });
    await this.audit.log({ actorId, action: 'user.badge.revoked', metadata: { targetUserId, type } });
    return { removed: true };
  }
}
