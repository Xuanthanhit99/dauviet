import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
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
