import { InvalidRedirectError, validateRedirectUrl } from './affiliate-redirect-security.util';

const ALLOWED = ['www.fixture-provider.example'];

describe('validateRedirectUrl (spec section 13/89 - open redirect matrix)', () => {
  it('accepts a valid https URL on an approved host', () => {
    expect(() => validateRedirectUrl('https://www.fixture-provider.example/hotel/123?label=abc', ALLOWED)).not.toThrow();
  });

  it('rejects an arbitrary external host', () => {
    expect(() => validateRedirectUrl('https://arbitrary.example/anything', ALLOWED)).toThrow(InvalidRedirectError);
  });

  it('rejects plain http scheme', () => {
    expect(() => validateRedirectUrl('http://www.fixture-provider.example/hotel/123', ALLOWED)).toThrow(InvalidRedirectError);
  });

  it('rejects javascript: scheme', () => {
    expect(() => validateRedirectUrl('javascript:alert(1)', ALLOWED)).toThrow(InvalidRedirectError);
  });

  it('rejects data: scheme', () => {
    expect(() => validateRedirectUrl('data:text/html,<script>alert(1)</script>', ALLOWED)).toThrow(InvalidRedirectError);
  });

  it('rejects a protocol-relative URL', () => {
    expect(() => validateRedirectUrl('//evil.example/phish', ALLOWED)).toThrow(InvalidRedirectError);
  });

  it('rejects a userinfo/credential URL', () => {
    expect(() => validateRedirectUrl('https://user:pass@www.fixture-provider.example/x', ALLOWED)).toThrow(InvalidRedirectError);
  });

  it('rejects a lookalike-userinfo host trick (trusted host before "@" is actually userinfo)', () => {
    expect(() => validateRedirectUrl('https://www.fixture-provider.example@evil.example/x', ALLOWED)).toThrow(InvalidRedirectError);
  });

  it('rejects a lookalike host (trusted name as a subdomain of an attacker domain)', () => {
    expect(() => validateRedirectUrl('https://www.fixture-provider.example.evil.example/x', ALLOWED)).toThrow(InvalidRedirectError);
  });

  it('rejects a subdomain trick (an unapproved subdomain of the real domain)', () => {
    expect(() => validateRedirectUrl('https://evil.www.fixture-provider.example/x', ALLOWED)).toThrow(InvalidRedirectError);
  });

  it('rejects an encoded-host bypass attempt', () => {
    expect(() => validateRedirectUrl('https://www.fixture-provider.example%2eevil.example/x', ALLOWED)).toThrow(InvalidRedirectError);
  });

  it('rejects a bare IP-literal host not on the allowlist', () => {
    expect(() => validateRedirectUrl('https://192.0.2.10/x', ALLOWED)).toThrow(InvalidRedirectError);
  });

  it('rejects a CRLF/header-injection attempt embedded in the URL string', () => {
    expect(() => validateRedirectUrl('https://www.fixture-provider.example/x\r\nSet-Cookie: evil=1', ALLOWED)).toThrow(InvalidRedirectError);
  });

  it('rejects a malformed URL', () => {
    expect(() => validateRedirectUrl('not a url at all', ALLOWED)).toThrow(InvalidRedirectError);
  });

  it('rejects an empty string', () => {
    expect(() => validateRedirectUrl('', ALLOWED)).toThrow(InvalidRedirectError);
  });

  it('host matching is case-insensitive but still exact (no suffix match)', () => {
    expect(() => validateRedirectUrl('https://WWW.FIXTURE-PROVIDER.EXAMPLE/x', ALLOWED)).not.toThrow();
    expect(() => validateRedirectUrl('https://WWW.FIXTURE-PROVIDER.EXAMPLE.evil.example/x', ALLOWED)).toThrow(InvalidRedirectError);
  });
});
