import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntityKind, SearchEntityKind, SearchTermKind } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfig } from '../../config/configuration';
import { CANONICAL_LOCALE } from '../../common/decorators/locale.decorator';
import { normalizeSearchText } from '../../common/search/search-normalization.util';
import { ALIAS_KINDS, geometrySql, LOADERS } from './search-projection.loaders';

export type RefreshOutcome = 'UPSERTED' | 'DELETED' | 'ABSENT';

export interface ProjectionCounters {
  processed: number;
  upserted: number;
  deleted: number;
  failed: number;
}

interface ClaimedRow {
  entityKind: SearchEntityKind;
  entityId: string;
  lockedAt: Date;
}

const SUMMARY_TEXT_LIMIT = 600;
const REBUILD_CONCURRENCY = 6;

/**
 * G11 search projection maintenance. The projection is a REBUILDABLE cache
 * over canonical public entities (SEARCH INDEX != SOURCE OF TRUTH):
 *
 * - `refreshEntity` is the single write path. It runs in one transaction that
 *   takes a per-entity advisory lock, RE-READS canonical truth inside the lock
 *   and then upserts (public) or deletes (not public / gone) the document and
 *   its terms. Because it always recomputes from current canonical state, a
 *   refresh that raced a canonical write can never leave a permanently stale
 *   row: the write's own trigger has re-queued the entity.
 * - The queue is filled by AFTER row triggers (migration), so seeds, raw SQL
 *   and every service are covered, and a projection problem can never fail a
 *   canonical write (the trigger insert is a trivial upsert).
 * - `drain` claims entries in a short statement (never holding a row lock
 *   during the refresh), refreshes them, then deletes the queue entry ONLY if
 *   its claim token (`lockedAt`) is unchanged - any newer canonical change
 *   resets `lockedAt` and so keeps the entry queued.
 * - `rebuildAll` pushes every canonical id and every existing document
 *   through the same `refreshEntity` - idempotent by construction.
 */
@Injectable()
export class SearchProjectionService {
  private readonly logger = new Logger(SearchProjectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  private get settings() {
    return this.config.get('search', { infer: true });
  }

  async refreshEntity(kind: SearchEntityKind, id: string): Promise<RefreshOutcome> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${kind}:${id}`}, 0))::text AS locked`;

        const loaded = await LOADERS[kind](tx, id);
        if (!loaded) {
          const removed = await tx.searchDocument.deleteMany({ where: { entityKind: kind, entityId: id } });
          return removed.count > 0 ? 'DELETED' : 'ABSENT';
        }

        const aliases = ALIAS_KINDS.has(kind)
          ? await tx.entityAlias.findMany({
              where: { entityType: kind as unknown as EntityKind, entityId: id },
              orderBy: [{ locale: 'asc' }, { alias: 'asc' }],
            })
          : [];

        const terms = new Map<string, { termKind: SearchTermKind; locale: string; aliasType: (typeof aliases)[number]['aliasType'] | null; text: string; normalizedText: string }>();
        const addTerm = (termKind: SearchTermKind, locale: string, aliasType: (typeof aliases)[number]['aliasType'] | null, text: string) => {
          const normalizedText = normalizeSearchText(text);
          if (!normalizedText) return;
          const key = `${termKind}|${locale}|${normalizedText}`;
          if (!terms.has(key)) terms.set(key, { termKind, locale, aliasType, text, normalizedText });
        };

        const translations = [...loaded.translations].sort((a, b) => a.locale.localeCompare(b.locale));
        const titles: Record<string, string> = {};
        const summaries: Record<string, string> = {};
        for (const t of translations) {
          titles[t.locale] = t.title;
          if (t.summary && t.summary.trim()) summaries[t.locale] = t.summary;
          // Canonical-locale (or locale-less) titles are CANONICAL_TITLE; every other stored translation is LOCALIZED_TITLE.
          addTerm(t.locale === CANONICAL_LOCALE || t.locale === '' ? SearchTermKind.CANONICAL_TITLE : SearchTermKind.LOCALIZED_TITLE, t.locale, null, t.title);
        }
        for (const a of aliases) addTerm(SearchTermKind.ALIAS, a.locale, a.aliasType, a.alias);

        const termRows = [...terms.values()];
        const normalizedNames = [...new Set(termRows.map((t) => t.normalizedText))].join(' ');
        const summaryText = Object.values(summaries)
          .map((s) => normalizeSearchText(s.slice(0, SUMMARY_TEXT_LIMIT)))
          .filter(Boolean)
          .join(' ');
        const normalizedSearchText = `${normalizedNames} ${summaryText}`.trim();

        const data = {
          canonicalSlug: loaded.slug,
          trustClass: loaded.trustClass,
          subtype: loaded.subtype,
          importance: loaded.importance,
          titles,
          summaries,
          normalizedNames,
          normalizedSearchText,
          countryIds: loaded.countryIds,
          regionIds: loaded.regionIds,
          cityIds: loaded.cityIds,
          chronologyStart: loaded.chronologyStart,
          chronologyEnd: loaded.chronologyEnd,
        };
        const doc = await tx.searchDocument.upsert({
          where: { entityKind_entityId: { entityKind: kind, entityId: id } },
          create: { entityKind: kind, entityId: id, ...data },
          update: { ...data, projectedAt: new Date() },
          select: { id: true },
        });

        await tx.searchTerm.deleteMany({ where: { documentId: doc.id } });
        if (termRows.length > 0) {
          await tx.searchTerm.createMany({ data: termRows.map((t) => ({ documentId: doc.id, ...t })) });
        }

        const geometry = geometrySql(kind, id);
        if (geometry) {
          await tx.$executeRaw`UPDATE "SearchDocument" SET "geom" = (${geometry}) WHERE "id" = ${doc.id}`;
        }
        return 'UPSERTED';
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
  }

