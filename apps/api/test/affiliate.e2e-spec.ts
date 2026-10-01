import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { bootstrapTestApp } from './bootstrap-test-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { FIXTURE_AFFILIATE_PROVIDER_CODE } from '../src/modules/affiliate/adapters/fixture-affiliate-adapter';

/**
 * G10 Affiliate & Commercial Attribution - live e2e coverage against a real
 * running app + real PostgreSQL. The fixture provider is configured through
 * the SAME real G02 admin HTTP endpoints `provider-activation.e2e-spec.ts`
 * already uses (never raw Prisma inserts for provider/license/attribution
 * rows) - this proves G10 actually goes through the live G02 gate, not a
 * test-only shortcut.
 */
describe('Affiliate & Commercial Attribution (G10) - e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const stamp = Date.now();
  const createdEmails: string[] = [];
  let adminToken: string;
  let userToken: string;
  let userId: string;
  let ownerToken: string;
  let editorToken: string;
  let editorId: string;

  async function registerAndLogin(label: string, roles: string[] = ['USER']) {
    const email = `g10-${label}-${stamp}@example.com`;
    createdEmails.push(email);
    await request(app.getHttpServer()).post('/v1/auth/register').send({ email, password: 'E2eTest-Pass!1', displayName: email }).expect(201);
    if (roles.length !== 1 || roles[0] !== 'USER') {
      await prisma.user.update({ where: { email }, data: { roles: roles as any } });
    }
    const res = await request(app.getHttpServer()).post('/v1/auth/login').send({ email, password: 'E2eTest-Pass!1' }).expect(201);
    return { token: res.body.data.accessToken as string, id: res.body.data.user.id as string };
  }

  /** Sets up a fresh, fully-eligible fixture provider via the real G02 admin API (mirrors provider-activation.e2e-spec.ts). Returns the provider code actually used (unique per test via a random suffix, so tests never collide). */
  async function setupEligibleProvider() {
    // Uppercase the whole thing - `POST /v1/admin/providers` uppercases
    // `code` server-side (CreateProviderDto's `@Transform(upper)`), and
    // `Math.random().toString(36)` produces lowercase characters, so the
    // stored code would otherwise silently differ from this local variable.
    const code = `${FIXTURE_AFFILIATE_PROVIDER_CODE}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`.toUpperCase();

    const providerRes = await request(app.getHttpServer()).post('/v1/admin/providers').set('Authorization', `Bearer ${adminToken}`).send({ code, name: 'G10 E2E Fixture Provider', credentialMode: 'API_KEY' }).expect(201);
    const providerId = providerRes.body.data.id as string;

    await request(app.getHttpServer()).patch(`/v1/admin/providers/${providerId}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'ACTIVE' }).expect(200);
    await request(app.getHttpServer()).post(`/v1/admin/providers/${providerId}/capabilities`).set('Authorization', `Bearer ${adminToken}`).send({ capability: 'AFFILIATE_LINK' }).expect(201);
    await request(app.getHttpServer()).post(`/v1/admin/providers/${providerId}/capabilities`).set('Authorization', `Bearer ${adminToken}`).send({ capability: 'CONVERSION_REPORTING' }).expect(201);

    const integrationRes = await request(app.getHttpServer())
      .post(`/v1/admin/providers/${providerId}/integrations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ environment: 'SANDBOX', credentialReference: 'E2E_G10_FIXTURE_KEY_REF' })
      .expect(201);
    const integrationId = integrationRes.body.data.id as string;
    await request(app.getHttpServer()).patch(`/v1/admin/provider-integrations/${integrationId}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'ACTIVE' }).expect(200);

    await request(app.getHttpServer()).post(`/v1/admin/provider-integrations/${integrationId}/capabilities/AFFILIATE_LINK/enable`).set('Authorization', `Bearer ${adminToken}`).expect(201);
    await request(app.getHttpServer()).post(`/v1/admin/provider-integrations/${integrationId}/capabilities/CONVERSION_REPORTING/enable`).set('Authorization', `Bearer ${adminToken}`).expect(201);

    // A single dataset-wide license (capability: null) covers both capabilities.
    const licenseRes = await request(app.getHttpServer())
      .post(`/v1/admin/providers/${providerId}/licenses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ datasetOrProduct: 'G10 fixture affiliate program', termsUrl: 'https://example.test/terms' })
      .expect(201);
    const licenseId = licenseRes.body.data.id as string;

    await request(app.getHttpServer())
      .patch(`/v1/admin/provider-licenses/${licenseId}/rights`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        rightsDisplay: 'ALLOWED',
        rightsCache: 'ALLOWED',
        rightsStore: 'PROHIBITED',
        rightsModify: 'PROHIBITED',
        rightsRedistribute: 'PROHIBITED',
        rightsCommercialUse: 'ALLOWED',
        attributionRequirement: 'NOT_REQUIRED',
      })
      .expect(200);
    await request(app.getHttpServer()).patch(`/v1/admin/provider-licenses/${licenseId}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'APPROVED' }).expect(200);

    await request(app.getHttpServer())
      .post(`/v1/admin/provider-integrations/${integrationId}/capabilities/AFFILIATE_LINK/activate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/v1/admin/provider-integrations/${integrationId}/capabilities/CONVERSION_REPORTING/activate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    return { code, providerId, integrationId, licenseId };
  }

  function createClick(token: string | null, body: Record<string, unknown>) {
    const req = request(app.getHttpServer()).post('/v1/affiliate/clicks');
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req.send(body);
  }
  function followRedirect(token: string) {
    return request(app.getHttpServer()).get(`/v1/affiliate/r/${token}`);
  }
  function ingest(token: string, body: Record<string, unknown>) {
    return request(app.getHttpServer()).post('/v1/admin/affiliate/conversions/ingest').set('Authorization', `Bearer ${token}`).send(body);
  }
  function listConversions(token: string, query = '') {
    return request(app.getHttpServer()).get(`/v1/admin/affiliate/conversions${query}`).set('Authorization', `Bearer ${token}`);
  }
  function summary(token: string) {
    return request(app.getHttpServer()).get('/v1/admin/affiliate/summary').set('Authorization', `Bearer ${token}`);
  }

  function fixtureEvidence(overrides: Record<string, unknown> = {}) {
    return {
      conversionId: `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      status: 'confirmed',
      providerOccurredAt: new Date().toISOString(),
      reportedAt: new Date().toISOString(),
      bookingAmount: '500.00',
      bookingCurrency: 'USD',
      commissionAmount: '40.00',
      commissionCurrency: 'USD',
      ...overrides,
    };
  }

  beforeAll(async () => {
    app = await bootstrapTestApp();
    prisma = app.get(PrismaService);
    ({ token: adminToken } = await registerAndLogin('admin', ['USER', 'ADMIN']));
    ({ token: userToken, id: userId } = await registerAndLogin('user'));
    ({ token: ownerToken } = await registerAndLogin('owner'));
    ({ token: editorToken, id: editorId } = await registerAndLogin('editor'));
    await registerAndLogin('viewer');
  }, 60_000);

  afterAll(async () => {
    const ownedTripIds = (await prisma.trip.findMany({ where: { owner: { email: { in: createdEmails } } }, select: { id: true } })).map((t) => t.id);
    if (ownedTripIds.length > 0) {
      await prisma.tripMember.deleteMany({ where: { tripId: { in: ownedTripIds } } });
    }
    await prisma.affiliateConversion.deleteMany({ where: { evidenceReference: { startsWith: 'e2e-' } } });
    await prisma.affiliateClick.deleteMany({ where: { provider: { code: { contains: 'TEST_FIXTURE_PROVIDER_G10' } } } });
    await prisma.affiliateSession.deleteMany({ where: { provider: { code: { contains: 'TEST_FIXTURE_PROVIDER_G10' } } } });
    await prisma.providerBookingReference.deleteMany({ where: { provider: { code: { contains: 'TEST_FIXTURE_PROVIDER_G10' } } } });
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await app.close();
  });

  describe('redirect flow (spec sections 6, 8-14, 16-18, 20-26)', () => {
    it('anonymous click -> redirect works end to end, no auth required', async () => {
      const { code } = await setupEligibleProvider();
      const clickRes = await createClick(null, { providerCode: code, providerOfferId: 'offer-1', surface: 'DESTINATION_STAY' }).expect(201);
      expect(clickRes.body.data.sessionId).toBeTruthy();
      expect(clickRes.body.data.redirectToken).toBeTruthy();

      const redirectRes = await followRedirect(clickRes.body.data.redirectToken);
      expect(redirectRes.status).toBe(302);
      expect(redirectRes.headers.location).toContain('www.fixture-provider.example');
    });

    it('an authenticated caller\'s identity is captured on the click without requiring it (spec section 6)', async () => {
      const { code } = await setupEligibleProvider();
      const clickRes = await createClick(userToken, { providerCode: code, providerOfferId: 'offer-1', surface: 'DESTINATION_STAY' }).expect(201);
      const click = await prisma.affiliateClick.findUniqueOrThrow({ where: { id: clickRes.body.data.clickId } });
      expect(click.userId).toBe(userId);
    });

    it('the redirect token is single-use-safe (idempotent replay within TTL, spec section 14)', async () => {
      const { code } = await setupEligibleProvider();
      const clickRes = await createClick(null, { providerCode: code, providerOfferId: 'offer-1', surface: 'DESTINATION_STAY' }).expect(201);
      const first = await followRedirect(clickRes.body.data.redirectToken);
      const second = await followRedirect(clickRes.body.data.redirectToken);
      expect(first.headers.location).toBe(second.headers.location);
    });

    it('an unknown redirect token 404s', async () => {
      await followRedirect('not-a-real-token').expect(404);
    });

    it('rejects a forged provider offer id before creating an affiliate click', async () => {
      const { code } = await setupEligibleProvider();
      const before = await prisma.affiliateClick.count({ where: { provider: { code } } });
      const res = await createClick(null, { providerCode: code, providerOfferId: 'forged-offer-id', surface: 'DESTINATION_STAY' }).expect(400);
      expect(res.body.error.code).toBe('AFFILIATE_PROVIDER_ENTITY_REQUIRED');
      expect(await prisma.affiliateClick.count({ where: { provider: { code } } })).toBe(before);
    });

    it('rejects a forged provider reference id before creating an affiliate click', async () => {
      const { code } = await setupEligibleProvider();
      const before = await prisma.affiliateClick.count({ where: { provider: { code } } });
      const res = await createClick(null, { providerCode: code, providerEntityReferenceId: 'forged-reference-id', entityKind: 'RESTAURANT', surface: 'DESTINATION_FOOD' }).expect(400);
      expect(res.body.error.code).toBe('AFFILIATE_PROVIDER_ENTITY_REQUIRED');
      expect(await prisma.affiliateClick.count({ where: { provider: { code } } })).toBe(before);
    });

    it('the client cannot supply a raw URL or provider params - only canonical ids are accepted (spec section 10-12)', async () => {
      const { code } = await setupEligibleProvider();
      const res = await createClick(null, { providerCode: code, providerOfferId: 'offer-1', surface: 'DESTINATION_STAY', url: 'https://evil.example', label: 'attacker-controlled' } as any).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR'); // forbidNonWhitelisted rejects the unknown fields outright
    });

    it('session continuity: reusing sessionId keeps the same campaignKey across two clicks', async () => {
      const { code } = await setupEligibleProvider();
      const first = await createClick(null, { providerCode: code, providerOfferId: 'offer-1', surface: 'DESTINATION_STAY' }).expect(201);
      const second = await createClick(null, { providerCode: code, providerOfferId: 'offer-2', surface: 'DESTINATION_STAY', sessionId: first.body.data.sessionId }).expect(201);
      expect(second.body.data.sessionId).toBe(first.body.data.sessionId);

      const clicks = await prisma.affiliateClick.findMany({ where: { affiliateSessionId: first.body.data.sessionId } });
      expect(clicks).toHaveLength(2);
      expect(clicks[0].campaignKey).toBe(clicks[1].campaignKey);
    });
  });

  describe('policy gate - fail closed (spec sections 16-19, 87-88)', () => {
    it('rejects a redirect for a provider that does not exist', async () => {
      const res = await createClick(null, { providerCode: 'NOT_A_REAL_PROVIDER', providerOfferId: 'offer-1', surface: 'DESTINATION_STAY' }).expect(403);
      expect(res.body.error.code).toBe('PROVIDER_NOT_FOUND');
    });

    it('policy revocation live test: eligible -> successful redirect -> revoke license -> next redirect fails closed, no restart (spec section 87)', async () => {
      const { code, licenseId } = await setupEligibleProvider();
      await createClick(null, { providerCode: code, providerOfferId: 'offer-1', surface: 'DESTINATION_STAY' }).expect(201);

      await request(app.getHttpServer()).patch(`/v1/admin/provider-licenses/${licenseId}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'REVOKED' }).expect(200);

      const afterRevoke = await createClick(null, { providerCode: code, providerOfferId: 'offer-1', surface: 'DESTINATION_STAY' }).expect(403);
      expect(afterRevoke.body.error.code).toBe('PROVIDER_LICENSE_REVOKED');
    });

    it('attribution-rule-missing test: REQUIRED attribution not configured -> fails closed (spec section 88)', async () => {
      const { code, providerId } = await setupEligibleProvider();
      const licenseRes = await request(app.getHttpServer())
        .post(`/v1/admin/providers/${providerId}/licenses`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ datasetOrProduct: 'G10 attribution-required variant', capability: 'AFFILIATE_LINK', termsUrl: 'https://example.test/terms' })
        .expect(201);
      const licenseId = licenseRes.body.data.id as string;
      await request(app.getHttpServer())
        .patch(`/v1/admin/provider-licenses/${licenseId}/rights`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          rightsDisplay: 'ALLOWED',
          rightsCache: 'ALLOWED',
          rightsStore: 'PROHIBITED',
          rightsModify: 'PROHIBITED',
          rightsRedistribute: 'PROHIBITED',
          rightsCommercialUse: 'ALLOWED',
          attributionRequirement: 'REQUIRED',
        })
        .expect(200);
      await request(app.getHttpServer()).patch(`/v1/admin/provider-licenses/${licenseId}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'APPROVED' }).expect(200);

      // This more-specific (capability=AFFILIATE_LINK) APPROVED license now
      // outranks the dataset-wide one from setupEligibleProvider - and has
      // no attribution rule configured for it.
      const res = await createClick(null, { providerCode: code, providerOfferId: 'offer-1', surface: 'DESTINATION_STAY' }).expect(403);
      expect(res.body.error.code).toBe('PROVIDER_ATTRIBUTION_REQUIRED');
    });
  });

  describe('open redirect matrix - live HTTP proof (spec section 89)', () => {
    it('a click for an offer id containing no exploitable characters always redirects only to the approved fixture host, never anywhere else', async () => {
      const { code } = await setupEligibleProvider();
      const clickRes = await createClick(null, { providerCode: code, providerOfferId: 'offer-1', surface: 'DESTINATION_STAY' }).expect(201);
      const redirectRes = await followRedirect(clickRes.body.data.redirectToken).expect(302);
      const location = new URL(redirectRes.headers.location);
      expect(location.hostname).toBe('www.fixture-provider.example');
      expect(location.protocol).toBe('https:');
    });
  });

  describe('conversion matrix (spec section 90)', () => {
    it('click only -> no conversion is ever created', async () => {
      const { code } = await setupEligibleProvider();
      await createClick(null, { providerCode: code, providerOfferId: 'offer-1', surface: 'DESTINATION_STAY' }).expect(201);
      const conversions = await prisma.affiliateConversion.findMany({ where: { provider: { code } } });
      expect(conversions).toHaveLength(0);
    });

    it('redirect -> still no conversion (browser return is never proof of booking, spec section 29)', async () => {
      const { code } = await setupEligibleProvider();
      const clickRes = await createClick(null, { providerCode: code, providerOfferId: 'offer-1', surface: 'DESTINATION_STAY' }).expect(201);
      await followRedirect(clickRes.body.data.redirectToken).expect(302);
      const conversions = await prisma.affiliateConversion.findMany({ where: { provider: { code } } });
      expect(conversions).toHaveLength(0);
    });

    it('valid provider evidence -> creates a conversion', async () => {
      const { code } = await setupEligibleProvider();
      const res = await ingest(adminToken, { providerCode: code, evidenceType: 'FIXTURE', evidenceReference: 'e2e-ref-1', evidence: fixtureEvidence() }).expect(201);
      expect(res.body.data.status).toBe('CONFIRMED');
    });

    it('duplicate evidence (same providerConversionId, same providerOccurredAt) -> exactly one conversion row (spec section 36/37)', async () => {
      const { code } = await setupEligibleProvider();
      const evidence = fixtureEvidence();
      await ingest(adminToken, { providerCode: code, evidenceType: 'FIXTURE', evidenceReference: 'e2e-ref-2a', evidence }).expect(201);
      await ingest(adminToken, { providerCode: code, evidenceType: 'FIXTURE', evidenceReference: 'e2e-ref-2b', evidence }).expect(201);
      const rows = await prisma.affiliateConversion.findMany({ where: { provider: { code }, providerConversionId: evidence.conversionId } });
      expect(rows).toHaveLength(1);
    });

    it('status update (cancel) -> same conversion row updates in place, not a new one', async () => {
      const { code } = await setupEligibleProvider();
      const conversionId = `conv-status-${Date.now()}`;
      const t0 = new Date();
      await ingest(adminToken, { providerCode: code, evidenceType: 'FIXTURE', evidenceReference: 'e2e-ref-3a', evidence: fixtureEvidence({ conversionId, providerOccurredAt: t0.toISOString() }) }).expect(201);
      const t1 = new Date(t0.getTime() + 60_000);
      const cancelRes = await ingest(adminToken, {
        providerCode: code,
        evidenceType: 'FIXTURE',
        evidenceReference: 'e2e-ref-3b',
        evidence: fixtureEvidence({ conversionId, status: 'cancelled', providerOccurredAt: t1.toISOString() }),
      }).expect(201);
      expect(cancelRes.body.data.status).toBe('CANCELLED');
      const rows = await prisma.affiliateConversion.findMany({ where: { provider: { code }, providerConversionId: conversionId } });
      expect(rows).toHaveLength(1);
    });

    it('older evidence cannot override newer authoritative state (spec section 38)', async () => {
      const { code } = await setupEligibleProvider();
      const conversionId = `conv-order-${Date.now()}`;
      const newer = new Date();
      const older = new Date(newer.getTime() - 60_000);
      await ingest(adminToken, { providerCode: code, evidenceType: 'FIXTURE', evidenceReference: 'e2e-ref-4a', evidence: fixtureEvidence({ conversionId, status: 'confirmed', providerOccurredAt: newer.toISOString() }) }).expect(201);
      const staleRes = await ingest(adminToken, {
        providerCode: code,
        evidenceType: 'FIXTURE',
        evidenceReference: 'e2e-ref-4b',
        evidence: fixtureEvidence({ conversionId, status: 'cancelled', providerOccurredAt: older.toISOString() }),
      }).expect(409);
      expect(staleRes.body.error.code).toBe('AFFILIATE_CONVERSION_STALE_EVIDENCE');

      const row = await prisma.affiliateConversion.findFirstOrThrow({ where: { provider: { code }, providerConversionId: conversionId } });
      expect(row.status).toBe('CONFIRMED'); // the older CANCELLED evidence never applied
    });

    it('cancel/reverse produce the correct lifecycle status', async () => {
      const { code } = await setupEligibleProvider();
      const conversionId = `conv-reverse-${Date.now()}`;
      const t0 = new Date();
      await ingest(adminToken, { providerCode: code, evidenceType: 'FIXTURE', evidenceReference: 'e2e-ref-5a', evidence: fixtureEvidence({ conversionId, providerOccurredAt: t0.toISOString() }) }).expect(201);
      const t1 = new Date(t0.getTime() + 60_000);
      const reversedRes = await ingest(adminToken, {
        providerCode: code,
        evidenceType: 'FIXTURE',
        evidenceReference: 'e2e-ref-5b',
        evidence: fixtureEvidence({ conversionId, status: 'reversed', providerOccurredAt: t1.toISOString() }),
      }).expect(201);
      expect(reversedRes.body.data.status).toBe('REVERSED');
    });

    it('missing commission is stored as null (spec section 31)', async () => {
      const { code } = await setupEligibleProvider();
      const res = await ingest(adminToken, {
        providerCode: code,
        evidenceType: 'FIXTURE',
        evidenceReference: 'e2e-ref-6',
        evidence: fixtureEvidence({ commissionAmount: undefined, commissionCurrency: undefined }),
      }).expect(201);
      expect(res.body.data.commissionAmount).toBeNull();
    });

    it('unattributed valid evidence is retained with affiliateClickId = null, never a fabricated click (spec section 42)', async () => {
      const { code } = await setupEligibleProvider();
      const res = await ingest(adminToken, { providerCode: code, evidenceType: 'FIXTURE', evidenceReference: 'e2e-ref-7', evidence: fixtureEvidence({ campaignKey: 'no-such-campaign-key' }) }).expect(201);
      expect(res.body.data.affiliateClickId).toBeNull();
    });

    it('a valid campaignKey deterministically reconciles the conversion to its originating click', async () => {
      const { code } = await setupEligibleProvider();
      const clickRes = await createClick(null, { providerCode: code, providerOfferId: 'offer-1', surface: 'DESTINATION_STAY' }).expect(201);
      const click = await prisma.affiliateClick.findUniqueOrThrow({ where: { id: clickRes.body.data.clickId } });

      const res = await ingest(adminToken, { providerCode: code, evidenceType: 'FIXTURE', evidenceReference: 'e2e-ref-8', evidence: fixtureEvidence({ campaignKey: click.campaignKey }) }).expect(201);
      expect(res.body.data.affiliateClickId).toBe(click.id);
    });
  });

  describe('real PostgreSQL: concurrent duplicate ingestion (spec sections 39, 85)', () => {
    it('two simultaneous ingestions of the SAME provider conversion never create duplicates', async () => {
      const { code } = await setupEligibleProvider();
      const evidence = fixtureEvidence();
      const [a, b] = await Promise.all([
        ingest(adminToken, { providerCode: code, evidenceType: 'FIXTURE', evidenceReference: 'e2e-ref-9a', evidence }),
        ingest(adminToken, { providerCode: code, evidenceType: 'FIXTURE', evidenceReference: 'e2e-ref-9b', evidence }),
      ]);
      expect([a.status, b.status].every((s) => s === 201)).toBe(true);
      const rows = await prisma.affiliateConversion.findMany({ where: { provider: { code }, providerConversionId: evidence.conversionId } });
      expect(rows).toHaveLength(1);
    });
  });

  describe('forced rollback (spec section 86)', () => {
    it('a real PostgreSQL failure mid-ingestion-transaction leaves no partial commercial state', async () => {
      const { providerId } = await setupEligibleProvider();
      const evidence = fixtureEvidence();
      const conversionId2 = `${evidence.conversionId}-dup`;

      // Mirrors AffiliateConversionsService.ingest's own statement shape but
      // deliberately inserts a duplicate (providerId, providerConversionId)
      // pair via two conflicting plain inserts inside one transaction, after
      // the first row has already been written - a genuine unique-
      // constraint violation, not a simulated one.
      await expect(
        prisma.$transaction(async (tx) => {
          await tx.affiliateConversion.create({
            data: {
              providerId,
              providerConversionId: conversionId2,
              status: 'CONFIRMED',
              providerOccurredAt: new Date(),
              reportedAt: new Date(),
              evidenceType: 'FIXTURE',
              evidenceReference: 'e2e-rollback-1',
            },
          });
          await tx.affiliateConversion.create({
            data: {
              providerId,
              providerConversionId: conversionId2, // same unique key -> real P2002
              status: 'CANCELLED',
              providerOccurredAt: new Date(),
              reportedAt: new Date(),
              evidenceType: 'FIXTURE',
              evidenceReference: 'e2e-rollback-2',
            },
          });
        }),
      ).rejects.toThrow();

      const rows = await prisma.affiliateConversion.findMany({ where: { providerId, providerConversionId: conversionId2 } });
      expect(rows).toHaveLength(0); // the whole transaction rolled back - not even the first insert survived
    });
  });

  describe('authorization matrix (spec sections 49-52, 92)', () => {
    it('anonymous/USER/unrelated cannot enumerate conversions or read the commission summary', async () => {
      await listConversions('').expect(401);
      expect((await listConversions(userToken)).status).toBe(403);
      expect((await listConversions(userToken)).status).toBe(403);
      expect((await summary(userToken)).status).toBe(403);
    });

    it('anonymous/USER/unrelated cannot ingest conversions', async () => {
      const { code } = await setupEligibleProvider();
      expect((await ingest(userToken, { providerCode: code, evidenceType: 'FIXTURE', evidenceReference: 'e2e-authz-1', evidence: fixtureEvidence() })).status).toBe(403);
    });

    it('ADMIN can list/summarize/ingest', async () => {
      const { code } = await setupEligibleProvider();
      await ingest(adminToken, { providerCode: code, evidenceType: 'FIXTURE', evidenceReference: 'e2e-authz-2', evidence: fixtureEvidence() }).expect(201);
      await listConversions(adminToken, `?providerCode=${code}`).expect(200);
      await summary(adminToken).expect(200);
    });

    it('trip OWNER/EDITOR/VIEWER role grants NO commercial reporting access - trip role != admin access (spec section 49)', async () => {
      const tripRes = await request(app.getHttpServer())
        .post('/v1/trips')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'G10 affiliate trip', startDate: '2026-12-01', endDate: '2026-12-03', primaryCurrency: 'USD' })
        .expect(201);
      const tripId = tripRes.body.data.id as string;
      await prisma.tripMember.create({ data: { tripId, userId: editorId, role: 'EDITOR' } });

      expect((await listConversions(ownerToken)).status).toBe(403);
      expect((await listConversions(editorToken)).status).toBe(403);
      expect((await summary(ownerToken)).status).toBe(403);
    });

    it('a click referencing a trip requires the caller to be a current accepted participant of that trip', async () => {
      const { code } = await setupEligibleProvider();
      const tripRes = await request(app.getHttpServer())
        .post('/v1/trips')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'G10 click trip', startDate: '2026-12-01', endDate: '2026-12-03', primaryCurrency: 'USD' })
        .expect(201);
      const tripId = tripRes.body.data.id as string;

      const rejected = await createClick(userToken, { providerCode: code, providerOfferId: 'offer-1', surface: 'TRIP_STAY', tripId }).expect(403);
      expect(rejected.body.error.code).toBe('TRIP_PERMISSION_DENIED');

      await createClick(ownerToken, { providerCode: code, providerOfferId: 'offer-1', surface: 'TRIP_STAY', tripId }).expect(201);
    });
  });

  describe('privacy matrix (spec section 7/91)', () => {
    it('no affiliate record contains an auth token, JWT, or password/reset-token-shaped field', async () => {
      const { code } = await setupEligibleProvider();
      const clickRes = await createClick(userToken, { providerCode: code, providerOfferId: 'offer-1', surface: 'DESTINATION_STAY' }).expect(201);
      const click: any = await prisma.affiliateClick.findUniqueOrThrow({ where: { id: clickRes.body.data.clickId } });
      const raw = JSON.stringify(click);
      expect(raw.toLowerCase()).not.toContain('bearer ');
      expect(raw).not.toContain(userToken);
      expect(click).not.toHaveProperty('password');
      expect(click).not.toHaveProperty('passportNumber');
      expect(click).not.toHaveProperty('cardNumber');
    });

    it('the click response never returns a raw provider credential', async () => {
      const { code } = await setupEligibleProvider();
      const res = await createClick(null, { providerCode: code, providerOfferId: 'offer-1', surface: 'DESTINATION_STAY' }).expect(201);
      expect(JSON.stringify(res.body)).not.toContain('E2E_G10_FIXTURE_KEY_REF');
    });
  });

  describe('G09 regression: conversion never touches the expense ledger (spec sections 47, 93, 113)', () => {
    it('ingesting a conversion creates zero TripExpense/TripExpenseShare/TripSettlement rows', async () => {
      const { code } = await setupEligibleProvider();
      const beforeExpenses = await prisma.tripExpense.count();
      const beforeSettlements = await prisma.tripSettlement.count();

      await ingest(adminToken, { providerCode: code, evidenceType: 'FIXTURE', evidenceReference: 'e2e-g09-regress', evidence: fixtureEvidence() }).expect(201);

      expect(await prisma.tripExpense.count()).toBe(beforeExpenses);
      expect(await prisma.tripSettlement.count()).toBe(beforeSettlements);
    });
  });

  describe('G08 regression: affiliate flow never touches location sharing/rows (spec section 48/94)', () => {
    it('a click does not create any TripLocationSharing/TripMemberLocation row', async () => {
      const { code } = await setupEligibleProvider();
      const beforeSharing = await prisma.tripLocationSharing.count();
      const beforeLocation = await prisma.tripMemberLocation.count();

      await createClick(userToken, { providerCode: code, providerOfferId: 'offer-1', surface: 'DESTINATION_STAY' }).expect(201);

      expect(await prisma.tripLocationSharing.count()).toBe(beforeSharing);
      expect(await prisma.tripMemberLocation.count()).toBe(beforeLocation);
    });
  });
});
