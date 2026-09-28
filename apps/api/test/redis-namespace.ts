import * as fs from 'fs';
import Redis from 'ioredis';
import { API_LOCAL_ENV_PATH, parseEnvFile } from '../src/config/load-env';

/**
 * G12 Redis test isolation. Every e2e run gets its own BullMQ key namespace
 * (`REDIS_KEY_PREFIX`, set by e2e-global-setup.ts before any app boots), and
 * cleanup deletes exactly the keys under that namespace - never FLUSHALL /
 * FLUSHDB, which used to wipe the shared dev Redis (including the developer's
 * own `bull:*` queues). The pattern guard means a mistaken prefix (empty,
 * `bull`, `*`) can never widen the deletion to keys the suite does not own.
 */
export const E2E_REDIS_PREFIX_PATTERN = /^dv-e2e:[A-Za-z0-9-]+$/;

export function e2eRedisUrl(): string {
  if (process.env.REDIS_URL) return process.env.REDIS_URL;
  const local = fs.existsSync(API_LOCAL_ENV_PATH) ? parseEnvFile(fs.readFileSync(API_LOCAL_ENV_PATH, 'utf8')) : {};
  return local.REDIS_URL || 'redis://localhost:6379';
}

export function assertSuiteOwnedPrefix(prefix: string | undefined): string {
  if (!prefix || !E2E_REDIS_PREFIX_PATTERN.test(prefix)) {
    throw new Error(`Refusing Redis cleanup: "${prefix}" is not a suite-owned e2e namespace (${E2E_REDIS_PREFIX_PATTERN}).`);
  }
  return prefix;
}

/** Deletes every key under `<prefix>:` (SCAN + UNLINK in batches). Returns the number of keys removed. */
export async function deleteRedisNamespace(prefix: string, url = e2eRedisUrl()): Promise<number> {
  assertSuiteOwnedPrefix(prefix);
  const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 2 });
  await redis.connect();
  try {
    let cursor = '0';
    let removed = 0;
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', `${prefix}:*`, 'COUNT', 500);
      cursor = next;
      if (keys.length > 0) removed += await redis.unlink(...keys);
    } while (cursor !== '0');
    return removed;
  } finally {
    redis.disconnect();
  }
}

export async function countRedisNamespace(prefix: string, url = e2eRedisUrl()): Promise<number> {
  assertSuiteOwnedPrefix(prefix);
  const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 2 });
  await redis.connect();
  try {
    let cursor = '0';
    let count = 0;
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', `${prefix}:*`, 'COUNT', 500);
      cursor = next;
      count += keys.length;
    } while (cursor !== '0');
    return count;
  } finally {
    redis.disconnect();
  }
}