  /** Claims a batch in ONE short statement (no lock is held while refreshing). */
  private async claimBatch(): Promise<ClaimedRow[]> {
    const { claimTimeoutSeconds, drainBatchSize } = this.settings;
    return this.prisma.$queryRaw<ClaimedRow[]>`
      WITH picked AS (
        SELECT "entityKind", "entityId" FROM "SearchProjectionQueue"
        WHERE "lockedAt" IS NULL OR "lockedAt" < now() - make_interval(secs => ${claimTimeoutSeconds})
        ORDER BY "enqueuedAt" ASC, "entityKind" ASC, "entityId" ASC
        LIMIT ${drainBatchSize}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "SearchProjectionQueue" q
      SET "lockedAt" = clock_timestamp(), "attempts" = q."attempts" + 1
      FROM picked
      WHERE q."entityKind" = picked."entityKind" AND q."entityId" = picked."entityId"
      RETURNING q."entityKind", q."entityId", q."lockedAt"
    `;
  }

  /** Deletes the queue entry only if nothing re-queued it since the claim (a re-queue resets `lockedAt`). */
  private async completeClaim(row: ClaimedRow): Promise<void> {
    await this.prisma.$executeRaw`
      DELETE FROM "SearchProjectionQueue"
      WHERE "entityKind" = ${row.entityKind}::"SearchEntityKind" AND "entityId" = ${row.entityId} AND "lockedAt" = ${row.lockedAt}
    `;
  }

  /** Keeps the entry (still locked => natural backoff until the claim timeout) and records why. */
  private async failClaim(row: ClaimedRow, error: unknown): Promise<void> {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
    await this.prisma.$executeRaw`
      UPDATE "SearchProjectionQueue" SET "lastError" = ${message}
      WHERE "entityKind" = ${row.entityKind}::"SearchEntityKind" AND "entityId" = ${row.entityId} AND "lockedAt" = ${row.lockedAt}
    `;
  }

  private tally(counters: ProjectionCounters, outcome: RefreshOutcome) {
    counters.processed += 1;
    if (outcome === 'UPSERTED') counters.upserted += 1;
    if (outcome === 'DELETED') counters.deleted += 1;
  }

  /** Processes the whole queue (bounded by `maxEntries`). Safe to run from several instances at once (SKIP LOCKED). */
  async drain(maxEntries = 5000): Promise<ProjectionCounters> {
    const counters: ProjectionCounters = { processed: 0, upserted: 0, deleted: 0, failed: 0 };
    while (counters.processed + counters.failed < maxEntries) {
      const batch = await this.claimBatch();
      if (batch.length === 0) break;
      for (const row of batch) {
        try {
          const outcome = await this.refreshEntity(row.entityKind, row.entityId);
          await this.completeClaim(row);
          this.tally(counters, outcome);
        } catch (err) {
          counters.failed += 1;
          this.logger.warn(`search projection refresh failed for ${row.entityKind}:${row.entityId}: ${err instanceof Error ? err.message : err}`);
          await this.failClaim(row, err);
        }
      }
    }
    return counters;
  }

