/**
 * G12 Path A: projection determinism + disposability on a fresh install.
 *   npx tsx scripts/g12/path-a-rebuild.ts --base http://localhost:3299/v1 --db <dauviet_g12_* url>
 * Provisions the first administrator exactly as the runbook's step 5 does (a normal account whose
 * roles are granted in the database - email verification is set directly because no mail is
 * delivered in this environment), then: ADMIN rebuild x2 -> identical projection; wipe the
 * projection tables -> rebuild -> identical again; canonical tables untouched throughout.
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const args = Object.fromEntries(process.argv.slice(2).reduce<string[][]>((acc, v, i, all) => (v.startsWith('--') ? [...acc, [v.slice(2), all[i + 1]]] : acc), []));
const BASE = args.base!;
const DB = args.db!;
if (!/\/dauviet_g12_[a-z_]+/.test(new URL(DB).pathname)) throw new Error('refusing: --db must be a disposable dauviet_g12_* database');
const prisma = new PrismaClient({ datasources: { db: { url: DB } } });

const PROJECTION = new Set(['SearchDocument', 'SearchTerm', 'SearchProjectionQueue', 'SearchProjectionRun']);
async function tableHashes() {
  const tables = await prisma.$queryRawUnsafe<{ t: string }[]>(`SELECT tablename t FROM pg_tables WHERE schemaname = 'public' ORDER BY 1`);
  const out: Record<string, string> = {};
  for (const { t } of tables) {
    if (t === 'User' || t === 'AuthIdentity' || t === 'Session' || t === 'AuditLog') continue; // the admin login itself writes these
    const excl = t === 'SearchDocument' ? `- 'id' - 'projectedAt'` : t === 'SearchTerm' ? `- 'id' - 'documentId'` : '';
    const r = await prisma.$queryRawUnsafe<{ h: string; n: bigint }[]>(`SELECT count(*) n, coalesce(md5(string_agg(md5((to_jsonb(x) ${excl})::text), ',' ORDER BY md5((to_jsonb(x) ${excl})::text))), 'empty') h FROM "${t}" x`);
    out[t] = `${r[0].n}:${r[0].h}`;
  }
  return out;
}
const canonical = (h: Record<string, string>) => Object.fromEntries(Object.entries(h).filter(([t]) => !PROJECTION.has(t)));

async function main() {
  // optional: let an earlier run's rebuild-throttle window (2/min) expire first
  await new Promise((r) => setTimeout(r, Number(args['initial-wait-ms'] ?? 0)));
  const email = `g12-first-admin-${Date.now()}@example.com`;
  const reg = await fetch(`${BASE}/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'G12-First-Admin-1!', displayName: 'G12 first admin' }) });
  if (reg.status !== 201) throw new Error(`register ${reg.status}`);
  await prisma.$executeRawUnsafe(`UPDATE "User" SET roles = ARRAY['USER','ADMIN']::"Role"[], "emailVerifiedAt" = now() WHERE email = $1`, email);
  const token = ((await (await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'G12-First-Admin-1!' }) })).json()) as any).data.accessToken;
  const rebuild = async () => {
    const r = await fetch(`${BASE}/admin/search/projection/rebuild`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
    return { status: r.status, body: ((await r.json()) as any).data };
  };

  const h0 = await tableHashes();
  const r1 = await rebuild();
  const h1 = await tableHashes();
  const r2 = await rebuild();
  const h2 = await tableHashes();
  await prisma.$executeRawUnsafe(`DELETE FROM "SearchTerm"`);
  await prisma.$executeRawUnsafe(`DELETE FROM "SearchDocument"`);
  const wiped = Number((await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) n FROM "SearchDocument"`))[0].n);
  // The ADMIN rebuild route is throttled at 2/min (G11) - wait out the window before the third call.
  await new Promise((r) => setTimeout(r, 61_000));
  const r3 = await rebuild();
  const h3 = await tableHashes();
  const same = (a: Record<string, string>, b: Record<string, string>, t: string) => a[t] === b[t];
  const checks = {
    firstAdminProvisioned: typeof token === 'string',
    rebuild1Ok: r1.status < 300 && r1.body?.failed === 0,
    rebuild2Ok: r2.status < 300 && r2.body?.failed === 0,
    projectionIdenticalAfterRebuildX2: same(h1, h2, 'SearchDocument') && same(h1, h2, 'SearchTerm'),
    projectionEqualsWorkerBuiltOne: same(h0, h1, 'SearchDocument') && same(h0, h1, 'SearchTerm'),
    wipeLeftNoDocuments: wiped === 0,
    rebuildAfterWipeConverges: r3.status < 300 && same(h1, h3, 'SearchDocument') && same(h1, h3, 'SearchTerm'),
    canonicalUntouchedByRebuildsAndWipe: JSON.stringify(canonical(h0)) === JSON.stringify(canonical(h3)),
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ checks, documents: h3.SearchDocument, terms: h3.SearchTerm, rebuilds: [r1.body, r2.body, r3.body] }, null, 1));
  await prisma.$disconnect();
  process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
}
main().catch(async (e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  await prisma.$disconnect();
  process.exit(2);
});
