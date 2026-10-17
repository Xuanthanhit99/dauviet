import { Prisma, PrismaClient } from '@prisma/client';
import { fanOutPublication, OutboxClaim } from './publication-fanout';

/**
 * Claim one due publication event with PostgreSQL SKIP LOCKED.
 * A monotonically increasing leaseGeneration fences stale workers.
 * No polling process is started here; callers own scheduling.
 */
export async function claimPublicationOutbox(
  db: PrismaClient, owner: string, leaseMs = 30_000,
): Promise<OutboxClaim | null> {
  if (!owner || leaseMs < 1000 || leaseMs > 300_000) throw new Error('Invalid claim parameters');
  const rows = await db.$queryRaw<Array<{ id: string; leaseGeneration: number }>>(Prisma.sql`
    WITH candidate AS (
      SELECT "id" FROM "NotificationOutbox"
      WHERE (
        ("status" = 'PENDING' AND "nextAttemptAt" <= NOW())
        OR ("status" = 'CLAIMED' AND "leaseUntil" < NOW())
      )
      ORDER BY "nextAttemptAt", "createdAt", "id"
      FOR UPDATE SKIP LOCKED LIMIT 1
    )
    UPDATE "NotificationOutbox" o
    SET "status" = 'CLAIMED', "leaseOwner" = ${owner},
        "leaseUntil" = NOW() + (${leaseMs} * INTERVAL '1 millisecond'),
        "leaseGeneration" = o."leaseGeneration" + 1,
        "updatedAt" = NOW()
    FROM candidate WHERE o."id" = candidate."id"
    RETURNING o."id", o."leaseGeneration" AS "leaseGeneration"
  `);
  const row = rows[0];
  return row ? { id: row.id, owner, generation: row.leaseGeneration } : null;
}

export async function processClaimedPublication(db: PrismaClient, claim: OutboxClaim) {
  return fanOutPublication(db, claim.id, claim);
}

/** One bounded iteration. Never sends SMTP or creates NotificationDelivery. */
export async function runPublicationFanoutOnce(db: PrismaClient, owner: string) {
  const claim = await claimPublicationOutbox(db, owner);
  if (!claim) return null;
  return { claim, result: await processClaimedPublication(db, claim) };
}