  private async canonicalIds(kind: SearchEntityKind): Promise<string[]> {
    const p = this.prisma;
    const rows: Array<{ id: string }> = await (
      {
        COUNTRY: () => p.country.findMany({ select: { id: true } }),
        REGION: () => p.region.findMany({ select: { id: true } }),
        CITY: () => p.city.findMany({ select: { id: true } }),
        DESTINATION: () => p.destination.findMany({ select: { id: true } }),
        PLACE: () => p.place.findMany({ select: { id: true } }),
        PERSON: () => p.person.findMany({ select: { id: true } }),
        EVENT: () => p.historicalEvent.findMany({ select: { id: true } }),
        ERA: () => p.historicalEra.findMany({ select: { id: true } }),
        DYNASTY: () => p.dynasty.findMany({ select: { id: true } }),
        TERRITORY: () => p.territory.findMany({ select: { id: true } }),
        THEME: () => p.theme.findMany({ select: { id: true } }),
        STORY: () => p.story.findMany({ select: { id: true } }),
        JOURNEY: () => p.journey.findMany({ select: { id: true } }),
        SOURCE: () => p.source.findMany({ select: { id: true } }),
        COMMUNITY_STORY: () => p.communityStory.findMany({ select: { id: true } }),
      } as Record<SearchEntityKind, () => Promise<Array<{ id: string }>>>
    )[kind]();
    return rows.map((r) => r.id);
  }

  /**
   * Full deterministic rebuild: every canonical entity and every existing document is pushed
   * through `refreshEntity`. Running it twice yields an identical projection; running two at
   * once is safe (per-entity locks + the (entityKind, entityId) unique key - no duplicates).
   */
  async rebuildAll(): Promise<ProjectionCounters & { runId: string; durationMs: number }> {
    const startedAt = Date.now();
    const run = await this.prisma.searchProjectionRun.create({ data: { mode: 'REBUILD', status: 'RUNNING' } });
    const counters: ProjectionCounters = { processed: 0, upserted: 0, deleted: 0, failed: 0 };
    let firstError: string | null = null;

    try {
      for (const kind of Object.values(SearchEntityKind)) {
        const canonical = await this.canonicalIds(kind);
        const existing = (await this.prisma.searchDocument.findMany({ where: { entityKind: kind }, select: { entityId: true } })).map((d) => d.entityId);
        const ids = [...new Set([...canonical, ...existing])].sort();

        let cursor = 0;
        const worker = async () => {
          while (cursor < ids.length) {
            const id = ids[cursor++];
            try {
              this.tally(counters, await this.refreshEntity(kind, id));
            } catch (err) {
              counters.failed += 1;
              firstError ??= `${kind}:${id}: ${err instanceof Error ? err.message : err}`;
            }
          }
        };
        await Promise.all(Array.from({ length: Math.min(REBUILD_CONCURRENCY, Math.max(ids.length, 1)) }, worker));
      }
    } catch (err) {
      firstError ??= err instanceof Error ? err.message : String(err);
    }

    const durationMs = Date.now() - startedAt;
    await this.prisma.searchProjectionRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        status: counters.failed > 0 || firstError ? 'FAILED' : 'SUCCEEDED',
        processed: counters.processed,
        upserted: counters.upserted,
        deleted: counters.deleted,
        failed: counters.failed,
        error: firstError?.slice(0, 500) ?? null,
      },
    });
    return { ...counters, runId: run.id, durationMs };
  }

  async status() {
    const [byKind, queue, oldest, lastRun] = await Promise.all([
      this.prisma.searchDocument.groupBy({ by: ['entityKind'], _count: { _all: true } }),
      this.prisma.searchProjectionQueue.aggregate({ _count: { _all: true }, _max: { attempts: true } }),
      this.prisma.searchProjectionQueue.findFirst({ orderBy: { enqueuedAt: 'asc' }, select: { enqueuedAt: true } }),
      this.prisma.searchProjectionRun.findFirst({ orderBy: { startedAt: 'desc' } }),
    ]);
    return {
      documents: Object.fromEntries(byKind.map((r) => [r.entityKind, r._count._all])),
      documentTotal: byKind.reduce((n, r) => n + r._count._all, 0),
      queueDepth: queue._count._all,
      maxQueueAttempts: queue._max.attempts ?? 0,
      oldestQueuedAgeSeconds: oldest ? Math.max(0, Math.round((Date.now() - oldest.enqueuedAt.getTime()) / 1000)) : 0,
      lastRun: lastRun
        ? { id: lastRun.id, mode: lastRun.mode, status: lastRun.status, startedAt: lastRun.startedAt, finishedAt: lastRun.finishedAt, processed: lastRun.processed, failed: lastRun.failed }
        : null,
    };
  }

  /** True when there is not a single document yet (fresh deploy) - the worker then runs one rebuild. */
  async isEmpty(): Promise<boolean> {
    return (await this.prisma.searchDocument.count({ take: 1 })) === 0;
  }
}
