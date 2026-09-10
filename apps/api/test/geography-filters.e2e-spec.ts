import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { bootstrapTestApp } from './bootstrap-test-app';

/**
 * Post-G04 API consistency hardening - see
 * docs/backend/POST_G04_API_CONSISTENCY_HARDENING.md for the full root-cause
 * writeup. `RegionsController.list()`, `CitiesController.list()`, and
 * `CountriesController`'s `:slug/cities`/`:slug/destinations` sub-routes all
 * had the exact same two defects G04 already found and fixed once on
 * `GET /v1/destinations`:
 *
 *  1. a dual-`@Query()` binding collision (`@Query() query:
 *     OffsetPaginationQuery` + separate `@Query('country')`-style params)
 *     that made the global `ValidationPipe`'s `forbidNonWhitelisted` reject
 *     every filter these routes document with `VALIDATION_ERROR: "property
 *     X should not exist"`;
 *  2. even once bound, the raw query value was forwarded straight through
 *     as the internal `countryId`/`regionId`/`cityId`, so a real public
 *     slug silently matched zero rows.
 *
 * This suite exercises the real, already-seeded Golden Dataset (no new
 * fixtures created - Vietnam/Japan, `viet-nam`/`VN`/`VNM`,
 * `nhat-ban`/`JP`/`JPN`, region `ha-noi`/`tinh-kyoto`, city `ha-noi`/
 * `kyoto`) against the real compiled app + real Postgres.
 */
