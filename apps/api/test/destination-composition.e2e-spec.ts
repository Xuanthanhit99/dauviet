import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { bootstrapTestApp } from './bootstrap-test-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/modules/audit/audit.service';

/**
 * G04 - Destination Discovery live e2e coverage: RBAC on a composition
 * mutation, audit persistence, and (mirroring the G03/Phase 12.1
 * `contribution-catalogue.e2e-spec.ts` precedent exactly) a real PostgreSQL
 * rollback/atomicity proof for the "replace style" transactional pattern
 * every `Destination.set*` mutation uses (delete existing links, recreate
 * the supplied set, write the audit row - all inside one `$transaction`,
 * with `AuditService.log` given the in-flight `tx` client).
 */
describe('Destination composition (G04) - e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let audit: AuditService;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    prisma = app.get(PrismaService);
    audit = app.get(AuditService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerAndLogin(email: string, roles: string[]) {
    await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email, password: 'E2eTest-Pass!1', displayName: email })
      .expect(201);
    await prisma.user.update({ where: { email }, data: { roles: roles as any } });
    const res = await request(app.getHttpServer()).post('/v1/auth/login').send({ email, password: 'E2eTest-Pass!1' }).expect(201);
    return res.body.data.accessToken as string;
  }

  it('RBAC: a plain USER is forbidden from setting Destination places; EDITOR succeeds and creates a real audit row', async () => {
    const stamp = Date.now();
    const editorToken = await registerAndLogin(`g04-editor-${stamp}@example.com`, ['EDITOR']);
    const userToken = await registerAndLogin(`g04-user-${stamp}@example.com`, ['USER']);

    const countryRes = await request(app.getHttpServer())
      .post('/v1/countries')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ iso2: 'ZZ', iso3: 'ZZZ', defaultLocale: 'vi', defaultCurrency: 'USD', translations: [{ locale: 'vi', name: `QA Country ${stamp}` }] })
      .expect(201);
    const countryId = countryRes.body.data.id as string;

    const placeRes = await request(app.getHttpServer())
      .post('/v1/places')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ type: 'LANDMARK', translations: [{ locale: 'vi', name: `QA Place ${stamp}` }] })
      .expect(201);
    const placeId = placeRes.body.data.id as string;

    const destRes = await request(app.getHttpServer())
      .post('/v1/destinations')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ countryId, type: 'CITY_AREA', translations: [{ locale: 'vi', name: `QA Destination ${stamp}` }] })
      .expect(201);
    const destinationId = destRes.body.data.id as string;

    await request(app.getHttpServer())
      .patch(`/v1/destinations/${destinationId}/places`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ places: [{ placeId, role: 'CORE' }] })
      .expect(403);

    const auditCountBefore = await prisma.auditLog.count({ where: { action: 'destination.places.set', entityId: destinationId } });

    await request(app.getHttpServer())
      .patch(`/v1/destinations/${destinationId}/places`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ places: [{ placeId, role: 'CORE', isFeatured: true }] })
      .expect(200);

    const links = await prisma.destinationPlace.findMany({ where: { destinationId } });
    expect(links).toHaveLength(1);
    expect(links[0].placeId).toBe(placeId);
    expect(links[0].isFeatured).toBe(true);

    const auditCountAfter = await prisma.auditLog.count({ where: { action: 'destination.places.set', entityId: destinationId } });
    expect(auditCountAfter).toBe(auditCountBefore + 1);

    // Cross-country rejection (spec section 15/45): a Place whose current
    // country is explicitly a DIFFERENT real country must be refused.
    await prisma.place.update({ where: { id: placeId }, data: { currentCountryId: null } });
    const otherCountryRes = await request(app.getHttpServer())
      .post('/v1/countries')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ iso2: 'YY', iso3: 'YYY', defaultLocale: 'vi', defaultCurrency: 'USD', translations: [{ locale: 'vi', name: `QA Other Country ${stamp}` }] })
      .expect(201);
    await prisma.place.update({ where: { id: placeId }, data: { currentCountryId: otherCountryRes.body.data.id } });

    const mismatchRes = await request(app.getHttpServer())
      .patch(`/v1/destinations/${destinationId}/places`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ places: [{ placeId }] })
      .expect(400);
    expect(mismatchRes.body.error.code).toBe('DESTINATION_PLACE_COUNTRY_MISMATCH');
  });

  it('regression: GET /v1/destinations accepts its own documented filter query string (country/region/city/type/theme) without VALIDATION_ERROR', async () => {
    // Real defect found live in this phase: binding BOTH a whole-object
    // `@Query() query: OffsetPaginationQuery` and separate individual
    // `@Query('country')`-style params over the same query string made the
    // whole-object binding's `forbidNonWhitelisted` reject every filter
    // this endpoint documents. Fixed via one combined ListDestinationsQueryDto.
    const res = await request(app.getHttpServer())
      .get('/v1/destinations')
      .query({ country: 'anything', region: 'anything', city: 'anything', type: 'CITY_AREA', theme: 'anything', page: 1, pageSize: 10 })
      .expect(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.items)).toBe(true);
  });

  it('real PostgreSQL rollback/atomicity proof: a forced failure mid-transaction leaves no partial DestinationPlace row and no success audit row', async () => {
    const stamp = Date.now();
    const editorToken = await registerAndLogin(`g04-rollback-editor-${stamp}@example.com`, ['EDITOR']);

    const countryRes = await request(app.getHttpServer())
      .post('/v1/countries')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ iso2: 'XX', iso3: 'XXX', defaultLocale: 'vi', defaultCurrency: 'USD', translations: [{ locale: 'vi', name: `QA Rollback Country ${stamp}` }] })
      .expect(201);
    const placeRes = await request(app.getHttpServer())
      .post('/v1/places')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ type: 'LANDMARK', translations: [{ locale: 'vi', name: `QA Rollback Place ${stamp}` }] })
      .expect(201);
    const destRes = await request(app.getHttpServer())
      .post('/v1/destinations')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ countryId: countryRes.body.data.id, type: 'CITY_AREA', translations: [{ locale: 'vi', name: `QA Rollback Destination ${stamp}` }] })
      .expect(201);
    const destinationId = destRes.body.data.id as string;
    const placeId = placeRes.body.data.id as string;

    const rollbackActor = await prisma.user.findFirstOrThrow({ select: { id: true } });
    const placeLinkCountBefore = await prisma.destinationPlace.count();
    const auditCountBefore = await prisma.auditLog.count({ where: { action: 'destination.places.set' } });

    await expect(
      prisma.$transaction(async (tx) => {
        // Exercises the exact tx-threading contract DestinationsService.
        // setPlaces relies on: delete-then-create the relation, then write
        // the audit row through the SAME `tx` client, all inside one
        // transaction.
        await tx.destinationPlace.deleteMany({ where: { destinationId } });
        await tx.destinationPlace.create({ data: { destinationId, placeId, role: 'CORE' } });
        await audit.log({ actorId: rollbackActor.id, action: 'destination.places.set', entityType: 'DESTINATION', entityId: destinationId, metadata: { count: 1 } }, tx);
        throw new Error('QA_FORCED_ROLLBACK_PROBE');
      }),
    ).rejects.toThrow('QA_FORCED_ROLLBACK_PROBE');

    const placeLinkCountAfter = await prisma.destinationPlace.count();
    expect(placeLinkCountAfter).toBe(placeLinkCountBefore); // the insert was rolled back, not left as a partial/orphan row
    const leaked = await prisma.destinationPlace.findFirst({ where: { destinationId, placeId } });
    expect(leaked).toBeNull();

    const auditCountAfter = await prisma.auditLog.count({ where: { action: 'destination.places.set' } });
    expect(auditCountAfter).toBe(auditCountBefore); // no success audit row survived the rollback
  });
});
