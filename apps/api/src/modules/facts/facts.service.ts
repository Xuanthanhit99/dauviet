import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CitationVerificationState,
  EntityKind,
  FactEditorialStatus,
  FactSensitivity,
  Prisma,
  ReviewDecision,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { buildHistoricalDateColumns } from '../../common/historical-date/historical-date.util';
import { TRUST_ERROR_CODES } from '../../common/errors/trust-error-codes';
import { CreateFactDto } from './dto/fact.dto';

const FORWARD_TRANSITIONS: Record<FactEditorialStatus, FactEditorialStatus[]> = {
  DRAFT: [FactEditorialStatus.SOURCE_CHECK, FactEditorialStatus.DRAFT],
  SOURCE_CHECK: [FactEditorialStatus.FACT_REVIEW, FactEditorialStatus.DRAFT],
  FACT_REVIEW: [FactEditorialStatus.EDITORIAL_REVIEW, FactEditorialStatus.DRAFT],
  EDITORIAL_REVIEW: [FactEditorialStatus.READY, FactEditorialStatus.DRAFT],
  READY: [FactEditorialStatus.PUBLISHED, FactEditorialStatus.DRAFT],
  // A published fact can only move to DRAFT (routine unpublish/rework) or
  // RETRACTED (a controlled, reason-required withdrawal - spec section 37).
  PUBLISHED: [FactEditorialStatus.DRAFT, FactEditorialStatus.RETRACTED],
  // A retraction is not a dead end - an editor can still send it back to
  // DRAFT to fix and resubmit; it never jumps straight back to PUBLISHED.
  RETRACTED: [FactEditorialStatus.DRAFT],
};

const REVIEWER_ROLES = ['HISTORIAN_REVIEWER', 'ADMIN'];

/**
 * Regressions (PUBLISHED/READY/etc -> DRAFT) and retractions represent a
 * reviewer decision that something was wrong - APPROVED is never valid there.
 * Every other transition is an approval to move the fact forward.
 */
function resolveReviewDecision(newStatus: FactEditorialStatus, requested?: ReviewDecision): ReviewDecision {
  const isRegression = newStatus === FactEditorialStatus.DRAFT || newStatus === FactEditorialStatus.RETRACTED;
  if (requested) {
    if (isRegression && requested === ReviewDecision.APPROVED) {
      throw new BadRequestException('decision APPROVED is not valid when moving a fact back to DRAFT or to RETRACTED.');
    }
    if (!isRegression && requested !== ReviewDecision.APPROVED) {
      throw new BadRequestException(`decision ${requested} is only valid when moving a fact back to DRAFT or to RETRACTED.`);
    }
    return requested;
  }
  return isRegression ? ReviewDecision.REJECTED : ReviewDecision.APPROVED;
}

/**
 * Trust-layer core (spec sections 14/17/36). This is where the "source-first"
 * guarantee is actually enforced, not just documented: a HistoricalFact cannot
 * reach PUBLISHED without at least one VERIFIED citation, and a fact flagged
 * with non-NORMAL sensitivity cannot be self-approved by its own creator.
 * Every transition is recorded twice: a `FactReview` row (who decided what,
 * at which stage, and why - full history, never just the latest reviewer)
 * and a `Revision` snapshot of the fact as it stood after the change.
 */
@Injectable()
export class FactsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async create(dto: CreateFactDto, actorId: string) {
    const date = buildHistoricalDateColumns(dto.date);
    const fact = await this.prisma.historicalFact.create({
      data: {
        factType: dto.factType,
        dateYear: date.year,
        dateMonth: date.month,
        dateDay: date.day,
        datePrecision: date.precision,
        dateQualifier: date.qualifier,
        dateEra: date.era,
        dateEndYear: date.endYear,
        dateEndMonth: date.endMonth,
        dateEndDay: date.endDay,
        dateLabel: date.label,
        dateSortStart: date.sortStart,
        dateSortEnd: date.sortEnd,
        dateChronologyStart: date.chronologyStart,
        dateChronologyEnd: date.chronologyEnd,
        certainty: dto.certainty,
        sensitivity: dto.sensitivity ?? FactSensitivity.NORMAL,
        createdById: actorId,
        translations: {
          create: [{ locale: dto.locale, statement: dto.statement, method: 'ORIGINAL' }],
        },
      },
      include: { translations: true },
    });

