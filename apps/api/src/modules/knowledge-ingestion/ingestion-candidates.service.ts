import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityKind, IngestionCandidateType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { IngestionPromotionService } from './ingestion-promotion.service';
import { INGESTION_ERROR_CODES } from '../../common/errors/ingestion-error-codes';
import { ListCandidatesQuery } from './dto/ingestion.dto';

/** Candidate types whose promotion is treated like sensitive HistoricalFact review (spec section 30/45) - self-approval forbidden. */
const SENSITIVE_CANDIDATE_TYPES: IngestionCandidateType[] = ['PERSON', 'EVENT', 'HISTORICAL_FACT'];

@Injectable()
export class IngestionCandidatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly promotion: IngestionPromotionService,
  ) {}

  async list(query: ListCandidatesQuery) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = {
      status: query.status,
      source: query.sourceCode ? { code: query.sourceCode } : undefined,
    };
    const [items, total] = await Promise.all([
      this.prisma.ingestionCandidate.findMany({
        where,
        include: { source: true, resolution: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.ingestionCandidate.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async getDetail(id: string) {
    const candidate = await this.prisma.ingestionCandidate.findUnique({
      where: { id },
      include: { source: true, resolution: true, evidence: true, externalIdentities: true, record: true },
    });
    if (!candidate) throw new NotFoundException(INGESTION_ERROR_CODES.INGESTION_CANDIDATE_NOT_FOUND);
    return candidate;
  }

  /** Field-level diff view (spec section 75) - proposed normalized values vs. the currently-resolved canonical entity's translations, where one exists. Never requires an editor to read raw JSON to understand a change. */
  async getDiff(id: string) {
    const candidate = await this.getDetail(id);
    const data = candidate.normalizedData as any;
    if (!candidate.resolvedEntityType || !candidate.resolvedEntityId) {
      return { proposed: data, current: null, fields: Object.entries(data?.labels ?? {}).map(([locale, value]) => ({ field: `labels.${locale}`, proposed: value, current: null })) };
    }
    let current: Record<string, string> = {};
    if (candidate.resolvedEntityType === EntityKind.PLACE) {
      const rows = await this.prisma.placeTranslation.findMany({ where: { placeId: candidate.resolvedEntityId } });
      current = Object.fromEntries(rows.map((r) => [r.locale, r.name]));
    } else if (candidate.resolvedEntityType === EntityKind.DESTINATION) {
      const rows = await this.prisma.destinationTranslation.findMany({ where: { destinationId: candidate.resolvedEntityId } });
      current = Object.fromEntries(rows.map((r) => [r.locale, r.name]));
    } else if (candidate.resolvedEntityType === EntityKind.CITY) {
      const rows = await this.prisma.cityTranslation.findMany({ where: { cityId: candidate.resolvedEntityId } });
      current = Object.fromEntries(rows.map((r) => [r.locale, r.name]));
    }
    const fields = Object.entries(data?.labels ?? {}).map(([locale, proposed]) => ({
      field: `labels.${locale}`,
      proposed,
      current: current[locale] ?? null,
      changed: current[locale] !== undefined && current[locale] !== proposed,
    }));
    return { proposed: data, current, fields };
  }

  private assertReviewable(status: string) {
    if (!['NEEDS_REVIEW', 'AUTO_MATCHED', 'UNRESOLVED'].includes(status)) {
      throw new BadRequestException(INGESTION_ERROR_CODES.INGESTION_CANDIDATE_NOT_REVIEWABLE);
    }
  }

  async approve(id: string, actorId: string) {
    const candidate = await this.prisma.ingestionCandidate.findUnique({ where: { id }, include: { record: { include: { run: true } } } });
    if (!candidate) throw new NotFoundException(INGESTION_ERROR_CODES.INGESTION_CANDIDATE_NOT_FOUND);
    this.assertReviewable(candidate.status);

    // Self-approval restriction (spec section 30/45/91) - preserves the
    // existing FactReview separation-of-duties rule for sensitive types.
    if (SENSITIVE_CANDIDATE_TYPES.includes(candidate.candidateType)) {
      const runCreatedById = candidate.record?.run?.createdById;
      if (runCreatedById && runCreatedById === actorId) {
        throw new ForbiddenException(INGESTION_ERROR_CODES.INGESTION_CANDIDATE_SELF_APPROVAL_FORBIDDEN);
      }
    }

    // The status: APPROVED write happens INSIDE IngestionPromotionService's
    // own transaction, atomically with the actual promotion (spec section
    // 34) - never pre-committed here. See the doc comment on
    // `IngestionPromotionService.promote` for the real failure mode this
    // fixed (a candidate stuck unretryable after a transient promotion
    // failure, found live during this phase's own Commons media pilot).
    return this.promotion.promote(id, actorId);
  }

  async reject(id: string, actorId: string, notes?: string) {
    const candidate = await this.prisma.ingestionCandidate.findUnique({ where: { id } });
    if (!candidate) throw new NotFoundException(INGESTION_ERROR_CODES.INGESTION_CANDIDATE_NOT_FOUND);
    this.assertReviewable(candidate.status);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.ingestionCandidate.update({ where: { id }, data: { status: 'REJECTED', reviewedById: actorId, reviewedAt: new Date() } });
      await this.audit.log({ actorId, action: 'ingestionCandidate.rejected', entityType: EntityKind.INGESTION_CANDIDATE, entityId: id, metadata: { notes } }, tx);
      return updated;
    });
  }

  /** Explicit human merge decision (spec section 23/26/84) - never automatic, even for AMBIGUOUS/HIGH_CONFIDENCE_MATCH outcomes. */
  async merge(id: string, mergedIntoCandidateId: string, actorId: string) {
    const [candidate, target] = await Promise.all([
      this.prisma.ingestionCandidate.findUnique({ where: { id } }),
      this.prisma.ingestionCandidate.findUnique({ where: { id: mergedIntoCandidateId } }),
    ]);
    if (!candidate || !target) throw new NotFoundException(INGESTION_ERROR_CODES.INGESTION_CANDIDATE_NOT_FOUND);
    this.assertReviewable(candidate.status);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.ingestionCandidate.update({
        where: { id },
        data: { status: 'MERGED', mergedIntoCandidateId, reviewedById: actorId, reviewedAt: new Date() },
      });
      await this.audit.log({ actorId, action: 'ingestionCandidate.merged', entityType: EntityKind.INGESTION_CANDIDATE, entityId: id, metadata: { mergedIntoCandidateId } }, tx);
      return updated;
    });
  }
}
