/**
 * G12 full-domain HTTP smoke (Path A, populated Path B, deployment smoke).
 *
 *   npx tsx scripts/g12/http-smoke.ts --base http://localhost:3199/v1 --db <DATABASE_URL> [--tag t1]
 *
 * Drives a RUNNING API over real HTTP across every domain: health, auth
 * (bearer + web cookie/CSRF), geography, historical knowledge (incl. the
 * citation workflow that writes EntityKind.FACT), discovery, provider
 * fail-closed / fixture offers, trip, collaboration, location, expense,
 * settlement, affiliate (fixture provider only - never a real booking),
 * provider-policy revocation, search and map. Prisma is used only for test
 * fixture steps a real client cannot perform (granting a role, inserting a
 * membership row instead of reading an emailed invitation token, creating
 * extra login-able actors under the 5/min registration throttle) and for
 * read-back assertions. Leaves its data in place (the target is expected to
 * be a disposable database). Exit code 1 if any check fails.
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const args = Object.fromEntries(
  process.argv.slice(2).reduce<string[][]>((acc, v, i, all) => (v.startsWith('--') ? [...acc, [v.slice(2), all[i + 1]]] : acc), []),
);
const BASE = (args.base ?? 'http://localhost:3199/v1').replace(/\/$/, '');
const TAG = args.tag ?? Date.now().toString(36);
const prisma = new PrismaClient({ datasources: { db: { url: args.db ?? process.env.DATABASE_URL } } });
const PASSWORD = 'G12-Smoke-Pass!1';

type Check = { name: string; ok: boolean; detail?: string };
const checks: Check[] = [];
function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
  // eslint-disable-next-line no-console
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

async function call(method: string, path: string, opts: { token?: string; body?: unknown; headers?: Record<string, string>; redirect?: RequestRedirect } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    redirect: opts.redirect ?? 'follow',
    headers: {
      ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.headers ?? {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON (redirect) */
  }
  return { status: res.status, json, headers: res.headers, text };
}

async function loginActor(label: string, roles: string[] = ['USER'], viaRegister = false) {
  const email = `g12smoke-${TAG}-${label}@example.com`.toLowerCase();
  if (viaRegister) {
    const r = await call('POST', '/auth/register', { body: { email, password: PASSWORD, displayName: `G12 ${label}` } });
    check(`auth: register ${label}`, r.status === 201, `status ${r.status}`);
  } else {
    const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
    await prisma.user.create({ data: { email, displayName: `G12 ${label}`, roles: roles as any, emailVerifiedAt: new Date(), authIdentities: { create: { provider: 'PASSWORD', passwordHash } } } });
  }
  if (viaRegister && (roles.length !== 1 || roles[0] !== 'USER')) await prisma.user.update({ where: { email }, data: { roles: roles as any } });
  const r = await call('POST', '/auth/login', { body: { email, password: PASSWORD } });
  check(`auth: login ${label}`, r.status === 201 && !!r.json?.data?.accessToken, `status ${r.status}`);
  return { email, token: r.json?.data?.accessToken as string, id: r.json?.data?.user?.id as string };
}

