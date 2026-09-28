/**
 * G12 Path C (restart / recovery) + Path D (failure injection) against the COMPILED API on a
 * DISPOSABLE database. Spawns `node dist/main.js` itself (kill = TerminateProcess on Windows,
 * i.e. an ungraceful crash), and uses `docker` to stop/restart the project's own Redis container.
 *
 *   npx tsx scripts/g12/path-cd.ts --db <disposable DATABASE_URL> --port 3399 --redis-container dauviet-redis-1
 *
 * Refuses to run against a database whose name does not contain "g12" (never the dev DB).
 */
import { ChildProcess, execSync, spawn } from 'child_process';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const args = Object.fromEntries(
  process.argv.slice(2).reduce<string[][]>((acc, v, i, all) => (v.startsWith('--') ? [...acc, [v.slice(2), all[i + 1]]] : acc), []),
);
const DB = args.db!;
if (!DB || !/\/dauviet_g12_[a-z_]+/.test(new URL(DB).pathname)) throw new Error('path-cd refuses to run: --db must be a disposable dauviet_g12_* database');
const PORT = Number(args.port ?? 3399);
const BASE = `http://127.0.0.1:${PORT}/v1`;
const REDIS = args['redis-container'] ?? 'dauviet-redis-1';
const API_DIR = path.resolve(__dirname, '../../apps/api');
const prisma = new PrismaClient({ datasources: { db: { url: DB } } });
const results: { name: string; ok: boolean; detail?: string }[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  results.push({ name, ok, detail });
  // eslint-disable-next-line no-console
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let app: ChildProcess | null = null;
let appLog = '';
function startApp(extraEnv: Record<string, string> = {}) {
  appLog += '\n----- app (re)start -----\n';
  app = spawn(process.execPath, ['dist/main.js'], {
    cwd: API_DIR,
    env: { ...process.env, DATABASE_URL: DB, PORT: String(PORT), REDIS_KEY_PREFIX: 'g12-pathcd', SMTP_HOST: '127.0.0.1', SMTP_PORT: '9', SEARCH_PROJECTION_INTERVAL_MS: '500', ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  app.stdout!.on('data', (d) => (appLog += d.toString()));
  app.stderr!.on('data', (d) => (appLog += d.toString()));
}
async function waitHealthy(timeoutMs = 240_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const r = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(5000) });
      if (r.status === 200) return (await r.json()) as any;
    } catch {
      /* not up yet */
    }
    await sleep(1000);
  }
  throw new Error('API did not become healthy');
}
function killApp() {
  app?.kill('SIGKILL');
  app = null;
}
async function call(method: string, p: string, token?: string, body?: unknown, timeoutMs = 20_000) {
  const started = Date.now();
  try {
    const r = await fetch(`${BASE}${p}`, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await r.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not json */
    }
    return { status: r.status, json, ms: Date.now() - started };
  } catch (e) {
    return { status: 0, json: null, ms: Date.now() - started, error: (e as Error).name };
  }
}
async function actor(label: string, roles: string[] = ['USER']) {
  const email = `g12cd-${label}-${Date.now()}@example.com`;
  const passwordHash = await argon2.hash('G12-CD-Pass!1', { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const u = await prisma.user.create({ data: { email, displayName: label, roles: roles as any, emailVerifiedAt: new Date(), authIdentities: { create: { provider: 'PASSWORD', passwordHash } } } });
  const r = await call('POST', '/auth/login', undefined, { email, password: 'G12-CD-Pass!1' });
  return { id: u.id, token: r.json.data.accessToken as string };
}
/** Canonical-state fingerprint used before/after restarts (PostgreSQL is the authority). */
async function fingerprint() {
  const q = (sql: string) => prisma.$queryRawUnsafe<{ h: string }[]>(sql).then((r) => r[0]?.h ?? 'empty');
  return {
    providers: await q(`SELECT md5(string_agg(md5(t::text), ',' ORDER BY md5(t::text))) h FROM (SELECT p.code, p.status, i.status AS istatus, l.status AS lstatus FROM "ExternalProvider" p LEFT JOIN "ProviderIntegration" i ON i."providerId" = p.id LEFT JOIN "ProviderLicense" l ON l."providerId" = p.id) t`),
    sharing: await q(`SELECT md5(string_agg(md5(t::text), ',' ORDER BY md5(t::text))) h FROM "TripLocationSharing" t`),
    locations: await q(`SELECT md5(string_agg(md5(t::text), ',' ORDER BY md5(t::text))) h FROM "TripMemberLocation" t`),
    expenses: await q(`SELECT md5(string_agg(md5(t::text), ',' ORDER BY md5(t::text))) h FROM "TripExpense" t`),
    shares: await q(`SELECT md5(string_agg(md5(t::text), ',' ORDER BY md5(t::text))) h FROM "TripExpenseShare" t`),
    settlements: await q(`SELECT md5(string_agg(md5(t::text), ',' ORDER BY md5(t::text))) h FROM "TripSettlement" t`),
    conversions: await q(`SELECT md5(string_agg(md5(t::text), ',' ORDER BY md5(t::text))) h FROM "AffiliateConversion" t`),
    canonicalPlaces: await q(`SELECT md5(string_agg(md5(t::text), ',' ORDER BY md5(t::text))) h FROM "Place" t`),
  };
}
async function ledgerInvariants() {
  const bad = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*) n FROM "TripExpense" e WHERE e.amount <> (SELECT coalesce(sum(s.amount), 0) FROM "TripExpenseShare" s WHERE s."expenseId" = e.id)`,
  );
  const orphanLoc = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*) n FROM "TripMemberLocation" l JOIN "Trip" t ON t.id = l."tripId" WHERE l."userId" <> t."ownerId" AND NOT EXISTS (SELECT 1 FROM "TripMember" m WHERE m."tripId" = l."tripId" AND m."userId" = l."userId")`,
  );
  return { expensesWithShareMismatch: Number(bad[0].n), locationsWithoutMembership: Number(orphanLoc[0].n) };
}
async function queueDepth() {
  return Number((await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) n FROM "SearchProjectionQueue"`))[0].n);
}

async function main() {
  // ---------- setup (app up, data through the API)
  startApp();
  await waitHealthy();
  const owner = await actor('owner');
  const editor = await actor('editor');
  const trip = (await call('POST', '/trips', owner.token, { title: 'G12 C/D trip', startDate: '2026-12-01', endDate: '2026-12-03', primaryCurrency: 'USD' })).json.data.id as string;
  await prisma.tripMember.create({ data: { tripId: trip, userId: editor.id, role: 'EDITOR' } });
  await call('POST', `/trips/${trip}/location-sharing/start`, editor.token, { durationMinutes: 120 });
  await call('PUT', `/trips/${trip}/location`, editor.token, { latitude: 12.3456789, longitude: 108.7654321, accuracyMeters: 9, capturedAt: new Date().toISOString() });
  for (let i = 0; i < 3; i++) await call('POST', `/trips/${trip}/expenses`, owner.token, { title: `e${i}`, category: 'FOOD', amount: '100.00', currency: 'USD', payerUserId: owner.id, splitMode: 'EQUAL', occurredOn: '2026-12-02', shares: [{ userId: owner.id }, { userId: editor.id }] });
  const suspended = await prisma.externalProvider.create({ data: { code: `G12_CD_SUSPENDED_${Date.now()}`, name: 'G12 C/D suspended provider', status: 'SUSPENDED', credentialMode: 'NONE' } });

  // ---------- Path C1: API crash + restart - canonical state identical, served identically
  const fpBefore = await fingerprint();
  const summaryBefore = (await call('GET', `/trips/${trip}/expenses/summary`, owner.token)).json;
  const locsBefore = (await call('GET', `/trips/${trip}/locations`, owner.token)).json;
  killApp();
  startApp();
  await waitHealthy();
  check('C1 API crash+restart: provider policy / sharing / location / ledger / conversions / canonical unchanged', JSON.stringify(await fingerprint()) === JSON.stringify(fpBefore));
  check('C1 same JWT still valid after restart (sessions are DB rows)', (await call('GET', '/users/me', owner.token)).status === 200);
  check('C1 expense summary served identically after restart', JSON.stringify((await call('GET', `/trips/${trip}/expenses/summary`, owner.token)).json.data) === JSON.stringify(summaryBefore.data));
  check('C1 location consent + latest location persisted', JSON.stringify((await call('GET', `/trips/${trip}/locations`, owner.token)).json.data) === JSON.stringify(locsBefore.data));
  check('C1 suspended provider still suspended after restart (policy not in memory)', (await prisma.externalProvider.findUniqueOrThrow({ where: { id: suspended.id } })).status === 'SUSPENDED');

  // ---------- Path C2: search worker down while canonical data changes -> converges after restart
  killApp();
  const place = await prisma.place.findFirstOrThrow({ where: { publicationStatus: 'PUBLISHED' }, include: { translations: true } });
  const vi = place.translations.find((t) => t.locale === 'vi')!;
  const marker = `G12 Recovery ${Date.now().toString(36)}`;
  await prisma.placeTranslation.update({ where: { id: vi.id }, data: { name: `${vi.name} ${marker}` } });
  const queued = await queueDepth();
  check('C2 canonical write while API is down still enqueues the projection refresh (trigger, no Redis)', queued > 0, `queue ${queued}`);
  startApp();
  await waitHealthy();
  let found = false;
  for (let i = 0; i < 60 && !found; i++) {
    await sleep(1000);
    const r = await call('GET', `/search?q=${encodeURIComponent(marker)}`);
    found = (r.json?.data?.results ?? []).some((x: any) => x.id === place.id);
  }
  check('C2 search worker converges after restart (renamed place searchable, queue drained)', found && (await queueDepth()) === 0);
  await prisma.placeTranslation.update({ where: { id: vi.id }, data: { name: vi.name } });

  // ---------- Path C3: kill the API in the middle of a large drain -> eventual convergence, equal to a rebuild
  await prisma.$executeRawUnsafe(`UPDATE "Place" SET "historicalImportance" = "historicalImportance" WHERE "publicationStatus" = 'PUBLISHED'`);
  await prisma.$executeRawUnsafe(`UPDATE "HistoricalEvent" SET "importance" = "importance"`);
  const bigQueue = await queueDepth();
  await sleep(700);
  killApp();
  const midQueue = await queueDepth();
  startApp();
  await waitHealthy();
  for (let i = 0; i < 120 && (await queueDepth()) > 0; i++) await sleep(1000);
  const docsAfterDrain = await prisma.$queryRawUnsafe<{ h: string }[]>(`SELECT md5(string_agg(md5((to_jsonb(d) - 'id' - 'projectedAt')::text), ',' ORDER BY md5((to_jsonb(d) - 'id' - 'projectedAt')::text))) h FROM "SearchDocument" d`);
  const admin = await actor('admin', ['USER', 'ADMIN']);
  const rebuild = await call('POST', '/admin/search/projection/rebuild', admin.token, {}, 600_000);
  const docsAfterRebuild = await prisma.$queryRawUnsafe<{ h: string }[]>(`SELECT md5(string_agg(md5((to_jsonb(d) - 'id' - 'projectedAt')::text), ',' ORDER BY md5((to_jsonb(d) - 'id' - 'projectedAt')::text))) h FROM "SearchDocument" d`);
  check('C3 killed mid-drain -> queue drains after restart and the projection equals a full rebuild', (await queueDepth()) === 0 && rebuild.status < 300 && docsAfterDrain[0].h === docsAfterRebuild[0].h, `queued ${bigQueue}, at kill ${midQueue}`);

  // ---------- Path C4 / D1: Redis restart and Redis unavailable
  execSync(`docker restart ${REDIS}`, { stdio: 'ignore' });
  let healthAfterRestart: any = null;
  for (let i = 0; i < 30; i++) {
    healthAfterRestart = await call('GET', '/health');
    if (healthAfterRestart.json?.data?.checks?.redis === 'ok') break;
    await sleep(1000);
  }
  check('C4 Redis restart: API keeps serving and health returns to redis=ok', healthAfterRestart.status === 200 && healthAfterRestart.json?.data?.checks?.redis === 'ok');

  execSync(`docker stop ${REDIS}`, { stdio: 'ignore' });
  await sleep(2000);
  const outage: Record<string, { status: number; ms: number }> = {};
  const probe = async (name: string, m: string, p: string, token?: string, body?: unknown) => {
    const r = await call(m, p, token, body, 20_000);
    outage[name] = { status: r.status, ms: r.ms };
  };
  const outageHealth = await call('GET', '/health');
  outage.health = { status: outageHealth.status, ms: outageHealth.ms };
  check('D1 health during Redis outage: 200 degraded with redis=error (not a false ok, not unready)', outageHealth.status === 200 && outageHealth.json?.data?.status === 'degraded' && outageHealth.json?.data?.checks?.redis === 'error', JSON.stringify(outageHealth.json?.data?.checks));
  await probe('login', 'POST', '/auth/login', undefined, { email: 'nobody@example.com', password: 'x-invalid-1' });
  await probe('trip read', 'GET', `/trips/${trip}`, owner.token);
  await probe('expense create', 'POST', `/trips/${trip}/expenses`, owner.token, { title: 'during outage', category: 'FOOD', amount: '10.00', currency: 'USD', payerUserId: owner.id, splitMode: 'EQUAL', occurredOn: '2026-12-02', shares: [{ userId: owner.id }] });
  await probe('location update', 'PUT', `/trips/${trip}/location`, editor.token, { latitude: 12.3456789, longitude: 108.7654321, accuracyMeters: 9, capturedAt: new Date().toISOString() });
  await probe('search', 'GET', '/search?q=hue');
  await probe('map', 'GET', '/map/features?bbox=102,8,110,24&zoom=6');
  await probe('media upload intent (BullMQ-backed domain)', 'POST', '/media/uploads', admin.token, { mimeType: 'image/png', sizeBytes: 100, originalFilename: 'x.png' });
  // eslint-disable-next-line no-console
  console.log('REDIS OUTAGE CLASSIFICATION', JSON.stringify(outage));
  check('D1 Redis down: auth, trips, expenses, location, search and map keep working (DB-authoritative)', ['login', 'trip read', 'expense create', 'location update', 'search', 'map'].every((k) => outage[k].status > 0 && outage[k].status < 500), JSON.stringify(outage));
  execSync(`docker start ${REDIS}`, { stdio: 'ignore' });
  let recovered = false;
  for (let i = 0; i < 60 && !recovered; i++) {
    await sleep(1000);
    recovered = (await call('GET', '/health')).json?.data?.checks?.redis === 'ok';
  }
  check('D1 Redis back: health recovers without an API restart', recovered);
  check('D1 ledger invariants intact after the outage', JSON.stringify(await ledgerInvariants()) === JSON.stringify({ expensesWithShareMismatch: 0, locationsWithoutMembership: 0 }));

  // ---------- Path D2: PostgreSQL connections killed during a write burst
  const burst = Array.from({ length: 20 }, (_, i) => call('POST', `/trips/${trip}/expenses`, i % 2 ? owner.token : editor.token, { title: `burst${i}`, category: 'FOOD', amount: '33.33', currency: 'USD', payerUserId: owner.id, splitMode: 'EQUAL', occurredOn: '2026-12-02', shares: [{ userId: owner.id }, { userId: editor.id }] }));
  await sleep(150);
  await prisma.$executeRawUnsafe(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()`);
  const burstStatuses = (await Promise.all(burst)).map((r) => r.status);
  check('D2 connections killed mid-burst: no partial expense (shares always sum), failures are 503 not 500', burstStatuses.every((s) => s === 201 || s === 503 || s === 0) && JSON.stringify(await ledgerInvariants()) === JSON.stringify({ expensesWithShareMismatch: 0, locationsWithoutMembership: 0 }), JSON.stringify(burstStatuses));
  let back = 0;
  for (let i = 0; i < 20 && back !== 201; i++) {
    back = (await call('POST', `/trips/${trip}/expenses`, owner.token, { title: 'after kill', category: 'FOOD', amount: '1.00', currency: 'USD', payerUserId: owner.id, splitMode: 'EQUAL', occurredOn: '2026-12-02', shares: [{ userId: owner.id }] })).status;
    if (back !== 201) await sleep(1000);
  }
  check('D2 API recovers its DB connections without restart', back === 201);

  // ---------- Path D3: API killed in the middle of a mixed write burst
  const mixed = [
    ...Array.from({ length: 10 }, (_, i) => call('POST', `/trips/${trip}/expenses`, owner.token, { title: `mid${i}`, category: 'FOOD', amount: '10.01', currency: 'USD', payerUserId: owner.id, splitMode: 'EXACT', occurredOn: '2026-12-02', shares: [{ userId: owner.id, amount: '5.00' }, { userId: editor.id, amount: '5.01' }] })),
    ...Array.from({ length: 10 }, () => call('PUT', `/trips/${trip}/location`, editor.token, { latitude: 12.3456789, longitude: 108.7654321, accuracyMeters: 9, capturedAt: new Date().toISOString() })),
  ];
  await sleep(200);
  killApp();
  await Promise.all(mixed);
  startApp();
  await waitHealthy();
  const inv = await ledgerInvariants();
  const locRows = await prisma.tripMemberLocation.count({ where: { tripId: trip, userId: editor.id } });
  check('D3 API killed mid-burst: no partial expense, still one latest-location row, API serves again', inv.expensesWithShareMismatch === 0 && inv.locationsWithoutMembership === 0 && locRows === 1 && (await call('GET', `/trips/${trip}/expenses/summary`, owner.token)).status === 200, JSON.stringify({ ...inv, locRows }));

  killApp();
  if (args['app-log']) require('fs').writeFileSync(args['app-log'], appLog);
  const failed = results.filter((r) => !r.ok);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ checks: results.length, passed: results.length - failed.length, failed: failed.map((f) => f.name), redisOutage: outage }, null, 1));
  await prisma.$disconnect();
  process.exit(failed.length ? 1 : 0);
}

main().catch(async (err) => {
  // eslint-disable-next-line no-console
  console.error('path-cd crashed:', err instanceof Error ? err.stack : err, '\n--- app log tail ---\n', appLog.slice(-3000));
  killApp();
  try {
    execSync(`docker start ${REDIS}`, { stdio: 'ignore' });
  } catch {
    /* already running */
  }
  await prisma.$disconnect();
  process.exit(2);
});
