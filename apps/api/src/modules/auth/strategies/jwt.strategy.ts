import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserStatus } from '@prisma/client';
import { AppConfig } from '../../../config/configuration';
import { PrismaService } from '../../../prisma/prisma.service';
import { AUTH_ERROR_CODES } from '../auth-error-codes';

interface JwtPayload {
  sub: string;
  sid: string;
}

/**
 * Deliberately re-checks the session and user on every request rather than
 * trusting the JWT's signature alone: the access token carries only `sub`
 * (user id) and `sid` (session id), so a revoked session or a role/status
 * change takes effect immediately - not after the (short) access-token TTL
 * expires. This trades one extra indexed DB read per request for real-time
 * revocation, which is the property spec Phase 02 section 24 requires
 * ("suspended account cannot continue normal auth").
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService<AppConfig, true>, private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('jwt', { infer: true }).accessSecret,
    });
  }

  async validate(payload: JwtPayload) {
    const session = await this.prisma.session.findUnique({ where: { id: payload.sid } });
    if (!session || session.userId !== payload.sub) {
      throw new UnauthorizedException({ code: AUTH_ERROR_CODES.TOKEN_INVALID, message: 'Invalid session.' });
    }
    if (session.revokedAt) {
      throw new UnauthorizedException({ code: AUTH_ERROR_CODES.SESSION_REVOKED, message: 'Session has been revoked.' });
    }
    if (session.expiresAt < new Date()) {
      throw new UnauthorizedException({ code: AUTH_ERROR_CODES.SESSION_EXPIRED, message: 'Session has expired.' });
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      throw new UnauthorizedException({ code: AUTH_ERROR_CODES.TOKEN_INVALID, message: 'Account not found.' });
    }
    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException({ code: AUTH_ERROR_CODES.ACCOUNT_SUSPENDED, message: 'Account is suspended.' });
    }
    if (user.status === UserStatus.DISABLED || user.status === UserStatus.DELETED) {
      throw new UnauthorizedException({ code: AUTH_ERROR_CODES.ACCOUNT_DISABLED, message: 'Account is not available.' });
    }

    return { id: user.id, email: user.email, roles: user.roles, sessionId: session.id };
  }
}
