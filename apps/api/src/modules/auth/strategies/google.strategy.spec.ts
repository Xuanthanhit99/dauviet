import { UnauthorizedException } from '@nestjs/common';
import { GoogleStrategy } from './google.strategy';
import { AUTH_ERROR_CODES } from '../auth-error-codes';

/** G12: a Google identity is only accepted (and so only ever linked by email) when Google has verified that email. */
describe('GoogleStrategy.validate (G12 verified-email requirement)', () => {
  const strategy = new GoogleStrategy({ get: () => ({ clientId: '', clientSecret: '', callbackUrl: '' }) } as any);
  const run = (profile: any) => {
    let result: { err: unknown; user: unknown } = { err: undefined, user: undefined };
    strategy.validate('at', 'rt', profile, (err: unknown, user?: unknown) => {
      result = { err, user };
    });
    return result;
  };

  it('accepts a verified email (emails[0].verified)', () => {
    const r = run({ id: 'g1', displayName: 'A', emails: [{ value: 'a@example.com', verified: true }] });
    expect(r.err).toBeNull();
    expect(r.user).toEqual({ googleId: 'g1', email: 'a@example.com', displayName: 'A' });
  });

  it('accepts a verified email (_json.email_verified)', () => {
    const r = run({ id: 'g2', emails: [{ value: 'b@example.com' }], _json: { email_verified: true } });
    expect(r.err).toBeNull();
  });

  it.each([
    ['unverified', { id: 'g3', emails: [{ value: 'c@example.com', verified: false }] }],
    ['verification unknown', { id: 'g4', emails: [{ value: 'd@example.com' }] }],
    ['no email', { id: 'g5', emails: [] }],
  ])('rejects %s', (_label, profile) => {
    const r = run(profile);
    expect(r.err).toBeInstanceOf(UnauthorizedException);
    expect((r.err as UnauthorizedException).getResponse()).toMatchObject({ code: AUTH_ERROR_CODES.GOOGLE_EMAIL_UNVERIFIED });
    expect(r.user).toBe(false);
  });
});
