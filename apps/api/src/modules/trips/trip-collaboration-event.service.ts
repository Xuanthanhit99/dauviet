import { Injectable } from '@nestjs/common';
import { Prisma, TripCollaborationEventType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;

export interface CollaborationEventEntry {
  tripId: string;
  type: TripCollaborationEventType;
  actorUserId: string;
  metadata?: Record<string, unknown>;
}

/**
 * Member-facing trip activity history (spec section 39/40) - deliberately
 * NOT the security `AuditLog`. Same `db: Db = this.prisma` transaction-
 * threading discipline as `AuditService` (Phase 12.1 fix): every
 * governance-relevant call site passes its own in-flight `tx` so the event
 * is committed or rolled back atomically with the mutation it describes
 * (spec section 85) - never written after the fact, never left orphaned by
 * a failed mutation.
 */
@Injectable()
export class TripCollaborationEventService {
  constructor(private readonly prisma: PrismaService) {}

  /** Resolves the actor's current `displayName` at write time and snapshots it (spec section 41) - callers never need to fetch/pass it themselves. */
  async record(entry: CollaborationEventEntry, db: Db = this.prisma) {
    const actor = await db.user.findUnique({ where: { id: entry.actorUserId }, select: { displayName: true } });
    await db.tripCollaborationEvent.create({
      data: {
        tripId: entry.tripId,
        type: entry.type,
        actorUserId: entry.actorUserId,
        actorSnapshotName: actor?.displayName ?? 'Unknown',
        metadata: entry.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }

  /** Bounded, deterministic pagination (spec section 43) - createdAt DESC with id as a stable tie-breaker, never unbounded. */
  async list(tripId: string, page: number, pageSize: number) {
    const where = { tripId };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.tripCollaborationEvent.count({ where }),
      this.prisma.tripCollaborationEvent.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items, total, page, pageSize };
  }
}
