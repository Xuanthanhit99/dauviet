import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityKind, ReportCategory, ReportStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async file(
    reporterId: string,
    targetType: EntityKind,
    targetId: string,
    category: ReportCategory,
    notes?: string,
  ) {
    return this.prisma.report.create({
      data: { reporterId, targetType, targetId, category, notes },
    });
  }

  async list(status?: ReportStatus) {
    return this.prisma.report.findMany({
      where: { status },
      orderBy: { createdAt: 'desc' },
      include: { reporter: { select: { id: true, displayName: true } } },
    });
  }

  async resolve(actorId: string, id: string, status: ReportStatus, resolutionNote?: string) {
    const report = await this.prisma.report.findUnique({ where: { id } });
    if (!report) throw new NotFoundException('Report not found.');

    const updated = await this.prisma.report.update({
      where: { id },
      data: { status, resolvedById: actorId, resolvedAt: new Date(), resolutionNote },
    });

    // Moderation actions must be auditable (spec section 34/38) - never a silent hard delete.
    await this.audit.log({
      actorId,
      action: 'report.resolved',
      entityType: report.targetType,
      entityId: report.targetId,
      metadata: { reportId: id, status, resolutionNote },
    });

    return updated;
  }
}
