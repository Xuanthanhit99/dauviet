import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { json, urlencoded } from 'express';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';

/**
 * Phase 12.1 finding: `main.ts`'s `bootstrap()` wires up `JwtAuthGuard`/
 * `RolesGuard`/`AllExceptionsFilter`/`ResponseInterceptor` imperatively via
 * `app.useGlobalGuards(...)`/`useGlobalFilters(...)`/`useGlobalInterceptors(...)`
 * - none of these are registered as `AppModule` providers (only `ThrottlerGuard`
 * is, via `APP_GUARD`). A `Test.createTestingModule({ imports: [AppModule] })`
 * e2e test that does not replicate this bootstrap therefore runs with
 * authentication/authorization/response-envelope/error-shaping entirely
 * disabled - every route becomes effectively public and unguarded, and
 * `res.body` is the raw controller return value rather than the real
 * `{ success, data }`/`{ success, error }` envelope. This was never caught
 * before because no `*.e2e-spec.ts` file in this repo had ever actually been
 * executed prior to Phase 12.1 (`.e2e-spec.ts` does not match the normal unit
 * `jest.config.js`'s `.spec.ts$` testRegex, and `pnpm test:e2e` requires live
 * infra that every prior phase's sandbox lacked). This helper is the fix:
 * every e2e spec should build its app through this function, not by hand, so
 * a real e2e test actually exercises the same security posture as
 * `node dist/main.js`.
 */
export async function bootstrapTestApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleFixture.createNestApplication();

  app.use(helmet());
  app.use(cookieParser());
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: true, limit: '1mb' }));
  app.enableCors({ origin: true, credentials: true });

  app.setGlobalPrefix('v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  const reflector = app.get(Reflector);
  app.useGlobalGuards(new JwtAuthGuard(reflector), new RolesGuard(reflector));

  await app.init();
  return app;
}
