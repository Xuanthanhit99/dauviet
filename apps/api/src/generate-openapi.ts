/**
 * Offline OpenAPI generation (spec Phase 11 sections 77/78). Boots the real
 * Nest application (the actual `AppModule` - not a hand-maintained subset)
 * and writes the Swagger document `SwaggerModule.createDocument` produces
 * from it to `docs/backend/openapi.json`, then exits. Requires no live
 * Postgres/Redis/S3 - `SKIP_DB_CONNECT=true` (read by `PrismaService.
 * onModuleInit`) is the only thing that lets the full DI graph resolve
 * without a reachable database; nothing else in the module graph makes a
 * blocking connection attempt during Nest's bootstrap phase (BullMQ/ioredis
 * queue registration connects lazily in the background, never blocking
 * `onModuleInit`).
 *
 * Run via `pnpm --filter @dauviet/api openapi:generate` (see package.json).
 * Never run this with `SKIP_DB_CONNECT=true` for anything other than
 * generating this file - it is not a safe way to boot a real server.
 */
process.env.SKIP_DB_CONNECT = 'true';

// MUST come before the AppModule import below - see config/load-env.ts.
// SKIP_DB_CONNECT means this script never actually opens a DB connection,
// but a deterministic DATABASE_URL still keeps env.validation.ts happy and
// keeps this script's behavior identical to every other entrypoint.
import './config/load-env';
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';
import { buildSwaggerConfig } from './swagger.config';

async function main() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });

  // Must match main.ts exactly - setGlobalPrefix() before createDocument()
  // is what makes every generated path carry the real `/v1` prefix. Omitting
  // this was caught in review: without it, this script would silently
  // generate a document that drifts from the actual server contract (every
  // path missing its real base path) - exactly what spec Phase 11 section
  // 78 exists to prevent.
  const config = app.get(ConfigService<AppConfig, true>);
  app.setGlobalPrefix(config.get('apiPrefix', { infer: true }));

  const document = SwaggerModule.createDocument(app, buildSwaggerConfig());

  const outPath = path.resolve(__dirname, '../../../docs/backend/openapi.json');
  fs.writeFileSync(outPath, JSON.stringify(document, null, 2));

  const pathCount = Object.keys(document.paths).length;
  // eslint-disable-next-line no-console
  console.log(`OpenAPI document written to ${outPath} (${pathCount} path templates).`);

  await app.close();
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('OpenAPI generation failed:', err);
  process.exit(1);
});
