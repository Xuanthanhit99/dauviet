import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthUser {
  id: string;
  email: string;
  roles: string[];
  /** Present on requests authenticated via the standard JwtStrategy (i.e. almost always). */
  sessionId?: string;
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser | undefined => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});
