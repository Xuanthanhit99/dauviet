import { CANONICAL_LOCALE } from '../decorators/locale.decorator';

interface HasLocale {
  locale: string;
}

/**
 * Locale fallback contract (spec section 48): try the requested locale, then
 * fall back to the canonical Vietnamese translation, then any remaining
 * translation. Callers must surface `fallbackApplied` in response meta so
 * clients never mistake a fallback for the locale they asked for.
 */
export function resolveTranslation<T extends HasLocale>(
  translations: T[],
  requestedLocale: string,
): { translation: T | null; resolvedLocale: string | null; fallbackApplied: boolean } {
  const exact = translations.find((t) => t.locale === requestedLocale);
  if (exact) return { translation: exact, resolvedLocale: exact.locale, fallbackApplied: false };

  const canonical = translations.find((t) => t.locale === CANONICAL_LOCALE);
  if (canonical) return { translation: canonical, resolvedLocale: canonical.locale, fallbackApplied: true };

  const any = translations[0];
  if (any) return { translation: any, resolvedLocale: any.locale, fallbackApplied: true };

  return { translation: null, resolvedLocale: null, fallbackApplied: false };
}
