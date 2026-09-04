import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityKind } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DISCOVERY_ERROR_CODES } from '../../common/errors/discovery-error-codes';
import { CANONICAL_LOCALE } from '../../common/decorators/locale.decorator';
import { SearchQueryDto } from './dto/search-query.dto';

interface SearchRow {
  id: string;
  slug: string;
  title: string;
  importanceBonus: number;
  nameSimilarity: number;
  aliasSimilarity: number;
  matchedLocale: string | null;
  exactMatch: boolean;
}

interface SearchResultItem {
  entityType: EntityKind;
  id: string;
  slug: string;
  title: string;
  matchedOn: 'name' | 'alias';
  score: number;
  locale: string;
  actualLocale: string | null;
  fallbackUsed: boolean;
}

const SIMILARITY_THRESHOLD = 0.15;
const RESULTS_PER_TYPE = 20;
const MAX_RESULTS = 50;
const MAX_QUERY_LENGTH = 200;
/** Large enough that any exact match always outranks a fuzzy one, regardless of importance bonus (spec section 40). */
const EXACT_MATCH_BONUS = 10;

const VALID_SEARCH_TYPES = new Set<string>([
  EntityKind.PLACE,
  EntityKind.PERSON,
  EntityKind.EVENT,
  EntityKind.ERA,
  EntityKind.STORY,
  EntityKind.JOURNEY,
  EntityKind.SOURCE,
  EntityKind.COMMUNITY_STORY,
]);

/**
 * MVP full-text/fuzzy search built entirely on PostgreSQL (pg_trgm +
 * unaccent), per spec section 32 - no separate search cluster for V1.
 * Ranking = trigram similarity (over the diacritic-stripped, lower-cased
 * text - spec section 33/34) + a small historical-importance bonus + a
 * large exact-match bonus (spec section 40), with community content given a
 * deliberate penalty so it can never outrank major historical entities on
 * relevance alone (spec section 39). The per-type query shape here is the
 * seam an OpenSearch/Elasticsearch replacement would slot into later
 * without touching the domain layer - see docs/backend/
 * DISCOVERY_ARCHITECTURE.md for the full contract, including why a
 * materialized `SearchDocument` projection was NOT added in this phase.
 */
