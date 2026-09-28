/**
 * G12 graceful-shutdown proof against the compiled API on a disposable database.
 *   npx tsx scripts/g12/graceful-shutdown-probe.ts --db <dauviet_g12_* url> --port 3499
 * Starts a long request (ADMIN projection rebuild), emits SIGTERM inside the process while it is in
 * flight, and checks: the handler is installed, the in-flight request completes 2xx, new connections
 * are refused afterwards, the process exits, and the database is left consistent (no projection
 * queue claim left behind, projection complete, no leftover connections).
 */
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const args = Object.fromEntries(process.argv.slice(2).reduce<string[][]>((acc, v, i, all) => (v.startsWith('--') ? [...acc, [v.slice(2), all[i + 1]]] : acc), []));
const DB = args.db!;
if (!/\/dauviet_g12_[a-z_]+/.test(new URL(DB).pathname)) throw new Error('refusing: --db must be a disposable dauviet_g12_* database');
const PORT = Number(args.port ?? 3499);
const BASE = `http://127.0.0.1:${PORT}/v1`;
const prisma = new PrismaClient({ datasources: { db: { url: DB } } });
const trigger = path.join(os.tmpdir(), `g12-sigterm-${Date.now()}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let log = '';
  let exitCode: number | null = null;
  const child = spawn(process.execPath, ['-r', path.resolve(__dirname, 'sigterm-trigger.cjs'), 'dist/main.js'], {
    cwd: path.resolve(__dirname, '../../apps/api'),
    env: { ...process.env, DATABASE_URL: DB, PORT: String(PORT), REDIS_KEY_PREFIX: 'g12-shutdown', SMTP_HOST: '127.0.0.1', SMTP_PORT: '9', G12_SIGTERM_TRIGGER_FILE: trigger },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => (log += d.toString()));
  child.stderr.on('data', (d) => (log += d.toString()));
  const exited = new Promise<void>((resolve) => child.on('exit', (code) => ((exitCode = code), resolve())));

  for (let i = 0; i < 240; i++) {
    try {
      if ((await fetch(`${BASE}/health`)).status === 200) break;
    } catch {
      /* booting */
    }
    await sleep(1000);
  }
  const email = `g12-shutdown-${Date.now()}@example.com`;
  const passwordHash = await argon2.hash('G12-Shutdown-1!', { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  await prisma.user.create({ data: { email, displayName: 'shutdown probe', roles: ['USER', 'ADMIN'], emailVerifiedAt: new Date(), authIdentities: { create: { provider: 'PASSWORD', passwordHash } } } });
  const token = ((await (await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'G12-Shutdown-1!' }) })).json()) as any).data.accessToken;

  const inflight = fetch(`${BASE}/admin/search/projection/rebuild`, { method: 'POST', headers: { authorization: `Bearer ${token}` } }).then(async (r) => ({ status: r.status, body: await r.text() }), (e) => ({ status: 0, body: String(e) }));
  await sleep(300);
  fs.writeFileSync(trigger, 'go');
  const inflightResult = await inflight;
  await sleep(500);
  let refused = false;
  try {
    await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(3000) });
  } catch {
    refused = true;
  }
  await Promise.race([exited, sleep(60_000)]);
  const queue = Number((await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) n FROM "SearchProjectionQueue" WHERE "lockedAt" IS NOT NULL`).catch(() => [{ n: BigInt(-1) }]))[0].n);
  const conns = Number((await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) n FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()`))[0].n);

  const emitted = /G12_SIGTERM_EMITTED at=\d+ms listeners=(\d+)/.exec(log);
  const checks = {
    sigtermHandlerInstalled: !!emitted && Number(emitted[1]) >= 1,
    inflightRequestCompleted: inflightResult.status >= 200 && inflightResult.status < 300,
    newConnectionsRefusedAfterShutdown: refused,
    processExited: exitCode !== null || /G12_PROCESS_EXIT/.test(log),
    noProjectionClaimLeftBehind: queue === 0,
    noLeftoverAppConnections: conns === 0,
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ checks, inflight: inflightResult.status, exitCode, markers: log.split('\n').filter((l) => l.startsWith('G12_')) }, null, 1));
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
  fs.rmSync(trigger, { force: true });
  process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
}
main().catch(async (e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  await prisma.$disconnect();
  process.exit(2);
});
