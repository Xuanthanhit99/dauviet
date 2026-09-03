import { ForbiddenException } from '@nestjs/common';
import { CsrfService } from './csrf.service';

describe('CsrfService', () => {
  const service = new CsrfService();

  function reqWith(cookie?: string, header?: string): any {
    return { cookies: cookie !== undefined ? { [CsrfService.COOKIE_NAME]: cookie } : {}, headers: header !== undefined ? { [CsrfService.HEADER_NAME]: header } : {} };
  }

  it('generates a non-trivial random token', () => {
    const a = service.generateToken();
    const b = service.generateToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(16);
  });

  it('accepts a request where the header matches the cookie', () => {
    expect(() => service.verify(reqWith('token-123', 'token-123'))).not.toThrow();
  });

  it('rejects a request with a mismatched header/cookie pair', () => {
    expect(() => service.verify(reqWith('token-123', 'different-token'))).toThrow(ForbiddenException);
  });

  it('rejects a request missing the cookie', () => {
    expect(() => service.verify(reqWith(undefined, 'token-123'))).toThrow(ForbiddenException);
  });

  it('rejects a request missing the header', () => {
    expect(() => service.verify(reqWith('token-123', undefined))).toThrow(ForbiddenException);
  });
});
