import { Injectable } from '@nestjs/common';
import { EntityKind, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditEntry {
  actorId?: string;
  action: string;
  entityType?: EntityKind;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

/** Either the ambient PrismaService or an in-flight `$transaction` callback client - same contract as `SourcesService`/`MediaService`'s own `Db` alias. */
type Db = PrismaService | Prisma.TransactionClient;

/**
 * Append-only audit trail (spec section 38). Deliberately has no update/delete
 * method - nothing in the normal editorial API can alter an audit record.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `db` defaults to the ambient PrismaService; pass an in-flight
   * `Prisma.TransactionClient` when logging from inside a caller's own
   * `$transaction` (e.g. `SourcesService.create`/`addDocument`,
   * `MediaService.promote` when invoked from a Contribution catalogue
   * action) so the audit row is rolled back along with everything else if
   * that transaction fails. Phase 12.1 fix: every call site previously
   * always wrote through `this.prisma` regardless of an in-flight `tx` it
   * was handed, which a real-database rollback test (`contribution-
   * catalogue.e2e-spec.ts`) proved left an orphaned `source.created` audit
   * row referencing a Source that no longer existed after a forced
   * mid-transaction failure rolled the Source itself back - see
   * docs/backend/LIVE_QA_REPORT.md's Phase 12.1 section.
   */
  async log(entry: AuditEntry, db: Db = this.prisma) {
    await db.auditLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        metadata: entry.metadata as any,
      },
    });
  }

  async list(params: { entityType?: EntityKind; entityId?: string; take?: number; skip?: number }) {
    const { entityType, entityId, take = 50, skip = 0 } = params;
    return this.prisma.auditLog.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    });
  }
}
