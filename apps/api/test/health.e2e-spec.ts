import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { bootstrapTestApp } from './bootstrap-test-app';

/**
 * Requires a reachable DATABASE_URL and REDIS_URL (see /.env.example - run
 * `pnpm infra:up && pnpm db:migrate` first). First actually executed in
 * Phase 12.1 - see docs/backend/LIVE_QA_REPORT.md's "Phase 12.1" section.
 * Bootstraps through the shared `bootstrapTestApp()` helper (not a hand-rolled
 * subset) so this test runs with the real global guards/filters/interceptor,
 * not a stripped-down unguarded app - see that helper's own comment for why
 * that distinction matters (a real, previously-undetected gap found this
 * phase).
 */
describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await bootstrapTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/v1/health (GET) reports database and redis connectivity', () => {
    return request(app.getHttpServer())
      .get('/v1/health')
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('data.status');
        expect(res.body).toHaveProperty('data.checks.database');
        expect(res.body).toHaveProperty('data.checks.redis');
      });
  });
});
