import { BadRequestException } from '@nestjs/common';
import { EntityKind } from '@prisma/client';
import { SearchService } from './search.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SearchQueryDto } from './dto/search-query.dto';

const emptyRow = () => [];

/** Routes a mocked `$queryRaw` call to a canned result set based on which table its SQL text mentions. */
function makeRoutedPrisma(routes: Record<string, any[]>) {
  const $queryRaw = jest.fn((strings: TemplateStringsArray) => {
    const sql = strings.join(' ');
    for (const [table, rows] of Object.entries(routes)) {
      if (sql.includes(`"${table}"`)) return Promise.resolve(rows);
    }
    return Promise.resolve(emptyRow());
  });
  return { $queryRaw };
}

describe('SearchService.search', () => {
  let service: SearchService;

  const dto = (overrides: Partial<SearchQueryDto> = {}): SearchQueryDto => ({ q: 'Hue', ...overrides });

  it('rejects an empty/whitespace-only query', async () => {
    const prisma = makeRoutedPrisma({});
    service = new SearchService(prisma as unknown as PrismaService);
    await expect(service.search(dto({ q: '   ' }), 'vi')).rejects.toThrow(BadRequestException);
  });

  it('rejects a query over the max length', async () => {
    const prisma = makeRoutedPrisma({});
    service = new SearchService(prisma as unknown as PrismaService);
    await expect(service.search(dto({ q: 'x'.repeat(201) }), 'vi')).rejects.toThrow(BadRequestException);
  });

  it('rejects an invalid entity type filter', async () => {
    const prisma = makeRoutedPrisma({});
    service = new SearchService(prisma as unknown as PrismaService);
    await expect(service.search(dto({ types: 'NOT_A_TYPE' }), 'vi')).rejects.toThrow(BadRequestException);
  });

  it('restricts to the requested type(s) only', async () => {
    const prisma = makeRoutedPrisma({
      Place: [{ id: 'p1', slug: 'co-do-hue', title: 'Co do Hue', importanceBonus: 0.1, nameSimilarity: 0.9, aliasSimilarity: 0, matchedLocale: 'vi', exactMatch: false }],
      Person: [{ id: 'person1', slug: 'someone', title: 'Someone Hue-ish', importanceBonus: 0.1, nameSimilarity: 0.9, aliasSimilarity: 0, matchedLocale: 'vi', exactMatch: false }],
    });
    service = new SearchService(prisma as unknown as PrismaService);
    const result = await service.search(dto({ types: 'PLACE' }), 'vi');
    expect(result.results.every((r) => r.entityType === EntityKind.PLACE)).toBe(true);
    const calls = (prisma.$queryRaw as jest.Mock).mock.calls;
    expect(calls.some((c) => c[0].join(' ').includes('"Person"'))).toBe(false);
  });

  it('drops results below the similarity threshold unless they are an exact match', async () => {
    const prisma = makeRoutedPrisma({
      Place: [
        { id: 'p1', slug: 'weak', title: 'Weak Match', importanceBonus: 0, nameSimilarity: 0.05, aliasSimilarity: 0, matchedLocale: 'vi', exactMatch: false },
        { id: 'p2', slug: 'exact', title: 'Hue', importanceBonus: 0, nameSimilarity: 0.05, aliasSimilarity: 0, matchedLocale: 'vi', exactMatch: true },
      ],
    });
    service = new SearchService(prisma as unknown as PrismaService);
    const result = await service.search(dto({ types: 'PLACE' }), 'vi');
    expect(result.results.map((r) => r.slug)).toEqual(['exact']);
  });

  it('ranks an exact match above a merely-important fuzzy match (spec section 40: importance never outranks exactness)', async () => {
    const prisma = makeRoutedPrisma({
      Place: [
        { id: 'p1', slug: 'very-important', title: 'Somewhat Similar', importanceBonus: 0.1, nameSimilarity: 0.9, aliasSimilarity: 0, matchedLocale: 'vi', exactMatch: false },
        { id: 'p2', slug: 'exact-but-minor', title: 'Hue', importanceBonus: 0, nameSimilarity: 0.2, aliasSimilarity: 0, matchedLocale: 'vi', exactMatch: true },
      ],
    });
    service = new SearchService(prisma as unknown as PrismaService);
    const result = await service.search(dto({ types: 'PLACE' }), 'vi');
    expect(result.results[0].slug).toBe('exact-but-minor');
  });

  it('gives community-story results a relevance penalty so they cannot outrank a major historical entity of similar textual similarity', async () => {
    const prisma = makeRoutedPrisma({
      Place: [{ id: 'p1', slug: 'co-do-hue', title: 'Co do Hue', importanceBonus: 0.05, nameSimilarity: 0.5, aliasSimilarity: 0, matchedLocale: 'vi', exactMatch: false }],
      CommunityStory: [{ id: 'cs1', slug: 'my-hue-trip', title: 'My Hue Trip', importanceBonus: -0.05, nameSimilarity: 0.5, aliasSimilarity: 0, matchedLocale: 'vi', exactMatch: false }],
    });
    service = new SearchService(prisma as unknown as PrismaService);
    const result = await service.search(dto(), 'vi');
    const placeIdx = result.results.findIndex((r) => r.entityType === EntityKind.PLACE);
    const communityIdx = result.results.findIndex((r) => r.entityType === EntityKind.COMMUNITY_STORY);
    expect(placeIdx).toBeLessThan(communityIdx);
  });

  it('excludes archived sources server-side', async () => {
    const prisma = makeRoutedPrisma({});
    service = new SearchService(prisma as unknown as PrismaService);
    await service.search(dto({ types: 'SOURCE' }), 'vi');
    const call = (prisma.$queryRaw as jest.Mock).mock.calls.find((c) => c[0].join(' ').includes('"Source"'));
    expect(call[0].join(' ')).toContain('archivedAt');
  });

  it('every per-type query wraps similarity() in immutable_unaccent(lower(...)) so diacritics and case never block a match', async () => {
    const prisma = makeRoutedPrisma({});
    service = new SearchService(prisma as unknown as PrismaService);
    await service.search(dto(), 'vi');
    const calls = (prisma.$queryRaw as jest.Mock).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      const sql = call[0].join(' ');
      expect(sql).toContain('immutable_unaccent');
    }
  });

  it('every per-type query uses DISTINCT ON to avoid duplicate rows when both the requested and canonical-locale translations exist', async () => {
    const prisma = makeRoutedPrisma({});
    service = new SearchService(prisma as unknown as PrismaService);
    await service.search(dto({ types: 'PLACE,PERSON,EVENT,STORY,JOURNEY' }), 'vi');
    const calls = (prisma.$queryRaw as jest.Mock).mock.calls;
    for (const call of calls) {
      expect(call[0].join(' ')).toContain('DISTINCT ON');
    }
  });

  it('reports fallbackUsed when the matched translation was not the requested locale', async () => {
    const prisma = makeRoutedPrisma({
      Place: [{ id: 'p1', slug: 'co-do-hue', title: 'Co do Hue', importanceBonus: 0, nameSimilarity: 0.9, aliasSimilarity: 0, matchedLocale: 'vi', exactMatch: false }],
    });
    service = new SearchService(prisma as unknown as PrismaService);
    const result = await service.search(dto({ types: 'PLACE' }), 'en');
    expect(result.results[0].fallbackUsed).toBe(true);
  });
});

describe('SearchService.suggest', () => {
  it('returns an empty suggestion list for an empty query without touching the database', async () => {
    const prisma = makeRoutedPrisma({});
    const service = new SearchService(prisma as unknown as PrismaService);
    const result = await service.suggest('   ', 'vi');
    expect(result.suggestions).toEqual([]);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('rejects an over-long query', async () => {
    const prisma = makeRoutedPrisma({});
    const service = new SearchService(prisma as unknown as PrismaService);
    await expect(service.suggest('x'.repeat(201), 'vi')).rejects.toThrow(BadRequestException);
  });

  it('caps suggestions at the requested limit', async () => {
    const prisma = makeRoutedPrisma({
      Place: Array.from({ length: 10 }, (_, i) => ({
        id: `p${i}`,
        slug: `place-${i}`,
        title: 'Hue',
        importanceBonus: 0,
        nameSimilarity: 0.9,
        aliasSimilarity: 0,
        matchedLocale: 'vi',
        exactMatch: true,
      })),
    });
    const service = new SearchService(prisma as unknown as PrismaService);
    const result = await service.suggest('Hue', 'vi', 3);
    expect(result.suggestions.length).toBe(3);
  });
});