    await this.snapshot(fact.id, actorId, 'fact.created');
    return fact;
  }

  async findById(id: string) {
    const fact = await this.prisma.historicalFact.findUnique({
      where: { id },
      include: {
        translations: true,
        citations: { include: { source: true } },
        placeLinks: true,
        personLinks: true,
        eventLinks: true,
        eraLinks: true,
        territoryLinks: true,
      },
    });
    if (!fact) throw new NotFoundException('Historical fact not found.');
    return fact;
  }

  async list(params: { editorialStatus?: FactEditorialStatus; sensitivity?: FactSensitivity }) {
    return this.prisma.historicalFact.findMany({
      where: params,
      include: { translations: true, citations: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /** Full review history for a fact (spec section 21) - never just the latest decision. */
  async listReviews(factId: string) {
    await this.findById(factId);
    return this.prisma.factReview.findMany({ where: { factId }, orderBy: { createdAt: 'desc' } });
  }

  async linkEntity(
    factId: string,
    kind: 'place' | 'person' | 'event' | 'era' | 'territory',
    entityId: string,
    actorId: string,
  ) {
    await this.findById(factId);

    const create = {
      place: () => this.prisma.factPlace.create({ data: { factId, placeId: entityId } }),
      person: () => this.prisma.factPerson.create({ data: { factId, personId: entityId } }),
      event: () => this.prisma.factEvent.create({ data: { factId, eventId: entityId } }),
      era: () => this.prisma.factEra.create({ data: { factId, eraId: entityId } }),
      territory: () => this.prisma.factTerritory.create({ data: { factId, territoryId: entityId } }),
    }[kind];

    const link = await create();
    await this.audit.log({ actorId, action: `fact.linked.${kind}`, entityType: EntityKind.FACT, entityId: factId, metadata: { entityId } });
    return link;
  }

  async setEditorialStatus(
    factId: string,
    newStatus: FactEditorialStatus,
    actor: AuthUser,
    options: { notes?: string; decision?: ReviewDecision } = {},
  ) {
    const fact = await this.findById(factId);

    const allowed = FORWARD_TRANSITIONS[fact.editorialStatus] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException({
        code: TRUST_ERROR_CODES.FACT_INVALID_TRANSITION,
        message: `Cannot transition a fact from ${fact.editorialStatus} to ${newStatus}.`,
      });
    }

    const isReviewer = actor.roles.some((r) => REVIEWER_ROLES.includes(r));

    if (newStatus === FactEditorialStatus.PUBLISHED) {
      if (fact.translations.length === 0) {
        throw new BadRequestException('Cannot publish a fact with no translated statement.');
      }

      if (fact.citations.length === 0) {
        throw new BadRequestException({
          code: TRUST_ERROR_CODES.FACT_CITATION_REQUIRED,
          message: 'A historical fact cannot be published without at least one citation.',
        });
      }

      const hasVerifiedCitation = fact.citations.some(
        (c) => c.verificationState === CitationVerificationState.VERIFIED,
      );
      if (!hasVerifiedCitation) {
        throw new BadRequestException({
          code: TRUST_ERROR_CODES.CITATION_NOT_VERIFIED,
          message: 'A historical fact cannot be published without at least one verified citation.',
        });
      }

      if (fact.sensitivity !== FactSensitivity.NORMAL) {
        if (!isReviewer) {
          throw new ForbiddenException({
            code: TRUST_ERROR_CODES.FACT_REVIEW_REQUIRED,
            message: `Publishing a fact with sensitivity ${fact.sensitivity} requires a historian reviewer or admin.`,
          });
        }
        if (fact.createdById === actor.id) {
          throw new ForbiddenException({
            code: TRUST_ERROR_CODES.FACT_SELF_APPROVAL_FORBIDDEN,
            message: 'A sensitive fact cannot be self-approved by the user who created it (separation of duties).',
          });
        }
      }
    }

    if (newStatus === FactEditorialStatus.RETRACTED) {
      if (!isReviewer) {
        throw new ForbiddenException({
          code: TRUST_ERROR_CODES.FACT_REVIEW_REQUIRED,
          message: 'Retracting a published fact requires a historian reviewer or admin.',
        });
      }
      if (!options.notes?.trim()) {
        throw new BadRequestException({
          code: TRUST_ERROR_CODES.FACT_REVIEW_REQUIRED,
          message: 'A retraction requires a documented reason.',
        });
      }
    }

    // Completing the FACT_REVIEW stage is the historical-accuracy checkpoint
    // itself - it must be a reviewer decision, not any CONTRIBUTOR/EDITOR.
    if (
      fact.editorialStatus === FactEditorialStatus.FACT_REVIEW &&
      newStatus === FactEditorialStatus.EDITORIAL_REVIEW &&
      !isReviewer
    ) {
      throw new ForbiddenException({
        code: TRUST_ERROR_CODES.FACT_REVIEW_REQUIRED,
        message: 'Completing fact review requires a historian reviewer or admin.',
      });
    }

    // Sending an already-in-progress fact back to DRAFT is a rejection - it
    // must be explained, never a silent mutation (spec section 22).
    if (
      newStatus === FactEditorialStatus.DRAFT &&
      fact.editorialStatus !== FactEditorialStatus.DRAFT &&
      !options.notes?.trim()
    ) {
      throw new BadRequestException({
        code: TRUST_ERROR_CODES.FACT_REVIEW_REQUIRED,
        message: 'Sending a fact back to draft requires a documented reason.',
      });
    }

    const decision = resolveReviewDecision(newStatus, options.decision);

    const updateData: Prisma.HistoricalFactUpdateInput = { editorialStatus: newStatus };
    if (newStatus === FactEditorialStatus.PUBLISHED) {
      updateData.reviewedById = actor.id;
      updateData.reviewedAt = new Date();
    }

    const updated = await this.prisma.historicalFact.update({ where: { id: factId }, data: updateData });
    await this.snapshot(factId, actor.id, `fact.editorialStatus.${newStatus}`, {
      stage: fact.editorialStatus,
      decision,
      notes: options.notes,
    });
    return updated;
  }

  /**
   * Records a Revision snapshot and (when a review context is given) a
   * FactReview row together, then an audit entry. The two Prisma writes run
   * in one transaction (spec section 48) so a fact's history can never end
   * up with a review decision but no matching snapshot, or vice versa.
   */
  private async snapshot(
    factId: string,
    actorId: string,
    note: string,
    review?: { stage: FactEditorialStatus; decision: ReviewDecision; notes?: string },
  ) {
    const fact = await this.prisma.historicalFact.findUnique({
      where: { id: factId },
      include: { translations: true, citations: true },
    });

    const writes: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.revision.create({
        data: {
          entityType: EntityKind.FACT,
          entityId: factId,
          factId,
          snapshot: fact as unknown as Prisma.InputJsonValue,
          changeNote: note,
          changedById: actorId,
        },
      }),
    ];
    if (review) {
      writes.push(
        this.prisma.factReview.create({
          data: {
            factId,
            reviewerId: actorId,
            stage: review.stage,
            decision: review.decision,
            notes: review.notes,
          },
        }),
      );
    }
    await this.prisma.$transaction(writes);

    await this.audit.log({ actorId, action: note, entityType: EntityKind.FACT, entityId: factId, metadata: review });
  }
}