describe('Geography public filters (post-G04 API consistency hardening) - e2e', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await bootstrapTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (path: string) => request(app.getHttpServer()).get(path);

  describe('GET /v1/regions', () => {
    it('accepts the documented filter query string without VALIDATION_ERROR (whitelist-binding regression)', async () => {
      const res = await get('/v1/regions?country=viet-nam&parentRegion=nope&type=PROVINCE&page=1&pageSize=10');
      expect(res.status).not.toBe(400);
      expect(res.body.error?.code).not.toBe('VALIDATION_ERROR');
    });

    it('resolves a real country canonicalSlug', async () => {
      const res = await get('/v1/regions?country=viet-nam').expect(200);
      expect(res.body.data.items.map((r: any) => r.slug)).toEqual(expect.arrayContaining(['ha-noi', 'da-nang']));
    });

    it('resolves a real country ISO2 code identically to the canonicalSlug', async () => {
      const res = await get('/v1/regions?country=VN').expect(200);
      expect(res.body.data.items.map((r: any) => r.slug).sort()).toEqual(['da-nang', 'ha-noi']);
    });

    it('resolves a real country ISO3 code identically to the canonicalSlug', async () => {
      const res = await get('/v1/regions?country=VNM').expect(200);
      expect(res.body.data.items.map((r: any) => r.slug).sort()).toEqual(['da-nang', 'ha-noi']);
    });

    it('accepts the raw internal Country id as a backward-compatible fallback', async () => {
      const bySlug = await get('/v1/regions?country=viet-nam').expect(200);
      const countryId = (await get('/v1/countries/viet-nam').expect(200)).body.data.id;
      const byId = await get(`/v1/regions?country=${countryId}`).expect(200);
      expect(byId.body.data.items.map((r: any) => r.slug).sort()).toEqual(bySlug.body.data.items.map((r: any) => r.slug).sort());
    });

    it('an unresolvable country 404s - never silently broadens (returns everything) or empties (returns nothing without explanation)', async () => {
      const res = await get('/v1/regions?country=not-a-real-country').expect(404);
      expect(res.body.error.code).toBe('COUNTRY_NOT_FOUND');
    });

    it('an unresolvable parentRegion 404s', async () => {
      const res = await get('/v1/regions?parentRegion=not-a-real-region').expect(404);
      expect(res.body.error.code).toBe('REGION_NOT_FOUND');
    });
  });

  describe('GET /v1/cities', () => {
    it('accepts the documented filter query string without VALIDATION_ERROR', async () => {
      const res = await get('/v1/cities?country=viet-nam&region=ha-noi&page=1&pageSize=10');
      expect(res.body.error?.code).not.toBe('VALIDATION_ERROR');
    });

    it('resolves a real country canonicalSlug', async () => {
      const res = await get('/v1/cities?country=nhat-ban').expect(200);
      expect(res.body.data.items.map((c: any) => c.slug).sort()).toEqual(['kyoto', 'tokyo']);
    });

    it('resolves a real region canonicalSlug', async () => {
      const res = await get('/v1/cities?region=tinh-kyoto').expect(200);
      expect(res.body.data.items.map((c: any) => c.slug)).toEqual(['kyoto']);
    });

    it('combined country + region filters both apply (AND, not OR)', async () => {
      const res = await get('/v1/cities?country=viet-nam&region=ha-noi').expect(200);
      expect(res.body.data.items.map((c: any) => c.slug)).toEqual(['ha-noi']);
    });

    it('cross-scope safety: a real country paired with a real region from a DIFFERENT country returns empty, not an error and not a silent single-filter match', async () => {
      const res = await get('/v1/cities?country=viet-nam&region=tinh-kyoto').expect(200);
      expect(res.body.data.items).toEqual([]);
    });

    it('an unresolvable country 404s', async () => {
      const res = await get('/v1/cities?country=not-a-real-country').expect(404);
      expect(res.body.error.code).toBe('COUNTRY_NOT_FOUND');
    });

    it('an unresolvable region 404s', async () => {
      const res = await get('/v1/cities?region=not-a-real-region').expect(404);
      expect(res.body.error.code).toBe('REGION_NOT_FOUND');
    });
  });

  describe('GET /v1/countries/:slug/cities', () => {
    it('accepts the documented filter query string without VALIDATION_ERROR', async () => {
      const res = await get('/v1/countries/viet-nam/cities?region=ha-noi&page=1&pageSize=10');
      expect(res.body.error?.code).not.toBe('VALIDATION_ERROR');
    });

    it('resolves a real region canonicalSlug scoped to the path country', async () => {
      const res = await get('/v1/countries/viet-nam/cities?region=ha-noi').expect(200);
      expect(res.body.data.items.map((c: any) => c.slug)).toEqual(['ha-noi']);
    });

    it('an unresolvable region 404s', async () => {
      const res = await get('/v1/countries/viet-nam/cities?region=not-a-real-region').expect(404);
      expect(res.body.error.code).toBe('REGION_NOT_FOUND');
    });
  });

  describe('GET /v1/countries/:slug/destinations', () => {
    it('accepts the documented filter query string without VALIDATION_ERROR', async () => {
      const res = await get('/v1/countries/viet-nam/destinations?region=ha-noi&city=ha-noi&type=HISTORIC_DISTRICT&page=1&pageSize=10');
      expect(res.body.error?.code).not.toBe('VALIDATION_ERROR');
    });

    it('resolves real region + city canonicalSlugs scoped to the path country', async () => {
      const res = await get('/v1/countries/viet-nam/destinations?region=ha-noi&city=ha-noi').expect(200);
      expect(res.body.data.items.map((d: any) => d.slug)).toEqual(['pho-co-ha-noi']);
    });

    it('an unresolvable city 404s', async () => {
      const res = await get('/v1/countries/viet-nam/destinations?city=not-a-real-city').expect(404);
      expect(res.body.error.code).toBe('CITY_NOT_FOUND');
    });

    it('remains PUBLISHED-only - the fix touches filter resolution, not publication filtering', async () => {
      const res = await get('/v1/countries/viet-nam/destinations').expect(200);
      expect(res.body.data.items.every((d: any) => d.slug)).toBe(true);
      // every item returned must independently be reachable via the public detail route (proves it's really PUBLISHED, not just listed)
      for (const item of res.body.data.items) {
        await get(`/v1/destinations/${item.slug}`).expect(200);
      }
    });
  });

  describe('GET /v1/countries/:slug/regions', () => {
    it('accepts its own documented type filter without VALIDATION_ERROR (this route has no id/slug filter, only the whitelist-binding class of defect applied here)', async () => {
      const res = await get('/v1/countries/viet-nam/regions?type=METROPOLITAN_CITY&page=1&pageSize=10');
      expect(res.body.error?.code).not.toBe('VALIDATION_ERROR');
      expect(res.body.data.items.map((r: any) => r.slug).sort()).toEqual(['da-nang', 'ha-noi']);
    });
  });

  describe('G04 destination discovery filters remain correct (regression)', () => {
    it('country/theme filters on GET /v1/destinations are unaffected by this hardening pass', async () => {
      const res = await get('/v1/destinations?country=viet-nam&theme=heritage').expect(200);
      expect(res.body.data.total).toBeGreaterThan(0);
    });
  });
});
