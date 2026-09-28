import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { INestApplication, RequestMethod } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ModulesContainer } from '@nestjs/core';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { SwaggerModule } from '@nestjs/swagger';
import { bootstrapTestApp } from './bootstrap-test-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { MailerService } from '../src/modules/mailer/mailer.service';
import { SearchProjectionService } from '../src/modules/search/search-projection.service';
import { TripsService } from '../src/modules/trips/trips.service';
import { IS_PUBLIC_KEY } from '../src/common/decorators/public.decorator';
import { ROLES_KEY } from '../src/common/decorators/roles.decorator';
import { buildSwaggerConfig } from '../src/swagger.config';
import { FIXTURE_AFFILIATE_PROVIDER_CODE } from '../src/modules/affiliate/adapters/fixture-affiliate-adapter';

/**
 * G12 - Final contract + cross-domain certification (real HTTP, real PostgreSQL/PostGIS, real Redis).
 *
 * Not a re-run of the phase suites: every block here exercises an interaction BETWEEN domains, or
 * sweeps the whole runtime surface, which no single phase suite could:
 * - runtime routes vs the OpenAPI generated from the same running app vs the committed openapi.json,
 *   automated route classification, and a live anonymous / plain-USER sweep of every route;
 * - actor x object IDOR with known foreign ids (incl. cross-trip sub-resource confusion);
 * - same-JWT next-request revocation (role downgrade, removal, archive, location stop, provider
 *   disable, account suspension);
 * - trust-zone / ingestion / commercial / money / location-privacy separation across domains;
 * - real PostgreSQL races and a lock-order stress over the G07/G08/G09 tables;
 * - input abuse, error-envelope privacy, rate limiting with principal separation, time semantics;
 * - log capture proving no secret / precise coordinate reaches stdout/stderr.
 */
jest.setTimeout(180_000);

const STAMP = Date.now().toString(36);
// Distinctive private coordinate (never a real public place) - asserted absent from every public surface and the logs.
const LAT = 10.7769421;
const LNG = 106.7009123;
const LAT_S = '10.7769421';
const LNG_S = '106.7009123';
const PASSWORD = 'G12-Cert-Pass!1';

