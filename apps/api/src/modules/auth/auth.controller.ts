import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { ClientPlatform } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Platform } from '../../common/decorators/platform.decorator';
import { AppConfig } from '../../config/configuration';
import { AuthService, TokenPair } from './auth.service';
import { CsrfService } from './csrf.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { RequestPasswordResetDto, ResetPasswordDto } from './dto/password-reset.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { GoogleAuthGuard } from './guards/google-auth.guard';

const REFRESH_COOKIE_NAME = 'dv_refresh';

function deviceInfo(req: Request) {
  return { userAgent: req.headers['user-agent'], ip: req.ip };
}

/**
 * Web/mobile auth contract (full write-up: docs/backend/AUTH.md):
 *
 * - `X-Client-Platform: web` switches login/refresh/logout to cookie mode:
 *   the refresh token is set as an httpOnly cookie and stripped from the
 *   JSON body; a companion non-httpOnly CSRF cookie is set alongside it,
 *   and its value must be echoed back in an `X-CSRF-Token` header on
 *   `/auth/refresh` and `/auth/logout` (double-submit-cookie defense).
 * - Any other value (or no header at all - the default, and what mobile/
 *   native clients should send) keeps both tokens in the JSON response
 *   body, for the client to store in secure native storage and send the
 *   refresh token explicitly on refresh/logout. No cookies are involved,
 *   so there is nothing for CSRF to attack on that path.
 * - The access token is always a Bearer token in the Authorization header
 *   on both paths - CORS + explicit-header requirements already make it
 *   immune to cross-site forgery, so it never needs a cookie.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly csrf: CsrfService,
  ) {}

  private isProd() {
    return this.config.get('nodeEnv', { infer: true }) === 'production';
  }

  /** `/auth` scoped to the configured API prefix (e.g. `/v1/auth`) - the only path the browser needs to send the refresh cookie back to. */
  private refreshCookiePath() {
    return `/${this.config.get('apiPrefix', { infer: true })}/auth`;
  }

  private respondWithTokens(res: Response, platform: ClientPlatform, tokens: TokenPair, extra: Record<string, unknown> = {}) {
    if (platform === ClientPlatform.WEB) {
      const csrfToken = this.csrf.generateToken();
      res.cookie(REFRESH_COOKIE_NAME, tokens.refreshToken, {
        httpOnly: true,
        secure: this.isProd(),
        sameSite: 'lax',
        path: this.refreshCookiePath(),
        expires: tokens.refreshExpiresAt,
      });
      res.cookie(CsrfService.COOKIE_NAME, csrfToken, {
        httpOnly: false,
        secure: this.isProd(),
        sameSite: 'lax',
        path: '/',
        expires: tokens.refreshExpiresAt,
      });
      return { ...extra, accessToken: tokens.accessToken, expiresIn: tokens.expiresIn };
    }

    return { ...extra, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresIn: tokens.expiresIn };
  }

  private clearCookies(res: Response) {
    res.clearCookie(REFRESH_COOKIE_NAME, { path: this.refreshCookiePath() });
    res.clearCookie(CsrfService.COOKIE_NAME, { path: '/' });
  }

  private resolveRefreshToken(req: Request, dto: RefreshTokenDto): { token: string; fromCookie: boolean } {
    if (dto.refreshToken) return { token: dto.refreshToken, fromCookie: false };
    const cookieToken = (req as any).cookies?.[REFRESH_COOKIE_NAME];
    if (cookieToken) return { token: cookieToken, fromCookie: true };
    throw new BadRequestException({ code: 'AUTH_REFRESH_TOKEN_MISSING', message: 'No refresh token provided.' });
  }

  @Public()
  @ApiOperation({ summary: 'Register with email/password. Always assigns the USER role - roles can never be set from the request body.' })
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @ApiOperation({
    summary: 'Login with email/password.',
    description:
      'Send `X-Client-Platform: web` to receive the refresh token as an httpOnly cookie (and a companion readable CSRF cookie) instead of in the JSON body. Any other/absent value returns both tokens in the body for native/secure storage.',
  })
  @ApiHeader({ name: 'X-Client-Platform', required: false, description: 'web | ios | android (default: token-in-body mode)' })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Platform() platform: ClientPlatform,
  ) {
    const result = await this.authService.login(dto, deviceInfo(req), platform);
    return this.respondWithTokens(res, platform, result, { user: result.user });
  }

  @Public()
  @ApiOperation({
    summary: 'Rotate the refresh token for a new access/refresh pair.',
    description:
      'Body `refreshToken` for mobile/API clients. Web/cookie-mode clients omit the body and rely on the `dv_refresh` cookie, and must echo the `dv_csrf` cookie value in the `X-CSRF-Token` header (double-submit CSRF defense). The token presented is always revoked (single use) - presenting an already-used one revokes every session on the account as a theft response.',
  })
  @ApiHeader({ name: 'X-CSRF-Token', required: false, description: 'Required in cookie mode, must match the dv_csrf cookie' })
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('refresh')
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Platform() platform: ClientPlatform,
  ) {
    const { token, fromCookie } = this.resolveRefreshToken(req, dto);
    if (fromCookie) this.csrf.verify(req);

    const tokens = await this.authService.refresh(token, deviceInfo(req), platform);
    return this.respondWithTokens(res, platform, tokens);
  }

  @Public()
  @ApiOperation({ summary: 'Revoke the current session.', description: 'Same body/cookie/CSRF rules as /auth/refresh.' })
  @Post('logout')
  async logout(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookieToken = (req as any).cookies?.[REFRESH_COOKIE_NAME];
    const token = dto.refreshToken ?? cookieToken;
    if (cookieToken && !dto.refreshToken) this.csrf.verify(req);

    if (token) await this.authService.logout(token);
    this.clearCookies(res);
    return { loggedOut: true };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('email-verification/resend')
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendEmailVerification(dto.email);
  }

  @Public()
  @Post('verify-email')
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.token);
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('request-password-reset')
  requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    return this.authService.requestPasswordReset(dto.email);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Change password while authenticated.',
    description: 'Requires the current password. On success, every other session is revoked; the session making this request is kept.',
  })
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('change-password')
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.id, user.sessionId, dto.currentPassword, dto.newPassword);
  }

  @ApiBearerAuth()
  @Get('sessions')
  listSessions(@CurrentUser() user: AuthUser) {
    return this.authService.listSessions(user.id);
  }

  @ApiBearerAuth()
  @Delete('sessions/:id')
  revokeSession(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.authService.revokeSession(user.id, id);
  }

  @ApiBearerAuth()
  @Post('sessions/revoke-all')
  revokeAllSessions(@CurrentUser() user: AuthUser) {
    return this.authService.revokeAllSessions(user.id, 'user_revoke_all', user.sessionId);
  }

  @Public()
  @UseGuards(GoogleAuthGuard)
  @Get('google')
  googleAuth() {
    // handled by GoogleAuthGuard redirect
  }

  /**
   * Browser-redirect OAuth callback: tokens are never placed in the redirect
   * URL (query strings leak via browser history, Referer headers, and
   * server logs). Instead this sets the same httpOnly refresh/CSRF cookies
   * the web login flow uses, and the SPA calls POST /auth/refresh
   * (cookie mode) immediately after landing to mint its first access token.
   * NOTE: not exercised against real Google credentials in this build - see
   * docs/backend/AUTH.md ("UNVERIFIED_EXTERNAL_CREDENTIAL").
   */
  @Public()
  @UseGuards(GoogleAuthGuard)
  @Get('google/callback')
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const profile = req.user as { googleId: string; email: string; displayName: string };
    const user = await this.authService.findOrCreateGoogleUser(profile);
    const tokens = await this.authService.issueTokenPair(
      { id: user.id, roles: user.roles },
      deviceInfo(req),
      ClientPlatform.WEB,
    );

    const csrfToken = this.csrf.generateToken();
    res.cookie(REFRESH_COOKIE_NAME, tokens.refreshToken, {
      httpOnly: true,
      secure: this.isProd(),
      sameSite: 'lax',
      path: this.refreshCookiePath(),
      expires: tokens.refreshExpiresAt,
    });
    res.cookie(CsrfService.COOKIE_NAME, csrfToken, {
      httpOnly: false,
      secure: this.isProd(),
      sameSite: 'lax',
      path: '/',
      expires: tokens.refreshExpiresAt,
    });

    const webUrl = this.config.get('appUrl', { infer: true });
    res.redirect(`${webUrl}/auth/callback?login=success`);
  }
}
