import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Requires a reachable DATABASE_URL and REDIS_URL (see /.env.example - run
 * `pnpm infra:up && pnpm db:migrate` first). Not executed in the sandbox
 * this repo was bootstrapped in - see docs/backend/BACKEND_FREEZE_REPORT.md.
 */
describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/v1/health (GET) reports database and redis connectivity', () => {
    return request(app.getHttpServer())
      .get('/v1/health')
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('status');
        expect(res.body).toHaveProperty('checks.database');
        expect(res.body).toHaveProperty('checks.redis');
      });
  });
});
