import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityKind, ReportCategory, ReportStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { COMMUNITY_ERROR_CODES } from '../../common/errors/community-error-codes';

const OPEN_STATUSES: ReportStatus[] = [ReportStatus.OPEN, ReportStatus.IN_REVIEW];

/** Report targets that structurally exist in this codebase (spec section 37). */
const REPORTABLE_TYPES = new Set<EntityKind>([EntityKind.COMMUNITY_STORY, EntityKind.COMMENT, EntityKind.STORY, EntityKind.MEDIA_ASSET]);

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private async assertTargetExists(targetType: EntityKind, targetId: string) {
    if (!REPORTABLE_TYPES.has(targetType)) {
      throw new BadRequestException({ code: COMMUNITY_ERROR_CODES.REPORT_TARGET_NOT_FOUND, message: `${targetType} cannot be reported.` });
    }
    const exists = await (
      targetType === EntityKind.COMMUNITY_STORY
        ? this.prisma.communityStory.findUnique({ where: { id: targetId } })
        : targetType === EntityKind.COMMENT
          ? this.prisma.comment.findUnique({ where: { id: targetId } })
          : targetType === EntityKind.STORY
            ? this.prisma.story.findUnique({ where: { id: targetId } })
            : this.prisma.mediaAsset.findUnique({ where: { id: targetId } })
    );
    if (!exists) {
      throw new NotFoundException({ code: COMMUNITY_ERROR_CODES.REPORT_TARGET_NOT_FOUND, message: 'Report target does not exist.' });
    }
  }

  /**
   * Files a report (spec section 37/38). Never trusts `targetType`+`targetId`
   * without checking the target exists, and refuses a duplicate open report
   * from the same reporter against the same target+category - a user
   * spamming the report button does not multiply the queue, though they can
   * still re-report after the earlier one is resolved (a new instance of the
   * same problem is a legitimate re-report, not abuse).
   */
  async file(
    reporterId: string,
    targetType: EntityKind,
    targetId: string,
    category: ReportCategory,
    notes?: string,
  ) {
    await this.assertTargetExists(targetType, targetId);

    const duplicate = await this.prisma.report.findFirst({
      where: { reporterId, targetType, targetId, category, status: { in: OPEN_STATUSES } },
    });
    if (duplicate) {
      throw new BadRequestException({ code: COMMUNITY_ERROR_CODES.REPORT_DUPLICATE, message: 'You already have an open report for this target and reason.' });
    }

    return this.prisma.report.create({
      data: { reporterId, targetType, targetId, category, notes },
    });
  }

  /**
   * Moderation queue (spec section 47) - richer filtering than a bare status
   * lookup. Never exposed publicly (`ReportsController.list`/`queue` are
   * MODERATOR/ADMIN only); reporter identity is included here for moderator
   * use only, never surfaced on any public target detail.
   */
  async queue(filters: { status?: ReportStatus; targetType?: EntityKind; category?: ReportCategory; from?: Date; to?: Date }) {
    return this.prisma.report.findMany({
      where: {
        status: filters.status,
        targetType: filters.targetType,
        category: filters.category,
        createdAt: filters.from || filters.to ? { gte: filters.from, lte: filters.to } : undefined,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { reporter: { select: { id: true, displayName: true } } },
    });
  }

  async list(status?: ReportStatus) {
    return this.queue({ status });
  }

  async forTarget(targetType: EntityKind, targetId: string) {
    return this.prisma.report.findMany({
      where: { targetType, targetId },
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
