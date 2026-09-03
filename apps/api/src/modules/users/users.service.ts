import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role, UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';

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
        emailVerifiedAt: true,
        createdAt: true,
      },
    });
    if (!user) throw new NotFoundException('User not found.');
    return user;
  }

  /** Public profile boundary (spec Phase 02 section 23): never exposes email or account status. */
  async publicProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, displayName: true, avatarMediaId: true, createdAt: true },
    });
    if (!user) throw new NotFoundException('User not found.');
    return user;
  }

  async updateProfile(userId: string, data: { displayName?: string; locale?: string; avatarMediaId?: string }) {
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
   * they naturally expire.
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
}
