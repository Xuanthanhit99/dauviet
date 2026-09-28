/**
 * G12 representative API performance + bounded load (not an SLA - no product SLA exists for these
 * endpoints; this looks for obvious regressions and resource symptoms).
 *
 *   npx tsx scripts/g12/api-load.ts --base http://127.0.0.1:3299/v1 --db <dauviet_g12_* url> --api-pid <pid> [--workers 20] [--seconds 90]
 *
 * Phase 1 (sequential, warm): p50/p95/p99/max per class for auth/session, trip read, trip update,
 * expense create, expense summary, location update, location read - with a /health control class.
 * Phase 2 (bounded concurrency): N workers for S seconds on a realistic mix; samples PostgreSQL
 * connections (pg_stat_activity), Redis connected clients, API process memory (Windows tasklist),
 * SearchProjectionQueue depth and /health latency (event-loop stall proxy) every 2 s.
 */
import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const args = Object.fromEntries(process.argv.slice(2).reduce<string[][]>((acc, v, i, all) => (v.startsWith('--') ? [...acc, [v.slice(2), all[i + 1]]] : acc), []));
const BASE = args.base!;
const DB = args.db!;
if (!/\/dauviet_g12_[a-z_]+/.test(new URL(DB).pathname)) throw new Error('refusing: --db must be a disposable dauviet_g12_* database');
const WORKERS = Number(args.workers ?? 20);
const SECONDS = Number(args.seconds ?? 90);
const prisma = new PrismaClient({ datasources: { db: { url: DB } } });

async function call(method: string, p: string, token?: string, body?: unknown) {
  const t = performance.now();
  // A socket reset (client keep-alive reuse race) is recorded as status 0, never retried silently.
  const r = await fetch(`${BASE}${p}`, { method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined }).catch(() => null);
  if (!r) return { status: 0, ms: performance.now() - t };
  await r.arrayBuffer().catch(() => undefined);
  return { status: r.status, ms: performance.now() - t };
}
const pct = (s: number[], p: number) => (s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : NaN);
const stats = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return { n: s.length, p50: +pct(s, 50).toFixed(1), p95: +pct(s, 95).toFixed(1), p99: +pct(s, 99).toFixed(1), max: +(s[s.length - 1] ?? NaN).toFixed(1) };
};

