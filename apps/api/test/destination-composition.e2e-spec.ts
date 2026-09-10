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

  // Real ISO 3166-1 alpha-2/alpha-3 shape is enforced by CreateCountryDto
  // (`@Matches(/^[A-Z]{2}$/)` / `/^[A-Z]{3}$/`), so these fixture codes can't
  // carry a per-run `stamp` suffix the way every other fixture name in this
  // file does - they have to be fixed, reused values instead. Cleaning up
  // any previous run's rows for them up front is what makes this suite
  // actually re-runnable rather than 409 CONFLICT on iso2/iso3 uniqueness
  // the second time it's ever executed (the exact failure mode this live QA
  // caught: this file was, per `bootstrap-test-app.ts`'s own header comment,
  // never actually run before Phase 12.1, so this was never noticed).
  const FIXTURE_ISO2_CODES = ['ZZ', 'YY', 'XX', 'QF'];

  async function cleanupFixtureCountries() {
    const countries = await prisma.country.findMany({ where: { iso2: { in: FIXTURE_ISO2_CODES } }, select: { id: true } });
    const countryIds = countries.map((c) => c.id);
    if (countryIds.length === 0) return;
    const destinations = await prisma.destination.findMany({ where: { countryId: { in: countryIds } }, select: { id: true } });
    const destinationIds = destinations.map((d) => d.id);
    await prisma.destinationPlace.deleteMany({ where: { destinationId: { in: destinationIds } } });
    await prisma.destinationTheme.deleteMany({ where: { destinationId: { in: destinationIds } } });
    await prisma.destinationTranslation.deleteMany({ where: { destinationId: { in: destinationIds } } });
    await prisma.destination.deleteMany({ where: { id: { in: destinationIds } } });
    await prisma.place.updateMany({ where: { currentCountryId: { in: countryIds } }, data: { currentCountryId: null } });
    await prisma.cityTranslation.deleteMany({ where: { city: { countryId: { in: countryIds } } } });
    await prisma.city.deleteMany({ where: { countryId: { in: countryIds } } });
    await prisma.regionTranslation.deleteMany({ where: { region: { countryId: { in: countryIds } } } });
    await prisma.region.deleteMany({ where: { countryId: { in: countryIds } } });
    await prisma.countryTranslation.deleteMany({ where: { countryId: { in: countryIds } } });
    await prisma.country.deleteMany({ where: { id: { in: countryIds } } });
  }

  beforeAll(async () => {
    app = await bootstrapTestApp();
    prisma = app.get(PrismaService);
    audit = app.get(AuditService);
    await cleanupFixtureCountries();
  });

  afterAll(async () => {
    await cleanupFixtureCountries();
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
      .send({ type: 'MONUMENT', translations: [{ locale: 'vi', name: `QA Place ${stamp}` }] })
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
    // Real defect #1 found live in this phase: binding BOTH a whole-object
    // `@Query() query: OffsetPaginationQuery` and separate individual
    // `@Query('country')`-style params over the same query string made the
    // whole-object binding's `forbidNonWhitelisted` reject every filter
    // this endpoint documents. Fixed via one combined ListDestinationsQueryDto.
    // Any non-empty geography/theme value that fails to resolve now 404s
    // (defect #2 below), so this specific test exercises only the binding
    // itself with a value guaranteed not to trip whitelist validation.
    const res = await request(app.getHttpServer())
      .get('/v1/destinations')
      .query({ type: 'CITY_AREA', page: 1, pageSize: 10 })
      .expect(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.items)).toBe(true);
  });

  it('regression: GET /v1/destinations?country=&region=&city=&theme= resolve real public canonicalSlug/slug values, combine correctly, and reject an unresolvable slug with 404 instead of silently matching nothing', async () => {
    // Real defect #2 found live in this phase: the controller passed the raw
    // `?country=`/`?region=`/`?city=`/`?theme=` query string straight through
    // as `countryId`/`regionId`/`cityId`/`themeId` to the service - so every
    // documented filter silently returned an empty page for any real public
    // slug (only a raw internal cuid ever matched). Fixed by DestinationsService
    // .listPublic(), which resolves each filter's canonicalSlug/slug (with the
    // raw id still accepted as a compatibility fallback) before delegating to
    // the existing id-based list(), and 404s (never silently broadens/empties)
    // on a filter that does not resolve.
    const stamp = Date.now();
    const editorToken = await registerAndLogin(`g04-filter-editor-${stamp}@example.com`, ['EDITOR']);

    const publish = (kind: 'countries' | 'regions' | 'cities' | 'destinations', id: string) =>
      request(app.getHttpServer())
        .patch(`/v1/${kind}/${id}/status`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({ status: 'PUBLISHED' })
        .expect(200);

    const countryRes = await request(app.getHttpServer())
      .post('/v1/countries')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ iso2: 'QF', iso3: 'QFI', defaultLocale: 'vi', defaultCurrency: 'USD', translations: [{ locale: 'vi', name: `QA Filter Country ${stamp}` }] })
      .expect(201);
    const country = countryRes.body.data;
    const countrySlug = country.canonicalSlug as string;
    await publish('countries', country.id);

    const regionRes = await request(app.getHttpServer())
      .post('/v1/regions')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ countryId: country.id, type: 'PROVINCE', translations: [{ locale: 'vi', name: `QA Filter Region ${stamp}` }] })
      .expect(201);
    const region = regionRes.body.data;
    const regionSlug = region.canonicalSlug as string;
    await publish('regions', region.id);

    const cityRes = await request(app.getHttpServer())
      .post('/v1/cities')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ countryId: country.id, regionId: region.id, timezone: 'Asia/Ho_Chi_Minh', translations: [{ locale: 'vi', name: `QA Filter City ${stamp}` }] })
      .expect(201);
    const city = cityRes.body.data;
    const citySlug = city.canonicalSlug as string;
    await publish('cities', city.id);

    const themeRes = await request(app.getHttpServer())
      .post('/v1/themes')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ category: 'CULTURAL', translations: [{ locale: 'vi', name: `QA Filter Theme ${stamp}` }] })
      .expect(201);
    const theme = themeRes.body.data;

    const destRes = await request(app.getHttpServer())
      .post('/v1/destinations')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ countryId: country.id, regionId: region.id, cityId: city.id, type: 'CITY_AREA', translations: [{ locale: 'vi', name: `QA Filter Destination ${stamp}` }] })
      .expect(201);
    const destination = destRes.body.data;
    await publish('destinations', destination.id);
    await request(app.getHttpServer())
      .patch(`/v1/destinations/${destination.id}/themes`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ themeIds: [theme.id] })
      .expect(200);

    // Single-filter resolution, each by its real public slug.
    for (const query of [{ country: countrySlug }, { region: regionSlug }, { city: citySlug }, { theme: theme.slug }]) {
      const res = await request(app.getHttpServer()).get('/v1/destinations').query(query).expect(200);
      expect(res.body.data.items.map((d: any) => d.id)).toContain(destination.id);
    }

    // Combined filters narrow the SAME query, not just each independently.
    for (const query of [
      { country: countrySlug, theme: theme.slug },
      { country: countrySlug, city: citySlug },
      { region: regionSlug, theme: theme.slug },
    ]) {
      const res = await request(app.getHttpServer()).get('/v1/destinations').query(query).expect(200);
      expect(res.body.data.items.map((d: any) => d.id)).toContain(destination.id);
    }

    // Backward-compatible id fallback: the raw internal id still resolves.
    const byId = await request(app.getHttpServer()).get('/v1/destinations').query({ country: country.id }).expect(200);
    expect(byId.body.data.items.map((d: any) => d.id)).toContain(destination.id);

    // An unresolvable slug 404s - never a silent empty page or a broadened query.
    const badCountry = await request(app.getHttpServer()).get('/v1/destinations').query({ country: `not-a-real-country-${stamp}` }).expect(404);
    expect(badCountry.body.error.code).toBe('COUNTRY_NOT_FOUND');
    const badTheme = await request(app.getHttpServer()).get('/v1/destinations').query({ theme: `not-a-real-theme-${stamp}` }).expect(404);
    expect(badTheme.body.error.code).toBe('DESTINATION_THEME_NOT_FOUND');
    // A valid filter combined with an unresolvable one must still 404, not
    // silently fall back to matching only the valid filter.
    const mixedRes = await request(app.getHttpServer())
      .get('/v1/destinations')
      .query({ country: countrySlug, theme: `not-a-real-theme-${stamp}` })
      .expect(404);
    expect(mixedRes.body.error.code).toBe('DESTINATION_THEME_NOT_FOUND');
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
      .send({ type: 'MONUMENT', translations: [{ locale: 'vi', name: `QA Rollback Place ${stamp}` }] })
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
