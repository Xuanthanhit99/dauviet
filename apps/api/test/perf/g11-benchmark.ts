/**
 * G11 performance benchmark (disposable, test-only - NOT a jest suite). Run against the throwaway
 * `dauviet_perf` database only:
 *
 *   PERF_DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/dauviet_perf?schema=public \
 *   npx ts-node --transpile-only -r tsconfig-paths/register test/perf/g11-benchmark.ts
 *
 * It boots the real Nest app (real HTTP stack, real Postgres), builds the projection with the REAL rebuild,
 * runs warm sequential requests per query class and prints latency percentiles plus EXPLAIN (ANALYZE, BUFFERS).
 */
const perfUrl = process.env.PERF_DATABASE_URL;
if (!perfUrl || !perfUrl.includes('dauviet_perf')) throw new Error('Refusing to run: PERF_DATABASE_URL must point at the disposable dauviet_perf database.');
process.env.DATABASE_URL = perfUrl;
process.env.RATE_LIMIT_MAX = '10000000';
process.env.SEARCH_RATE_LIMIT_MAX = '10000000';
process.env.SEARCH_PROJECTION_WORKER_ENABLED = 'false';

import request from 'supertest';
import { Prisma } from '@prisma/client';
import { bootstrapTestApp } from '../bootstrap-test-app';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SearchProjectionService } from '../../src/modules/search/search-projection.service';

const WARMUP = 30;
const ROUNDS = Number(process.env.ROUNDS ?? 5);
const SAMPLES_PER_ROUND = Number(process.env.SAMPLES_PER_ROUND ?? 60);

