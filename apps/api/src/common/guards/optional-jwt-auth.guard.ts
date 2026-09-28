import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * "Soft" auth for G10's anonymous-friendly affiliate click route (spec
 * section 6): unlike `@Public()` (which makes the GLOBAL `JwtAuthGuard`
 * skip the passport strategy entirely - `request.user` is NEVER populated,
 * even for a logged-in caller who sent a valid bearer token), this guard
 * ALWAYS attempts JWT validation and populates `request.user` when a valid
 * token is present, but never rejects the request when it is absent or
 * invalid. Applied locally (`@UseGuards(OptionalJwtAuthGuard)`) ALONGSIDE
 * `@Public()` on the same route - the global guard's `@Public()` check lets
 * unauthenticated requests through; this guard is the one that actually
 * captures the caller's identity when they happen to be logged in. Chosen
 * deliberately over modifying the global `JwtAuthGuard` itself, to avoid
 * touching that security-critical class at all for a single route's need.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = unknown>(_err: unknown, user: TUser): TUser | null {
    return user ?? null;
  }
}
