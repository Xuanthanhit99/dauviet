import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { AppConfig } from '../../../config/configuration';

/**
 * Only registers if Google credentials are configured, so the API still boots
 * cleanly in environments without OAuth credentials (spec section 39).
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService<AppConfig, true>) {
    const google = config.get('google', { infer: true });
    super({
      clientID: google.clientId || 'not-configured',
      clientSecret: google.clientSecret || 'not-configured',
      callbackURL: google.callbackUrl || 'http://localhost:3000/v1/auth/google/callback',
      scope: ['email', 'profile'],
    });
  }

  validate(_accessToken: string, _refreshToken: string, profile: any, done: VerifyCallback) {
    const email = profile.emails?.[0]?.value;
    const user = {
      googleId: profile.id,
      email,
      displayName: profile.displayName ?? email,
    };
    done(null, user);
  }
}
