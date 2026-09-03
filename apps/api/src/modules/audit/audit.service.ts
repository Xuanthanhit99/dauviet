import { Injectable } from '@nestjs/common';
import { EntityKind } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditEntry {
  actorId?: string;
  action: string;
  entityType?: EntityKind;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Append-only audit trail (spec section 38). Deliberately has no update/delete
 * method - nothing in the normal editorial API can alter an audit record.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry) {
    await this.prisma.auditLog.create({
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