async function main() {
  // optional: let the per-IP login/register throttles (10 and 5 per minute) of an earlier run expire
  await new Promise((r) => setTimeout(r, Number(args['initial-wait-ms'] ?? 0)));
  // ---- health
  const h = await call('GET', '/health');
  check('health: 200 + database/redis ok', h.status === 200 && h.json?.data?.checks?.database === 'ok' && h.json?.data?.checks?.redis === 'ok', JSON.stringify(h.json?.data?.checks));

  // ---- auth
  const owner = await loginActor('owner', ['USER'], true);
  const editor = await loginActor('editor', ['USER', 'EDITOR'], true);
  const outsider = await loginActor('outsider');
  const admin = await loginActor('admin', ['USER', 'ADMIN']);
  const me = await call('GET', '/users/me', { token: owner.token });
  check('auth: /users/me with bearer', me.status === 200 && me.json?.data?.email === owner.email);
  check('auth: /users/me anonymous -> 401', (await call('GET', '/users/me')).status === 401);

  const web = await call('POST', '/auth/login', { body: { email: owner.email, password: PASSWORD }, headers: { 'x-client-platform': 'web' } });
  const cookies = web.headers.getSetCookie?.() ?? [];
  const refreshCookie = cookies.find((c) => c.startsWith('dv_refresh='));
  const csrfCookie = cookies.find((c) => c.startsWith('dv_csrf='));
  check('auth: web login sets HttpOnly SameSite=Lax refresh cookie scoped to /auth', !!refreshCookie && /HttpOnly/i.test(refreshCookie) && /SameSite=Lax/i.test(refreshCookie) && /Path=\/v1\/auth/i.test(refreshCookie), refreshCookie?.replace(/dv_refresh=[^;]+/, 'dv_refresh=<redacted>'));
  check('auth: web login returns no refresh token in body', web.json?.data?.refreshToken === undefined);
  const cookieHeader = [refreshCookie, csrfCookie].filter(Boolean).map((c) => c!.split(';')[0]).join('; ');
  const csrfValue = csrfCookie?.split(';')[0].split('=')[1] ?? '';
  const noCsrf = await call('POST', '/auth/refresh', { body: {}, headers: { cookie: cookieHeader, 'x-client-platform': 'web' } });
  check('csrf: cookie refresh without X-CSRF-Token -> 403', noCsrf.status === 403, `status ${noCsrf.status}`);
  const badCsrf = await call('POST', '/auth/refresh', { body: {}, headers: { cookie: cookieHeader, 'x-client-platform': 'web', 'x-csrf-token': 'forged' } });
  check('csrf: cookie refresh with forged X-CSRF-Token -> 403', badCsrf.status === 403, `status ${badCsrf.status}`);
  const goodCsrf = await call('POST', '/auth/refresh', { body: {}, headers: { cookie: cookieHeader, 'x-client-platform': 'web', 'x-csrf-token': csrfValue } });
  check('csrf: cookie refresh with matching X-CSRF-Token -> 201', goodCsrf.status === 201, `status ${goodCsrf.status}`);

  // ---- geography + discovery
  const countries = await call('GET', '/countries');
  const countrySlug = countries.json?.data?.items?.[0]?.slug ?? countries.json?.data?.[0]?.slug;
  check('geography: countries list', countries.status === 200 && !!countrySlug);
  check('geography: country detail', (await call('GET', `/countries/${countrySlug}`)).status === 200);
  const dests = await call('GET', '/destinations');
  const destItems = dests.json?.data?.items ?? dests.json?.data ?? [];
  const destSlug = destItems[0]?.slug;
  check('discovery: destinations list', dests.status === 200 && !!destSlug);
  const dest = await call('GET', `/destinations/${destSlug}`);
  check('discovery: destination detail', dest.status === 200);

  // ---- historical knowledge
  for (const p of ['/events', '/eras', '/dynasties', '/places', '/facts', '/timeline?fromYear=1000&toYear=2000']) {
    // /facts is a staff (CONTRIBUTOR+) module - read with the editor token; the others are public.
    const r = await call('GET', p, { token: p === '/facts' ? editor.token : undefined });
    check(`historical: GET ${p}`, r.status === 200, `status ${r.status}`);
  }
  const source = await call('POST', '/sources', { token: editor.token, body: { sourceType: 'BOOK', title: `G12 smoke source ${TAG}` } });
  check('trust: editor creates a Source', source.status === 201, `status ${source.status}`);
  const fact = await prisma.historicalFact.findFirst({ orderBy: { id: 'asc' }, select: { id: true } });
  const citation = await call('POST', '/citations', { token: editor.token, body: { factId: fact?.id, sourceId: source.json?.data?.id } });
  check('trust: citation create succeeds (writes EntityKind.FACT audit - G12 P1-2)', citation.status === 201, `status ${citation.status} ${citation.json?.error?.code ?? ''}`);
  // On a database without the G12 enum fix even this read fails ("invalid input value for enum EntityKind: FACT").
  const factAudit = await prisma.auditLog.count({ where: { entityType: 'FACT' as any, action: 'citation.created', entityId: fact?.id } }).catch(() => -1);
  check('trust: citation.created audit row with entityType FACT exists', factAudit >= 1, `rows ${factAudit}`);

  // ---- provider fail-closed / fixture offers (G05)
  const acc = await prisma.accommodation.findFirst({ where: { status: 'PUBLISHED' }, select: { canonicalSlug: true } });
  if (acc) {
    const offers = await call('GET', `/accommodations/${acc.canonicalSlug}/offers?checkIn=2026-12-01&checkOut=2026-12-03&guests=2&rooms=1&currency=USD`);
    check('provider: accommodation offers respond 200 (fixture offers only in the development seed profile; empty otherwise)', offers.status === 200, `offers ${offers.json?.data?.offers?.length ?? 'n/a'}`);
  }

  // ---- trip + collaboration
  const trip = await call('POST', '/trips', { token: owner.token, body: { title: `G12 smoke trip ${TAG}`, startDate: '2026-12-01', endDate: '2026-12-05', primaryCurrency: 'VND' } });
  const tripId = trip.json?.data?.id as string;
  check('trip: create', trip.status === 201 && !!tripId);
  check('trip: owner reads', (await call('GET', `/trips/${tripId}`, { token: owner.token })).status === 200);
  check('trip: outsider denied', (await call('GET', `/trips/${tripId}`, { token: outsider.token })).status === 403);
  const invite = await call('POST', `/trips/${tripId}/invitations`, { token: owner.token, body: { email: `g12smoke-${TAG}-invitee@example.com`, role: 'VIEWER' } });
  check('collaboration: invitation created (token never returned)', invite.status === 201 && JSON.stringify(invite.json).indexOf('tokenHash') === -1);
  await prisma.tripMember.create({ data: { tripId, userId: editor.id, role: 'EDITOR' } });
  const members = await call('GET', `/trips/${tripId}/members`, { token: owner.token });
  check('collaboration: member list', members.status === 200);
  check('collaboration: editor reads trip', (await call('GET', `/trips/${tripId}`, { token: editor.token })).status === 200);

  // ---- location (G08)
  const startSharing = await call('POST', `/trips/${tripId}/location-sharing/start`, { token: editor.token, body: { durationMinutes: 60 } });
  check('location: editor starts sharing', startSharing.status === 201, `status ${startSharing.status}`);
  const loc = await call('PUT', `/trips/${tripId}/location`, { token: editor.token, body: { latitude: 21.0301234, longitude: 105.8401234, accuracyMeters: 12, capturedAt: new Date().toISOString() } });
  check('location: editor updates location', loc.status === 200, `status ${loc.status}`);
  const locs = await call('GET', `/trips/${tripId}/locations`, { token: owner.token });
  check('location: owner sees editor location', locs.status === 200 && (locs.json?.data ?? []).some((l: any) => l.userId === editor.id && l.latitude === 21.0301234));
  check('location: outsider denied', (await call('GET', `/trips/${tripId}/locations`, { token: outsider.token })).status === 403);

  // ---- expense + settlement (G09)
  const vnd = await call('POST', `/trips/${tripId}/expenses`, { token: owner.token, body: { title: 'Pho', category: 'FOOD', amount: '300000', currency: 'VND', payerUserId: owner.id, splitMode: 'EQUAL', occurredOn: '2026-12-02', shares: [{ userId: owner.id }, { userId: editor.id }] } });
  check('expense: VND equal split', vnd.status === 201, `status ${vnd.status}`);
  const usd = await call('POST', `/trips/${tripId}/expenses`, { token: editor.token, body: { title: 'Museum', category: 'ACTIVITY', amount: '10.01', currency: 'USD', payerUserId: editor.id, splitMode: 'EXACT', occurredOn: '2026-12-03', shares: [{ userId: owner.id, amount: '5.00' }, { userId: editor.id, amount: '5.01' }] } });
  check('expense: USD exact split', usd.status === 201, `status ${usd.status}`);
  const neg = await call('POST', `/trips/${tripId}/expenses`, { token: editor.token, body: { title: 'Neg', category: 'OTHER', amount: '100.00', currency: 'USD', payerUserId: editor.id, splitMode: 'EXACT', occurredOn: '2026-12-03', shares: [{ userId: owner.id, amount: '150.00' }, { userId: editor.id, amount: '-50.00' }] } });
  check('expense: negative share rejected (G12 P1-3)', neg.status === 400 && neg.json?.error?.code === 'TRIP_EXPENSE_SPLIT_INVALID', `status ${neg.status}`);
  const summary = await call('GET', `/trips/${tripId}/expenses/summary`, { token: editor.token });
  const totals = summary.json?.data?.totalsByCurrency ?? [];
  check('money: summary keeps currencies separate (no FX, no cross-currency total)', summary.status === 200 && totals.length === 2 && totals.some((t: any) => t.currency === 'VND' && t.totalAmount === '300000') && totals.some((t: any) => t.currency === 'USD' && t.totalAmount === '10.01'), JSON.stringify(totals));
  check('money: settlement suggestions', (await call('GET', `/trips/${tripId}/settlement-suggestions`, { token: owner.token })).status === 200);
  const settle = await call('POST', `/trips/${tripId}/settlements`, { token: editor.token, body: { fromUserId: editor.id, toUserId: owner.id, amount: '150000', currency: 'VND', settledAt: '2026-12-04' } });
  check('money: settlement recorded', settle.status === 201, `status ${settle.status}`);

  // ---- affiliate (G10) - internal fixture provider only
  const code = `TEST_FIXTURE_PROVIDER_G10_AFFILIATE_SMOKE_${TAG}`.toUpperCase();
  const a = (m: string, p: string, body?: unknown) => call(m, p, { token: admin.token, body });
  const prov = await a('POST', '/admin/providers', { code, name: 'G12 smoke fixture provider', credentialMode: 'API_KEY' });
  const providerId = prov.json?.data?.id;
  await a('PATCH', `/admin/providers/${providerId}/status`, { status: 'ACTIVE' });
  for (const cap of ['AFFILIATE_LINK', 'CONVERSION_REPORTING']) await a('POST', `/admin/providers/${providerId}/capabilities`, { capability: cap });
  const integ = await a('POST', `/admin/providers/${providerId}/integrations`, { environment: 'SANDBOX', credentialReference: 'G12_SMOKE_FIXTURE_REF' });
  const integrationId = integ.json?.data?.id;
  await a('PATCH', `/admin/provider-integrations/${integrationId}/status`, { status: 'ACTIVE' });
  for (const cap of ['AFFILIATE_LINK', 'CONVERSION_REPORTING']) await a('POST', `/admin/provider-integrations/${integrationId}/capabilities/${cap}/enable`);
  const lic = await a('POST', `/admin/providers/${providerId}/licenses`, { datasetOrProduct: 'G12 smoke fixture program', termsUrl: 'https://example.test/terms' });
  const licenseId = lic.json?.data?.id;
  await a('PATCH', `/admin/provider-licenses/${licenseId}/rights`, { rightsDisplay: 'ALLOWED', rightsCache: 'ALLOWED', rightsStore: 'PROHIBITED', rightsModify: 'PROHIBITED', rightsRedistribute: 'PROHIBITED', rightsCommercialUse: 'ALLOWED', attributionRequirement: 'NOT_REQUIRED' });
  await a('PATCH', `/admin/provider-licenses/${licenseId}/status`, { status: 'APPROVED' });
  for (const cap of ['AFFILIATE_LINK', 'CONVERSION_REPORTING']) await a('POST', `/admin/provider-integrations/${integrationId}/capabilities/${cap}/activate`);
  const expensesBefore = await prisma.tripExpense.count({ where: { tripId } });
  const click = await call('POST', '/affiliate/clicks', { body: { providerCode: code, providerOfferId: 'offer-1', surface: 'DESTINATION_STAY' } });
  check('affiliate: anonymous click', click.status === 201, `status ${click.status} ${click.json?.error?.code ?? ''}`);
  const redirect = await call('GET', `/affiliate/r/${click.json?.data?.redirectToken}`, { redirect: 'manual' });
  const location = redirect.headers.get('location') ?? '';
  check('affiliate: redirect 302 to the https fixture host only', redirect.status === 302 && location.startsWith('https://www.fixture-provider.example/'), location.replace(/[?#].*$/, ''));
  check('affiliate: click + redirect created no conversion', (await prisma.affiliateConversion.count({ where: { providerId } })) === 0);
  const ingest = await a('POST', '/admin/affiliate/conversions/ingest', { providerCode: code, evidenceType: 'FIXTURE', evidenceReference: `g12-smoke-${TAG}`, evidence: { conversionId: `conv-${TAG}`, status: 'confirmed', providerOccurredAt: new Date().toISOString(), reportedAt: new Date().toISOString(), bookingAmount: '500.00', bookingCurrency: 'USD', commissionAmount: '40.00', commissionCurrency: 'USD' } });
  check('affiliate: admin ingests fixture conversion', ingest.status === 201, `status ${ingest.status}`);
  check('commercial: conversion never creates a TripExpense', (await prisma.tripExpense.count({ where: { tripId } })) === expensesBefore);
  check('affiliate: non-admin cannot list conversions', (await call('GET', '/admin/affiliate/conversions', { token: owner.token })).status === 403);
  await a('PATCH', `/admin/provider-licenses/${licenseId}/status`, { status: 'REVOKED' });
  const revoked = await call('POST', '/affiliate/clicks', { body: { providerCode: code, providerOfferId: 'offer-1', surface: 'DESTINATION_STAY' } });
  check('provider policy: license revoked -> very next click 403, no restart', revoked.status === 403, `${revoked.status} ${revoked.json?.error?.code ?? ''}`);

  // ---- search + map (G11)
  const search = await call('GET', '/search?q=hoi%20an');
  check('search: accent-insensitive query returns results', search.status === 200 && (search.json?.data?.results?.length ?? 0) > 0);
  const priv = await call('GET', `/search?q=${encodeURIComponent(`G12 smoke trip ${TAG}`)}`);
  // A public Source titled 'G12 smoke source <tag>' may legitimately fuzzy-match; the private trip must not.
  check('search: private trip title/id never searchable', priv.status === 200 && JSON.stringify(priv.json).indexOf(tripId) === -1 && !(priv.json?.data?.results ?? []).some((r: any) => r.title === `G12 smoke trip ${TAG}` || r.id === tripId));
  check('search: suggestions', (await call('GET', '/search/suggestions?q=hue')).status === 200);
  const map = await call('GET', '/map/features?bbox=102,8,110,24&zoom=6');
  check('map: features in Vietnam bbox', map.status === 200);
  check('map: private G08 coordinate never on the public map', !JSON.stringify(map.json).includes('21.0301234') && !JSON.stringify(map.json).includes('105.8401234'));

  const failed = checks.filter((c) => !c.ok);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ base: BASE, tag: TAG, checks: checks.length, passed: checks.length - failed.length, failed: failed.map((f) => f.name), tripId }, null, 1));
  await prisma.$disconnect();
  process.exit(failed.length ? 1 : 0);
}

main().catch(async (err) => {
  // eslint-disable-next-line no-console
  console.error('smoke crashed:', err instanceof Error ? err.message : err);
  await prisma.$disconnect();
  process.exit(2);
});
