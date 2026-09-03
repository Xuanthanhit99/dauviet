import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const SUPPORTED_LOCALES = ['vi', 'en'];
export const CANONICAL_LOCALE = 'vi';

/**
 * Resolves the requested locale from `?locale=` (falls back to Accept-Language,
 * then the canonical Vietnamese locale). Every content endpoint must have
 * predictable locale behavior (spec section 48) - this is the single place
 * that decides it.
 */
export const Locale = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest();
  const queryLocale = request.query?.locale as string | undefined;
  if (queryLocale && SUPPORTED_LOCALES.includes(queryLocale)) return queryLocale;

  const header = request.headers?.['accept-language'] as string | undefined;
  if (header) {
    const preferred = header.split(',')[0]?.split('-')[0]?.trim();
    if (preferred && SUPPORTED_LOCALES.includes(preferred)) return preferred;
  }

  return CANONICAL_LOCALE;
});