describe('G12 certification (cross-domain, contract, security)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let projection: SearchProjectionService;
  const createdEmails: string[] = [];
  const createdTripIds: string[] = [];
  const createdProviderIds: string[] = [];
  const logChunks: string[] = [];
  const secretsSeen: string[] = [];
  let restoreStreams: () => void;

  type Actor = { id: string; token: string; email: string; sessionId?: string };
  let owner: Actor, editor: Actor, viewer: Actor, removed: Actor, pending: Actor, unrelated: Actor, admin: Actor, contributor: Actor;
  let T1: string; // owner's trip: editor, viewer, (removed) members; pending invitation
  let T2: string; // unrelated user's own trip
  let editorMemberId: string, viewerMemberId: string, invitationId: string, dayId: string, expenseId: string, settlementId: string;

  const http = () => request(app.getHttpServer());
  const as = (r: request.Test, a?: Actor | null) => (a ? r.set('Authorization', `Bearer ${a.token}`) : r);

  async function registerViaHttp(label: string): Promise<Actor> {
    const email = `g12-${label}-${STAMP}@example.com`;
    createdEmails.push(email);
    await http().post('/v1/auth/register').send({ email, password: PASSWORD, displayName: `G12 ${label}` }).expect(201);
    const res = await http().post('/v1/auth/login').send({ email, password: PASSWORD }).expect(201);
    secretsSeen.push(res.body.data.accessToken, res.body.data.refreshToken);
    return { id: res.body.data.user.id, token: res.body.data.accessToken, email };
  }

  /** Real user + real Session row + real signed JWT (validated per request by JwtStrategy) - used for actors beyond the 5/min registration throttle. */
  async function mintActor(label: string, roles: string[] = ['USER']): Promise<Actor> {
    const email = `g12-${label}-${STAMP}@example.com`;
    createdEmails.push(email);
    const user = await prisma.user.create({ data: { email, displayName: `G12 ${label}`, roles: roles as any, emailVerifiedAt: new Date() } });
    const tokens = await app.get(AuthService).issueTokenPair({ id: user.id, roles: user.roles }, { userAgent: 'g12-e2e' });
    secretsSeen.push(tokens.accessToken, tokens.refreshToken);
    return { id: user.id, token: tokens.accessToken, email, sessionId: tokens.sessionId };
  }

  async function createTrip(a: Actor, overrides: Record<string, unknown> = {}) {
    const res = await as(http().post('/v1/trips'), a).send({ title: `G12 trip ${STAMP}`, startDate: '2026-12-01', endDate: '2026-12-05', primaryCurrency: 'VND', ...overrides }).expect(201);
    createdTripIds.push(res.body.data.id);
    return res.body.data.id as string;
  }
  const tripVersion = async (tripId: string) => (await prisma.trip.findUniqueOrThrow({ where: { id: tripId } })).version;
  async function addMember(tripId: string, userId: string, role: 'EDITOR' | 'VIEWER') {
    return (await prisma.tripMember.create({ data: { tripId, userId, role } })).id;
  }
  const expenseBody = (payer: Actor, participants: Actor[], extra: Record<string, unknown> = {}) => ({
    title: 'G12 dinner', category: 'FOOD', amount: '300.00', currency: 'USD', payerUserId: payer.id, splitMode: 'EQUAL', occurredOn: '2026-12-02', shares: participants.map((p) => ({ userId: p.id })), ...extra,
  });
  const locBody = (lat = LAT, lng = LNG, capturedAt = new Date(Date.now() - 1000).toISOString()) => ({ latitude: lat, longitude: lng, accuracyMeters: 8, capturedAt });

  async function setupProvider(opts: { g05?: boolean } = {}) {
    const code = `${FIXTURE_AFFILIATE_PROVIDER_CODE}_G12_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`.toUpperCase();
    const a = (r: request.Test) => as(r, admin);
    const providerId = (await a(http().post('/v1/admin/providers')).send({ code, name: 'G12 fixture provider', credentialMode: 'API_KEY' }).expect(201)).body.data.id as string;
    createdProviderIds.push(providerId);
    const caps = ['AFFILIATE_LINK', 'CONVERSION_REPORTING', ...(opts.g05 ? ['ACCOMMODATION_SEARCH', 'LIVE_PRICE'] : [])];
    await a(http().patch(`/v1/admin/providers/${providerId}/status`)).send({ status: 'ACTIVE' }).expect(200);
    for (const capability of caps) await a(http().post(`/v1/admin/providers/${providerId}/capabilities`)).send({ capability }).expect(201);
    const integrationId = (await a(http().post(`/v1/admin/providers/${providerId}/integrations`)).send({ environment: 'SANDBOX', credentialReference: 'G12_FIXTURE_REF' }).expect(201)).body.data.id as string;
    await a(http().patch(`/v1/admin/provider-integrations/${integrationId}/status`)).send({ status: 'ACTIVE' }).expect(200);
    for (const c of caps) await a(http().post(`/v1/admin/provider-integrations/${integrationId}/capabilities/${c}/enable`)).expect(201);
    const licenseId = (await a(http().post(`/v1/admin/providers/${providerId}/licenses`)).send({ datasetOrProduct: 'G12 fixture program', termsUrl: 'https://example.test/terms' }).expect(201)).body.data.id as string;
    await a(http().patch(`/v1/admin/provider-licenses/${licenseId}/rights`))
      .send({ rightsDisplay: 'ALLOWED', rightsCache: 'ALLOWED', rightsStore: 'ALLOWED', rightsModify: 'PROHIBITED', rightsRedistribute: 'PROHIBITED', rightsCommercialUse: 'ALLOWED', attributionRequirement: 'NOT_REQUIRED' })
      .expect(200);
    await a(http().patch(`/v1/admin/provider-licenses/${licenseId}/status`)).send({ status: 'APPROVED' }).expect(200);
    for (const c of caps) await a(http().post(`/v1/admin/provider-integrations/${integrationId}/capabilities/${c}/activate`)).expect(201);
    return { code, providerId, integrationId, licenseId };
  }
  const click = (a: Actor | null, body: Record<string, unknown>) => as(http().post('/v1/affiliate/clicks'), a).send(body);
  const ingest = (body: Record<string, unknown>) => as(http().post('/v1/admin/affiliate/conversions/ingest'), admin).send(body);
  const evidence = (o: Record<string, unknown> = {}) => ({
    conversionId: `g12-conv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, status: 'confirmed', providerOccurredAt: new Date().toISOString(), reportedAt: new Date().toISOString(),
    bookingAmount: '500.00', bookingCurrency: 'USD', commissionAmount: '40.00', commissionCurrency: 'USD', ...o,
  });

  beforeAll(async () => {
    // Capture everything the app writes to stdout/stderr for the log-privacy assertions (still passed through).
    const origOut = process.stdout.write.bind(process.stdout);
    const origErr = process.stderr.write.bind(process.stderr);
    (process.stdout as any).write = (chunk: any, ...rest: any[]) => {
      logChunks.push(String(chunk));
      return origOut(chunk, ...rest);
    };
    (process.stderr as any).write = (chunk: any, ...rest: any[]) => {
      logChunks.push(String(chunk));
      return origErr(chunk, ...rest);
    };
    restoreStreams = () => {
      (process.stdout as any).write = origOut;
      (process.stderr as any).write = origErr;
    };

    process.env.RATE_LIMIT_MAX = '100000';
    process.env.SEARCH_RATE_LIMIT_MAX = '100000';
    app = await bootstrapTestApp();
    prisma = app.get(PrismaService);
    projection = app.get(SearchProjectionService);
    jest.spyOn(app.get(MailerService), 'sendTripInvitation').mockResolvedValue(undefined);

    owner = await registerViaHttp('owner');
    editor = await registerViaHttp('editor');
    viewer = await mintActor('viewer');
    removed = await mintActor('removed');
    pending = await mintActor('pending');
    unrelated = await mintActor('unrelated');
    admin = await mintActor('admin', ['USER', 'ADMIN']);
    contributor = await mintActor('contributor', ['USER', 'CONTRIBUTOR']);

    T1 = await createTrip(owner);
    T2 = await createTrip(unrelated, { title: `G12 other trip ${STAMP}` });
    editorMemberId = await addMember(T1, editor.id, 'EDITOR');
    viewerMemberId = await addMember(T1, viewer.id, 'VIEWER');
    const removedMemberId = await addMember(T1, removed.id, 'VIEWER');
    invitationId = (await as(http().post(`/v1/trips/${T1}/invitations`), owner).send({ email: pending.email, role: 'VIEWER' }).expect(201)).body.data.id;
    dayId = (await prisma.tripDay.findFirstOrThrow({ where: { tripId: T1 } })).id;
    expenseId = (await as(http().post(`/v1/trips/${T1}/expenses`), editor).send(expenseBody(editor, [owner, editor, viewer])).expect(201)).body.data.id;
    settlementId = (await as(http().post(`/v1/trips/${T1}/settlements`), owner).send({ fromUserId: viewer.id, toUserId: editor.id, amount: '10.00', currency: 'USD', settledAt: '2026-12-03' }).expect(201)).body.data.id;
    await as(http().post(`/v1/trips/${T1}/location-sharing/start`), editor).send({ durationMinutes: 60 }).expect(201);
    await as(http().put(`/v1/trips/${T1}/location`), editor).send(locBody()).expect(200);
    // `removed` held access (proven), then is removed - its JWT is kept for next-request checks.
    await as(http().get(`/v1/trips/${T1}`), removed).expect(200);
    await as(http().delete(`/v1/trips/${T1}/members/${removedMemberId}`), owner).send({ expectedVersion: await tripVersion(T1) }).expect(200);
  });

  afterAll(async () => {
    if (!prisma) {
      restoreStreams?.();
      await app?.close();
      return;
    }
    try {
      const tripIds = (await prisma.trip.findMany({ where: { owner: { email: { in: createdEmails } } }, select: { id: true } })).map((t) => t.id);
      if (tripIds.length) {
        await prisma.affiliateClick.updateMany({ where: { tripId: { in: tripIds } }, data: { tripId: null } });
        await prisma.tripMemberLocation.deleteMany({ where: { tripId: { in: tripIds } } });
        await prisma.tripLocationSharing.deleteMany({ where: { tripId: { in: tripIds } } });
        await prisma.tripExpenseShare.deleteMany({ where: { expense: { tripId: { in: tripIds } } } });
        await prisma.tripExpense.deleteMany({ where: { tripId: { in: tripIds } } });
        await prisma.tripSettlement.deleteMany({ where: { tripId: { in: tripIds } } });
        await prisma.tripInvitation.deleteMany({ where: { tripId: { in: tripIds } } });
        await prisma.tripCollaborationEvent.deleteMany({ where: { tripId: { in: tripIds } } });
        await prisma.tripMember.deleteMany({ where: { tripId: { in: tripIds } } });
      }
      if (createdProviderIds.length) {
        await prisma.affiliateConversion.deleteMany({ where: { providerId: { in: createdProviderIds } } });
        await prisma.affiliateClick.deleteMany({ where: { providerId: { in: createdProviderIds } } });
        await prisma.affiliateSession.deleteMany({ where: { providerId: { in: createdProviderIds } } });
        await prisma.providerBookingReference.deleteMany({ where: { providerId: { in: createdProviderIds } } });
        await prisma.accommodationOffer.deleteMany({ where: { providerReference: { providerId: { in: createdProviderIds } } } });
        await prisma.providerAccommodationReference.deleteMany({ where: { providerId: { in: createdProviderIds } } });
      }
      await prisma.ingestionCandidate.deleteMany({ where: { normalizedData: { path: ['name'], string_contains: `G12 Unaccepted ${STAMP}` } } });
      await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    } finally {
      restoreStreams?.();
      await app?.close();
    }
  }, 600_000);

  // =====================================================================================
  describe('1. runtime routes == OpenAPI == committed contract; classification; live auth sweep', () => {
    type RouteInfo = { method: string; path: string; oapiPath: string; cls: string; roles: string[] };
    let routes: RouteInfo[] = [];
    let document: any;
    const METHOD_NAMES: Record<number, string> = { [RequestMethod.GET]: 'get', [RequestMethod.POST]: 'post', [RequestMethod.PUT]: 'put', [RequestMethod.DELETE]: 'delete', [RequestMethod.PATCH]: 'patch' };

    beforeAll(() => {
      const join = (...parts: string[]) => '/' + parts.flatMap((p) => p.split('/')).filter(Boolean).join('/');
      const fromMetadata = new Map<string, RouteInfo>();
      for (const mod of app.get(ModulesContainer).values()) {
        for (const wrapper of mod.controllers.values()) {
          const ctor = wrapper.metatype as any;
          if (!ctor) continue;
          const ctrlPaths: string[] = [].concat(Reflect.getMetadata(PATH_METADATA, ctor) ?? '');
          for (const name of Object.getOwnPropertyNames(ctor.prototype)) {
            const handler = ctor.prototype[name];
            if (name === 'constructor' || typeof handler !== 'function') continue;
            const methodPath = Reflect.getMetadata(PATH_METADATA, handler);
            const verb = Reflect.getMetadata(METHOD_METADATA, handler);
            if (methodPath === undefined || verb === undefined) continue;
            const isPublic = Reflect.getMetadata(IS_PUBLIC_KEY, handler) ?? Reflect.getMetadata(IS_PUBLIC_KEY, ctor) ?? false;
            const roles: string[] = Reflect.getMetadata(ROLES_KEY, handler) ?? Reflect.getMetadata(ROLES_KEY, ctor) ?? [];
            for (const cp of ctrlPaths) {
              for (const mp of [].concat(methodPath)) {
                const p = join('v1', cp, mp);
                let cls = 'AUTHENTICATED';
                if (p === '/v1/auth/google/callback') cls = 'PROVIDER_CALLBACK';
                else if (isPublic) cls = 'PUBLIC';
                else if (roles.length && !roles.includes('USER')) cls = 'ADMIN';
                else if (/^\/v1\/(trips\/:id(\/|$)|trip-invitations\/)/.test(p)) cls = 'TRIP_CAPABILITY';
                fromMetadata.set(`${METHOD_NAMES[verb]} ${p}`, { method: METHOD_NAMES[verb], path: p, oapiPath: p.replace(/:(\w+)/g, '{$1}'), cls, roles });
              }
            }
          }
        }
      }
      const expressRoutes = (app.getHttpAdapter().getInstance()._router.stack as any[])
        .filter((l) => l.route)
        .flatMap((l) => Object.keys(l.route.methods).map((m) => `${m} ${l.route.path}`));
      // The runtime router IS the source of truth: every registered route must have a controller handler.
      for (const key of expressRoutes) expect(fromMetadata.has(key) ? key : `UNEXPLAINED ${key}`).toBe(key);
      routes = expressRoutes.map((k) => fromMetadata.get(k)!).sort((a, b) => (a.path + a.method).localeCompare(b.path + b.method));
      document = SwaggerModule.createDocument(app, buildSwaggerConfig());
    });

    it('every runtime route has exactly one OpenAPI operation and vice versa (no undocumented route, no phantom operation)', () => {
      const runtime = new Set(routes.map((r) => `${r.method} ${r.oapiPath}`));
      const documented = new Set(Object.entries(document.paths).flatMap(([p, ops]: [string, any]) => Object.keys(ops).map((m) => `${m} ${p}`)));
      const undocumented = [...runtime].filter((k) => !documented.has(k));
      const phantom = [...documented].filter((k) => !runtime.has(k));
      expect({ undocumented, phantom }).toEqual({ undocumented: [], phantom: [] });
      expect(runtime.size).toBe(routes.length);
    });

    it('committed docs/backend/openapi.json is exactly what the running app generates (automated drift check)', () => {
      const committed = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../docs/backend/openapi.json'), 'utf8'));
      expect(committed).toEqual(JSON.parse(JSON.stringify(document)));
    });

    it('OpenAPI security declaration matches the real guard classification for every operation', () => {
      const mismatches: string[] = [];
      for (const r of routes) {
        const op = document.paths[r.oapiPath][r.method];
        const bearer = (op.security ?? []).some((s: any) => 'bearer' in s);
        const shouldBeBearer = !['PUBLIC', 'PROVIDER_CALLBACK'].includes(r.cls);
        if (bearer !== shouldBeBearer) mismatches.push(`${r.method.toUpperCase()} ${r.path} (${r.cls}) bearer=${bearer}`);
      }
      expect(mismatches).toEqual([]);
    });

    it('every route is classified; inventory matches the committed G12 route inventory', () => {
      const inventory = routes.map((r) => ({ method: r.method.toUpperCase(), path: r.path, class: r.cls, roles: r.roles }));
      const counts = inventory.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.class]: (acc[r.class] ?? 0) + 1 }), {});
      const file = path.resolve(__dirname, '../../../docs/backend/g12-evidence/route-inventory.json');
      if (process.env.G12_WRITE_ROUTE_INVENTORY === '1') fs.writeFileSync(file, JSON.stringify({ total: inventory.length, counts, routes: inventory }, null, 1) + '\n');
      const committed = JSON.parse(fs.readFileSync(file, 'utf8'));
      expect({ total: inventory.length, counts, routes: inventory }).toEqual(committed);
      expect(inventory.every((r) => ['PUBLIC', 'AUTHENTICATED', 'TRIP_CAPABILITY', 'ADMIN', 'INTERNAL', 'PROVIDER_CALLBACK'].includes(r.class))).toBe(true);
    });

    const fill = (p: string) => p.replace(/:capability/g, 'AFFILIATE_LINK').replace(/:locale/g, 'vi').replace(/:(\w+)/g, 'g12-nonexistent-id');

    it('anonymous request to every non-public route -> 401 (no accidentally public route)', async () => {
      const wrong: string[] = [];
      for (const r of routes.filter((x) => !['PUBLIC', 'PROVIDER_CALLBACK'].includes(x.cls))) {
        const res = await (http() as any)[r.method](fill(r.path)).send({});
        if (res.status !== 401) wrong.push(`${r.method.toUpperCase()} ${r.path} -> ${res.status}`);
      }
      expect(wrong).toEqual([]);
    });

    it('plain USER token on every role-gated (ADMIN-class) route -> 403', async () => {
      const wrong: string[] = [];
      for (const r of routes.filter((x) => x.cls === 'ADMIN')) {
        const res = await as((http() as any)[r.method](fill(r.path)), unrelated).send({});
        if (res.status !== 403) wrong.push(`${r.method.toUpperCase()} ${r.path} -> ${res.status}`);
      }
      expect(wrong).toEqual([]);
    });

    it('every public route with placeholder params/empty body -> never 5xx', async () => {
      const wrong: string[] = [];
      for (const r of routes.filter((x) => x.cls === 'PUBLIC' || x.cls === 'PROVIDER_CALLBACK')) {
        const res = await (http() as any)[r.method](fill(r.path)).send({});
        if (res.status >= 500) wrong.push(`${r.method.toUpperCase()} ${r.path} -> ${res.status} ${JSON.stringify(res.body?.error)}`);
      }
      expect(wrong).toEqual([]);
    });
  });

  // =====================================================================================
  describe('2. IDOR - knowledge of an id is never authorization', () => {
    // Guards run before pipes, pipes before the handler's in-service trip authorization - so every
    // probe carries a VALID body: the answer then comes from authorization, never from validation.
    const t1Routes = (a: Actor): [string, string, Record<string, unknown>?][] => [
      ['get', `/v1/trips/${T1}`], ['patch', `/v1/trips/${T1}`, { expectedVersion: 0, title: 'x' }], ['post', `/v1/trips/${T1}/archive`, { expectedVersion: 0 }],
      ['get', `/v1/trips/${T1}/members`], ['patch', `/v1/trips/${T1}/members/${editorMemberId}`, { role: 'VIEWER', expectedVersion: 0 }],
      ['delete', `/v1/trips/${T1}/members/${viewerMemberId}`, { expectedVersion: 0 }], ['post', `/v1/trips/${T1}/leave`, { expectedVersion: 0 }],
      ['get', `/v1/trips/${T1}/invitations`], ['post', `/v1/trips/${T1}/invitations`, { email: `g12-x-${STAMP}@example.com`, role: 'VIEWER' }],
      ['delete', `/v1/trips/${T1}/invitations/${invitationId}`], ['get', `/v1/trips/${T1}/activity`],
      ['post', `/v1/trips/${T1}/transfer-ownership`, { newOwnerUserId: a.id, expectedVersion: 0 }], ['get', `/v1/trips/${T1}/locations`],
      ['put', `/v1/trips/${T1}/location`, locBody()], ['post', `/v1/trips/${T1}/location-sharing/start`, { durationMinutes: 30 }],
      ['post', `/v1/trips/${T1}/location-sharing/stop`, {}], ['get', `/v1/trips/${T1}/location-sharing/me`], ['get', `/v1/trips/${T1}/expenses`],
      ['post', `/v1/trips/${T1}/expenses`, expenseBody(a, [a])], ['get', `/v1/trips/${T1}/expenses/${expenseId}`],
      ['patch', `/v1/trips/${T1}/expenses/${expenseId}`, { ...expenseBody(a, [a]), expectedVersion: 0 }], ['delete', `/v1/trips/${T1}/expenses/${expenseId}`, { expectedVersion: 0 }],
      ['get', `/v1/trips/${T1}/expenses/summary`], ['get', `/v1/trips/${T1}/settlement-suggestions`], ['get', `/v1/trips/${T1}/settlements`],
      ['post', `/v1/trips/${T1}/settlements`, { fromUserId: a.id, toUserId: owner.id, amount: '1.00', currency: 'USD', settledAt: '2026-12-02' }],
      ['get', `/v1/trips/${T1}/estimates`], ['get', `/v1/trips/${T1}/estimates/latest`], ['post', `/v1/trips/${T1}/estimates`],
      ['put', `/v1/trips/${T1}/days/${dayId}/items`, { expectedVersion: 0, items: [] }], ['put', `/v1/trips/${T1}/destinations`, { expectedVersion: 0, destinations: [] }],
    ];

    it.each(['unrelated', 'pending', 'removed'])('%s user with known ids is denied on every T1 route (403, same code for all, never data)', async (who) => {
      const actor = { unrelated, pending, removed }[who as 'unrelated' | 'pending' | 'removed'];
      const wrong: string[] = [];
      const before = { trip: await prisma.trip.findUniqueOrThrow({ where: { id: T1 } }), members: await prisma.tripMember.count({ where: { tripId: T1 } }) };
      for (const [m, p, body] of t1Routes(actor)) {
        const res = await as((http() as any)[m](p), actor).send(body ?? {});
        const selfScopedLeave = p.endsWith('/leave') && ((res.status === 404 && res.body.error?.code === 'TRIP_MEMBER_NOT_FOUND') || (res.status === 409 && res.body.error?.code === 'TRIP_VERSION_CONFLICT'));
        const denied = res.status === 403 && res.body.error?.code === 'TRIP_PERMISSION_DENIED';
        if ((!denied && !selfScopedLeave) || JSON.stringify(res.body).includes(LAT_S) || JSON.stringify(res.body).includes(owner.email)) wrong.push(`${m} ${p} -> ${res.status} ${res.body.error?.code}`);
      }
      expect(wrong).toEqual([]);
      // no probe changed anything
      expect({ trip: await prisma.trip.findUniqueOrThrow({ where: { id: T1 } }), members: await prisma.tripMember.count({ where: { tripId: T1 } }) }).toEqual(before);
    });

    it('cross-trip sub-resource confusion: T2 owner addressing T1 sub-resources through T2 paths -> 404, T1 untouched', async () => {
      const before = await prisma.tripExpense.findUniqueOrThrow({ where: { id: expenseId } });
      await as(http().get(`/v1/trips/${T2}/expenses/${expenseId}`), unrelated).expect(404);
      await as(http().patch(`/v1/trips/${T2}/expenses/${expenseId}`), unrelated).send({ ...expenseBody(unrelated, [unrelated]), expectedVersion: before.version }).expect(404);
      await as(http().delete(`/v1/trips/${T2}/expenses/${expenseId}`), unrelated).send({ expectedVersion: before.version }).expect(404);
      await as(http().patch(`/v1/trips/${T2}/members/${editorMemberId}`), unrelated).send({ role: 'VIEWER', expectedVersion: await tripVersion(T2) }).expect(404);
      await as(http().delete(`/v1/trips/${T2}/members/${viewerMemberId}`), unrelated).send({ expectedVersion: await tripVersion(T2) }).expect(404);
      await as(http().delete(`/v1/trips/${T2}/invitations/${invitationId}`), unrelated).expect(404);
      await as(http().put(`/v1/trips/${T2}/days/${dayId}/items`), unrelated).send({ expectedVersion: await tripVersion(T2), items: [] }).expect(404);
      expect(await prisma.tripExpense.findUniqueOrThrow({ where: { id: expenseId } })).toEqual(before);
      expect((await prisma.tripMember.findUniqueOrThrow({ where: { id: editorMemberId } })).role).toBe('EDITOR');
      expect((await prisma.tripInvitation.findUniqueOrThrow({ where: { id: invitationId } })).status).toBe('PENDING');
    });

    it('a viewer cannot mutate (403) but can read; a trip participant has no admin/commercial authority', async () => {
      await as(http().post(`/v1/trips/${T1}/expenses`), viewer).send(expenseBody(viewer, [viewer])).expect(403);
      await as(http().get(`/v1/trips/${T1}/expenses/${expenseId}`), viewer).expect(200);
      for (const a of [owner, editor, viewer]) {
        await as(http().get('/v1/admin/affiliate/conversions'), a).expect(403);
        await as(http().get(`/v1/admin/providers/${createdProviderIds[0] ?? 'x'}`), a).expect(403);
        await as(http().get('/v1/admin/search/projection/status'), a).expect(403);
        await as(http().get('/v1/admin/audit'), a).expect(403);
      }
    });

    it('a click may reference a trip only for a current participant of that trip', async () => {
      const { code } = await setupProvider();
      await click(unrelated, { providerCode: code, providerOfferId: 'o1', surface: 'TRIP_STAY', tripId: T1 }).expect(403);
      await click(removed, { providerCode: code, providerOfferId: 'o1', surface: 'TRIP_STAY', tripId: T1 }).expect(403);
      await click(null, { providerCode: code, providerOfferId: 'o1', surface: 'TRIP_STAY', tripId: T1 }).expect(403);
      await click(viewer, { providerCode: code, providerOfferId: 'o1', surface: 'TRIP_STAY', tripId: T1 }).expect(201);
    });

    it('settlement / expense ids are not usable across trips even by an admin-role trip outsider', async () => {
      await as(http().get(`/v1/trips/${T1}/expenses/${expenseId}`), admin).expect(403);
      await as(http().get(`/v1/trips/${T1}/settlements`), admin).expect(403);
      expect(settlementId).toBeTruthy();
    });
  });

  // =====================================================================================
  describe('3. same-JWT next-request revocation (no stale authorization anywhere)', () => {
    it('role downgrade EDITOR -> VIEWER: the very next mutation with the same JWT is 403', async () => {
      const trip = await createTrip(owner);
      const m = await addMember(trip, editor.id, 'EDITOR');
      await as(http().post(`/v1/trips/${trip}/expenses`), editor).send(expenseBody(editor, [editor, owner])).expect(201);
      await as(http().patch(`/v1/trips/${trip}/members/${m}`), owner).send({ role: 'VIEWER', expectedVersion: await tripVersion(trip) }).expect(200);
      await as(http().post(`/v1/trips/${trip}/expenses`), editor).send(expenseBody(editor, [editor, owner])).expect(403);
      await as(http().put(`/v1/trips/${trip}/days/${(await prisma.tripDay.findFirstOrThrow({ where: { tripId: trip } })).id}/items`), editor).send({ expectedVersion: await tripVersion(trip), items: [] }).expect(403);
    });

    it('member removal: the removed member JWT (unchanged) is denied on read, location and expense', async () => {
      await as(http().get(`/v1/trips/${T1}`), removed).expect(403);
      await as(http().put(`/v1/trips/${T1}/location`), removed).send(locBody()).expect(403);
      await as(http().get(`/v1/trips/${T1}/expenses`), removed).expect(403);
      expect(await prisma.tripMemberLocation.count({ where: { tripId: T1, userId: removed.id } })).toBe(0);
    });

    it('trip archive: next location update / expense create with the same JWT is refused (409), history intact', async () => {
      const trip = await createTrip(owner);
      await addMember(trip, editor.id, 'EDITOR');
      await as(http().post(`/v1/trips/${trip}/location-sharing/start`), editor).send({ durationMinutes: 30 }).expect(201);
      await as(http().put(`/v1/trips/${trip}/location`), editor).send(locBody()).expect(200);
      const exp = await as(http().post(`/v1/trips/${trip}/expenses`), editor).send(expenseBody(editor, [editor, owner])).expect(201);
      await as(http().post(`/v1/trips/${trip}/archive`), owner).send({ expectedVersion: await tripVersion(trip) }).expect(201);
      const loc = await as(http().put(`/v1/trips/${trip}/location`), editor).send(locBody());
      expect([403, 409]).toContain(loc.status);
      expect((await as(http().post(`/v1/trips/${trip}/expenses`), editor).send(expenseBody(editor, [editor, owner]))).status).toBe(409);
      expect((await as(http().get(`/v1/trips/${trip}/locations`), owner).expect(200)).body.data).toEqual([]);
      await as(http().get(`/v1/trips/${trip}/expenses/${exp.body.data.id}`), editor).expect(200);
    });

    it('location stop: the owner next read no longer carries the coordinate', async () => {
      const trip = await createTrip(owner);
      await addMember(trip, editor.id, 'EDITOR');
      await as(http().post(`/v1/trips/${trip}/location-sharing/start`), editor).send({ durationMinutes: 30 }).expect(201);
      await as(http().put(`/v1/trips/${trip}/location`), editor).send(locBody()).expect(200);
      expect(JSON.stringify((await as(http().get(`/v1/trips/${trip}/locations`), owner).expect(200)).body)).toContain(LAT_S);
      await as(http().post(`/v1/trips/${trip}/location-sharing/stop`), editor).send({}).expect(201);
      expect(JSON.stringify((await as(http().get(`/v1/trips/${trip}/locations`), owner).expect(200)).body)).not.toContain(LAT_S);
      await as(http().put(`/v1/trips/${trip}/location`), editor).send(locBody()).expect((r) => expect(r.status).toBeGreaterThanOrEqual(400));
    });

    it('provider disable (G02) takes effect on the next request in BOTH G05 offers and G10 clicks, and restore works, no restart', async () => {
      const { code, providerId } = await setupProvider({ g05: true });
      const vn = await prisma.country.findFirstOrThrow({ where: { status: 'PUBLISHED' } });
      const acc = await prisma.accommodation.create({ data: { countryId: vn.id, type: 'HOTEL' as any, canonicalSlug: `g12-acc-${STAMP}`, status: 'PUBLISHED', translations: { create: [{ locale: 'vi', name: `G12 Hotel ${STAMP}`, slug: `g12-hotel-${STAMP}` }] } } });
      const ref = await prisma.providerAccommodationReference.create({ data: { providerId, accommodationId: acc.id, externalEntityId: `G12-STAY-${STAMP}`, status: 'ACTIVE', lastVerifiedAt: new Date() } });
      await prisma.accommodationOffer.create({ data: { providerReferenceId: ref.id, checkInDate: new Date('2027-01-10'), checkOutDate: new Date('2027-01-12'), guests: 2, rooms: 1, currency: 'USD', amount: 99, availability: 'AVAILABLE', fetchedAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000) } });
      const offers = () => http().get(`/v1/accommodations/${acc.canonicalSlug}/offers`).query({ checkIn: '2027-01-10', checkOut: '2027-01-12', guests: 2, rooms: 1, currency: 'USD' }).expect(200);
      const clickBody = { providerCode: code, providerOfferId: 'o1', surface: 'DESTINATION_STAY' };
      try {
        expect((await offers()).body.data.offers).toHaveLength(1);
        await click(null, clickBody).expect(201);
        await as(http().patch(`/v1/admin/providers/${providerId}/status`), admin).send({ status: 'SUSPENDED' }).expect(200);
        expect((await offers()).body.data.offers).toEqual([]);
        await click(null, clickBody).expect(403);
        await as(http().patch(`/v1/admin/providers/${providerId}/status`), admin).send({ status: 'ACTIVE' }).expect(200);
        expect((await offers()).body.data.offers).toHaveLength(1);
        await click(null, clickBody).expect(201);
      } finally {
        await prisma.accommodationOffer.deleteMany({ where: { providerReferenceId: ref.id } });
        await prisma.providerAccommodationReference.delete({ where: { id: ref.id } });
        await prisma.accommodationTranslation.deleteMany({ where: { accommodationId: acc.id } });
        await prisma.accommodation.delete({ where: { id: acc.id } });
      }
    });

    it('account suspension: the next request with the same JWT is 401', async () => {
      const victim = await mintActor('suspend');
      await as(http().get('/v1/users/me'), victim).expect(200);
      await as(http().patch(`/v1/admin/users/${victim.id}/status`), admin).send({ status: 'SUSPENDED' }).expect(200);
      await as(http().get('/v1/users/me'), victim).expect(401);
    });
  });

  // =====================================================================================
  describe('4. trust zones, ingestion, commercial and money separation', () => {
    it('an unaccepted IngestionCandidate never appears in search, map, facts or places', async () => {
      const src = await prisma.ingestionSource.findFirstOrThrow();
      const name = `G12 Unaccepted ${STAMP}`;
      await prisma.ingestionCandidate.create({ data: { sourceId: src.id, candidateType: 'PLACE', normalizationVersion: 1, normalizedData: { name, latitude: 10.1234567, longitude: 106.1234567 } } });
      await projection.drain();
      const s = await http().get('/v1/search').query({ q: name }).expect(200);
      expect(JSON.stringify(s.body.data.results)).not.toContain(name);
      const m = await http().get('/v1/map/features').query({ bbox: '106.0,10.0,106.3,10.3', zoom: 14 }).expect(200);
      expect(JSON.stringify(m.body)).not.toContain('10.1234567');
      const places = await http().get('/v1/places').query({ q: name });
      expect(JSON.stringify(places.body.data ?? null)).not.toContain(name);
      expect(JSON.stringify((await as(http().get('/v1/facts'), contributor)).body)).not.toContain(name);
    });

    it('provider data never enters public search (PROVIDER DATA != VERIFIED KNOWLEDGE)', async () => {
      const ref = await prisma.providerAccommodationReference.findFirst({ select: { externalEntityId: true } });
      if (ref) expect(JSON.stringify((await http().get('/v1/search').query({ q: ref.externalEntityId })).body.data.results)).not.toContain(ref.externalEntityId);
      const docKinds = await prisma.$queryRaw<{ k: string }[]>`SELECT DISTINCT "entityKind"::text AS k FROM "SearchDocument"`;
      expect(docKinds.map((d) => d.k).filter((k) => /ACCOMMODATION|RESTAURANT|ACTIVITY|OFFER|TRIP|INGESTION|AFFILIATE/.test(k))).toEqual([]);
    });

    it('click -> redirect -> conversion never creates a Booking or a TripExpense; commission never reaches the trip ledger', async () => {
      const { code } = await setupProvider();
      const summaryBefore = (await as(http().get(`/v1/trips/${T1}/expenses/summary`), owner).expect(200)).body.data;
      const expensesBefore = await prisma.tripExpense.count({ where: { tripId: T1 } });
      const c = await click(owner, { providerCode: code, providerOfferId: 'o1', surface: 'TRIP_STAY', tripId: T1 }).expect(201);
      await http().get(`/v1/affiliate/r/${c.body.data.redirectToken}`).expect(302);
      const campaignKey = (await prisma.affiliateClick.findUniqueOrThrow({ where: { id: c.body.data.clickId } })).campaignKey;
      expect(await prisma.affiliateConversion.count({ where: { provider: { code } } })).toBe(0);
      await ingest({ providerCode: code, evidenceType: 'FIXTURE', evidenceReference: `g12-${STAMP}`, evidence: evidence({ campaignKey, bookingAmount: '1234.56', commissionAmount: '98.76' }) }).expect(201);
      expect(await prisma.tripExpense.count({ where: { tripId: T1 } })).toBe(expensesBefore);
      const summaryAfter = (await as(http().get(`/v1/trips/${T1}/expenses/summary`), owner).expect(200)).body.data;
      expect(summaryAfter).toEqual(summaryBefore);
      expect(JSON.stringify(summaryAfter)).not.toMatch(/1234\.56|98\.76/);
    });

    it('planned cost (estimate) != actual expense != settlement: recording expenses/settlements never changes an estimate', async () => {
      const trip = await createTrip(owner);
      const e1 = await as(http().post(`/v1/trips/${trip}/estimates`), owner).send({});
      if (e1.status !== 201) return expect(e1.status).toBeLessThan(500); // estimate needs inputs this trip lacks - never a 5xx
      const latestBefore = (await as(http().get(`/v1/trips/${trip}/estimates/latest`), owner).expect(200)).body.data;
      await as(http().post(`/v1/trips/${trip}/expenses`), owner).send(expenseBody(owner, [owner], { amount: '777.77' })).expect(201);
      const latestAfter = (await as(http().get(`/v1/trips/${trip}/estimates/latest`), owner).expect(200)).body.data;
      expect(latestAfter).toEqual(latestBefore);
    });

    it('no implicit FX: two currencies stay two totals and two balance sets; suggestions never cross currencies', async () => {
      const trip = await createTrip(owner);
      await addMember(trip, editor.id, 'EDITOR');
      await as(http().post(`/v1/trips/${trip}/expenses`), owner).send(expenseBody(owner, [owner, editor], { amount: '100.00', currency: 'USD' })).expect(201);
      await as(http().post(`/v1/trips/${trip}/expenses`), editor).send(expenseBody(editor, [owner, editor], { amount: '200000', currency: 'VND' })).expect(201);
      const s = (await as(http().get(`/v1/trips/${trip}/expenses/summary`), owner).expect(200)).body.data;
      expect(s.totalsByCurrency.map((t: any) => `${t.currency}:${t.totalAmount}`).sort()).toEqual(['USD:100', 'VND:200000']);
      for (const b of s.balancesByCurrency) expect(b.balances.reduce((acc: Prisma.Decimal, x: any) => acc.plus(x.netAmount), new Prisma.Decimal(0)).isZero()).toBe(true);
      const sug = (await as(http().get(`/v1/trips/${trip}/settlement-suggestions`), owner).expect(200)).body.data.suggestionsByCurrency;
      expect(sug.map((x: any) => x.currency).sort()).toEqual(['USD', 'VND']);
    });

    it('negative shares are rejected by the API (G12 fix) and by the database (CHECK) even for a direct writer', async () => {
      const bad = await as(http().post(`/v1/trips/${T1}/expenses`), editor).send(expenseBody(editor, [], { splitMode: 'EXACT', amount: '100.00', shares: [{ userId: owner.id, amount: '150.00' }, { userId: editor.id, amount: '-50.00' }] }));
      expect([bad.status, bad.body.error.code]).toEqual([400, 'TRIP_EXPENSE_SPLIT_INVALID']);
      await expect(prisma.tripExpenseShare.update({ where: { expenseId_userId: { expenseId, userId: editor.id } }, data: { amount: -1 } })).rejects.toThrow();
      await expect(prisma.tripSettlement.update({ where: { id: settlementId }, data: { amount: 0 } })).rejects.toThrow();
      await expect(prisma.tripMemberLocation.updateMany({ where: { tripId: T1 }, data: { latitude: 91 } })).rejects.toThrow();
    });

    it('citation workflow audits with EntityKind.FACT (G12 enum fix) and stays atomic', async () => {
      const source = await as(http().post('/v1/sources'), contributor).send({ sourceType: 'BOOK', title: `G12 source ${STAMP}` }).expect(201);
      const fact = await prisma.historicalFact.findFirstOrThrow({ orderBy: { id: 'asc' } });
      const cit = await as(http().post('/v1/citations'), contributor).send({ factId: fact.id, sourceId: source.body.data.id }).expect(201);
      expect(await prisma.auditLog.count({ where: { entityType: 'FACT', action: 'citation.created', entityId: fact.id, metadata: { path: ['citationId'], equals: cit.body.data.id } } })).toBe(1);
      await prisma.citation.delete({ where: { id: cit.body.data.id } });
      await prisma.source.delete({ where: { id: source.body.data.id } });
    });
  });

  // =====================================================================================
  describe('5. G08 private coordinates never leak', () => {
    it('not in public search (by digits), map (tight bbox, every layer), trip activity, expense/affiliate responses or audit rows', async () => {
      await projection.drain();
      for (const q of [LAT_S, LNG_S, `${LAT_S},${LNG_S}`]) {
        const r = await http().get('/v1/search').query({ q });
        expect(JSON.stringify(r.body.data?.results ?? [])).not.toContain(LAT_S.slice(0, 7));
      }
      const bbox = `${LNG - 0.001},${LAT - 0.001},${LNG + 0.001},${LAT + 0.001}`;
      for (const kinds of [undefined, 'PLACE,EVENT,TERRITORY,COUNTRY,REGION,CITY,DESTINATION']) {
        const res = await http().get('/v1/map/features').query({ bbox, zoom: 16, ...(kinds ? { kinds } : {}) });
        expect(JSON.stringify(res.body)).not.toContain(LAT_S);
      }
      expect(JSON.stringify((await as(http().get(`/v1/trips/${T1}/activity`), owner).expect(200)).body)).not.toContain(LAT_S);
      expect(JSON.stringify((await as(http().get(`/v1/trips/${T1}/expenses`), owner).expect(200)).body)).not.toContain(LAT_S);
      expect(JSON.stringify((await as(http().get(`/v1/trips/${T1}/expenses/summary`), owner).expect(200)).body)).not.toContain(LAT_S);
      const audits = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "AuditLog" WHERE metadata::text LIKE ${'%' + LAT_S.slice(0, 7) + '%'} OR metadata::text LIKE ${'%' + LNG_S.slice(0, 8) + '%'}`;
      expect(Number(audits[0].n)).toBe(0);
      const events = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "TripCollaborationEvent" WHERE metadata::text LIKE ${'%' + LAT_S.slice(0, 7) + '%'}`;
      expect(Number(events[0].n)).toBe(0);
    });

    it('not echoed in validation / error responses', async () => {
      const res = await as(http().put(`/v1/trips/${T1}/location`), editor).send({ ...locBody(), latitude: 95.7769421 });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).not.toContain('7769421');
      const outsider = await as(http().put(`/v1/trips/${T1}/location`), unrelated).send(locBody());
      expect(outsider.status).toBe(403);
      expect(JSON.stringify(outsider.body)).not.toContain(LAT_S);
    });

    it('not in OpenAPI examples', () => {
      const doc = fs.readFileSync(path.resolve(__dirname, '../../../docs/backend/openapi.json'), 'utf8');
      expect(doc).not.toContain(LAT_S);
      expect(doc).not.toContain('7769421');
    });

    it('membership != location consent: a member who never started sharing has no coordinate, and a new member is not auto-shared', async () => {
      const locs = (await as(http().get(`/v1/trips/${T1}/locations`), owner).expect(200)).body.data as any[];
      const v = locs.find((l) => l.userId === viewer.id);
      expect(v?.latitude).toBeUndefined();
      expect(await prisma.tripLocationSharing.count({ where: { tripId: T1, userId: viewer.id } })).toBe(0);
    });
  });

  // =====================================================================================
  describe('6. real PostgreSQL races and lock-order stress', () => {
    const settle = (ps: Promise<request.Response>[]) => Promise.all(ps.map((p) => p.then((r) => r.status)));

    it('member removal vs expense create / location update (x5): no 5xx, removal is permanent, no orphan location', async () => {
      for (let i = 0; i < 5; i++) {
        const trip = await createTrip(owner);
        const m = await addMember(trip, editor.id, 'EDITOR');
        await as(http().post(`/v1/trips/${trip}/location-sharing/start`), editor).send({ durationMinutes: 30 }).expect(201);
        const statuses = await settle([
          as(http().delete(`/v1/trips/${trip}/members/${m}`), owner).send({ expectedVersion: await tripVersion(trip) }),
          as(http().post(`/v1/trips/${trip}/expenses`), editor).send(expenseBody(editor, [editor, owner])),
          as(http().put(`/v1/trips/${trip}/location`), editor).send(locBody()),
        ]);
        expect(statuses.filter((s) => s >= 500)).toEqual([]);
        expect(statuses[0]).toBe(200);
        expect(await prisma.tripMemberLocation.count({ where: { tripId: trip, userId: editor.id } })).toBe(0);
        expect((await prisma.tripLocationSharing.findFirst({ where: { tripId: trip, userId: editor.id } }))?.status).not.toBe('ACTIVE');
        await as(http().post(`/v1/trips/${trip}/expenses`), editor).send(expenseBody(editor, [editor, owner])).expect(403);
      }
    });

    it('archive vs location update / expense update (x5): no 5xx; after archive nothing mutates', async () => {
      for (let i = 0; i < 5; i++) {
        const trip = await createTrip(owner);
        await addMember(trip, editor.id, 'EDITOR');
        await as(http().post(`/v1/trips/${trip}/location-sharing/start`), editor).send({ durationMinutes: 30 }).expect(201);
        const exp = (await as(http().post(`/v1/trips/${trip}/expenses`), editor).send(expenseBody(editor, [editor, owner])).expect(201)).body.data;
        const statuses = await settle([
          as(http().post(`/v1/trips/${trip}/archive`), owner).send({ expectedVersion: await tripVersion(trip) }),
          as(http().put(`/v1/trips/${trip}/location`), editor).send(locBody()),
          as(http().patch(`/v1/trips/${trip}/expenses/${exp.id}`), editor).send({ ...expenseBody(editor, [editor, owner], { title: 'raced' }), expectedVersion: exp.version }),
        ]);
        expect(statuses.filter((s) => s >= 500)).toEqual([]);
        expect(statuses[0]).toBe(201);
        const snapshot = await prisma.tripExpense.findUniqueOrThrow({ where: { id: exp.id } });
        expect((await as(http().patch(`/v1/trips/${trip}/expenses/${exp.id}`), editor).send({ ...expenseBody(editor, [editor, owner], { title: 'after' }), expectedVersion: snapshot.version })).status).toBe(409);
        expect(await prisma.tripExpense.findUniqueOrThrow({ where: { id: exp.id } })).toEqual(snapshot);
      }
    });

    it('ownership transfer vs member removal of the new owner (x10): never both, exactly one owner, no 5xx, no deadlock', async () => {
      for (let i = 0; i < 10; i++) {
        const trip = await createTrip(owner);
        const m = await addMember(trip, editor.id, 'EDITOR');
        const v = await tripVersion(trip);
        const [transfer, remove] = await settle([
          as(http().post(`/v1/trips/${trip}/transfer-ownership`), owner).send({ newOwnerUserId: editor.id, expectedVersion: v }),
          as(http().delete(`/v1/trips/${trip}/members/${m}`), owner).send({ expectedVersion: v }),
        ]);
        expect([transfer, remove].filter((s) => s >= 500)).toEqual([]);
        expect([transfer < 300, remove < 300].filter(Boolean).length).toBeLessThanOrEqual(1);
        const t = await prisma.trip.findUniqueOrThrow({ where: { id: trip } });
        const ownerIsMember = await prisma.tripMember.count({ where: { tripId: trip, userId: t.ownerId } });
        expect(ownerIsMember).toBe(0);
      }
    });

    it('provider revoke vs affiliate redirect (x3): redirect is either 302 (before) or 403; afterwards always 403', async () => {
      for (let i = 0; i < 3; i++) {
        const { code, licenseId } = await setupProvider();
        const token = (await click(null, { providerCode: code, providerOfferId: 'o1', surface: 'DESTINATION_STAY' }).expect(201)).body.data.redirectToken;
        const [revoke, redirect] = await settle([
          as(http().patch(`/v1/admin/provider-licenses/${licenseId}/status`), admin).send({ status: 'REVOKED' }),
          http().get(`/v1/affiliate/r/${token}`),
        ]);
        expect(revoke).toBe(200);
        expect([302, 403]).toContain(redirect);
        expect((await http().get(`/v1/affiliate/r/${token}`)).status).toBe(403);
      }
    });

    it('duplicate concurrent conversion ingestion -> one row; out-of-order older evidence cannot override newer', async () => {
      const { code, providerId } = await setupProvider();
      const ev = evidence();
      const statuses = await settle([1, 2, 3].map((n) => ingest({ providerCode: code, evidenceType: 'FIXTURE', evidenceReference: `g12-dup-${n}-${STAMP}`, evidence: ev })));
      expect(statuses.filter((s) => s >= 500)).toEqual([]);
      expect(await prisma.affiliateConversion.count({ where: { providerId, providerConversionId: ev.conversionId } })).toBe(1);
      const newer = new Date(Date.now() + 60_000).toISOString();
      await ingest({ providerCode: code, evidenceType: 'FIXTURE', evidenceReference: `g12-new-${STAMP}`, evidence: { ...ev, status: 'cancelled', providerOccurredAt: newer } }).expect(201);
      const stale = await ingest({ providerCode: code, evidenceType: 'FIXTURE', evidenceReference: `g12-old-${STAMP}`, evidence: { ...ev, status: 'confirmed', providerOccurredAt: new Date(Date.now() - 60_000).toISOString() } });
      expect(stale.status).toBe(409);
      expect((await prisma.affiliateConversion.findFirstOrThrow({ where: { providerId, providerConversionId: ev.conversionId } })).status).toBe('CANCELLED');
    });

    it('search rebuild vs publish / unpublish: the projection converges to the publication state', async () => {
      const place = await prisma.place.create({ data: { canonicalSlug: `g12-race-${STAMP}`, type: 'HISTORICAL_SITE' as any, publicationStatus: 'DRAFT', translations: { create: [{ locale: 'vi', name: `G12 Race Place ${STAMP}`, slug: `g12-race-place-${STAMP}` }] } } });
      try {
        await Promise.all([projection.rebuildAll(), prisma.place.update({ where: { id: place.id }, data: { publicationStatus: 'PUBLISHED' } })]);
        await projection.drain();
        expect(await prisma.searchDocument.count({ where: { entityKind: 'PLACE', entityId: place.id } })).toBe(1);
        await Promise.all([projection.rebuildAll(), prisma.place.update({ where: { id: place.id }, data: { publicationStatus: 'DRAFT' } })]);
        await projection.drain();
        expect(await prisma.searchDocument.count({ where: { entityKind: 'PLACE', entityId: place.id } })).toBe(0);
      } finally {
        await prisma.placeTranslation.deleteMany({ where: { placeId: place.id } });
        await prisma.place.delete({ where: { id: place.id } });
        await projection.drain();
      }
    });

    it('lock-order stress over Trip/TripMember/TripLocationSharing/TripMemberLocation/TripExpense/TripExpenseShare/TripSettlement (x10 bursts): no deadlock surfaces, no 5xx, ledger consistent', async () => {
      const allStatuses: number[] = [];
      for (let i = 0; i < 10; i++) {
        const trip = await createTrip(owner);
        const mE = await addMember(trip, editor.id, 'EDITOR');
        const mV = await addMember(trip, viewer.id, 'VIEWER');
        for (const a of [editor, viewer]) await as(http().post(`/v1/trips/${trip}/location-sharing/start`), a).send({ durationMinutes: 30 }).expect(201);
        const exp = (await as(http().post(`/v1/trips/${trip}/expenses`), owner).send(expenseBody(owner, [owner, editor, viewer])).expect(201)).body.data;
        const v = await tripVersion(trip);
        const statuses = await settle([
          as(http().post(`/v1/trips/${trip}/expenses`), editor).send(expenseBody(editor, [owner, editor, viewer])),
          as(http().patch(`/v1/trips/${trip}/expenses/${exp.id}`), owner).send({ ...expenseBody(owner, [owner, editor, viewer], { amount: '301.00' }), expectedVersion: exp.version }),
          as(http().post(`/v1/trips/${trip}/settlements`), owner).send({ fromUserId: viewer.id, toUserId: owner.id, amount: '5.00', currency: 'USD', settledAt: '2026-12-02' }),
          as(http().put(`/v1/trips/${trip}/location`), editor).send(locBody()),
          as(http().put(`/v1/trips/${trip}/location`), viewer).send(locBody()),
          i % 2 === 0
            ? as(http().delete(`/v1/trips/${trip}/members/${mV}`), owner).send({ expectedVersion: v })
            : as(http().patch(`/v1/trips/${trip}/members/${mE}`), owner).send({ role: 'VIEWER', expectedVersion: v }),
          as(http().post(`/v1/trips/${trip}/location-sharing/stop`), editor).send({}),
        ]);
        allStatuses.push(...statuses);
        expect(statuses.filter((s) => s >= 500)).toEqual([]);
        const expenses = await prisma.tripExpense.findMany({ where: { tripId: trip, deletedAt: null }, include: { shares: true } });
        for (const e of expenses) expect(e.shares.reduce((acc, sh) => acc.plus(sh.amount), new Prisma.Decimal(0)).equals(e.amount)).toBe(true);
        if (i % 2 === 0) expect(await prisma.tripMemberLocation.count({ where: { tripId: trip, userId: viewer.id } })).toBe(0);
      }
      expect(allStatuses.filter((s) => s >= 500)).toEqual([]);
    });
  });

  // =====================================================================================
  describe('7. input abuse, error contract, 5xx privacy', () => {
    it('hostile inputs are 4xx, never 5xx', async () => {
      const wrong: string[] = [];
      const probe = async (label: string, r: request.Test) => {
        const res = await r;
        if (res.status >= 500 || res.status < 400) wrong.push(`${label} -> ${res.status}`);
      };
      const big = 'x'.repeat(200_000);
      let deep: any = {};
      for (let i = 0; i < 5000; i++) deep = { a: deep };
      await probe('oversized title', as(http().post('/v1/trips'), owner).send({ title: big, startDate: '2026-12-01', endDate: '2026-12-02', primaryCurrency: 'VND' }));
      await probe('body over 1mb', as(http().post('/v1/trips'), owner).send({ title: 'x'.repeat(1_200_000) }));
      await probe('deep JSON', as(http().post('/v1/trips'), owner).send(deep));
      await probe('malformed JSON', as(http().post('/v1/trips'), owner).set('Content-Type', 'application/json').send('{"title": "x",,}'));
      await probe('large share array', as(http().post(`/v1/trips/${T1}/expenses`), editor).send(expenseBody(editor, [], { shares: Array.from({ length: 5000 }, (_, i) => ({ userId: `u${i}` })) })));
      for (const amount of ['NaN', 'Infinity', '-Infinity', '1e5', '1.234', '99999999999.99', '', '0x10', '１００']) {
        await probe(`amount ${amount}`, as(http().post(`/v1/trips/${T1}/expenses`), editor).send(expenseBody(editor, [editor], { amount })));
      }
      for (const currency of ['usd1', 'US', '€€€', 'U$D', '']) await probe(`currency ${currency}`, as(http().post(`/v1/trips/${T1}/expenses`), editor).send(expenseBody(editor, [editor], { currency })));
      for (const d of ['2026-02-30', '2026-13-01', '26-12-01', 'yesterday']) {
        await probe(`occurredOn ${d}`, as(http().post(`/v1/trips/${T1}/expenses`), editor).send(expenseBody(editor, [editor], { occurredOn: d })));
        await probe(`trip startDate ${d}`, as(http().post('/v1/trips'), owner).send({ title: 't', startDate: d, endDate: '2026-12-02', primaryCurrency: 'VND' }));
      }
      for (const [lat, lng] of [[91, 0], [0, 181], ['NaN', 0], [1e308, 0], ['abc', 'def']] as any[]) {
        await probe(`location ${lat},${lng}`, as(http().put(`/v1/trips/${T1}/location`), editor).send({ latitude: lat, longitude: lng, accuracyMeters: 5, capturedAt: new Date().toISOString() }));
      }
      await probe('capturedAt garbage', as(http().put(`/v1/trips/${T1}/location`), editor).send({ ...locBody(), capturedAt: 'not-a-date' }));
      await probe('capturedAt far future', as(http().put(`/v1/trips/${T1}/location`), editor).send({ ...locBody(), capturedAt: '2099-01-01T00:00:00Z' }));
      for (const bbox of ['a,b,c,d', '0,0,0', '-200,0,10,10', '170,0,-170,10', 'NaN,NaN,NaN,NaN', '0,0,1e400,1']) await probe(`bbox ${bbox}`, http().get('/v1/map/features').query({ bbox, zoom: 6 }));
      await probe('search over 200 chars', http().get('/v1/search').query({ q: 'a'.repeat(201) }));
      await probe('search unknown param', http().get('/v1/search').query({ q: 'hue', includeUnpublished: 'true' }));
      await probe('invalid cursor', http().get('/v1/search').query({ q: 'hue', cursor: 'not-a-cursor' }));
      for (const id of ['..%2F..%2Fetc%2Fpasswd', "1' OR '1'='1", '%00', 'x'.repeat(5000)]) await probe(`trip id ${id.slice(0, 20)}`, as(http().get(`/v1/trips/${id}`), owner));
      expect(wrong).toEqual([]);
    });

    it('SQL-like, HTML/script and malformed Unicode text is stored/queried as inert data, never executed or 5xx', async () => {
      for (const q of ["'; DROP TABLE \"Trip\"; --", '<script>alert(1)</script>', '\u0000', '%%%', 'ĐÀ NẴNǴ']) {
        const res = await http().get('/v1/search').query({ q });
        expect(res.status).toBeLessThan(500);
      }
      // A lone surrogate / invalid UTF-8 cannot be URI-encoded by the client - send raw percent-encoding.
      for (const raw of ['%ED%A0%80', '%C3%28', '%FF%FE', '%E0%80%AF', '%']) {
        const res = await http().get(`/v1/search?q=${raw}`);
        expect(res.status).toBeLessThan(500);
      }
      const t = await as(http().post('/v1/trips'), owner).send({ title: '<img src=x onerror=alert(1)> \'; DROP TABLE "Trip"; --', startDate: '2026-12-01', endDate: '2026-12-01', primaryCurrency: 'VND' }).expect(201);
      createdTripIds.push(t.body.data.id);
      expect((await as(http().get(`/v1/trips/${t.body.data.id}`), owner).expect(200)).body.data.title).toContain('<img src=x');
      expect(await prisma.trip.count()).toBeGreaterThan(0);
      const surrogate = await as(http().post('/v1/trips'), owner).set('Content-Type', 'application/json').send(Buffer.from('{"title":"\\ud800","startDate":"2026-12-01","endDate":"2026-12-01","primaryCurrency":"VND"}'));
      expect(surrogate.status).toBeLessThan(500);
      if (surrogate.status === 201) createdTripIds.push(surrogate.body.data.id);
    });

    it('error envelope is uniform across 400/401/403/404/409/429 families', async () => {
      const shape = (r: request.Response) => ({ success: r.body.success, hasCode: typeof r.body.error?.code === 'string', hasMessage: typeof r.body.error?.message === 'string', requestId: typeof r.body.requestId === 'string' });
      const expected = { success: false, hasCode: true, hasMessage: true, requestId: true };
      expect(shape(await as(http().post('/v1/trips'), owner).send({}))).toEqual(expected); // 400
      expect(shape(await http().get(`/v1/trips/${T1}`))).toEqual(expected); // 401
      expect(shape(await as(http().get(`/v1/trips/${T1}`), unrelated))).toEqual(expected); // 403
      expect(shape(await as(http().get('/v1/trips/g12-does-not-exist'), owner))).toEqual(expected); // 404
      const exp = await prisma.tripExpense.findUniqueOrThrow({ where: { id: expenseId } });
      const conflict = await as(http().patch(`/v1/trips/${T1}/expenses/${expenseId}`), editor).send({ ...expenseBody(editor, [editor, owner, viewer]), expectedVersion: exp.version + 99 });
      expect(conflict.status).toBe(409);
      expect(shape(conflict)).toEqual(expected);
    });

    it('a forced unexpected 5xx exposes no stack, SQL, Prisma internals, path, DATABASE_URL, JWT or secret', async () => {
      const secret = 'postgresql://dauviet:SUPERSECRETPW@10.0.0.9:5432/prod';
      const spy = jest.spyOn(app.get(TripsService), 'list').mockRejectedValue(Object.assign(new Error(`connect failed ${secret} at /srv/app/dist/x.js SELECT * FROM "Trip" jwt=${owner.token}`), { code: 'ECONNREFUSED' }));
      try {
        const res = await as(http().get('/v1/trips'), owner);
        expect(res.status).toBe(500);
        expect(res.body.error).toEqual({ code: 'INTERNAL_ERROR', message: 'Unexpected server error' });
        const text = JSON.stringify(res.body) + JSON.stringify(res.headers);
        for (const needle of ['SUPERSECRETPW', 'postgresql://', '/srv/app', 'SELECT', owner.token, 'at Object', '.ts:', '.js:']) expect(text).not.toContain(needle);
      } finally {
        spy.mockRestore();
      }
    });

    it('a real Prisma error (FK violation) returns no SQL / table internals', async () => {
      const spy = jest.spyOn(app.get(TripsService), 'list').mockImplementation(() => prisma.tripMember.create({ data: { tripId: 'g12-missing-trip', userId: 'g12-missing-user', role: 'VIEWER' } }) as any);
      try {
        const res = await as(http().get('/v1/trips'), owner);
        expect(res.status).toBeLessThan(500);
        expect(JSON.stringify(res.body)).not.toMatch(/INSERT|SELECT|TripMember_tripId_fkey|public\./);
      } finally {
        spy.mockRestore();
      }
    });
  });

  // =====================================================================================
  describe('8. time semantics under the process timezone (run in UTC, Asia/Bangkok and America/New_York)', () => {
    it(`date-only fields round-trip exactly (TZ=${process.env.TZ ?? 'system'}) incl. a DST transition range`, async () => {
      const trip = await createTrip(owner, { startDate: '2026-03-08', endDate: '2026-03-09' });
      const t = (await as(http().get(`/v1/trips/${trip}`), owner).expect(200)).body.data;
      expect(String(t.startDate).slice(0, 10)).toBe('2026-03-08');
      expect(String(t.endDate).slice(0, 10)).toBe('2026-03-09');
      expect(await prisma.tripDay.count({ where: { tripId: trip } })).toBe(2);
      const e = await as(http().post(`/v1/trips/${trip}/expenses`), owner).send(expenseBody(owner, [owner], { occurredOn: '2026-12-31' })).expect(201);
      expect(String(e.body.data.occurredOn).slice(0, 10)).toBe('2026-12-31');
    });

    it('capturedAt with +07:00 / -04:00 offsets is stored as the same UTC instant; capturedAt != receivedAt', async () => {
      const trip = await createTrip(owner);
      await addMember(trip, editor.id, 'EDITOR');
      await as(http().post(`/v1/trips/${trip}/location-sharing/start`), editor).send({ durationMinutes: 30 }).expect(201);
      const instant = new Date(Math.floor((Date.now() - 20_000) / 1000) * 1000);
      const withOffset = (minutes: number) => {
        const local = new Date(instant.getTime() + minutes * 60_000).toISOString().slice(0, 19);
        const sign = minutes >= 0 ? '+' : '-';
        const abs = Math.abs(minutes);
        return `${local}${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
      };
      await as(http().put(`/v1/trips/${trip}/location`), editor).send(locBody(LAT, LNG, withOffset(7 * 60))).expect(200);
      let row = await prisma.tripMemberLocation.findFirstOrThrow({ where: { tripId: trip, userId: editor.id } });
      expect(row.capturedAt.toISOString()).toBe(instant.toISOString());
      expect(row.receivedAt.getTime()).toBeGreaterThanOrEqual(row.capturedAt.getTime());
      await prisma.tripMemberLocation.deleteMany({ where: { tripId: trip } });
      await as(http().put(`/v1/trips/${trip}/location`), editor).send(locBody(LAT, LNG, withOffset(-4 * 60))).expect(200);
      row = await prisma.tripMemberLocation.findFirstOrThrow({ where: { tripId: trip, userId: editor.id } });
      expect(row.capturedAt.toISOString()).toBe(instant.toISOString());
    });
  });

  // =====================================================================================
  describe('9. rate limiting (real HTTP): 429, window recovery, principal separation', () => {
    // A fresh app instance: its throttler storage is empty, so earlier traffic cannot interfere, and it
    // listens on a real port so two distinct SOURCE addresses can be used as principals (IPv4 vs IPv6
    // loopback - on Windows a connection to 127.0.0.x still originates from 127.0.0.1).
    let limitedApp: INestApplication;
    let v4: ReturnType<typeof request>;
    let v6: ReturnType<typeof request>;
    beforeAll(async () => {
      process.env.RATE_LIMIT_MAX = '5';
      process.env.RATE_LIMIT_TTL = '10';
      limitedApp = await bootstrapTestApp();
      await limitedApp.listen(0);
      const p = (limitedApp.getHttpServer().address() as { port: number }).port;
      v4 = request(`http://127.0.0.1:${p}`);
      v6 = request(`http://[::1]:${p}`);
      process.env.RATE_LIMIT_MAX = '100000';
      delete process.env.RATE_LIMIT_TTL;
    });
    afterAll(async () => {
      process.env.SEARCH_RATE_LIMIT_MAX = '100000';
      await limitedApp.close();
    });

    it('search: 429 after the limit for one client address, the other address is still served, other routes unaffected', async () => {
      process.env.SEARCH_RATE_LIMIT_MAX = '3';
      const statuses: number[] = [];
      for (let i = 0; i < 5; i++) statuses.push((await v4.get('/v1/search').query({ q: 'hue' })).status);
      expect(statuses).toEqual([200, 200, 200, 429, 429]);
      const limited = await v4.get('/v1/search').query({ q: 'hue' });
      expect([limited.status, limited.body.error.code]).toEqual([429, 'RATE_LIMITED']);
      expect((await v6.get('/v1/search').query({ q: 'hue' })).status).toBe(200);
      expect((await v4.get('/v1/health')).status).toBe(200); // throttling is per route and per address
      process.env.SEARCH_RATE_LIMIT_MAX = '100000';
    });

    it('auth-sensitive endpoint: login is throttled (10 / 60 s) independently of the global limit', async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 12; i++) statuses.push((await v6.post('/v1/auth/login').send({ email: `nobody-${STAMP}@example.com`, password: 'wrong-password-1' })).status);
      expect(statuses.slice(0, 10).every((st) => st === 401)).toBe(true);
      expect(statuses.slice(10)).toEqual([429, 429]);
    });

    it('map abuse: global limit (5 / 10 s) -> 429, then the window recovers', async () => {
      const statuses: number[] = [];
      const unexpected: string[] = [];
      for (let i = 0; i < 7; i++) {
        const r = await v4.get('/v1/map/features').query({ bbox: '102,8,110,24', zoom: 6 });
        statuses.push(r.status);
        if (![200, 429].includes(r.status)) unexpected.push(`${r.status} ${JSON.stringify(r.body.error)}`);
      }
      expect(unexpected).toEqual([]);
      expect(statuses).toEqual([200, 200, 200, 200, 200, 429, 429]);
      await new Promise((r) => setTimeout(r, 10_500));
      expect((await v4.get('/v1/map/features').query({ bbox: '102,8,110,24', zoom: 6 })).status).toBe(200);
    });
  });

  // =====================================================================================
  describe('10. log privacy (everything the app wrote to stdout/stderr during this suite)', () => {
    it('logs contain no JWT/refresh token, password, precise private coordinate or DB password', () => {
      const logs = logChunks.join('');
      expect(logs.length).toBeGreaterThan(0);
      for (const s of secretsSeen.filter(Boolean)) expect(logs.includes(s)).toBe(false);
      expect(logs).not.toContain(PASSWORD);
      expect(logs).not.toContain(LAT_S);
      expect(logs).not.toContain(LNG_S);
      expect(logs).not.toContain('SUPERSECRETPW');
      expect(logs).not.toMatch(/postgresql:\/\/[^:\s]+:(?!\*\*\*@)[^@\s]+@/);
      expect(logs).not.toContain('user-secret-id');
    });
  });
});
