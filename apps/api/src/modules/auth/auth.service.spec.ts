import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { ClientPlatform, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailerService } from '../mailer/mailer.service';

/**
 * Covers spec Phase 02 section 32 test items #1-4, #9-18: password hashing/
 * verification, generic-failure login, duplicate-email registration,
 * session lifecycle (create/revoke/revoke-all), refresh rotation + reuse
 * detection, email-verification and password-reset token lifecycle, and
 * account-suspension enforcement. All against a mocked Prisma - no database
 * required, matching the existing test style in this repo.
 */
describe('AuthService', () => {
  let prisma: any;
  let jwt: { signAsync: jest.Mock };
  let config: { get: jest.Mock };
  let mailer: { sendEmailVerification: jest.Mock; sendPasswordReset: jest.Mock };
  let audit: { log: jest.Mock };
  let service: AuthService;

  const jwtConfig = { accessSecret: 'a'.repeat(32), accessTtl: '15m', refreshSecret: 'b'.repeat(32), refreshTtl: '30d' };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      authIdentity: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), upsert: jest.fn() },
      session: { create: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findMany: jest.fn() },
      emailVerificationToken: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      passwordResetToken: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      $transaction: jest.fn((ops: any[]) => Promise.all(ops)),
    };
    jwt = { signAsync: jest.fn().mockResolvedValue('signed.jwt.token') };
    config = { get: jest.fn().mockReturnValue(jwtConfig) };
    mailer = { sendEmailVerification: jest.fn(), sendPasswordReset: jest.fn() };
    audit = { log: jest.fn() };

    service = new AuthService(
      prisma as unknown as PrismaService,
      jwt as any,
      config as any,
      mailer as unknown as MailerService,
      audit as unknown as AuditService,
    );
  });

  describe('register', () => {
    it('hashes the password (never stores it in plaintext)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(({ data }: any) => ({
        id: 'user-1',
        email: data.email,
        displayName: data.displayName,
        __passwordHash: data.authIdentities.create.passwordHash,
      }));

      await service.register({ email: 'New.User@Example.com', password: 'CorrectHorse123', displayName: 'New User' });

      const createCall = prisma.user.create.mock.calls[0][0];
      const storedHash: string = createCall.data.authIdentities.create.passwordHash;
      expect(storedHash).not.toBe('CorrectHorse123');
      expect(storedHash.startsWith('$argon2id$')).toBe(true);
      await expect(argon2.verify(storedHash, 'CorrectHorse123')).resolves.toBe(true);
    });

    it('normalizes email and hardcodes the USER role regardless of input', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(({ data }: any) => ({ id: 'user-1', ...data }));

      await service.register({ email: '  New.User@Example.com  ', password: 'CorrectHorse123', displayName: 'New User' });

      const createCall = prisma.user.create.mock.calls[0][0];
      expect(createCall.data.email).toBe('new.user@example.com');
      expect(createCall.data.roles).toEqual(['USER']);
    });

    it('rejects a duplicate email that only differs by case/whitespace', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing-user' });

      await expect(
        service.register({ email: 'User@Example.com', password: 'CorrectHorse123', displayName: 'Dup' }),
      ).rejects.toThrow(ConflictException);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'user@example.com' } });
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('validateCredentials / login', () => {
    async function seedUser(password: string, status: UserStatus = UserStatus.ACTIVE) {
      const passwordHash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
      return {
        id: 'user-1',
        email: 'user@example.com',
        displayName: 'User',
        status,
        roles: ['USER'],
        emailVerifiedAt: null,
        authIdentities: [{ provider: 'PASSWORD', passwordHash }],
      };
    }

    it('authenticates with the correct password', async () => {
      const user = await seedUser('CorrectHorse123');
      prisma.user.findUnique.mockResolvedValue(user);

      const result = await service.validateCredentials({ email: 'user@example.com', password: 'CorrectHorse123' });
      expect(result.id).toBe('user-1');
    });

    it('fails with the same generic error for a wrong password and for a nonexistent user', async () => {
      const user = await seedUser('CorrectHorse123');
      prisma.user.findUnique.mockResolvedValueOnce(user).mockResolvedValueOnce(null);

      let wrongPasswordError: any;
      try {
        await service.validateCredentials({ email: 'user@example.com', password: 'WrongPassword' });
      } catch (e) {
        wrongPasswordError = e;
      }

      let noUserError: any;
      try {
        await service.validateCredentials({ email: 'nobody@example.com', password: 'WrongPassword' });
      } catch (e) {
        noUserError = e;
      }

      expect(wrongPasswordError).toBeInstanceOf(UnauthorizedException);
      expect(noUserError).toBeInstanceOf(UnauthorizedException);
      expect(wrongPasswordError.getResponse()).toEqual(noUserError.getResponse());
    });

    it('rejects login for a suspended account only after the password is proven correct', async () => {
      const user = await seedUser('CorrectHorse123', UserStatus.SUSPENDED);
      prisma.user.findUnique.mockResolvedValue(user);

      const error: any = await service.validateCredentials({ email: 'user@example.com', password: 'CorrectHorse123' }).catch((e) => e);
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(error.getResponse().code).toBe('AUTH_ACCOUNT_SUSPENDED');
    });

    it('login() creates a session for the user', async () => {
      const user = await seedUser('CorrectHorse123');
      prisma.user.findUnique.mockResolvedValue(user);
      prisma.session.create.mockResolvedValue({ id: 'session-1' });

      await service.login({ email: 'user@example.com', password: 'CorrectHorse123' }, { userAgent: 'jest', ip: '127.0.0.1' }, ClientPlatform.OTHER);

      expect(prisma.session.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: 'user-1' }) }),
      );
    });
  });

  describe('refresh', () => {
    it('rotates the token: revokes the old session and issues a new one', async () => {
      prisma.session.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 1000 * 60),
        user: { id: 'user-1', roles: ['USER'], status: UserStatus.ACTIVE },
      });
      prisma.session.create.mockResolvedValue({ id: 'session-2' });

      await service.refresh('some-refresh-token', {}, ClientPlatform.OTHER);

      expect(prisma.session.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'session-1' }, data: expect.objectContaining({ revokedAt: expect.any(Date) }) }),
      );
      expect(prisma.session.create).toHaveBeenCalled();
    });

    it('detects reuse of an already-revoked refresh token and revokes every session for that user', async () => {
      prisma.session.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 1000 * 60),
        user: { id: 'user-1', roles: ['USER'], status: UserStatus.ACTIVE },
      });

      await expect(service.refresh('stolen-token', {}, ClientPlatform.OTHER)).rejects.toThrow(UnauthorizedException);

      expect(prisma.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: 'user-1', revokedAt: null }) }),
      );
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'auth.refreshTokenReuseDetected' }));
    });

    it('rejects an expired session', async () => {
      prisma.session.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
        user: { id: 'user-1', roles: ['USER'], status: UserStatus.ACTIVE },
      });

      await expect(service.refresh('expired-token', {}, ClientPlatform.OTHER)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a completely unknown token', async () => {
      prisma.session.findUnique.mockResolvedValue(null);
      await expect(service.refresh('unknown-token', {}, ClientPlatform.OTHER)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('sessions', () => {
    it('logout revokes the matching session', async () => {
      await service.logout('some-refresh-token');
      expect(prisma.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ revokedAt: expect.any(Date), revokedReason: 'logout' }) }),
      );
    });

    it('a user cannot revoke another user\'s session', async () => {
      prisma.session.findFirst.mockResolvedValue(null);
      await expect(service.revokeSession('user-a', 'session-belongs-to-user-b')).rejects.toThrow(BadRequestException);
      expect(prisma.session.findFirst).toHaveBeenCalledWith({ where: { id: 'session-belongs-to-user-b', userId: 'user-a' } });
    });

    it('revokeAllSessions revokes every active session except the one excluded', async () => {
      await service.revokeAllSessions('user-1', 'password_changed', 'keep-this-session');
      expect(prisma.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'user-1', revokedAt: null, id: { not: 'keep-this-session' } }),
        }),
      );
    });
  });

  describe('email verification', () => {
    it('rejects an expired token', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue({
        id: 't1', userId: 'user-1', consumedAt: null, expiresAt: new Date(Date.now() - 1000),
      });
      await expect(service.verifyEmail('expired')).rejects.toThrow(BadRequestException);
    });

    it('rejects a token that has already been used', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue({
        id: 't1', userId: 'user-1', consumedAt: new Date(), expiresAt: new Date(Date.now() + 1000 * 60),
      });
      const error: any = await service.verifyEmail('used').catch((e) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.getResponse().code).toBe('AUTH_TOKEN_ALREADY_USED');
    });
  });

  describe('password reset', () => {
    it('rejects an expired reset token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'r1', userId: 'user-1', consumedAt: null, expiresAt: new Date(Date.now() - 1000),
      });
      await expect(service.resetPassword('expired', 'NewPassword123')).rejects.toThrow(BadRequestException);
    });

    it('a successful reset revokes every active session for the account', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'r1', userId: 'user-1', consumedAt: null, expiresAt: new Date(Date.now() + 1000 * 60),
      });

      await service.resetPassword('valid-token', 'NewPassword123');

      expect(prisma.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1', revokedAt: null },
          data: expect.objectContaining({ revokedReason: 'password_reset' }),
        }),
      );
    });
  });

  describe('changePassword', () => {
    it('rejects an incorrect current password', async () => {
      const hash = await argon2.hash('CorrectHorse123', { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
      prisma.authIdentity.findUnique.mockResolvedValue({ id: 'identity-1', passwordHash: hash });

      await expect(service.changePassword('user-1', 'session-1', 'WrongPassword', 'NewPassword123')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.authIdentity.update).not.toHaveBeenCalled();
    });

    it('on success, revokes every other session but keeps the current one', async () => {
      const hash = await argon2.hash('CorrectHorse123', { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
      prisma.authIdentity.findUnique.mockResolvedValue({ id: 'identity-1', passwordHash: hash });

      await service.changePassword('user-1', 'current-session', 'CorrectHorse123', 'NewPassword123');

      expect(prisma.authIdentity.update).toHaveBeenCalled();
      expect(prisma.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: 'user-1', id: { not: 'current-session' } }) }),
      );
    });
  });
});
