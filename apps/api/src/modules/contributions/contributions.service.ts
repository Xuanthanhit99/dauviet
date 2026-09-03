import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ContributionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateContributionDto, AdvanceContributionDto } from './dto/contribution.dto';

const FORWARD: Record<ContributionStatus, ContributionStatus[]> = {
  SUBMITTED: [ContributionStatus.TRIAGE, ContributionStatus.REJECTED],
  TRIAGE: [ContributionStatus.PROVENANCE_REVIEW, ContributionStatus.REJECTED],
  PROVENANCE_REVIEW: [ContributionStatus.HISTORICAL_REVIEW, ContributionStatus.REJECTED],
  HISTORICAL_REVIEW: [ContributionStatus.ACCEPTED, ContributionStatus.REJECTED],
  ACCEPTED: [ContributionStatus.CATALOGUED],
  CATALOGUED: [],
  REJECTED: [],
};

/**
 * Contribution intake is intentionally a distinct workflow from Source/
 * HistoricalFact (spec section 33): even a CATALOGUED contribution never
 * auto-creates a Source record. Promoting contributed material into the
 * verified library is a deliberate, separate editorial action.
 */
@Injectable()
export class ContributionsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async create(dto: CreateContributionDto, contributorId: string) {
    const contribution = await this.prisma.contribution.create({
      data: {
        contributorId,
        title: dto.title,
        description: dto.description,
        originSource: dto.originSource,
        currentOwner: dto.currentOwner,
        sharingRights: dto.sharingRights,
        approxDateLabel: dto.approxDateLabel,
        approxDateStart: dto.approxDateStart ? new Date(dto.approxDateStart) : undefined,
        approxDateEnd: dto.approxDateEnd ? new Date(dto.approxDateEnd) : undefined,
        peopleShown: dto.peopleShown ?? [],
        placeId: dto.placeId,
        contextNote: dto.contextNote,
        media: dto.mediaAssetIds
          ? { create: dto.mediaAssetIds.map((mediaAssetId) => ({ mediaAssetId })) }
          : undefined,
      },
      include: { media: true },
    });

    await this.audit.log({ actorId: contributorId, action: 'contribution.created', entityType: 'CONTRIBUTION', entityId: contribution.id });
    return contribution;
  }

  async findById(id: string) {
    const contribution = await this.prisma.contribution.findUnique({
      where: { id },
      include: { media: { include: { mediaAsset: true } }, reviewNotes: true, contributor: { select: { id: true, displayName: true } } },
    });
    if (!contribution) throw new NotFoundException('Contribution not found.');
    return contribution;
  }

  async listMine(contributorId: string) {
    return this.prisma.contribution.findMany({ where: { contributorId }, orderBy: { createdAt: 'desc' } });
  }

  async listForReview(status?: ContributionStatus) {
    return this.prisma.contribution.findMany({
      where: { status },
      orderBy: { createdAt: 'asc' },
      include: { contributor: { select: { id: true, displayName: true } } },
    });
  }

  async advance(id: string, reviewerId: string, dto: AdvanceContributionDto) {
    const contribution = await this.prisma.contribution.findUnique({ where: { id } });
    if (!contribution) throw new NotFoundException('Contribution not found.');

    const allowed = FORWARD[contribution.status] ?? [];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(`Cannot move a contribution from ${contribution.status} to ${dto.status}.`);
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.contribution.update({ where: { id }, data: { status: dto.status } }),
      this.prisma.contributionReviewNote.create({
        data: { contributionId: id, reviewerId, stage: dto.status, note: dto.note ?? '' },
      }),
    ]);

    await this.audit.log({ actorId: reviewerId, action: 'contribution.advanced', entityType: 'CONTRIBUTION', entityId: id, metadata: { status: dto.status } });
    return updated;
  }
}
