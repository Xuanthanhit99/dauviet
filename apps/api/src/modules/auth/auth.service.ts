import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { AuthProvider, ClientPlatform, Role, UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfig } from '../../config/configuration';
import { MailerService } from '../mailer/mailer.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuditService } from '../audit/audit.service';
import { AUTH_ERROR_CODES } from './auth-error-codes';

const REFRESH_TOKEN_BYTES = 48;

/**
 * Argon2id parameters (OWASP-recommended baseline for an interactive login
 * path: ~19 MiB memory, 2 iterations, single-threaded). Tuned here rather
 * than left at library defaults so the cost is deliberate and documented -
 * see docs/backend/AUTH.md.
 */
const ARGON2_OPTIONS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresAt: Date;
  sessionId: string;
}

interface AuthenticatedUserLike {
  id: string;
  roles: string[];
}

function authError(code: string, message: string) {
  return new UnauthorizedException({ code, message });
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly mailer: MailerService,
    private readonly audit: AuditService,
  ) {}

  normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private generateOpaqueToken(bytes = 32): string {
    return crypto.randomBytes(bytes).toString('base64url');
  }

  private hashPassword(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  private verifyPassword(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password).catch(() => false);
  }

  async register(dto: RegisterDto) {
    const email = this.normalizeEmail(dto.email);
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      // Registration is the one place where existence *must* be disclosed
      // (the user is asserting ownership of the address, not guessing a
      // password) - but we still never reveal it via the login path.
      throw new ConflictException({
        code: AUTH_ERROR_CODES.EMAIL_ALREADY_REGISTERED,
        message: 'An account with this email already exists.',
      });
    }

    const passwordHash = await this.hashPassword(dto.password);

    // Role is never taken from the request body (RegisterDto has no role
    // field at all) - every new account is hardcoded to USER only.
    const user = await this.prisma.user.create({
      data: {
        email,
        displayName: dto.displayName,
        roles: [Role.USER],
        authIdentities: {
          create: { provider: AuthProvider.PASSWORD, passwordHash },
        },
      },
    });

    await this.issueEmailVerification(user.id, user.email);
    await this.audit.log({ actorId: user.id, action: 'auth.register' });

    return { id: user.id, email: user.email, displayName: user.displayName };
  }

  async issueEmailVerification(userId: string, email: string) {
    const token = this.generateOpaqueToken();
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.prisma.emailVerificationToken.create({
      data: { userId, tokenHash, expiresAt },
    });
    await this.mailer.sendEmailVerification(email, token);
  }

  /** Always returns a generic response - never discloses whether the email exists or is already verified. */
  async resendEmailVerification(email: string) {
    const normalized = this.normalizeEmail(email);
    const user = await this.prisma.user.findUnique({ where: { email: normalized } });
    if (user && !user.emailVerifiedAt) {
      await this.issueEmailVerification(user.id, user.email);
    }
    return { requested: true };
  }

  async verifyEmail(token: string) {
    const tokenHash = this.hashToken(token);
    const record = await this.prisma.emailVerificationToken.findUnique({ where: { tokenHash } });
    if (!record) {
      throw new BadRequestException({ code: AUTH_ERROR_CODES.TOKEN_INVALID, message: 'Invalid verification token.' });
    }
    if (record.consumedAt) {
      throw new BadRequestException({
        code: AUTH_ERROR_CODES.TOKEN_ALREADY_USED,
        message: 'This verification token has already been used.',
      });
    }
    if (record.expiresAt < new Date()) {
      throw new BadRequestException({ code: AUTH_ERROR_CODES.TOKEN_EXPIRED, message: 'Verification token has expired.' });
    }

    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: new Date() },
      }),
    ]);

    return { verified: true };
  }

  /**
   * Password check happens before any account-status check, and both a
   * nonexistent email and a wrong password produce the exact same error -
   * only once the password is proven correct do we disclose *why* login is
   * refused (suspended/disabled), which is not an enumeration risk since the
   * caller has already demonstrated they know the credentials.
   */
  async validateCredentials(dto: LoginDto) {
    const email = this.normalizeEmail(dto.email);
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { authIdentities: true },
    });

    const identity = user?.authIdentities.find((i) => i.provider === AuthProvider.PASSWORD);
    const passwordHash = identity?.passwordHash;

    // Always run a verify (against a dummy hash when the user/identity is
    // missing) so failed lookups and failed password checks take the same
    // amount of time - avoids a timing side-channel for account enumeration.
    const valid = await this.verifyPassword(passwordHash ?? DUMMY_HASH, dto.password);

    if (!user || !passwordHash || !valid) {
      throw authError(AUTH_ERROR_CODES.INVALID_CREDENTIALS, 'Invalid email or password.');
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw authError(AUTH_ERROR_CODES.ACCOUNT_SUSPENDED, 'This account has been suspended.');
    }
    if (user.status === UserStatus.DISABLED || user.status === UserStatus.DELETED) {
      throw authError(AUTH_ERROR_CODES.ACCOUNT_DISABLED, 'This account is not available.');
    }

    return user;
  }

  private parseDurationSeconds(duration: string): number {
    const match = /^(\d+)([smhd])$/.exec(duration);
    if (!match) return 15 * 60;
    const value = parseInt(match[1], 10);
    const unitSeconds: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
    return value * unitSeconds[match[2]];
  }

  async issueTokenPair(
    user: AuthenticatedUserLike,
    device: { userAgent?: string; ip?: string },
    platform: ClientPlatform = ClientPlatform.OTHER,
  ): Promise<TokenPair> {
    const jwtConfig = this.config.get('jwt', { infer: true });

    const refreshToken = this.generateOpaqueToken(REFRESH_TOKEN_BYTES);
    const refreshTokenHash = this.hashToken(refreshToken);
    const refreshExpiresAt = this.addDuration(new Date(), jwtConfig.refreshTtl);

    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash,
        platform,
        userAgent: device.userAgent,
        ip: device.ip,
        expiresAt: refreshExpiresAt,
      },
    });

    // Minimal claims only: user id + session id. Roles/email are never
    // embedded - every authenticated request re-reads the current roles and
    // status from the database (see JwtStrategy), so a role change or
    // suspension takes effect immediately rather than waiting for token
    // expiry.
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, sid: session.id },
      { secret: jwtConfig.accessSecret, expiresIn: jwtConfig.accessTtl },
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: this.parseDurationSeconds(jwtConfig.accessTtl),
      refreshExpiresAt,
      sessionId: session.id,
    };
  }

  async login(dto: LoginDto, device: { userAgent?: string; ip?: string }, platform: ClientPlatform = ClientPlatform.OTHER) {
    const user = await this.validateCredentials(dto);
    const tokens = await this.issueTokenPair({ id: user.id, roles: user.roles }, device, platform);
    await this.audit.log({ actorId: user.id, action: 'auth.login', metadata: { platform } });
    return {
      user: { id: user.id, email: user.email, displayName: user.displayName, roles: user.roles, emailVerified: !!user.emailVerifiedAt },
      ...tokens,
    };
  }

  /**
   * Refresh-token rotation with reuse detection: the token used here is
   * always revoked immediately (single use). If someone presents a token
   * that was already revoked (i.e. already rotated, or already reused once
   * before), that is treated as evidence the refresh token family has been
   * stolen, and every session for that user is revoked as a security
   * response (spec Phase 02 section 10).
   */
  async refresh(refreshToken: string, device: { userAgent?: string; ip?: string }, platform: ClientPlatform = ClientPlatform.OTHER) {
    const tokenHash = this.hashToken(refreshToken);
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: tokenHash },
      include: { user: true },
    });

    if (!session) {
      throw authError(AUTH_ERROR_CODES.TOKEN_INVALID, 'Invalid refresh token.');
    }

    if (session.revokedAt) {
      await this.revokeAllSessions(session.userId, 'refresh_token_reuse_detected');
      await this.audit.log({
        actorId: session.userId,
        action: 'auth.refreshTokenReuseDetected',
        metadata: { sessionId: session.id },
      });
      throw authError(AUTH_ERROR_CODES.REFRESH_REUSE_DETECTED, 'Refresh token reuse detected; all sessions revoked.');
    }

    if (session.expiresAt < new Date()) {
      throw authError(AUTH_ERROR_CODES.SESSION_EXPIRED, 'Refresh token has expired.');
    }

    if (session.user.status !== UserStatus.ACTIVE) {
      throw authError(AUTH_ERROR_CODES.ACCOUNT_SUSPENDED, 'Account is not active.');
    }

    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date(), revokedReason: 'rotated' },
    });

    return this.issueTokenPair({ id: session.user.id, roles: session.user.roles }, device, platform);
  }

  async logout(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);
    await this.prisma.session.updateMany({
      where: { refreshTokenHash: tokenHash, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'logout' },
    });
    return { loggedOut: true };
  }

  async listSessions(userId: string) {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        platform: true,
        userAgent: true,
        ip: true,
        deviceLabel: true,
        createdAt: true,
        lastUsedAt: true,
      },
      orderBy: { lastUsedAt: 'desc' },
    });
  }

  async revokeSession(userId: string, sessionId: string) {
    // Scoped by userId, not just id - a user can never revoke another
    // user's session (spec Phase 02 section 11), and a nonexistent id
    // returns the same 404 whether it belongs to someone else or nothing.
    const session = await this.prisma.session.findFirst({ where: { id: sessionId, userId } });
    if (!session) throw new BadRequestException('Session not found.');
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date(), revokedReason: 'user_revoked' },
    });
    return { revoked: true };
  }

  async revokeAllSessions(userId: string, reason: string, exceptSessionId?: string) {
    await this.prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    return { revoked: true };
  }

  async changePassword(userId: string, currentSessionId: string | undefined, currentPassword: string, newPassword: string) {
    const identity = await this.prisma.authIdentity.findUnique({
      where: { userId_provider: { userId, provider: AuthProvider.PASSWORD } },
    });
    if (!identity?.passwordHash) {
      throw new BadRequestException('This account does not have a password set.');
    }

    const valid = await this.verifyPassword(identity.passwordHash, currentPassword);
    if (!valid) {
      throw authError(AUTH_ERROR_CODES.INVALID_CREDENTIALS, 'Current password is incorrect.');
    }

    const newHash = await this.hashPassword(newPassword);
    await this.prisma.authIdentity.update({ where: { id: identity.id }, data: { passwordHash: newHash } });

    // Safe default: keep the session that made this request, revoke every other one.
    await this.revokeAllSessions(userId, 'password_changed', currentSessionId);
    await this.audit.log({ actorId: userId, action: 'auth.passwordChanged' });

    return { changed: true };
  }

  async requestPasswordReset(email: string) {
    const normalized = this.normalizeEmail(email);
    const user = await this.prisma.user.findUnique({ where: { email: normalized } });
    // Do not reveal whether the account exists.
    if (!user) return { requested: true };

    const token = this.generateOpaqueToken();
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await this.prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt } });
    await this.mailer.sendPasswordReset(user.email, token);
    return { requested: true };
  }

  async resetPassword(token: string, newPassword: string) {
    const tokenHash = this.hashToken(token);
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!record) {
      throw new BadRequestException({ code: AUTH_ERROR_CODES.TOKEN_INVALID, message: 'Invalid reset token.' });
    }
    if (record.consumedAt) {
      throw new BadRequestException({
        code: AUTH_ERROR_CODES.TOKEN_ALREADY_USED,
        message: 'This reset token has already been used.',
      });
    }
    if (record.expiresAt < new Date()) {
      throw new BadRequestException({ code: AUTH_ERROR_CODES.TOKEN_EXPIRED, message: 'Reset token has expired.' });
    }

    const passwordHash = await this.hashPassword(newPassword);

    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({ where: { id: record.id }, data: { consumedAt: new Date() } }),
      this.prisma.authIdentity.upsert({
        where: { userId_provider: { userId: record.userId, provider: AuthProvider.PASSWORD } },
        update: { passwordHash },
        create: { userId: record.userId, provider: AuthProvider.PASSWORD, passwordHash },
      }),
      this.prisma.session.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'password_reset' },
      }),
    ]);

    await this.audit.log({ actorId: record.userId, action: 'auth.passwordReset' });
    return { reset: true };
  }

  /**
   * Google OAuth account linking. NOTE: this backend was never exercised
   * against real Google credentials in this build session (no
   * GOOGLE_CLIENT_ID/SECRET configured) - treat successful Google login as
   * UNVERIFIED_EXTERNAL_CREDENTIAL until validated against a live Google App.
   * See docs/backend/AUTH.md.
   */
  async findOrCreateGoogleUser(profile: { googleId: string; email: string; displayName: string }) {
    const email = this.normalizeEmail(profile.email);

    const existingIdentity = await this.prisma.authIdentity.findUnique({
      where: { provider_providerUserId: { provider: AuthProvider.GOOGLE, providerUserId: profile.googleId } },
      include: { user: true },
    });
    if (existingIdentity) return existingIdentity.user;

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      await this.prisma.authIdentity.create({
        data: { userId: existingUser.id, provider: AuthProvider.GOOGLE, providerUserId: profile.googleId },
      });
      return existingUser;
    }

    return this.prisma.user.create({
      data: {
        email,
        displayName: profile.displayName,
        emailVerifiedAt: new Date(),
        roles: [Role.USER],
        authIdentities: {
          create: { provider: AuthProvider.GOOGLE, providerUserId: profile.googleId },
        },
      },
    });
  }

  private addDuration(base: Date, duration: string): Date {
    const match = /^(\d+)([smhd])$/.exec(duration);
    if (!match) return new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);
    const value = parseInt(match[1], 10);
    const unitMs: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    return new Date(base.getTime() + value * unitMs[match[2]]);
  }
}

// A real (pre-computed) argon2id hash of a fixed, unused password. Used only
// so a nonexistent-user login attempt still pays a genuine verify() cost -
// matching a real failed-password attempt's timing rather than fast-failing
// on a malformed/placeholder hash, which would reopen the timing side-channel
// this is meant to close.
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$qfuCAXeuRsuu7Xt+/bJM9Q$HO9ejfC7UvJgFm4pKBLMhi/uKTju2VVDw2+i6b6uBIE';
