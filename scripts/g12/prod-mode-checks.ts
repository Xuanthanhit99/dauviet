/**
 * G12 production-mode HTTP checks against the COMPILED app booted with NODE_ENV=production
 * (Path A / deployment smoke). Covers what the e2e harness cannot, because bootstrapTestApp()
 * always reflects CORS origins and never sets Secure cookies:
 *   - CORS: an allowed origin is echoed with credentials; a foreign origin gets no ACAO; no wildcard.
 *   - Security headers from helmet on real responses (success and error).
 *   - Cookie flags in production (HttpOnly, Secure, SameSite=Lax, Path) for the web login flow.
 *   - Error bodies in production carry no stack / internals.
 *
 *   npx tsx scripts/g12/prod-mode-checks.ts --base http://localhost:3299/v1 --allowed-origin https://app.example.test --db <url>
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const args = Object.fromEntries(
  process.argv.slice(2).reduce<string[][]>((acc, v, i, all) => (v.startsWith('--') ? [...acc, [v.slice(2), all[i + 1]]] : acc), []),
);
const BASE = (args.base ?? 'http://localhost:3299/v1').replace(/\/$/, '');
const ALLOWED = args['allowed-origin'] ?? 'https://app.example.test';
const prisma = new PrismaClient({ datasources: { db: { url: args.db ?? process.env.DATABASE_URL } } });
const checks: { name: string; ok: boolean; detail?: string }[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  checks.push({ name, ok, detail });
  // eslint-disable-next-line no-console
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

async function main() {
  // CORS
  const allowed = await fetch(`${BASE}/health`, { headers: { origin: ALLOWED } });
  check('cors: allowed origin echoed with credentials', allowed.headers.get('access-control-allow-origin') === ALLOWED && allowed.headers.get('access-control-allow-credentials') === 'true', `${allowed.headers.get('access-control-allow-origin')}`);
  const foreign = await fetch(`${BASE}/health`, { headers: { origin: 'https://evil.example.test' } });
  check('cors: foreign origin gets no Access-Control-Allow-Origin', !foreign.headers.get('access-control-allow-origin'), `${foreign.headers.get('access-control-allow-origin')}`);
  const preflight = await fetch(`${BASE}/trips`, { method: 'OPTIONS', headers: { origin: 'https://evil.example.test', 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type' } });
  check('cors: foreign preflight not allowed', !preflight.headers.get('access-control-allow-origin'));
  const goodPreflight = await fetch(`${BASE}/trips`, { method: 'OPTIONS', headers: { origin: ALLOWED, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type' } });
  check('cors: allowed preflight answered, never "*"', goodPreflight.status < 300 && goodPreflight.headers.get('access-control-allow-origin') === ALLOWED);

  // Security headers (success + error)
  for (const [label, res] of [['200 /health', allowed], ['404', await fetch(`${BASE}/does-not-exist`)], ['401', await fetch(`${BASE}/users/me`)]] as const) {
    const h = res.headers;
    const want: [string, (v: string | null) => boolean][] = [
      ['x-content-type-options', (v) => v === 'nosniff'],
      ['x-frame-options', (v) => v === 'SAMEORIGIN' || v === 'DENY'],
      ['strict-transport-security', (v) => !!v && /max-age=\d+/.test(v)],
      ['content-security-policy', (v) => !!v && v.includes("default-src 'self'")],
      ['referrer-policy', (v) => !!v],
      ['cross-origin-opener-policy', (v) => !!v],
      ['x-powered-by', (v) => v === null],
    ];
    const missing = want.filter(([k, ok]) => !ok(h.get(k))).map(([k]) => `${k}=${h.get(k)}`);
    check(`headers: helmet set on ${label}`, missing.length === 0, missing.join(', '));
  }

  // Cookies in production
  const email = `g12prod-${Date.now()}@example.com`;
  const passwordHash = await argon2.hash('G12-Prod-Pass!1', { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  await prisma.user.create({ data: { email, displayName: 'G12 prod check', emailVerifiedAt: new Date(), authIdentities: { create: { provider: 'PASSWORD', passwordHash } } } });
  const login = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-client-platform': 'web', origin: ALLOWED }, body: JSON.stringify({ email, password: 'G12-Prod-Pass!1' }) });
  const cookies = login.headers.getSetCookie();
  const refresh = cookies.find((c) => c.startsWith('dv_refresh=')) ?? '';
  const csrf = cookies.find((c) => c.startsWith('dv_csrf=')) ?? '';
  const redact = (c: string) => c.replace(/=([^;]+)/, '=<redacted>');
  check('cookies: refresh cookie HttpOnly + Secure + SameSite=Lax + Path=/v1/auth + expiry', /HttpOnly/i.test(refresh) && /;\s*Secure/i.test(refresh) && /SameSite=Lax/i.test(refresh) && /Path=\/v1\/auth/i.test(refresh) && /Expires=|Max-Age=/i.test(refresh), redact(refresh));
  check('cookies: CSRF cookie readable (not HttpOnly) but Secure + SameSite=Lax', !/HttpOnly/i.test(csrf) && /;\s*Secure/i.test(csrf) && /SameSite=Lax/i.test(csrf), redact(csrf));
  check('cookies: no Domain attribute (host-only)', !/Domain=/i.test(refresh) && !/Domain=/i.test(csrf));
  const body = (await login.json()) as any;
  check('cookies: web login body carries no refresh token', body?.data?.refreshToken === undefined && typeof body?.data?.accessToken === 'string');

  // Production error bodies
  const bad = await fetch(`${BASE}/trips`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${body?.data?.accessToken}` }, body: '{"title":' });
  const badText = await bad.text();
  check('errors: malformed JSON -> 400 envelope, no parser internals', bad.status === 400 && !/at \w|SyntaxError|Unexpected end|position \d/i.test(badText), `${bad.status}`);
  const big = await fetch(`${BASE}/trips`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'x'.repeat(1_100_000) }) });
  check('errors: body over 1 MB -> 413 PAYLOAD_TOO_LARGE', big.status === 413 && (await big.text()).includes('PAYLOAD_TOO_LARGE'), `${big.status}`);
  const docs = await fetch(`${BASE.replace(/\/v1$/, '')}/docs`);
  check('docs: Swagger UI served (public contract only - documented P3)', docs.status === 200 || docs.status === 301, `${docs.status}`);

  await prisma.user.delete({ where: { email } });
  const failed = checks.filter((c) => !c.ok);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ base: BASE, checks: checks.length, passed: checks.length - failed.length, failed: failed.map((f) => f.name) }, null, 1));
  await prisma.$disconnect();
  process.exit(failed.length ? 1 : 0);
}

main().catch(async (err) => {
  // eslint-disable-next-line no-console
  console.error('prod-mode checks crashed:', err instanceof Error ? err.message : err);
  await prisma.$disconnect();
  process.exit(2);
});
