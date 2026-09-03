import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ClientPlatform } from '@prisma/client';

/**
 * Reads `X-Client-Platform: web|ios|android` to decide whether an auth
 * endpoint should use the browser cookie flow (`web`) or the JSON
 * token-in-body flow (everything else, including no header at all - the
 * safe default that preserves existing mobile/API-consumer behavior).
 */
export const Platform = createParamDecorator((_data: unknown, ctx: ExecutionContext): ClientPlatform => {
  const request = ctx.switchToHttp().getRequest();
  const header = (request.headers['x-client-platform'] as string | undefined)?.toUpperCase();
  if (header === 'WEB' || header === 'IOS' || header === 'ANDROID') {
    return header as ClientPlatform;
  }
  return ClientPlatform.OTHER;
});