async function actor(label: string) {
  const email = `g12load-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  const passwordHash = await argon2.hash('G12-Load-Pass!1', { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const u = await prisma.user.create({ data: { email, displayName: label, emailVerifiedAt: new Date(), authIdentities: { create: { provider: 'PASSWORD', passwordHash } } } });
  return { id: u.id, email };
}

async function main() {
  // One login per actor through the API (login is throttled 10/min/IP - the load itself uses bearer tokens).
  const pairs: { owner: { id: string; token: string }; editor: { id: string; token: string }; trip: string }[] = [];
  const loginQueue: { id: string; email: string }[] = [];
  for (let i = 0; i < WORKERS; i++) loginQueue.push(await actor(`o${i}`), await actor(`e${i}`));
  const tokens: string[] = [];
  for (const a of loginQueue) {
    // Real logins; the per-IP login throttle (10/min) is waited out rather than bypassed.
    const r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: a.email, password: 'G12-Load-Pass!1' }) });
    if (r.status === 429) {
      await new Promise((res) => setTimeout(res, 61_000));
      const again = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: a.email, password: 'G12-Load-Pass!1' }) });
      tokens.push(((await again.json()) as any).data.accessToken);
    } else tokens.push(((await r.json()) as any).data.accessToken);
  }
  for (let i = 0; i < WORKERS; i++) {
    const owner = { id: loginQueue[2 * i].id, token: tokens[2 * i] };
    const editor = { id: loginQueue[2 * i + 1].id, token: tokens[2 * i + 1] };
    const trip = ((await (await fetch(`${BASE}/trips`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${owner.token}` }, body: JSON.stringify({ title: `load ${i}`, startDate: '2026-12-01', endDate: '2026-12-05', primaryCurrency: 'USD' }) })).json()) as any).data.id;
    await prisma.tripMember.create({ data: { tripId: trip, userId: editor.id, role: 'EDITOR' } });
    await call('POST', `/trips/${trip}/location-sharing/start`, editor.token, { durationMinutes: 120 });
    pairs.push({ owner, editor, trip });
  }
  const loc = () => ({ latitude: 11 + Math.random() * 0.01, longitude: 107 + Math.random() * 0.01, accuracyMeters: 10, capturedAt: new Date().toISOString() });
  const exp = (p: (typeof pairs)[number]) => ({ title: 'load', category: 'FOOD', amount: '12.34', currency: 'USD', payerUserId: p.owner.id, splitMode: 'EQUAL', occurredOn: '2026-12-02', shares: [{ userId: p.owner.id }, { userId: p.editor.id }] });

  // ---------- phase 1: sequential per class
  const p0 = pairs[0];
  const classes: [string, () => Promise<{ status: number; ms: number }>][] = [
    ['CONTROL GET /health', () => call('GET', '/health')],
    ['auth/session GET /users/me', () => call('GET', '/users/me', p0.owner.token)],
    ['auth/session GET /auth/sessions', () => call('GET', '/auth/sessions', p0.owner.token)],
    ['trip read GET /trips/:id', () => call('GET', `/trips/${p0.trip}`, p0.owner.token)],
    ['trip list GET /trips', () => call('GET', '/trips', p0.owner.token)],
    ['trip mutation PATCH /trips/:id', async () => {
      const v = (await prisma.trip.findUniqueOrThrow({ where: { id: p0.trip } })).version;
      return call('PATCH', `/trips/${p0.trip}`, p0.owner.token, { expectedVersion: v, notes: `n${Math.random()}` });
    }],
    ['expense create POST', () => call('POST', `/trips/${p0.trip}/expenses`, p0.owner.token, exp(p0))],
    ['expense summary GET', () => call('GET', `/trips/${p0.trip}/expenses/summary`, p0.owner.token)],
    ['location update PUT', () => call('PUT', `/trips/${p0.trip}/location`, p0.editor.token, loc())],
    ['location read GET', () => call('GET', `/trips/${p0.trip}/locations`, p0.owner.token)],
  ];
  const seq: Record<string, number[]> = Object.fromEntries(classes.map(([n]) => [n, []]));
  const seqErrors: string[] = [];
  for (const [, f] of classes) for (let i = 0; i < 10; i++) await f(); // warm
  for (let round = 0; round < 4; round++) {
    for (const [name, f] of classes) {
      for (let i = 0; i < 25; i++) {
        const r = await f();
        if (r.status >= 400) seqErrors.push(`${name} ${r.status}`);
        seq[name].push(r.ms);
      }
    }
  }

  // ---------- phase 2: bounded concurrency
  const mixed: Record<string, number[]> = {};
  const statuses: Record<number, number> = {};
  const samples: Record<string, number>[] = [];
  let stop = false;
  const sampler = (async () => {
    while (!stop) {
      const conns = Number((await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) n FROM pg_stat_activity WHERE datname = current_database()`))[0].n);
      const queue = Number((await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) n FROM "SearchProjectionQueue"`))[0].n);
      let redisClients = NaN;
      let memMb = NaN;
      try {
        redisClients = Number(/connected_clients:(\d+)/.exec(execSync('docker exec dauviet-redis-1 redis-cli INFO clients').toString())![1]);
      } catch {
        /* ignore */
      }
      try {
        if (args['api-pid']) memMb = Number(execSync(`tasklist /FI "PID eq ${args['api-pid']}" /FO CSV /NH`).toString().split('","')[4].replace(/[^\d]/g, '')) / 1024;
      } catch {
        /* ignore */
      }
      const h = await call('GET', '/health');
      samples.push({ t: samples.length * 2, dbConnections: conns, projectionQueue: queue, redisClients, apiMemMb: Math.round(memMb), healthMs: Math.round(h.ms) });
      await new Promise((r) => setTimeout(r, 2000));
    }
  })();
  const until = Date.now() + SECONDS * 1000;
  const mix: [string, (p: (typeof pairs)[number]) => Promise<{ status: number; ms: number }>][] = [
    ['trip read', (p) => call('GET', `/trips/${p.trip}`, p.editor.token)],
    ['expense create', (p) => call('POST', `/trips/${p.trip}/expenses`, p.editor.token, exp(p))],
    ['expense summary', (p) => call('GET', `/trips/${p.trip}/expenses/summary`, p.owner.token)],
    ['location update', (p) => call('PUT', `/trips/${p.trip}/location`, p.editor.token, loc())],
    ['location read', (p) => call('GET', `/trips/${p.trip}/locations`, p.owner.token)],
    ['search', () => call('GET', `/search?q=${encodeURIComponent(['hue', 'ha noi', 'hoi an', 'thang long'][Math.floor(Math.random() * 4)])}`)],
    ['session', (p) => call('GET', '/users/me', p.owner.token)],
  ];
  await Promise.all(
    pairs.map(async (p, w) => {
      let i = w;
      while (Date.now() < until) {
        const [name, f] = mix[i++ % mix.length];
        const r = await f(p);
        (mixed[name] ??= []).push(r.ms);
        statuses[r.status] = (statuses[r.status] ?? 0) + 1;
      }
    }),
  );
  stop = true;
  await sampler;
  const total = Object.values(statuses).reduce((a, b) => a + b, 0);
  const deadlocks = Number((await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT deadlocks n FROM pg_stat_database WHERE datname = current_database()`))[0].n);
  const invariant = Number((await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) n FROM "TripExpense" e WHERE e.amount <> (SELECT coalesce(sum(s.amount),0) FROM "TripExpenseShare" s WHERE s."expenseId" = e.id)`))[0].n);
  const out = {
    sequential: Object.fromEntries(Object.entries(seq).map(([k, v]) => [k, stats(v)])),
    sequentialErrors: seqErrors,
    concurrency: { workers: WORKERS, seconds: SECONDS, requests: total, throughputRps: +(total / SECONDS).toFixed(1), statuses },
    concurrentLatency: Object.fromEntries(Object.entries(mixed).map(([k, v]) => [k, stats(v)])),
    resources: {
      dbConnectionsMax: Math.max(...samples.map((s) => s.dbConnections)),
      redisClientsMax: Math.max(...samples.map((s) => s.redisClients)),
      apiMemMbFirst: samples[0]?.apiMemMb,
      apiMemMbMax: Math.max(...samples.map((s) => s.apiMemMb)),
      apiMemMbLast: samples[samples.length - 1]?.apiMemMb,
      projectionQueueMax: Math.max(...samples.map((s) => s.projectionQueue)),
      healthMsMax: Math.max(...samples.map((s) => s.healthMs)),
      pgDeadlocksTotalForDb: deadlocks,
    },
    ledgerInvariantViolations: invariant,
    samples,
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(out, null, 1));
  await prisma.$disconnect();
}
main().catch(async (e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  await prisma.$disconnect();
  process.exit(2);
});
