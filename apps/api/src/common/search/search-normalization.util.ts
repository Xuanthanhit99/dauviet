/**
 * Deterministic server-side search normalization (G11 spec sections 17-19).
 *
 * The single implementation used BOTH when writing the search projection and
 * when normalizing a query, so stored and queried text can never drift. The
 * result is used only for retrieval - display text is always the canonical or
 * localized string, never this ASCII-folded form.
 *
 * Steps: NFD -> drop combining marks -> d-stroke folding (PostgreSQL's
 * `unaccent` also maps it, verified in G11's pre-implementation report, but
 * the application never relies on that) -> lower-case -> every run of
 * non-letter/non-digit characters becomes a single space -> trim.
 */
export function normalizeSearchText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Splits an already-normalized string into its tokens. */
export function tokenizeNormalized(normalized: string): string[] {
  return normalized.length === 0 ? [] : normalized.split(' ');
}

/**
 * Builds a `to_tsquery('simple', ...)` string from already-normalized tokens:
 * every token is reduced to letters/digits only (so no tsquery operator,
 * quote, backslash or `:` from user input can ever reach the parser), joined
 * with `&`, and the LAST token gets a prefix marker so typing-in-progress
 * queries match. Returns null when nothing usable remains.
 */
export function buildPrefixTsQuery(normalized: string): string | null {
  const tokens = tokenizeNormalized(normalized)
    .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return null;
  return tokens.map((t, i) => (i === tokens.length - 1 ? `${t}:*` : t)).join(' & ');
}

/** Escapes `%`, `_` and `\` so a value can be used as the literal part of a LIKE prefix pattern. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}
