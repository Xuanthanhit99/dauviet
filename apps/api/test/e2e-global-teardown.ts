import { countRedisNamespace, deleteRedisNamespace } from './redis-namespace';

/** G12: removes exactly the keys this e2e run created (its own namespace) and proves none remain. */
export default async function globalTeardown(): Promise<void> {
  const prefix = process.env.REDIS_KEY_PREFIX!;
  const removed = await deleteRedisNamespace(prefix);
  const left = await countRedisNamespace(prefix);
  // eslint-disable-next-line no-console
  console.log(`[e2e] Redis namespace ${prefix}: removed ${removed} suite-owned keys, ${left} left`);
  if (left !== 0) throw new Error(`Redis namespace ${prefix} still has ${left} keys after cleanup.`);
}