function pct(sorted: number[], p: number) {
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

async function main() {
  const app = await bootstrapTestApp();
  const prisma = app.get(PrismaService);
  const projection = app.get(SearchProjectionService);
  const server = app.getHttpServer();

  const counts = await prisma.$queryRaw<Array<{ k: string; n: bigint }>>`
    SELECT 'Place' k, count(*) n FROM "Place" UNION ALL SELECT 'Territory', count(*) FROM "Territory" UNION ALL SELECT 'HistoricalEvent', count(*) FROM "HistoricalEvent"
    UNION ALL SELECT 'City', count(*) FROM "City" UNION ALL SELECT 'Person', count(*) FROM "Person" UNION ALL SELECT 'Story', count(*) FROM "Story"`;
  console.log('canonical rows:', counts.map((c) => `${c.k}=${c.n}`).join(' '));

  if (!process.env.SKIP_REBUILD) {
  const t0 = Date.now();
  const rebuild = await projection.rebuildAll();
  console.log(`rebuildAll #1: processed=${rebuild.processed} upserted=${rebuild.upserted} failed=${rebuild.failed} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const t1 = Date.now();
  const rebuild2 = await projection.rebuildAll();
  console.log(`rebuildAll #2 (idempotent re-run): processed=${rebuild2.processed} upserted=${rebuild2.upserted} failed=${rebuild2.failed} in ${((Date.now() - t1) / 1000).toFixed(1)} s`);
  }
  await prisma.$executeRaw`ANALYZE "SearchDocument"`;
  await prisma.$executeRaw`ANALYZE "SearchTerm"`;
  const docs = await prisma.$queryRaw<Array<{ docs: bigint; terms: bigint }>>`SELECT (SELECT count(*) FROM "SearchDocument") docs, (SELECT count(*) FROM "SearchTerm") terms`;
  console.log(`projection: ${docs[0].docs} documents, ${docs[0].terms} terms`);

  // sample real names from the loaded data so queries hit realistic values
  const sample = await prisma.$queryRaw<Array<{ id: string; name: string }>>`SELECT p."id", pt."name" FROM "Place" p JOIN "PlaceTranslation" pt ON pt."placeId" = p."id" AND pt."locale" = 'vi' WHERE p."publicationStatus" = 'PUBLISHED' ORDER BY p."id" LIMIT 2000`;
  const alias = await prisma.$queryRaw<Array<{ alias: string }>>`SELECT alias FROM "EntityAlias" ORDER BY id LIMIT 500`;
  const strip = (s: string) => s.normalize('NFD').replace(/\p{M}+/gu, '').replace(/[đĐ]/g, 'd');
  const pick = <T>(arr: T[], i: number) => arr[(i * 7919) % arr.length];

  type Cls = { name: string; run: (i: number) => request.Test };
  const S = (q: string, params: Record<string, unknown> = {}) => request(server).get('/v1/search').query({ q, ...params });
  const M = (params: Record<string, unknown>) => request(server).get('/v1/map/features').query(params);

  const controlClass: Cls = { name: 'CONTROL: GET /v1/health (noise floor)', run: () => request(server).get('/v1/health') };
  const searchClasses: Cls[] = [
    { name: 'search: exact canonical', run: (i) => S(pick(sample, i).name) },
    { name: 'search: accent-insensitive', run: (i) => S(strip(pick(sample, i).name)) },
    { name: 'search: exact alias', run: (i) => S(pick(alias, i).alias) },
    { name: 'search: prefix (3 tokens of 4)', run: (i) => S(pick(sample, i).name.split(' ').slice(0, 3).join(' ')) },
    { name: 'search: FTS multi-token (out of order)', run: (i) => S(pick(sample, i).name.split(' ').reverse().slice(0, 3).join(' ')) },
    { name: 'search: fuzzy (one-character typo)', run: (i) => S(strip(pick(sample, i).name).replace(/[aeiou]/, 'x')) },
    { name: 'search: common short prefix ("ha")', run: () => S('ha') },
    { name: 'search: filtered types+country', run: (i) => S(pick(sample, i).name.split(' ')[0], { types: 'PLACE,CITY', countryId: `pc${1 + (i % 10)}` }) },
    { name: 'search: period filter (CE)', run: (i) => S(pick(sample, i).name.split(' ')[0], { types: 'EVENT,TERRITORY', fromYear: 1000, toYear: 1300 }) },
    { name: 'search: bbox filter', run: (i) => S(pick(sample, i).name.split(' ')[0], { bbox: '100,0,110,10' }) },
    { name: 'search: page 2 (cursor)', run: () => S('nhan vat') },
    { name: 'suggestions', run: (i) => request(server).get('/v1/search/suggestions').query({ q: pick(sample, i).name.split(' ').slice(0, 2).join(' ') }) },
  ];
  const mapClasses: Cls[] = [
    { name: 'map: world zoom 2 (bbox world)', run: () => M({ bbox: '-180,-85,180,85', zoom: 2 }) },
    { name: 'map: country zoom 5', run: (i) => M({ bbox: `${95 + (i % 5)},0,${115 + (i % 5)},20`, zoom: 5.4 }) },
    { name: 'map: regional zoom 8', run: (i) => M({ bbox: `${100 + (i % 20)},2,${105 + (i % 20)},7`, zoom: 8.2 }) },
    { name: 'map: city zoom 12', run: (i) => M({ bbox: `${105 + (i % 30) * 0.1},10,${105.4 + (i % 30) * 0.1},10.3`, zoom: 12.5 }) },
    { name: 'map: dense street zoom 15', run: (i) => M({ bbox: `${105 + (i % 30) * 0.1},10,${105.05 + (i % 30) * 0.1},10.04`, zoom: 15 }) },
    { name: 'map: geography layers zoom 6', run: (i) => M({ bbox: `${95 + (i % 5)},0,${115 + (i % 5)},20`, zoom: 6, kinds: 'COUNTRY,REGION,CITY,DESTINATION' }) },
    { name: 'map: territories zoom 5 (generalized)', run: (i) => M({ bbox: `${95 + (i % 5)},0,${115 + (i % 5)},20`, zoom: 5, kinds: 'TERRITORY', year: 1200 }) },
    { name: 'map: strict period events+territories', run: (i) => M({ bbox: `${95 + (i % 5)},0,${115 + (i % 5)},20`, zoom: 9, fromYear: 1000, toYear: 1200, kinds: 'EVENT,TERRITORY' }) },
  ];

  const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
  const all = [controlClass, ...searchClasses, ...mapClasses].filter((c) => !only || only.test(c.name));
  const failures: string[] = [];
  const perRound = new Map<string, number[][]>(all.map((c) => [c.name, []]));
  const bytesBy = new Map<string, number>();
  const countBy = new Map<string, number>();
  for (const cls of all) for (let i = 0; i < WARMUP; i++) await cls.run(i); // warm caches/plans once
  // Interleaved rounds: every class is sampled in every round, so background host noise (this
  // benchmark host is a shared laptop) is spread across classes instead of hitting one class.
  for (let round = 0; round < ROUNDS; round++) {
    for (const cls of all) {
      const lat: number[] = [];
      for (let i = 0; i < SAMPLES_PER_ROUND; i++) {
        const s = process.hrtime.bigint();
        const res = await cls.run(WARMUP + round * SAMPLES_PER_ROUND + i);
        lat.push(Number(process.hrtime.bigint() - s) / 1e6);
        if (res.status !== 200) failures.push(`${cls.name}: HTTP ${res.status}`);
        bytesBy.set(cls.name, (bytesBy.get(cls.name) ?? 0) + JSON.stringify(res.body).length);
        countBy.set(cls.name, res.body?.data?.results?.length ?? res.body?.data?.features?.length ?? 0);
      }
      perRound.get(cls.name)!.push(lat);
    }
  }
  const rows: string[] = [];
  for (const cls of all) {
    const rounds = perRound.get(cls.name)!;
    const pooled = rounds.flat().sort((a, b) => a - b);
    const roundP95 = rounds.map((r) => pct([...r].sort((a, b) => a - b), 95)).sort((a, b) => a - b);
    rows.push(
      `${cls.name.padEnd(42)} n=${pooled.length} p50=${pct(pooled, 50).toFixed(1)} p95=${pct(pooled, 95).toFixed(1)} p99=${pct(pooled, 99).toFixed(1)} max=${pooled[pooled.length - 1].toFixed(1)} | round-p95 min/median/max=${roundP95[0].toFixed(0)}/${roundP95[Math.floor(roundP95.length / 2)].toFixed(0)}/${roundP95[roundP95.length - 1].toFixed(0)} | bytes=${Math.round((bytesBy.get(cls.name) ?? 0) / pooled.length)} results=${countBy.get(cls.name)}`,
    );
  }
  console.log(`\nLATENCY (ms; ${ROUNDS} interleaved rounds x ${SAMPLES_PER_ROUND} sequential warm requests per class over the real HTTP stack)\n` + rows.join('\n'));
  if (failures.length) console.log('NON-200 RESPONSES:', [...new Set(failures)].slice(0, 10));

  // ---- EXPLAIN (ANALYZE, BUFFERS) of the representative queries: capture the SQL the services actually issue
  let captured: Prisma.Sql | null = null;
  const original = prisma.$queryRaw.bind(prisma) as any;
  (prisma as any).$queryRaw = (q: any, ...rest: any[]) => {
    if (q && typeof q === 'object' && 'text' in q) captured = q as Prisma.Sql;
    return original(q, ...rest);
  };
  const explain = async (label: string, fn: () => Promise<unknown>) => {
    captured = null;
    await fn();
    if (!captured) {
      console.log(`\n### EXPLAIN ${label}: (tagged-template query, captured separately)`);
      return;
    }
    const c = captured as Prisma.Sql;
    const plan = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('pg_trgm.similarity_threshold', '0.5', true)`; // identical to SearchService
      return tx.$queryRawUnsafe<Array<{ 'QUERY PLAN': string }>>(`EXPLAIN (ANALYZE, BUFFERS) ${c.text}`, ...c.values);
    });
    console.log(`\n### EXPLAIN ANALYZE ${label}\n` + plan.map((p) => p['QUERY PLAN']).join('\n'));
  };
  const one = pick(sample, 3).name;
  await explain('exact / accent-insensitive', () => S(strip(one)).then());
  await explain('prefix + FTS', () => S(one.split(' ').slice(0, 2).join(' ')).then());
  await explain('fuzzy', () => S(strip(one).replace(/[aeiou]/, 'x')).then());
  await explain('period filter', () => S(one.split(' ')[0], { types: 'EVENT', fromYear: 1000, toYear: 1300 }).then());
  await explain('bbox filter', () => S(one.split(' ')[0], { bbox: '100,0,110,10' }).then());
  (prisma as any).$queryRaw = original;

  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
