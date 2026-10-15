import { randomBytes } from 'crypto';
import { resolveE2eDatabaseUrl } from './e2e-database-guard';
import { countRedisNamespace } from './redis-namespace';

/**
 * Fail closed before touching Redis or starting any E2E app.
 * The explicit QA URL takes precedence over DATABASE_URL and apps/api/.env.
 * Jest propagates globalSetup's process.env changes to test workers.
 */
export default async function globalSetup(): Promise<void> {
  process.env.DATABASE_URL = resolveE2eDatabaseUrl(process.env.E2E_DATABASE_URL);

  if (!process.env.REDIS_KEY_PREFIX) {
    process.env.REDIS_KEY_PREFIX = `dv-e2e:${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
  }
  if (!process.env.SMTP_PORT) {
    process.env.SMTP_HOST = '127.0.0.1';
    process.env.SMTP_PORT = '9';
  }
  const existing = await countRedisNamespace(process.env.REDIS_KEY_PREFIX);
  console.log(`[e2e] Redis namespace ${process.env.REDIS_KEY_PREFIX} (pre-existing keys: ${existing})`);
}
