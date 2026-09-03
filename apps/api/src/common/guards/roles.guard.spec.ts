import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from './roles.guard';

function contextWithUser(user: { roles: string[] } | undefined) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any;
}

/**
 * Covers spec Phase 02 section 32 tests #6-8, #20: role-protected routes
 * are enforced server-side regardless of what a client claims - a USER or
 * EDITOR is rejected from an ADMIN-only route, an ADMIN passes, and a
 * request with no authenticated user at all is rejected outright.
 */
describe('RolesGuard', () => {
  function guardRequiring(...roles: Role[]) {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(roles) } as unknown as Reflector;
    return new RolesGuard(reflector);
  }

  it('allows a route through when no roles are required', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(contextWithUser({ roles: ['USER'] }))).toBe(true);
  });

  it('rejects a USER from an ADMIN-only route', () => {
    const guard = guardRequiring(Role.ADMIN);
    expect(() => guard.canActivate(contextWithUser({ roles: ['USER'] }))).toThrow(ForbiddenException);
  });

  it('rejects an EDITOR trying to self-promote via an ADMIN-only route', () => {
    const guard = guardRequiring(Role.ADMIN);
    expect(() => guard.canActivate(contextWithUser({ roles: ['EDITOR'] }))).toThrow(ForbiddenException);
  });

  it('allows an ADMIN through an ADMIN-only route', () => {
    const guard = guardRequiring(Role.ADMIN);
    expect(guard.canActivate(contextWithUser({ roles: ['ADMIN'] }))).toBe(true);
  });

  it('allows a user matching any one of several required roles', () => {
    const guard = guardRequiring(Role.EDITOR, Role.ADMIN);
    expect(guard.canActivate(contextWithUser({ roles: ['EDITOR'] }))).toBe(true);
  });

  it('rejects an unauthenticated request outright', () => {
    const guard = guardRequiring(Role.ADMIN);
    expect(() => guard.canActivate(contextWithUser(undefined))).toThrow(ForbiddenException);
  });
});
