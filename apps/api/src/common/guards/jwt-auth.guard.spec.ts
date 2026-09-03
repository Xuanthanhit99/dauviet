import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { JwtAuthGuard } from './jwt-auth.guard';

/**
 * Covers spec Phase 02 section 32 test #19 (protected endpoint rejects
 * unauthenticated access): a route without @Public() must fall through to
 * the real passport-jwt check (which JwtStrategy.spec.ts proves rejects
 * missing/invalid/revoked sessions); only @Public() routes bypass it.
 */
describe('JwtAuthGuard', () => {
  const context = {
    switchToHttp: () => ({ getRequest: () => ({}), getResponse: () => ({}) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any;

  it('bypasses passport entirely for a @Public() route', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(true) } as unknown as Reflector;
    const guard = new JwtAuthGuard(reflector);
    const superSpy = jest.spyOn(AuthGuard('jwt').prototype, 'canActivate').mockReturnValue(true as any);

    expect(guard.canActivate(context)).toBe(true);
    expect(superSpy).not.toHaveBeenCalled();
    superSpy.mockRestore();
  });

  it('delegates to the real passport-jwt check for a non-public route', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) } as unknown as Reflector;
    const guard = new JwtAuthGuard(reflector);
    const superSpy = jest.spyOn(AuthGuard('jwt').prototype, 'canActivate').mockReturnValue(false as any);

    expect(guard.canActivate(context)).toBe(false);
    expect(superSpy).toHaveBeenCalled();
    superSpy.mockRestore();
  });
});
