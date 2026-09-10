import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { bootstrapTestApp } from './bootstrap-test-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/modules/audit/audit.service';

/**
 * G05 - Stay + Food + Activities live e2e coverage: RBAC, audit,
 * a real PostgreSQL rollback proof for the replace-style composition
 * mutation, provider-backed offer/snapshot serving gated live through the
 * real G02 `ProviderRegistryService`, offer freshness, license revocation
 * taking effect without a restart, required-attribution enforcement, and
 * provider-failure isolation (a gate failure degrades the provider-backed
 * section only - the canonical entity stays fully reachable). Every
 * provider-backed check here creates its OWN throwaway
 * `ExternalProvider`/`ProviderLicense` (never the seeded
 * `TEST_PROVIDER_G05_FIXTURE`, and never a real vendor) - same isolation
 * discipline as G02's own `provider-activation.e2e-spec.ts`.
 */
describe('Stay + Food + Activities (G05) - e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let audit: AuditService;

  // Fixed ISO codes cannot carry a per-run stamp (real ISO 3166-1 format is
  // enforced) - same lesson as destination-composition.e2e-spec.ts's own
  // cleanup fix (see docs/backend/G04_DESTINATION_DISCOVERY.md section 14-C).
  const FIXTURE_ISO2_CODES = ['ZG', 'ZH'];

  async function cleanupFixtureCountry() {
    const countries = await prisma.country.findMany({ where: { iso2: { in: FIXTURE_ISO2_CODES } }, select: { id: true } });
    const countryIds = countries.map((c) => c.id);
    if (!countryIds.length) return;
    const accommodations = await prisma.accommodation.findMany({ where: { countryId: { in: countryIds } }, select: { id: true } });
    const accommodationIds = accommodations.map((a) => a.id);
    await prisma.accommodationOffer.deleteMany({ where: { providerReference: { accommodationId: { in: accommodationIds } } } });
    await prisma.providerAccommodationReference.deleteMany({ where: { accommodationId: { in: accommodationIds } } });
    await prisma.destinationAccommodation.deleteMany({ where: { accommodationId: { in: accommodationIds } } });
    await prisma.accommodationTranslation.deleteMany({ where: { accommodationId: { in: accommodationIds } } });
    await prisma.accommodation.deleteMany({ where: { id: { in: accommodationIds } } });
    const destinations = await prisma.destination.findMany({ where: { countryId: { in: countryIds } }, select: { id: true } });
    const destinationIds = destinations.map((d) => d.id);
    await prisma.destinationTranslation.deleteMany({ where: { destinationId: { in: destinationIds } } });
    await prisma.destination.deleteMany({ where: { id: { in: destinationIds } } });
    await prisma.city.deleteMany({ where: { countryId: { in: countryIds } } });
    await prisma.region.deleteMany({ where: { countryId: { in: countryIds } } });
    await prisma.countryTranslation.deleteMany({ where: { countryId: { in: countryIds } } });
    await prisma.country.deleteMany({ where: { id: { in: countryIds } } });
  }

  beforeAll(async () => {
    app = await bootstrapTestApp();
    prisma = app.get(PrismaService);
    audit = app.get(AuditService);
    await cleanupFixtureCountry();
  });

  afterAll(async () => {
    await cleanupFixtureCountry();
    await app.close();
  });

  async function registerAndLogin(email: string, roles: string[]) {
    await request(app.getHttpServer()).post('/v1/auth/register').send({ email, password: 'E2eTest-Pass!1', displayName: email }).expect(201);
    await prisma.user.update({ where: { email }, data: { roles: roles as any } });
    const res = await request(app.getHttpServer()).post('/v1/auth/login').send({ email, password: 'E2eTest-Pass!1' }).expect(201);
    return res.body.data.accessToken as string;
  }

  it('RBAC + audit + real PostgreSQL rollback + publication safety for Accommodation.setDestinations', async () => {
    const stamp = Date.now();
    const editorToken = await registerAndLogin(`g05-editor-${stamp}@example.com`, ['EDITOR']);
    const userToken = await registerAndLogin(`g05-user-${stamp}@example.com`, ['USER']);

    const countryRes = await request(app.getHttpServer())
      .post('/v1/countries')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ iso2: 'ZG', iso3: 'ZGF', defaultLocale: 'vi', defaultCurrency: 'USD', translations: [{ locale: 'vi', name: `G05 QA Country ${stamp}` }] })
      .expect(201);
    const countryId = countryRes.body.data.id as string;
    await request(app.getHttpServer()).patch(`/v1/countries/${countryId}/status`).set('Authorization', `Bearer ${editorToken}`).send({ status: 'PUBLISHED' }).expect(200);

    const destRes = await request(app.getHttpServer())
      .post('/v1/destinations')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ countryId, type: 'CITY_AREA', translations: [{ locale: 'vi', name: `G05 QA Destination ${stamp}` }] })
      .expect(201);
    const destinationId = destRes.body.data.id as string;

    const accRes = await request(app.getHttpServer())
      .post('/v1/accommodations')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ countryId, type: 'HOTEL', translations: [{ locale: 'vi', name: `G05 QA Hotel ${stamp}` }] })
      .expect(201);
    const accommodationId = accRes.body.data.id as string;
    const accommodationSlug = accRes.body.data.canonicalSlug as string;
    expect(accRes.body.data.status).toBe('DRAFT');

    // Publication safety: a DRAFT accommodation must 404 publicly and never appear in the public list.
    await request(app.getHttpServer()).get(`/v1/accommodations/${accommodationSlug}`).expect(404);
    const draftList = await request(app.getHttpServer()).get('/v1/accommodations').query({ country: 'ZG' }).expect(200);
    expect(draftList.body.data.items).toEqual([]);

    // RBAC: plain USER forbidden from composition mutation.
    await request(app.getHttpServer())
      .patch(`/v1/accommodations/${accommodationId}/destinations`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ destinationIds: [destinationId] })
      .expect(403);

    const auditCountBefore = await prisma.auditLog.count({ where: { action: 'accommodation.destinations.set', entityId: accommodationId } });
    await request(app.getHttpServer())
      .patch(`/v1/accommodations/${accommodationId}/destinations`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ destinationIds: [destinationId] })
      .expect(200);
    const links = await prisma.destinationAccommodation.findMany({ where: { accommodationId } });
    expect(links).toHaveLength(1);
    const auditCountAfter = await prisma.auditLog.count({ where: { action: 'accommodation.destinations.set', entityId: accommodationId } });
    expect(auditCountAfter).toBe(auditCountBefore + 1);

    // Now publish and confirm it becomes publicly visible.
    await request(app.getHttpServer()).patch(`/v1/accommodations/${accommodationId}/status`).set('Authorization', `Bearer ${editorToken}`).send({ status: 'PUBLISHED' }).expect(200);
    await request(app.getHttpServer()).get(`/v1/accommodations/${accommodationSlug}`).expect(200);

    // Real PostgreSQL rollback probe, exact same transactional shape `AccommodationsService.setDestinations` uses.
    const actor = await prisma.user.findFirstOrThrow({ select: { id: true } });
    const linkCountBefore = await prisma.destinationAccommodation.count({ where: { accommodationId } });
    const rollbackAuditCountBefore = await prisma.auditLog.count({ where: { action: 'accommodation.destinations.set', entityId: accommodationId } });
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.destinationAccommodation.deleteMany({ where: { accommodationId } });
        await audit.log({ actorId: actor.id, action: 'accommodation.destinations.set', entityType: 'ACCOMMODATION', entityId: accommodationId, metadata: { count: 0 } }, tx);
        throw new Error('G05_QA_FORCED_ROLLBACK_PROBE');
      }),
    ).rejects.toThrow('G05_QA_FORCED_ROLLBACK_PROBE');
    const linkCountAfter = await prisma.destinationAccommodation.count({ where: { accommodationId } });
    expect(linkCountAfter).toBe(linkCountBefore); // delete was rolled back
    const rollbackAuditCountAfter = await prisma.auditLog.count({ where: { action: 'accommodation.destinations.set', entityId: accommodationId } });
    expect(rollbackAuditCountAfter).toBe(rollbackAuditCountBefore); // no orphaned success audit row
  }, 60000);

  it('provider-backed offers: idempotent ingestion, freshness, license revocation without restart, required attribution, and failure isolation', async () => {
    const stamp = Date.now();
    const adminToken = await registerAndLogin(`g05-provider-admin-${stamp}@example.com`, ['USER', 'ADMIN']);
    const editorToken = await registerAndLogin(`g05-provider-editor-${stamp}@example.com`, ['EDITOR']);
    const providerCode = `TEST_PROVIDER_G05_E2E_${stamp}`;

    // A minimal accommodation to attach the provider reference to.
    const countryRes = await request(app.getHttpServer())
      .post('/v1/countries')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ iso2: 'ZH', iso3: 'ZHF', defaultLocale: 'vi', defaultCurrency: 'USD', translations: [{ locale: 'vi', name: `G05 QA Country B ${stamp}` }] })
      .expect(201);
    const countryId = countryRes.body.data.id as string;
    await request(app.getHttpServer()).patch(`/v1/countries/${countryId}/status`).set('Authorization', `Bearer ${editorToken}`).send({ status: 'PUBLISHED' }).expect(200);
    const accRes = await request(app.getHttpServer())
      .post('/v1/accommodations')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ countryId, type: 'HOTEL', translations: [{ locale: 'vi', name: `G05 QA Offer Hotel ${stamp}` }] })
      .expect(201);
    const accommodationId = accRes.body.data.id as string;
    const accommodationSlug = accRes.body.data.canonicalSlug as string;
    await request(app.getHttpServer()).patch(`/v1/accommodations/${accommodationId}/status`).set('Authorization', `Bearer ${editorToken}`).send({ status: 'PUBLISHED' }).expect(200);

    // Provider not yet ACTIVE -> upsertProviderReference must fail closed (PROVIDER_NOT_ACTIVE / PROVIDER_NOT_FOUND).
    const beforeProviderExists = await request(app.getHttpServer())
      .post('/v1/accommodations/provider-references')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ providerCode, externalEntityId: 'E2E-STAY-1' })
      .expect(404);
    expect(beforeProviderExists.body.error.code).toBe('PROVIDER_NOT_FOUND');

    // Stand up the provider through the real G02 admin flow (mirrors provider-activation.e2e-spec.ts exactly).
    const providerRes = await request(app.getHttpServer())
      .post('/v1/admin/providers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: providerCode, name: 'G05 E2E Fixture Provider', credentialMode: 'NONE' })
      .expect(201);
    const providerId = providerRes.body.data.id as string;
    await request(app.getHttpServer()).patch(`/v1/admin/providers/${providerId}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'ACTIVE' }).expect(200);
    await request(app.getHttpServer()).post(`/v1/admin/providers/${providerId}/capabilities`).set('Authorization', `Bearer ${adminToken}`).send({ capability: 'ACCOMMODATION_SEARCH' }).expect(201);
    await request(app.getHttpServer()).post(`/v1/admin/providers/${providerId}/capabilities`).set('Authorization', `Bearer ${adminToken}`).send({ capability: 'LIVE_PRICE' }).expect(201);
    const integrationRes = await request(app.getHttpServer())
      .post(`/v1/admin/providers/${providerId}/integrations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ environment: 'SANDBOX' })
      .expect(201);
    const integrationId = integrationRes.body.data.id as string;
    await request(app.getHttpServer()).patch(`/v1/admin/provider-integrations/${integrationId}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'ACTIVE' }).expect(200);
    await request(app.getHttpServer()).post(`/v1/admin/provider-integrations/${integrationId}/capabilities/ACCOMMODATION_SEARCH/enable`).set('Authorization', `Bearer ${adminToken}`).expect(201);
    await request(app.getHttpServer()).post(`/v1/admin/provider-integrations/${integrationId}/capabilities/LIVE_PRICE/enable`).set('Authorization', `Bearer ${adminToken}`).expect(201);

    // Ingesting still fails before any license exists.
    const beforeLicense = await request(app.getHttpServer())
      .post('/v1/accommodations/provider-references')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ providerCode, externalEntityId: 'E2E-STAY-1' })
      .expect(404);
    expect(beforeLicense.body.error.code).toBe('PROVIDER_LICENSE_NOT_FOUND');

    const licenseRes = await request(app.getHttpServer())
      .post(`/v1/admin/providers/${providerId}/licenses`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ datasetOrProduct: 'G05 e2e fixture data', capability: null, termsUrl: 'https://example.test/g05-e2e-terms' })
      .expect(201);
    const licenseId = licenseRes.body.data.id as string;
    await request(app.getHttpServer())
      .patch(`/v1/admin/provider-licenses/${licenseId}/rights`)
      .set('Authorization', `Bearer ${adminToken}`)
      // rightsStore ALLOWED here because `upsertProviderReference` gates on
      // `usage: 'store'` (it persists a ProviderAccommodationReference row) -
      // a PROHIBITED store right correctly fails at PROVIDER_USAGE_NOT_ALLOWED
      // before the gate ever reaches the attribution check below, which is
      // exactly the fail-closed precedence this test elsewhere expects.
      .send({ rightsDisplay: 'ALLOWED', rightsCache: 'ALLOWED', rightsStore: 'ALLOWED', rightsModify: 'PROHIBITED', rightsRedistribute: 'PROHIBITED', rightsCommercialUse: 'ALLOWED', attributionRequirement: 'REQUIRED' })
      .expect(200);
    await request(app.getHttpServer()).patch(`/v1/admin/provider-licenses/${licenseId}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'APPROVED' }).expect(200);

    // Attribution required but not yet configured -> ingestion still fails closed.
    const beforeAttribution = await request(app.getHttpServer())
      .post('/v1/accommodations/provider-references')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ providerCode, externalEntityId: 'E2E-STAY-1' })
      .expect(404);
    expect(beforeAttribution.body.error.code).toBe('PROVIDER_ATTRIBUTION_REQUIRED');

    await request(app.getHttpServer())
      .post(`/v1/admin/providers/${providerId}/attribution-rules`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ licenseId, requirement: 'REQUIRED', displayText: 'Data (c) G05 E2E Fixture Provider' })
      .expect(201);

    // Now ingestion succeeds - and is idempotent (same providerId+externalEntityId upserts, never duplicates).
    const ref1 = await request(app.getHttpServer())
      .post('/v1/accommodations/provider-references')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ providerCode, externalEntityId: 'E2E-STAY-1', externalUrl: 'https://example.test/listing/1' })
      .expect(201);
    const referenceId = ref1.body.data.id as string;
    const ref2 = await request(app.getHttpServer())
      .post('/v1/accommodations/provider-references')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ providerCode, externalEntityId: 'E2E-STAY-1', externalUrl: 'https://example.test/listing/1-updated' })
      .expect(201);
    expect(ref2.body.data.id).toBe(referenceId); // same row, not a duplicate
    const referenceCount = await prisma.providerAccommodationReference.count({ where: { providerId, externalEntityId: 'E2E-STAY-1' } });
    expect(referenceCount).toBe(1);

    await request(app.getHttpServer())
      .patch(`/v1/accommodations/provider-references/${referenceId}/map`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ accommodationId })
      .expect(200);

    // Seed one fresh and one expired offer directly (this is what a real adapter's ingestion job would persist).
    await prisma.accommodationOffer.create({
      data: { providerReferenceId: referenceId, checkInDate: new Date('2027-01-10'), checkOutDate: new Date('2027-01-12'), guests: 2, rooms: 1, currency: 'USD', amount: 200, availability: 'AVAILABLE', fetchedAt: new Date(), expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
    });
    await prisma.accommodationOffer.create({
      data: { providerReferenceId: referenceId, checkInDate: new Date('2027-01-10'), checkOutDate: new Date('2027-01-12'), guests: 2, rooms: 1, currency: 'USD', amount: 150, availability: 'AVAILABLE', fetchedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), expiresAt: new Date(Date.now() - 60 * 60 * 1000) },
    });

    const freshRes = await request(app.getHttpServer()).get(`/v1/accommodations/${accommodationSlug}/offers`).query({ checkIn: '2027-01-10', checkOut: '2027-01-12', guests: 2, rooms: 1, currency: 'USD' }).expect(200);
    expect(freshRes.body.data.offers).toHaveLength(1); // only the fresh offer, the expired one is never presented as current
    expect(freshRes.body.data.offers[0].amount).toBe('200');
    expect(freshRes.body.data.offers[0].attribution.displayText).toBe('Data (c) G05 E2E Fixture Provider');

    // Failure isolation: the canonical accommodation detail route must remain fully reachable while only the provider-backed offer layer is affected below.
    await request(app.getHttpServer()).get(`/v1/accommodations/${accommodationSlug}`).expect(200);

    // License revocation takes effect immediately, without an app restart, nothing cached.
    await request(app.getHttpServer()).patch(`/v1/admin/provider-licenses/${licenseId}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'REVOKED' }).expect(200);
    const afterRevokeRes = await request(app.getHttpServer()).get(`/v1/accommodations/${accommodationSlug}/offers`).query({ checkIn: '2027-01-10', checkOut: '2027-01-12', guests: 2, rooms: 1, currency: 'USD' }).expect(200);
    expect(afterRevokeRes.body.data.offers).toEqual([]); // fails closed to an empty offer list, not a 500 - failure isolation (spec section 59/93)
    // The canonical entity itself is still perfectly reachable - only the provider-backed layer degraded.
    await request(app.getHttpServer()).get(`/v1/accommodations/${accommodationSlug}`).expect(200);
  }, 90000);
});
