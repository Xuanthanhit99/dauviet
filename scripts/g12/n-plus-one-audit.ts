/**
 * G12 N+1 audit. Counts the SQL statements PostgreSQL logs for ONE request to each hot path, at two
 * data sizes (3 vs 30 rows). A per-row query shows up as statement growth; a fixed count means the
 * path is not N+1. Requires `ALTER DATABASE <db> SET log_statement = 'all'` on a DISPOSABLE
 * dauviet_g12_* database and the API running with the projection worker disabled (no background SQL).
 *
 *   npx tsx scripts/g12/n-plus-one-audit.ts --base http://localhost:3299/v1 --db <url> --container dauviet-postgres-1
 */
import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const args = Object.fromEntries(process.argv.slice(2).reduce<string[][]>((acc, v, i, all) => (v.startsWith('--') ? [...acc, [v.slice(2), all[i + 1]]] : acc), []));
const BASE = args.base!;
const DB = args.db!;
const DBNAME = new URL(DB).pathname.slice(1);
if (!/^dauviet_g12_[a-z_]+$/.test(DBNAME)) throw new Error('refusing: disposable dauviet_g12_* database only');
const CONTAINER = args.container ?? 'dauviet-postgres-1';
const prisma = new PrismaClient({ datasources: { db: { url: DB } } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function http(method: string, p: string, token?: string, body?: unknown, retried = false): Promise<{ status: number; json: any }> {
  // A pause between requests can outlive the server keep-alive window; retry once on a reset socket.
  const r = await fetch(`${BASE}${p}`, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined }).catch((e) => {
    if (retried) throw e;
    return null;
  });
  if (!r) return http(method, p, token, body, true);
  return { status: r.status, json: (await r.json().catch(() => null)) as any };
}
function mark(label: string) {
  execSync(`docker exec ${CONTAINER} psql -U dauviet -d ${DBNAME} -qtAc "SELECT 'G12MARK-${label}'"`);
}
/** Statements logged for this database between the two markers (excluding the markers themselves). */
async function countBetween(label: string, fn: () => Promise<unknown>) {
  const since = new Date(Date.now() - 1000).toISOString();
  mark(`${label}-start`);
  await fn();
  await sleep(300);
  mark(`${label}-end`);
  const logs = execSync(`docker logs --since ${since} ${CONTAINER} 2>&1`, { maxBuffer: 256 * 1024 * 1024 }).toString().split('\n');
  const a = logs.findIndex((l) => l.includes(`G12MARK-${label}-start`));
  const b = logs.findIndex((l) => l.includes(`G12MARK-${label}-end`));
  return logs.slice(a + 1, b).filter((l) => /LOG:\s+(statement|execute)/.test(l)).length;
}

async function main() {
  const email = `g12n1-${Date.now()}@example.com`;
  const passwordHash = await argon2.hash('G12-N1-Pass!1', { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const owner = await prisma.user.create({ data: { email, displayName: 'n1 owner', emailVerifiedAt: new Date(), authIdentities: { create: { provider: 'PASSWORD', passwordHash } } } });
  const token = (await http('POST', '/auth/login', undefined, { email, password: 'G12-N1-Pass!1' })).json.data.accessToken;
  const members: string[] = [];
  for (let i = 0; i < 4; i++) members.push((await prisma.user.create({ data: { email: `g12n1-m${i}-${Date.now()}@example.com`, displayName: `m${i}` } })).id);

  async function tripWith(expenses: number) {
    const trip = (await http('POST', '/trips', token, { title: `n1 ${expenses}`, startDate: '2026-12-01', endDate: '2026-12-10', primaryCurrency: 'USD' })).json.data.id as string;
    for (const m of members) await prisma.tripMember.create({ data: { tripId: trip, userId: m, role: 'EDITOR' } });
    for (let i = 0; i < expenses; i++) {
      await http('POST', `/trips/${trip}/expenses`, token, { title: `e${i}`, category: 'FOOD', amount: '50.00', currency: i % 2 ? 'USD' : 'VND', payerUserId: owner.id, splitMode: 'EQUAL', occurredOn: '2026-12-02', shares: [{ userId: owner.id }, ...members.map((m) => ({ userId: m }))] });
    }
    for (let i = 0; i < Math.ceil(expenses / 3); i++) await http('POST', `/trips/${trip}/settlements`, token, { fromUserId: members[0], toUserId: owner.id, amount: '1.00', currency: 'USD', settledAt: '2026-12-03' });
    return trip;
  }
  const small = await tripWith(3);
  const large = await tripWith(30);
  const dest = (await http('GET', '/destinations')).json.data;
  const destSlug = (dest.items ?? dest)[0].slug;

  const rows: Record<string, { small: number; large: number } | number> = {};
  for (const [name, f] of [
    ['trip detail', (t: string) => http('GET', `/trips/${t}`, token)],
    ['trip members', (t: string) => http('GET', `/trips/${t}/members`, token)],
    ['expense list', (t: string) => http('GET', `/trips/${t}/expenses`, token)],
    ['expense summary', (t: string) => http('GET', `/trips/${t}/expenses/summary`, token)],
    ['settlement suggestions', (t: string) => http('GET', `/trips/${t}/settlement-suggestions`, token)],
    ['settlements list', (t: string) => http('GET', `/trips/${t}/settlements`, token)],
    ['location list', (t: string) => http('GET', `/trips/${t}/locations`, token)],
  ] as const) {
    rows[name] = { small: await countBetween(`${name.replace(/\W/g, '')}-s`, () => f(small)), large: await countBetween(`${name.replace(/\W/g, '')}-l`, () => f(large)) };
  }
  rows['destination detail (slug)'] = await countBetween('dest', () => http('GET', `/destinations/${destSlug}`));
  rows['search q=hue'] = await countBetween('search', () => http('GET', '/search?q=hue'));
  rows['search q=ha (20 results)'] = await countBetween('search2', () => http('GET', '/search?q=ha'));
  rows['map world zoom 2'] = await countBetween('map', () => http('GET', '/map/features?bbox=-180,-85,180,85&zoom=2'));
  rows['map VN zoom 6'] = await countBetween('map2', () => http('GET', '/map/features?bbox=102,8,110,24&zoom=6'));
  rows['auth-only baseline GET /users/me'] = await countBetween('me', () => http('GET', '/users/me', token));
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ note: 'statement counts include JWT validation (Session + User reads) on authenticated routes', expensesSmall: 3, expensesLarge: 30, rows }, null, 1));
  await prisma.$disconnect();
}
main().catch(async (e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  await prisma.$disconnect();
  process.exit(2);
});
