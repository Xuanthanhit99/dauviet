import { ForbiddenException, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { Request } from 'express';
import { AUTH_ERROR_CODES } from './auth-error-codes';

/**
 * Double-submit-cookie CSRF defense (spec Phase 02 section 26). Only relevant
 * to the two endpoints that can authenticate via the httpOnly refresh cookie
 * (`/auth/refresh`, `/auth/logout` in web/cookie mode) - every other endpoint
 * uses a Bearer access token in the Authorization header, which a cross-site
 * form/fetch cannot forge, so it needs no CSRF token of its own.
 */
@Injectable()
export class CsrfService {
  static readonly COOKIE_NAME = 'dv_csrf';
  static readonly HEADER_NAME = 'x-csrf-token';

  generateToken(): string {
    return crypto.randomBytes(24).toString('base64url');
  }

  verify(req: Request): void {
    const cookieToken = (req as any).cookies?.[CsrfService.COOKIE_NAME];
    const headerToken = req.headers[CsrfService.HEADER_NAME] as string | undefined;
    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      throw new ForbiddenException({
        code: AUTH_ERROR_CODES.CSRF_INVALID,
        message: 'Missing or invalid CSRF token.',
      });
    }
  }
}
