import slugify from 'slugify';

/** Diacritic-stripping slug generator, used for canonicalSlug (VI-based, stable) and per-locale translation slugs. */
export function toSlug(input: string): string {
  return slugify(input, { lower: true, strict: true, locale: 'vi' });
}
