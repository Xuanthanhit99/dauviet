import { Injectable } from '@nestjs/common';
import { EntityKind } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SearchQueryDto } from './dto/search-query.dto';

interface SearchRow {
  id: string;
  slug: string;
  title: string;
  importanceBonus: number;
  similarity: number;
}

interface SearchResultItem {
  entityType: EntityKind;
  id: string;
  slug: string;
  title: string;
  score: number;
}

const SIMILARITY_THRESHOLD = 0.15;
const RESULTS_PER_TYPE = 20;

/**
 * MVP full-text/fuzzy search built entirely on PostgreSQL (pg_trgm), per spec
 * section 23 - no separate search cluster for V1. Ranking = trigram
 * similarity + a small historical-importance bonus, with community content
 * given a deliberate penalty so it can never outrank major historical
 * entities on relevance alone. The per-type query shape here is the seam an
 * OpenSearch/Elasticsearch replacement would slot into later without
 * touching the domain layer.
 */
@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(query: SearchQueryDto, locale: string) {
    const q = query.q.trim();
    if (!q) return { query: q, results: [] };

    const requestedTypes = query.types
      ? query.types.split(',').map((t) => t.trim().toUpperCase())
      : undefined;

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
        if (row.similarity < SIMILARITY_THRESHOLD) continue;
        results.push({
          entityType: group.type,
          id: row.id,
          slug: row.slug,
          title: row.title,
          score: row.similarity + row.importanceBonus,
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return { query: q, results: results.slice(0, 50) };
  }

  private async searchPlaces(q: string, locale: string): Promise<SearchRow[]> {
    return this.prisma.$queryRaw<SearchRow[]>`
      SELECT p."id", p."canonicalSlug" as slug, pt."name" as title,
             (p."historicalImportance" * 0.01) as "importanceBonus",
             GREATEST(
               similarity(pt."name", ${q}),
               COALESCE((SELECT MAX(similarity(a."alias", ${q})) FROM "EntityAlias" a WHERE a."entityType" = 'PLACE' AND a."entityId" = p."id"), 0)
             ) as similarity
      FROM "Place" p
      JOIN "PlaceTranslation" pt ON pt."placeId" = p."id"
      WHERE p."publicationStatus" = 'PUBLISHED' AND (pt."locale" = ${locale} OR pt."locale" = 'vi')
      ORDER BY similarity DESC
      LIMIT ${RESULTS_PER_TYPE}
    `;
  }

  private async searchPeople(q: string, locale: string): Promise<SearchRow[]> {
    return this.prisma.$queryRaw<SearchRow[]>`
      SELECT p."id", p."canonicalSlug" as slug, pt."displayName" as title,
             (p."historicalImportance" * 0.01) as "importanceBonus",
             GREATEST(
               similarity(pt."displayName", ${q}),
               COALESCE((SELECT MAX(similarity(a."alias", ${q})) FROM "EntityAlias" a WHERE a."entityType" = 'PERSON' AND a."entityId" = p."id"), 0)
             ) as similarity
      FROM "Person" p
      JOIN "PersonTranslation" pt ON pt."personId" = p."id"
      WHERE p."publicationStatus" = 'PUBLISHED' AND (pt."locale" = ${locale} OR pt."locale" = 'vi')
      ORDER BY similarity DESC
      LIMIT ${RESULTS_PER_TYPE}
    `;
  }

  private async searchEvents(q: string, locale: string): Promise<SearchRow[]> {
    return this.prisma.$queryRaw<SearchRow[]>`
      SELECT e."id", e."canonicalSlug" as slug, et."title" as title,
             (e."importance" * 0.01) as "importanceBonus",
             GREATEST(
               similarity(et."title", ${q}),
               COALESCE((SELECT MAX(similarity(a."alias", ${q})) FROM "EntityAlias" a WHERE a."entityType" = 'EVENT' AND a."entityId" = e."id"), 0)
             ) as similarity
      FROM "HistoricalEvent" e
      JOIN "HistoricalEventTranslation" et ON et."eventId" = e."id"
      WHERE e."publicationStatus" = 'PUBLISHED' AND (et."locale" = ${locale} OR et."locale" = 'vi')
      ORDER BY similarity DESC
      LIMIT ${RESULTS_PER_TYPE}
    `;
  }

  private async searchEras(q: string, locale: string): Promise<SearchRow[]> {
    return this.prisma.$queryRaw<SearchRow[]>`
      SELECT er."id", er."canonicalSlug" as slug, ert."name" as title,
             0 as "importanceBonus",
             similarity(ert."name", ${q}) as similarity
      FROM "HistoricalEra" er
      JOIN "HistoricalEraTranslation" ert ON ert."eraId" = er."id"
      WHERE (ert."locale" = ${locale} OR ert."locale" = 'vi')
      ORDER BY similarity DESC
      LIMIT ${RESULTS_PER_TYPE}
    `;
  }

  private async searchStories(q: string, locale: string): Promise<SearchRow[]> {
    return this.prisma.$queryRaw<SearchRow[]>`
      SELECT s."id", s."canonicalSlug" as slug, st."title" as title,
             0.02 as "importanceBonus",
             similarity(st."title", ${q}) as similarity
      FROM "Story" s
      JOIN "StoryTranslation" st ON st."storyId" = s."id"
      WHERE s."editorialStatus" = 'PUBLISHED' AND (st."locale" = ${locale} OR st."locale" = 'vi')
      ORDER BY similarity DESC
      LIMIT ${RESULTS_PER_TYPE}
    `;
  }

  private async searchJourneys(q: string, locale: string): Promise<SearchRow[]> {
    return this.prisma.$queryRaw<SearchRow[]>`
      SELECT j."id", j."canonicalSlug" as slug, jt."title" as title,
             0 as "importanceBonus",
             similarity(jt."title", ${q}) as similarity
      FROM "Journey" j
      JOIN "JourneyTranslation" jt ON jt."journeyId" = j."id"
      WHERE j."editorialStatus" = 'PUBLISHED' AND (jt."locale" = ${locale} OR jt."locale" = 'vi')
      ORDER BY similarity DESC
      LIMIT ${RESULTS_PER_TYPE}
    `;
  }

  private async searchSources(q: string): Promise<SearchRow[]> {
    return this.prisma.$queryRaw<SearchRow[]>`
      SELECT s."id", s."id" as slug, s."title" as title,
             0 as "importanceBonus",
             similarity(s."title", ${q}) as similarity
      FROM "Source" s
      ORDER BY similarity DESC
      LIMIT ${RESULTS_PER_TYPE}
    `;
  }

  private async searchCommunityStories(q: string, locale: string): Promise<SearchRow[]> {
    return this.prisma.$queryRaw<SearchRow[]>`
      SELECT cs."id", cs."canonicalSlug" as slug, cst."title" as title,
             -0.05 as "importanceBonus",
             similarity(cst."title", ${q}) as similarity
      FROM "CommunityStory" cs
      JOIN "CommunityStoryTranslation" cst ON cst."storyId" = cs."id"
      WHERE cs."moderationStatus" = 'VISIBLE' AND (cst."locale" = ${locale} OR cst."locale" = 'vi')
      ORDER BY similarity DESC
      LIMIT ${RESULTS_PER_TYPE}
    `;
  }
}
