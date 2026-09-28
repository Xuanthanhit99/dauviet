import { SearchEntityKind, SearchTrustClass } from '@prisma/client';

export type SearchMatchTier = 'EXACT_CANONICAL' | 'EXACT_LOCALIZED' | 'EXACT_ALIAS' | 'PREFIX' | 'TEXT' | 'FUZZY';

/**
 * Public search result item. Explicit DTO - never a raw Prisma record. `score` is an
 * opaque, tier-derived ordering hint kept for backward compatibility; it is NOT a database
 * relevance number and carries no factual or historical authority (use `matchTier`).
 */
export interface SearchResultItem {
  entityType: SearchEntityKind;
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  matchedOn: 'name' | 'alias';
  matchTier: SearchMatchTier;
  score: number;
  trustClass: SearchTrustClass;
  subtype: string | null;
  /** The locale the client asked for. */
  locale: string;
  /** The locale the returned title/summary actually came from (null for locale-less content). */
  actualLocale: string | null;
  fallbackUsed: boolean;
}

export interface SearchResponse {
  query: string;
  results: SearchResultItem[];
  nextCursor: string | null;
  hasMore: boolean;
}
