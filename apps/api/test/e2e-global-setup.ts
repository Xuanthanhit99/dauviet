import { randomBytes } from 'crypto';
import * as fs from 'fs';
import { API_LOCAL_ENV_PATH, parseEnvFile } from '../src/config/load-env';
import { countRedisNamespace } from './redis-namespace';

/**
 * G12: gives the whole e2e run one unique Redis/BullMQ namespace. Jest runs
 * this before any test file, in the same process that later runs the suites
 * (`--runInBand`), so every `bootstrapTestApp()` inherits `REDIS_KEY_PREFIX`
 * and all of its queues live under `dv-e2e:<run-id>:*`. An explicitly
 * provided suite namespace (e.g. for a repeat run) is respected.
 */
export default async function globalSetup(): Promise<void> {
  if (!process.env.REDIS_KEY_PREFIX) {
    process.env.REDIS_KEY_PREFIX = `dv-e2e:${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
  }
  // No e2e suite reads mail (MailerService is fail-soft), and on a shared host the conventional
  // 1025 SMTP port may belong to another project's mail catcher - point SMTP at a closed local port.
  if (!process.env.SMTP_PORT) {
    process.env.SMTP_HOST = '127.0.0.1';
    process.env.SMTP_PORT = '9';
  }
  // Same database, more patience: on a heavily loaded shared host Prisma's default 5 s connect /
  // 10 s pool timeouts were observed to fail a whole suite at boot (environment noise, not product).
  const local = fs.existsSync(API_LOCAL_ENV_PATH) ? parseEnvFile(fs.readFileSync(API_LOCAL_ENV_PATH, 'utf8')) : {};
  const dbUrl = process.env.DATABASE_URL || local.DATABASE_URL;
  if (dbUrl) {
    const url = new URL(dbUrl);
    if (!url.searchParams.has('connect_timeout')) url.searchParams.set('connect_timeout', '60');
    if (!url.searchParams.has('pool_timeout')) url.searchParams.set('pool_timeout', '60');
    process.env.DATABASE_URL = url.toString();
  }
  const existing = await countRedisNamespace(process.env.REDIS_KEY_PREFIX);
  // eslint-disable-next-line no-console
  console.log(`[e2e] Redis namespace ${process.env.REDIS_KEY_PREFIX} (pre-existing keys: ${existing})`);
}