@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(query: SearchQueryDto, locale: string) {
    const q = query.q.trim();
    if (!q) {
      throw new BadRequestException({ code: DISCOVERY_ERROR_CODES.SEARCH_QUERY_REQUIRED, message: 'q is required.' });
    }
    if (q.length > MAX_QUERY_LENGTH) {
      throw new BadRequestException({ code: DISCOVERY_ERROR_CODES.SEARCH_QUERY_TOO_LONG, message: `q must be at most ${MAX_QUERY_LENGTH} characters.` });
    }

    const requestedTypes = query.types ? query.types.split(',').map((t) => t.trim().toUpperCase()) : undefined;
    if (requestedTypes && requestedTypes.some((t) => !VALID_SEARCH_TYPES.has(t))) {
      throw new BadRequestException({ code: DISCOVERY_ERROR_CODES.SEARCH_INVALID_TYPE, message: `types must be a comma-separated list of: ${Array.from(VALID_SEARCH_TYPES).join(', ')}.` });
    }

    const searchers: Array<{ type: EntityKind; run: () => Promise<SearchRow[]> }> = [
      { type: EntityKind.PLACE, run: () => this.searchPlaces(q, locale) },
      { type: EntityKind.PERSON, run: () => this.searchPeople(q, locale) },
      { type: EntityKind.EVENT, run: () => this.searchEvents(q, locale) },
      { type: EntityKind.ERA, run: () => this.searchEras(q, locale) },
      { type: EntityKind.STORY, run: () => this.searchStories(q, locale) },
      { type: EntityKind.JOURNEY, run: () => this.searchJourneys(q, locale) },
      { type: EntityKind.SOURCE, run: () => this.searchSources(q) },
      { type: EntityKind.COMMUNITY_STORY, run: () => this.searchCommunityStories(q, locale) },
    ].filter((s) => !requestedTypes || requestedTypes.includes(s.type));

    const grouped = await Promise.all(searchers.map((s) => s.run().then((rows) => ({ type: s.type, rows }))));

    const results: SearchResultItem[] = [];
    for (const group of grouped) {
      for (const row of group.rows) {
        const similarity = Math.max(row.nameSimilarity, row.aliasSimilarity);
        if (similarity < SIMILARITY_THRESHOLD && !row.exactMatch) continue;
        results.push({
          entityType: group.type,
          id: row.id,
          slug: row.slug,
          title: row.title,
          matchedOn: row.aliasSimilarity > row.nameSimilarity ? 'alias' : 'name',
          score: similarity + row.importanceBonus + (row.exactMatch ? EXACT_MATCH_BONUS : 0),
          locale,
          actualLocale: row.matchedLocale,
          fallbackUsed: row.matchedLocale !== null && row.matchedLocale !== locale,
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return { query: q, results: results.slice(0, MAX_RESULTS) };
  }

  /** Lightweight, fast-path variant of `search` for a suggestions dropdown (spec section 50) - name/alias match only, no full ranking payload. */
  async suggest(q: string, locale: string, limit = 8) {
    const trimmed = q.trim();
    if (!trimmed) return { query: trimmed, suggestions: [] };
    if (trimmed.length > MAX_QUERY_LENGTH) {
      throw new BadRequestException({ code: DISCOVERY_ERROR_CODES.SEARCH_QUERY_TOO_LONG, message: `q must be at most ${MAX_QUERY_LENGTH} characters.` });
    }

    const { results } = await this.search({ q: trimmed } as SearchQueryDto, locale);
    return {
      query: trimmed,
      suggestions: results.slice(0, limit).map((r) => ({ entityType: r.entityType, id: r.id, slug: r.slug, title: r.title })),
    };
  }

  private async searchPlaces(q: string, locale: string): Promise<SearchRow[]> {
    return this.prisma.$queryRaw<SearchRow[]>`
      SELECT * FROM (
        SELECT DISTINCT ON (p."id")
          p."id", p."canonicalSlug" as slug, pt."name" as title, pt."locale" as "matchedLocale",
          (p."historicalImportance" * 0.01) as "importanceBonus",
          similarity(immutable_unaccent(lower(pt."name")), immutable_unaccent(lower(${q}))) as "nameSimilarity",
          COALESCE((SELECT MAX(similarity(immutable_unaccent(lower(a."alias")), immutable_unaccent(lower(${q})))) FROM "EntityAlias" a WHERE a."entityType" = 'PLACE' AND a."entityId" = p."id"), 0) as "aliasSimilarity",
          (immutable_unaccent(lower(pt."name")) = immutable_unaccent(lower(${q}))) as "exactMatch"
        FROM "Place" p
        JOIN "PlaceTranslation" pt ON pt."placeId" = p."id"
        WHERE p."publicationStatus" = 'PUBLISHED' AND (pt."locale" = ${locale} OR pt."locale" = ${CANONICAL_LOCALE})
        ORDER BY p."id", (CASE WHEN pt."locale" = ${locale} THEN 0 ELSE 1 END)
      ) sub
      ORDER BY GREATEST("nameSimilarity", "aliasSimilarity") DESC
      LIMIT ${RESULTS_PER_TYPE}
    `;
  }

  private async searchPeople(q: string, locale: string): Promise<SearchRow[]> {
    return this.prisma.$queryRaw<SearchRow[]>`
      SELECT * FROM (
        SELECT DISTINCT ON (p."id")
          p."id", p."canonicalSlug" as slug, pt."displayName" as title, pt."locale" as "matchedLocale",
          (p."historicalImportance" * 0.01) as "importanceBonus",
          similarity(immutable_unaccent(lower(pt."displayName")), immutable_unaccent(lower(${q}))) as "nameSimilarity",
          COALESCE((SELECT MAX(similarity(immutable_unaccent(lower(a."alias")), immutable_unaccent(lower(${q})))) FROM "EntityAlias" a WHERE a."entityType" = 'PERSON' AND a."entityId" = p."id"), 0) as "aliasSimilarity",
          (immutable_unaccent(lower(pt."displayName")) = immutable_unaccent(lower(${q}))) as "exactMatch"
        FROM "Person" p
        JOIN "PersonTranslation" pt ON pt."personId" = p."id"
        WHERE p."publicationStatus" = 'PUBLISHED' AND (pt."locale" = ${locale} OR pt."locale" = ${CANONICAL_LOCALE})
        ORDER BY p."id", (CASE WHEN pt."locale" = ${locale} THEN 0 ELSE 1 END)
      ) sub
      ORDER BY GREATEST("nameSimilarity", "aliasSimilarity") DESC
      LIMIT ${RESULTS_PER_TYPE}
    `;
  }

  private async searchEvents(q: string, locale: string): Promise<SearchRow[]> {
    return this.prisma.$queryRaw<SearchRow[]>`
      SELECT * FROM (
        SELECT DISTINCT ON (e."id")
          e."id", e."canonicalSlug" as slug, et."title" as title, et."locale" as "matchedLocale",
          (e."importance" * 0.01) as "importanceBonus",
          similarity(immutable_unaccent(lower(et."title")), immutable_unaccent(lower(${q}))) as "nameSimilarity",
          COALESCE((SELECT MAX(similarity(immutable_unaccent(lower(a."alias")), immutable_unaccent(lower(${q})))) FROM "EntityAlias" a WHERE a."entityType" = 'EVENT' AND a."entityId" = e."id"), 0) as "aliasSimilarity",
          (immutable_unaccent(lower(et."title")) = immutable_unaccent(lower(${q}))) as "exactMatch"
        FROM "HistoricalEvent" e
        JOIN "HistoricalEventTranslation" et ON et."eventId" = e."id"
        WHERE e."publicationStatus" = 'PUBLISHED' AND (et."locale" = ${locale} OR et."locale" = ${CANONICAL_LOCALE})
        ORDER BY e."id", (CASE WHEN et."locale" = ${locale} THEN 0 ELSE 1 END)
      ) sub
      ORDER BY GREATEST("nameSimilarity", "aliasSimilarity") DESC
      LIMIT ${RESULTS_PER_TYPE}
    `;
  }

  private async searchEras(q: string, locale: string): Promise<SearchRow[]> {
    return this.prisma.$queryRaw<SearchRow[]>`
      SELECT * FROM (
        SELECT DISTINCT ON (er."id")
          er."id", er."canonicalSlug" as slug, ert."name" as title, ert."locale" as "matchedLocale",
          0 as "importanceBonus",
          similarity(immutable_unaccent(lower(ert."name")), immutable_unaccent(lower(${q}))) as "nameSimilarity",
          0 as "aliasSimilarity",
          (immutable_unaccent(lower(ert."name")) = immutable_unaccent(lower(${q}))) as "exactMatch"
        FROM "HistoricalEra" er
        JOIN "HistoricalEraTranslation" ert ON ert."eraId" = er."id"
        WHERE (ert."locale" = ${locale} OR ert."locale" = ${CANONICAL_LOCALE})
        ORDER BY er."id", (CASE WHEN ert."locale" = ${locale} THEN 0 ELSE 1 END)
      ) sub
      ORDER BY "nameSimilarity" DESC
      LIMIT ${RESULTS_PER_TYPE}
    `;
  }

  private async searchStories(q: string, locale: string): Promise<SearchRow[]> {
    return this.prisma.$queryRaw<SearchRow[]>`
      SELECT * FROM (
        SELECT DISTINCT ON (s."id")
          s."id", s."canonicalSlug" as slug, st."title" as title, st."locale" as "matchedLocale",
          0.02 as "importanceBonus",
          similarity(immutable_unaccent(lower(st."title")), immutable_unaccent(lower(${q}))) as "nameSimilarity",
          0 as "aliasSimilarity",
          (immutable_unaccent(lower(st."title")) = immutable_unaccent(lower(${q}))) as "exactMatch"
        FROM "Story" s
        JOIN "StoryTranslation" st ON st."storyId" = s."id"
        WHERE s."editorialStatus" = 'PUBLISHED' AND (st."locale" = ${locale} OR st."locale" = ${CANONICAL_LOCALE})
        ORDER BY s."id", (CASE WHEN st."locale" = ${locale} THEN 0 ELSE 1 END)
      ) sub
      ORDER BY "nameSimilarity" DESC
      LIMIT ${RESULTS_PER_TYPE}
    `;
  }

  private async searchJourneys(q: string, locale: string): Promise<SearchRow[]> {
    return this.prisma.$queryRaw<SearchRow[]>`
      SELECT * FROM (
        SELECT DISTINCT ON (j."id")
          j."id", j."canonicalSlug" as slug, jt."title" as title, jt."locale" as "matchedLocale",
          0 as "importanceBonus",
          similarity(immutable_unaccent(lower(jt."title")), immutable_unaccent(lower(${q}))) as "nameSimilarity",
          0 as "aliasSimilarity",
          (immutable_unaccent(lower(jt."title")) = immutable_unaccent(lower(${q}))) as "exactMatch"
        FROM "Journey" j
        JOIN "JourneyTranslation" jt ON jt."journeyId" = j."id"
        WHERE j."editorialStatus" = 'PUBLISHED' AND (jt."locale" = ${locale} OR jt."locale" = ${CANONICAL_LOCALE})
        ORDER BY j."id", (CASE WHEN jt."locale" = ${locale} THEN 0 ELSE 1 END)
      ) sub
      ORDER BY "nameSimilarity" DESC
      LIMIT ${RESULTS_PER_TYPE}
    `;
  }

  /** Archived sources are excluded (spec section 43/44) - matches `SourcesService.list`'s public-browse filtering. */
  private async searchSources(q: string): Promise<SearchRow[]> {
    return this.prisma.$queryRaw<SearchRow[]>`
      SELECT s."id", s."id" as slug, s."title" as title, NULL as "matchedLocale",
             0 as "importanceBonus",
             similarity(immutable_unaccent(lower(s."title")), immutable_unaccent(lower(${q}))) as "nameSimilarity",
             0 as "aliasSimilarity",
             (immutable_unaccent(lower(s."title")) = immutable_unaccent(lower(${q}))) as "exactMatch"
      FROM "Source" s
      WHERE s."archivedAt" IS NULL
      ORDER BY "nameSimilarity" DESC
      LIMIT ${RESULTS_PER_TYPE}
    `;
  }

  /** Moderation-safe set matches PUBLIC_VISIBLE_STATUSES (spec Phase 08 section 39/50) - REMOVED and UNDER_REVIEW never surface in search. */
  private async searchCommunityStories(q: string, locale: string): Promise<SearchRow[]> {
    return this.prisma.$queryRaw<SearchRow[]>`
      SELECT * FROM (
        SELECT DISTINCT ON (cs."id")
          cs."id", cs."canonicalSlug" as slug, cst."title" as title, cst."locale" as "matchedLocale",
          -0.05 as "importanceBonus",
          similarity(immutable_unaccent(lower(cst."title")), immutable_unaccent(lower(${q}))) as "nameSimilarity",
          0 as "aliasSimilarity",
          (immutable_unaccent(lower(cst."title")) = immutable_unaccent(lower(${q}))) as "exactMatch"
        FROM "CommunityStory" cs
        JOIN "CommunityStoryTranslation" cst ON cst."storyId" = cs."id"
        WHERE cs."moderationStatus" IN ('VISIBLE', 'LIMITED', 'LOCKED') AND (cst."locale" = ${locale} OR cst."locale" = ${CANONICAL_LOCALE})
        ORDER BY cs."id", (CASE WHEN cst."locale" = ${locale} THEN 0 ELSE 1 END)
      ) sub
      ORDER BY "nameSimilarity" DESC
      LIMIT ${RESULTS_PER_TYPE}
    `;
  }
}
