import { SearchProjectionService } from './search-projection.service';
import { PrismaService } from '../../prisma/prisma.service';

/** Unit contract of the projection writer. Concurrency, triggers, rebuild idempotency and recovery are proven against real PostgreSQL in test/search-map.e2e-spec.ts. */
describe('SearchProjectionService', () => {
  let tx: any;
  let prisma: any;
  let service: SearchProjectionService;

  const config: any = { get: () => ({ projectionWorkerEnabled: false, projectionIntervalMs: 2000, claimTimeoutSeconds: 60, drainBatchSize: 200 }) };

  const placeRecord = (over: Record<string, unknown> = {}) => ({
    id: 'p1',
    canonicalSlug: 'hoang-sa',
    type: 'ARCHIPELAGO',
    publicationStatus: 'PUBLISHED',
    historicalImportance: 9,
    currentCountryId: null,
    currentRegionId: null,
    currentCityId: null,
    translations: [
      { locale: 'vi', name: 'Hoàng Sa', summary: 'Quần đảo.' },
      { locale: 'en', name: 'Hoang Sa (Paracel Islands)', summary: null },
    ],
    ...over,
  });

  beforeEach(() => {
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ locked: '' }]),
      $executeRaw: jest.fn().mockResolvedValue(1),
      place: { findUnique: jest.fn().mockResolvedValue(placeRecord()) },
      entityAlias: { findMany: jest.fn().mockResolvedValue([]) },
      searchDocument: { upsert: jest.fn().mockResolvedValue({ id: 'doc1' }), deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      searchTerm: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }), createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    prisma = {
      $transaction: jest.fn((fn: any) => fn(tx)),
      $queryRaw: jest.fn().mockResolvedValue([]),
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    service = new SearchProjectionService(prisma as unknown as PrismaService, config);
  });

  const termsWritten = () => tx.searchTerm.createMany.mock.calls[0][0].data as Array<{ termKind: string; locale: string; aliasType: string | null; text: string; normalizedText: string }>;
  const docWritten = () => tx.searchDocument.upsert.mock.calls[0][0].create;

  it('takes a per-entity advisory lock BEFORE re-reading canonical truth (lost-update safety)', async () => {
    await service.refreshEntity('PLACE', 'p1');
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.place.findUnique.mock.invocationCallOrder[0]);
    expect(tx.$queryRaw.mock.calls[0][0].join('')).toContain('pg_advisory_xact_lock');
  });

  it('keeps canonical title, localized title and alias as DISTINCT term kinds (ALIAS != TRANSLATION)', async () => {
    tx.entityAlias.findMany.mockResolvedValue([{ locale: '', alias: 'Paracel', aliasType: 'ROMANIZATION' }]);
    await service.refreshEntity('PLACE', 'p1');
    const byKind = Object.fromEntries(termsWritten().map((t) => [`${t.termKind}:${t.locale}`, t]));
    expect(byKind['CANONICAL_TITLE:vi'].text).toBe('Hoàng Sa');
    expect(byKind['CANONICAL_TITLE:vi'].normalizedText).toBe('hoang sa');
    expect(byKind['LOCALIZED_TITLE:en'].normalizedText).toBe('hoang sa paracel islands');
    expect(byKind['ALIAS:'].aliasType).toBe('ROMANIZATION');
    expect(byKind['CANONICAL_TITLE:vi'].aliasType).toBeNull();
  });

  it('only stores translations that exist - a missing locale is never fabricated', async () => {
    tx.place.findUnique.mockResolvedValue(placeRecord({ translations: [{ locale: 'vi', name: 'Hoàng Sa', summary: null }] }));
    await service.refreshEntity('PLACE', 'p1');
    expect(Object.keys(docWritten().titles)).toEqual(['vi']);
    expect(termsWritten().some((t) => t.termKind === 'LOCALIZED_TITLE')).toBe(false);
  });

  it('does not invent aliases: with none stored there are no ALIAS terms', async () => {
    await service.refreshEntity('PLACE', 'p1');
    expect(termsWritten().some((t) => t.termKind === 'ALIAS')).toBe(false);
  });

  it('deduplicates terms that normalize identically and never collapses different kinds', async () => {
    tx.entityAlias.findMany.mockResolvedValue([
      { locale: '', alias: 'HOANG SA', aliasType: 'ALTERNATE_SPELLING' },
      { locale: '', alias: 'Hoàng Sa', aliasType: 'ALTERNATE_NAME' },
    ]);
    await service.refreshEntity('PLACE', 'p1');
    const aliases = termsWritten().filter((t) => t.termKind === 'ALIAS');
    expect(aliases).toHaveLength(1);
    expect(termsWritten().filter((t) => t.termKind === 'CANONICAL_TITLE')).toHaveLength(1);
  });

  it('stores normalized retrieval text while keeping the original display titles untouched', async () => {
    await service.refreshEntity('PLACE', 'p1');
    expect(docWritten().titles.vi).toBe('Hoàng Sa');
    expect(docWritten().normalizedNames).toContain('hoang sa');
    expect(docWritten().normalizedNames).not.toContain('Hoàng');
  });

  it('reuses the accepted importance value as-is (no new scale)', async () => {
    await service.refreshEntity('PLACE', 'p1');
    expect(docWritten().importance).toBe(9);
  });

  it('DELETES the document when the entity is no longer public (unpublish leaves no ghost result)', async () => {
    tx.place.findUnique.mockResolvedValue(placeRecord({ publicationStatus: 'DRAFT' }));
    await expect(service.refreshEntity('PLACE', 'p1')).resolves.toBe('DELETED');
    expect(tx.searchDocument.deleteMany).toHaveBeenCalledWith({ where: { entityKind: 'PLACE', entityId: 'p1' } });
    expect(tx.searchDocument.upsert).not.toHaveBeenCalled();
  });

  it('reports ABSENT when a non-public entity never had a document', async () => {
    tx.place.findUnique.mockResolvedValue(null);
    tx.searchDocument.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.refreshEntity('PLACE', 'p1')).resolves.toBe('ABSENT');
  });

  it('replaces the whole term set on every refresh (idempotent projection of the same canonical state)', async () => {
    await service.refreshEntity('PLACE', 'p1');
    await service.refreshEntity('PLACE', 'p1');
    expect(tx.searchTerm.deleteMany).toHaveBeenCalledTimes(2);
    expect(tx.searchTerm.createMany.mock.calls[0][0]).toEqual(tx.searchTerm.createMany.mock.calls[1][0]);
  });

  it('projects a Place geometry from canonical data via SQL (never from text)', async () => {
    await service.refreshEntity('PLACE', 'p1');
    const sqlCalls = tx.$executeRaw.mock.calls.map((c: any[]) => c[0].join('?'));
    expect(sqlCalls.some((s: string) => s.includes('SET "geom"'))).toBe(true);
  });

  describe('drain (queue -> refresh)', () => {
    it('refreshes a claimed entry and then completes the claim', async () => {
      const claim = { entityKind: 'PLACE', entityId: 'p1', lockedAt: new Date() };
      prisma.$queryRaw.mockResolvedValueOnce([claim]).mockResolvedValueOnce([]);
      const res = await service.drain();
      expect(res).toEqual({ processed: 1, upserted: 1, deleted: 0, failed: 0 });
      const deleted = prisma.$executeRaw.mock.calls.map((c: any[]) => c[0].join('?')).find((s: string) => s.includes('DELETE FROM "SearchProjectionQueue"'));
      expect(deleted).toContain('"lockedAt" =');
    });

    it('a failing refresh keeps the queue entry (recorded, not deleted) and does not throw - canonical stays safe', async () => {
      const claim = { entityKind: 'PLACE', entityId: 'p1', lockedAt: new Date() };
      prisma.$queryRaw.mockResolvedValueOnce([claim]).mockResolvedValueOnce([]);
      prisma.$transaction.mockRejectedValueOnce(new Error('projection boom'));
      const res = await service.drain();
      expect(res.failed).toBe(1);
      const sqls = prisma.$executeRaw.mock.calls.map((c: any[]) => c[0].join('?'));
      expect(sqls.some((s: string) => s.includes('DELETE FROM "SearchProjectionQueue"'))).toBe(false);
      expect(sqls.some((s: string) => s.includes('"lastError"'))).toBe(true);
    });

    it('claims with SKIP LOCKED and never holds a row lock while refreshing', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([]);
      await service.drain();
      const claimSql = prisma.$queryRaw.mock.calls[0][0].join('?');
      expect(claimSql).toContain('FOR UPDATE SKIP LOCKED');
      expect(claimSql).toContain('UPDATE "SearchProjectionQueue"');
    });

    it('processes nothing on an empty queue', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([]);
      expect(await service.drain()).toEqual({ processed: 0, upserted: 0, deleted: 0, failed: 0 });
    });
  });
});
