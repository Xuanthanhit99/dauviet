import { UnauthorizedException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Covers spec Phase 02 section 32 test #18 and the "protected endpoint
 * rejects unauthenticated/invalid access" half of test #19: every
 * authenticated request re-validates the session and the account status,
 * so a revoked session or a suspended/disabled account is rejected
 * immediately - not only once the (short-lived) access token expires.
 */
describe('JwtStrategy.validate', () => {
  let prisma: { session: { findUnique: jest.Mock }; user: { findUnique: jest.Mock } };
  let strategy: JwtStrategy;

  beforeEach(() => {
    prisma = { session: { findUnique: jest.fn() }, user: { findUnique: jest.fn() } };
    const config = { get: jest.fn().mockReturnValue({ accessSecret: 'a'.repeat(32) }) };
    strategy = new JwtStrategy(config as any, prisma as unknown as PrismaService);
  });

  it('accepts a valid session for an active user', async () => {
    prisma.session.findUnique.mockResolvedValue({
      id: 'session-1', userId: 'user-1', revokedAt: null, expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'u@example.com', roles: ['USER'], status: UserStatus.ACTIVE });

    const result = await strategy.validate({ sub: 'user-1', sid: 'session-1' });
    expect(result).toEqual({ id: 'user-1', email: 'u@example.com', roles: ['USER'], sessionId: 'session-1' });
  });

  it('rejects a revoked session even though the JWT itself has not expired', async () => {
    prisma.session.findUnique.mockResolvedValue({
      id: 'session-1', userId: 'user-1', revokedAt: new Date(), expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(strategy.validate({ sub: 'user-1', sid: 'session-1' })).rejects.toThrow(UnauthorizedException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('rejects an expired session', async () => {
    prisma.session.findUnique.mockResolvedValue({
      id: 'session-1', userId: 'user-1', revokedAt: null, expiresAt: new Date(Date.now() - 1000),
    });

    await expect(strategy.validate({ sub: 'user-1', sid: 'session-1' })).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a suspended account even with a fully valid session', async () => {
    prisma.session.findUnique.mockResolvedValue({
      id: 'session-1', userId: 'user-1', revokedAt: null, expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'u@example.com', roles: ['USER'], status: UserStatus.SUSPENDED });

    const error: any = await strategy.validate({ sub: 'user-1', sid: 'session-1' }).catch((e) => e);
    expect(error).toBeInstanceOf(UnauthorizedException);
    expect(error.getResponse().code).toBe('AUTH_ACCOUNT_SUSPENDED');
  });

  it('rejects a disabled account', async () => {
    prisma.session.findUnique.mockResolvedValue({
      id: 'session-1', userId: 'user-1', revokedAt: null, expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'u@example.com', roles: ['USER'], status: UserStatus.DISABLED });

    const error: any = await strategy.validate({ sub: 'user-1', sid: 'session-1' }).catch((e) => e);
    expect(error.getResponse().code).toBe('AUTH_ACCOUNT_DISABLED');
  });

  it('rejects a session id that does not belong to the token\'s subject', async () => {
    prisma.session.findUnique.mockResolvedValue({
      id: 'session-1', userId: 'someone-else', revokedAt: null, expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(strategy.validate({ sub: 'user-1', sid: 'session-1' })).rejects.toThrow(UnauthorizedException);
  });
});
