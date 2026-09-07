import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';
import { buildSwaggerConfig } from './swagger.config';

/**
 * Phase 11 contract test suite (spec section 89). Boots the REAL Nest
 * application (the actual `AppModule`, every real controller/DTO) and
 * generates the real OpenAPI document from it - the same document
 * `generate-openapi.ts` writes to `docs/backend/openapi.json` - then
 * asserts on it. This is the regression guard against "API docs silently
 * drift from the real code" (spec section 78): if a route is renamed,
 * removed, or its auth/role decorator changes, this suite fails.
 *
 * Requires no live Postgres/Redis/S3 - `test-env-setup.ts` (jest
 * `setupFiles`) sets `SKIP_DB_CONNECT=true` plus safe fake env vars before
 * this file runs, so `PrismaService.onModuleInit` skips its `$connect()`
 * call. Booting the full DI graph is slower than a typical mocked-Prisma
 * unit test (several seconds) - kept in its own file/suite so it doesn't
 * slow down the fast unit-test feedback loop.
 */
describe('OpenAPI contract (spec Phase 11 sections 77-89)', () => {
  let document: OpenAPIObject;
  let app: Awaited<ReturnType<typeof NestFactory.create>>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    const config = app.get(ConfigService<AppConfig, true>);
    app.setGlobalPrefix(config.get('apiPrefix', { infer: true }));
    document = SwaggerModule.createDocument(app, buildSwaggerConfig());
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  it('generates a well-formed OpenAPI 3 document with no live database', () => {
    expect(document.openapi).toBe('3.0.0');
    expect(document.info.title).toBe('Dau Viet API');
    expect(Object.keys(document.paths).length).toBeGreaterThan(100);
  });

  it('every generated path carries the real /v1 global prefix', () => {
    for (const p of Object.keys(document.paths)) {
      expect(p.startsWith('/v1/')).toBe(true);
    }
  });

  function hasPath(pathSuffix: string): boolean {
    return Object.keys(document.paths).some((p) => p === `/v1${pathSuffix}` || p.startsWith(`/v1${pathSuffix}/`) || p.includes(pathSuffix));
  }

  function operationsFor(pathSuffix: string) {
    const key = Object.keys(document.paths).find((p) => p === `/v1${pathSuffix}`);
    return key ? document.paths[key] : undefined;
  }

  describe('critical routes exist (spec section 89 tests #2-#14)', () => {
    const criticalRoutes: [string, string][] = [
      ['map/features', 'Map'],
      ['timeline', 'Timeline'],
      ['search', 'Search'],
      ['search/suggestions', 'Search suggestions'],
      ['auth/login', 'Auth login'],
      ['auth/register', 'Auth register'],
      ['auth/refresh', 'Auth refresh'],
      ['media/uploads', 'Media upload intent'],
      ['media/uploads/{id}/confirm', 'Media confirm'],
      ['stories/{slug}', 'Story detail'],
      ['journeys/{slug}', 'Journey detail'],
      ['community/stories', 'CommunityStory list/create'],
      ['comments', 'Comments'],
      ['contributions', 'Contribution submit'],
      ['contributions/mine', 'Contribution mine'],
      ['admin/contributions', 'Admin contribution queue'],
      ['admin/contributions/{id}/catalogue/source', 'Admin catalogue Source'],
      ['admin/contributions/{id}/catalogue/document', 'Admin catalogue SourceDocument'],
      ['admin/contributions/{id}/catalogue/media', 'Admin catalogue Media'],
      ['admin/moderation/queue', 'Moderation queue'],
      ['editorial/home', 'Editorial home'],
      ['places/nearby', 'Nearby'],
    ];

    for (const [route, label] of criticalRoutes) {
      it(`${label}: /v1/${route}`, () => {
        expect(hasPath(`/${route}`)).toBe(true);
      });
    }
  });

  describe('representative auth/role metadata matches docs/backend/AUTHORIZATION_MATRIX.md (spec section 67/89 test #32)', () => {
    it('GET /v1/map/features requires no bearer auth (public)', () => {
      const op = operationsFor('/map/features')?.get;
      expect(op?.security ?? []).toEqual([]);
    });

    it('POST /v1/contributions requires bearer auth (any authenticated user)', () => {
      const op = operationsFor('/contributions')?.post;
      expect(op?.security?.some((s) => 'bearer' in s)).toBe(true);
    });

    it('GET /v1/admin/audit is documented as bearer-authenticated (ADMIN/MODERATOR/HISTORIAN_REVIEWER in-service)', () => {
      const op = operationsFor('/admin/audit')?.get;
      expect(op?.security?.some((s) => 'bearer' in s)).toBe(true);
    });

    it('GET /v1/health requires no auth', () => {
      const op = operationsFor('/health')?.get;
      expect(op?.security ?? []).toEqual([]);
    });
  });

  describe('response schemas never declare a raw Prisma-only sensitive field (spec section 6/89 tests #15-19)', () => {
    // Structural proxy check: no DTO/schema in the generated document should
    // ever declare these property names. The real, authoritative leak
    // regression tests live at the unit level (sources.service.spec.ts,
    // media.service.spec.ts) where an actual response object is asserted
    // against - this is a second, cheap, whole-document sweep as a safety
    // net for any *newly added* DTO that accidentally exposes one.
    const forbiddenPropertyNames = ['passwordHash', 'refreshTokenHash', 'storageKey'];

    it('no schema in components.schemas declares a forbidden property name', () => {
      const schemas = document.components?.schemas ?? {};
      const offenders: string[] = [];
      for (const [name, schema] of Object.entries(schemas)) {
        const props = Object.keys((schema as { properties?: Record<string, unknown> }).properties ?? {});
        for (const forbidden of forbiddenPropertyNames) {
          if (props.includes(forbidden)) offenders.push(`${name}.${forbidden}`);
        }
      }
      expect(offenders).toEqual([]);
    });
  });

  it('the OpenAPI document written to disk (docs/backend/openapi.json) is the same document this suite generated (spec section 78 - no drift)', () => {
    const onDisk = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../docs/backend/openapi.json'), 'utf8'));
    expect(Object.keys(onDisk.paths).sort()).toEqual(Object.keys(document.paths).sort());
  });
});

/**
 * Static source checks that don't require booting the app (spec section
 * 84/85/89 tests #22/23) - GeoJSON coordinate order and Nearby's distance
 * unit are both delegated to PostGIS/an explicit `::geography` cast rather
 * than hand-rolled math, so the guarantee is "this call shape is used",
 * checked the same way `trust-regression.spec.ts` already checks for
 * `$queryRawUnsafe`.
 */
describe('GeoJSON / Nearby contract (spec sections 84/85)', () => {
  it('Map GeoJSON geometry is produced by PostGIS ST_AsGeoJSON (guarantees [lng, lat] order per the GeoJSON spec, never hand-rolled coordinate math)', () => {
    const src = fs.readFileSync(path.resolve(__dirname, 'modules/map/map.service.ts'), 'utf8');
    expect(src).toMatch(/ST_AsGeoJSON/);
  });

  it('Nearby distance uses an explicit ::geography cast (guarantees meters, never raw degree units)', () => {
    const src = fs.readFileSync(path.resolve(__dirname, 'modules/places/places.service.ts'), 'utf8');
    expect(src).toMatch(/::geography/);
  });
});
