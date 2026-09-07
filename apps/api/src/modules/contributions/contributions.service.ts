import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ContributionRightsReviewState,
  ContributionStatus,
  ContributionType,
  EntityKind,
  Prisma,
  Role,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MediaService } from '../media/media.service';
import { SourcesService } from '../sources/sources.service';
import { CONTRIBUTION_ERROR_CODES } from '../../common/errors/contribution-error-codes';
import {
  AddProvenanceSourceDto,
  CatalogueDocumentDto,
  CatalogueMediaDto,
  CatalogueSourceDto,
  CONTRIBUTION_CORRECTION_TARGET_KINDS,
  CONTRIBUTION_LINKABLE_KINDS,
  ContributionQueueQueryDto,
  CreateContributionDto,
  SetProvenanceConfidenceDto,
  SetRightsReviewDto,
  SetSensitivityDto,
  SubmitContributionReviewDto,
  UpdateContributionDto,
  WithdrawContributionDto,
} from './dto/contribution.dto';

type Actor = { id: string; roles: string[] };

/**
 * Forward-only stage completion (spec section 3/4). `ACCEPTED` deliberately
 * has no forward entry here - `ACCEPTED -> CATALOGUED` only ever happens
 * through a catalogue action (`catalogueSource`/`catalogueDocument`/
 * `catalogueMedia`), never through `submitReview` (spec section 28/50).
 */
const FORWARD: Partial<Record<ContributionStatus, ContributionStatus>> = {
  SUBMITTED: ContributionStatus.TRIAGE,
  TRIAGE: ContributionStatus.PROVENANCE_REVIEW,
  PROVENANCE_REVIEW: ContributionStatus.HISTORICAL_REVIEW,
  HISTORICAL_REVIEW: ContributionStatus.ACCEPTED,
};

/** `RETURN_TO_PREVIOUS_STAGE` (spec section 27/58) - one step back, never past SUBMITTED, never once CATALOGUED/REJECTED. */
const BACKWARD: Partial<Record<ContributionStatus, ContributionStatus>> = {
  TRIAGE: ContributionStatus.SUBMITTED,
  PROVENANCE_REVIEW: ContributionStatus.TRIAGE,
  HISTORICAL_REVIEW: ContributionStatus.PROVENANCE_REVIEW,
  ACCEPTED: ContributionStatus.HISTORICAL_REVIEW,
};

/**
 * Roles allowed to *complete* (approve out of) a given stage (spec section
 * 25/72). HISTORICAL_REVIEW is stricter - the historical-accuracy
 * checkpoint itself, mirroring FactsService's FACT_REVIEW->EDITORIAL_REVIEW
 * gate (see docs/backend/TRUST_MODEL.md section 8).
 */
const STAGE_COMPLETION_ROLES: Partial<Record<ContributionStatus, Role[]>> = {
  SUBMITTED: [Role.EDITOR, Role.HISTORIAN_REVIEWER, Role.ADMIN],
  TRIAGE: [Role.EDITOR, Role.HISTORIAN_REVIEWER, Role.ADMIN],
  PROVENANCE_REVIEW: [Role.EDITOR, Role.HISTORIAN_REVIEWER, Role.ADMIN],
  HISTORICAL_REVIEW: [Role.HISTORIAN_REVIEWER, Role.ADMIN],
};

const REVIEWER_ROLES: Role[] = [Role.EDITOR, Role.HISTORIAN_REVIEWER, Role.ADMIN];
/** Cataloguing (promotion into the trust layer) is a stricter gate than ordinary review, same as Source.archive (spec section 30/50). */
const CATALOGUE_ROLES: Role[] = [Role.HISTORIAN_REVIEWER, Role.ADMIN];

type ContributionRow = Prisma.ContributionGetPayload<Record<string, never>>;

/**
 * Contribution intake/review/cataloguing pipeline (spec Phase 09). The core
 * invariant this service exists to enforce: `Contribution ACCEPTED` is not
 * `HistoricalFact PUBLISHED` and is not `Source VERIFIED` - a contribution
 * can only become trusted catalogue material through the explicit, audited
 * catalogue* actions below, never merely by advancing its own status.
 * See docs/backend/CONTRIBUTION_ARCHITECTURE.md for the full contract.
 */
@Injectable()
export class ContributionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
    private readonly sources: SourcesService,
  ) {}

  // ---------------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------------

  private hasAnyRole(actor: Actor, roles: Role[]): boolean {
    return actor.roles.some((r) => roles.includes(r as Role));
  }

  private async getOr404(id: string) {
    const contribution = await this.prisma.contribution.findUnique({ where: { id } });
    if (!contribution) {
      throw new NotFoundException({ code: CONTRIBUTION_ERROR_CODES.CONTRIBUTION_NOT_FOUND, message: 'Contribution not found.' });
    }
    return contribution;
  }

  private assertOwnerOrPrivileged(contribution: { contributorId: string }, actor: Actor) {
    if (contribution.contributorId === actor.id) return;
    if (this.hasAnyRole(actor, REVIEWER_ROLES)) return;
    throw new ForbiddenException('You do not have access to this contribution.');
  }

  private assertNotSelfReview(contribution: { contributorId: string }, actor: Actor) {
    if (contribution.contributorId === actor.id) {
      throw new ForbiddenException({
        code: CONTRIBUTION_ERROR_CODES.CONTRIBUTION_SELF_REVIEW_FORBIDDEN,
        message: 'You cannot review your own contribution, regardless of role.',
      });
    }
  }

  /** SUBMITTED, or any stage while a reviewer has explicitly asked for more information (spec sections 23/45/58). Never editable once withdrawn. */
  private isEditable(contribution: { status: ContributionStatus; needsInfo: boolean; withdrawnAt: Date | null }): boolean {
    if (contribution.withdrawnAt) return false;
    return contribution.status === ContributionStatus.SUBMITTED || contribution.needsInfo;
  }

  private assertVersion(contribution: { version: number }, expectedVersion: number) {
    if (contribution.version !== expectedVersion) {
      throw new BadRequestException({
        code: CONTRIBUTION_ERROR_CODES.CONTRIBUTION_VERSION_CONFLICT,
        message: `This contribution changed since you last read it (expected version ${expectedVersion}, current is ${contribution.version}) - reload and retry.`,
      });
    }
  }

  private async assertLinkedEntityExists(type: EntityKind, id: string) {
    if (!CONTRIBUTION_LINKABLE_KINDS.includes(type)) {
      throw new BadRequestException({
        code: CONTRIBUTION_ERROR_CODES.CONTRIBUTION_INVALID_TARGET,
        message: `Contributions cannot link entity kind ${type}.`,
      });
    }
    const exists =
      type === EntityKind.PERSON
        ? await this.prisma.person.findUnique({ where: { id }, select: { id: true } })
        : type === EntityKind.EVENT
          ? await this.prisma.historicalEvent.findUnique({ where: { id }, select: { id: true } })
          : type === EntityKind.ERA
            ? await this.prisma.historicalEra.findUnique({ where: { id }, select: { id: true } })
            : await this.prisma.territory.findUnique({ where: { id }, select: { id: true } });
    if (!exists) {
      throw new BadRequestException({ code: CONTRIBUTION_ERROR_CODES.CONTRIBUTION_INVALID_TARGET, message: `Linked ${type} ${id} does not exist.` });
    }
  }

  private async assertCorrectionTargetExists(type: EntityKind, id: string) {
    if (!CONTRIBUTION_CORRECTION_TARGET_KINDS.includes(type)) {
      throw new BadRequestException({
        code: CONTRIBUTION_ERROR_CODES.CONTRIBUTION_INVALID_TARGET,
        message: `Corrections cannot target entity kind ${type}.`,
      });
    }
    const exists =
      type === EntityKind.PLACE
        ? await this.prisma.place.findUnique({ where: { id }, select: { id: true } })
        : type === EntityKind.PERSON
          ? await this.prisma.person.findUnique({ where: { id }, select: { id: true } })
          : type === EntityKind.EVENT
            ? await this.prisma.historicalEvent.findUnique({ where: { id }, select: { id: true } })
            : type === EntityKind.ERA
              ? await this.prisma.historicalEra.findUnique({ where: { id }, select: { id: true } })
              : type === EntityKind.STORY
                ? await this.prisma.story.findUnique({ where: { id }, select: { id: true } })
                : type === EntityKind.SOURCE
                  ? await this.prisma.source.findUnique({ where: { id }, select: { id: true } })
                  : await this.prisma.historicalFact.findUnique({ where: { id }, select: { id: true } });
    if (!exists) {
      throw new BadRequestException({ code: CONTRIBUTION_ERROR_CODES.CONTRIBUTION_INVALID_TARGET, message: `Correction target ${type} ${id} does not exist.` });
    }
  }

  // ---------------------------------------------------------------------
  // submitter-facing
  // ---------------------------------------------------------------------

  /**
   * Creates a raw Contribution (spec section 6/74). `submitterId` is always
   * `contributor.id` from the authenticated request, never client input
   * (test #2) - `CreateContributionDto` has no `contributorId`/`status`
   * field for exactly this reason (test #7: a client cannot self-accept).
   * Never creates a Source/SourceDocument/HistoricalFact (tests #9/#10/#8) -
   * this method touches only the Contribution/ContributionMedia tables.
   */
  async create(dto: CreateContributionDto, contributor: Actor) {
    if (dto.mediaAssetIds?.length) {
      for (const mediaAssetId of dto.mediaAssetIds) {
        await this.media.assertOwnedByOrPrivileged(mediaAssetId, contributor);
      }
    }

    if (dto.linkedEntityType) {
      if (!dto.linkedEntityId) throw new BadRequestException('linkedEntityId is required when linkedEntityType is set.');
      await this.assertLinkedEntityExists(dto.linkedEntityType, dto.linkedEntityId);
    }

    const isCorrection = (dto.type ?? ContributionType.OTHER) === ContributionType.CORRECTION;
    if (isCorrection || dto.correctionTargetType) {
      if (!dto.correctionTargetType || !dto.correctionTargetId) {
        throw new BadRequestException('A CORRECTION contribution requires both correctionTargetType and correctionTargetId.');
      }
      await this.assertCorrectionTargetExists(dto.correctionTargetType, dto.correctionTargetId);
    }

    if (dto.placeId) {
      const place = await this.prisma.place.findUnique({ where: { id: dto.placeId }, select: { id: true } });
      if (!place) throw new BadRequestException({ code: CONTRIBUTION_ERROR_CODES.CONTRIBUTION_INVALID_TARGET, message: 'placeId does not exist.' });
    }

    const contribution = await this.prisma.contribution.create({
      data: {
        contributorId: contributor.id,
        type: dto.type ?? ContributionType.OTHER,
        title: dto.title,
        description: dto.description,
        originalLocale: dto.originalLocale ?? 'vi',
        originSource: dto.originSource,
        currentOwner: dto.currentOwner,
        sharingRights: dto.sharingRights,
        submitterDeclaration: dto.submitterDeclaration,
        attribution: dto.attribution,
        approxDateLabel: dto.approxDateLabel,
        approxDateStart: dto.approxDateStart ? new Date(dto.approxDateStart) : undefined,
        approxDateEnd: dto.approxDateEnd ? new Date(dto.approxDateEnd) : undefined,
        peopleShown: dto.peopleShown ?? [],
        placeId: dto.placeId,
        linkedEntityType: dto.linkedEntityType,
        linkedEntityId: dto.linkedEntityId,
        correctionTargetType: dto.correctionTargetType,
        correctionTargetId: dto.correctionTargetId,
        contextNote: dto.contextNote,
        media: dto.mediaAssetIds?.length ? { create: dto.mediaAssetIds.map((mediaAssetId) => ({ mediaAssetId })) } : undefined,
      },
      include: { media: true },
    });

    await this.audit.log({ actorId: contributor.id, action: 'contribution.created', entityType: 'CONTRIBUTION', entityId: contribution.id, metadata: { type: contribution.type } });
    return contribution;
  }

  async listMine(contributorId: string) {
    return this.prisma.contribution.findMany({ where: { contributorId }, orderBy: { createdAt: 'desc' } });
  }

  /**
   * Submitter's own detail view - never includes internal reviewer notes
   * (spec section 42/56/58); `rejectionReason` (a reviewer-authored, meant-
   * to-be-read-by-the-submitter field) is exposed, the raw ContributionReviewNote
   * history is not.
   */
  async findMineById(id: string, actor: Actor) {
    const contribution = await this.prisma.contribution.findUnique({
      where: { id },
      include: { media: { include: { mediaAsset: true } }, provenanceEvidence: true, catalogueResults: true },
    });
    if (!contribution) throw new NotFoundException({ code: CONTRIBUTION_ERROR_CODES.CONTRIBUTION_NOT_FOUND, message: 'Contribution not found.' });
    this.assertOwnerOrPrivileged(contribution, actor);
    return contribution;
  }

  /**
   * SUBMITTED-state (or explicitly NEEDS_INFO) edits only (spec sections 45/58).
   * Snapshots the pre-edit row into `Revision` first (reusing the existing
   * generic model, same convention as HistoricalFact) so an edit after
   * PROVENANCE_REVIEW/HISTORICAL_REVIEW already touched the contribution
   * never silently destroys what a reviewer saw.
   */
  async update(id: string, dto: UpdateContributionDto, actor: Actor) {
    const contribution = await this.getOr404(id);
    if (contribution.contributorId !== actor.id) {
      throw new ForbiddenException('You can only edit your own contribution.');
    }
    if (!this.isEditable(contribution)) {
      throw new BadRequestException({
        code: CONTRIBUTION_ERROR_CODES.CONTRIBUTION_NOT_EDITABLE,
        message: `Contribution is not editable in its current state (${contribution.status}).`,
      });
    }

    if (dto.mediaAssetIds) {
      for (const mediaAssetId of dto.mediaAssetIds) {
        await this.media.assertOwnedByOrPrivileged(mediaAssetId, actor);
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.revision.create({
        data: { entityType: EntityKind.CONTRIBUTION, entityId: id, snapshot: contribution as unknown as Prisma.InputJsonValue, changeNote: 'Submitter edit', changedById: actor.id },
      });

      if (dto.mediaAssetIds) {
        await tx.contributionMedia.deleteMany({ where: { contributionId: id } });
        if (dto.mediaAssetIds.length) {
          await tx.contributionMedia.createMany({ data: dto.mediaAssetIds.map((mediaAssetId) => ({ contributionId: id, mediaAssetId })) });
        }
      }

      return tx.contribution.update({
        where: { id },
        data: {
          title: dto.title,
          description: dto.description,
          originSource: dto.originSource,
          currentOwner: dto.currentOwner,
          sharingRights: dto.sharingRights,
          submitterDeclaration: dto.submitterDeclaration,
          attribution: dto.attribution,
          approxDateLabel: dto.approxDateLabel,
          approxDateStart: dto.approxDateStart ? new Date(dto.approxDateStart) : undefined,
          approxDateEnd: dto.approxDateEnd ? new Date(dto.approxDateEnd) : undefined,
          peopleShown: dto.peopleShown,
          contextNote: dto.contextNote,
          // The submitter has now responded - no longer awaiting info (spec section 58).
          needsInfo: false,
          version: { increment: 1 },
        },
      });
    });

    await this.audit.log({ actorId: actor.id, action: 'contribution.updated', entityType: 'CONTRIBUTION', entityId: id });
    return updated;
  }

  /** Soft withdrawal only (spec section 46) - never deletes review/audit history, and refuses once CATALOGUED (its canonical records are independent by then). */
  async withdraw(id: string, dto: WithdrawContributionDto, actor: Actor) {
    const contribution = await this.getOr404(id);
    if (contribution.contributorId !== actor.id) {
      throw new ForbiddenException('You can only withdraw your own contribution.');
    }
    if (contribution.status === ContributionStatus.CATALOGUED) {
      throw new BadRequestException({
        code: CONTRIBUTION_ERROR_CODES.CONTRIBUTION_NOT_EDITABLE,
        message: 'A catalogued contribution cannot be withdrawn - its canonical records already stand on their own.',
      });
    }
    if (contribution.withdrawnAt) return contribution;

    const updated = await this.prisma.contribution.update({
      where: { id },
      data: { withdrawnAt: new Date(), version: { increment: 1 } },
    });
    await this.audit.log({ actorId: actor.id, action: 'contribution.withdrawn', entityType: 'CONTRIBUTION', entityId: id, metadata: { reason: dto.reason } });
    return updated;
  }

  /** Structured provenance evidence (spec sections 9/10) - never becomes a canonical Source by itself. Owner (while editable) or any reviewer may add one. */
  async addProvenanceSource(id: string, dto: AddProvenanceSourceDto, actor: Actor) {
    const contribution = await this.getOr404(id);
    const isOwner = contribution.contributorId === actor.id;
    const isPrivileged = this.hasAnyRole(actor, REVIEWER_ROLES);
    if (!isOwner && !isPrivileged) throw new ForbiddenException('You do not have access to this contribution.');
    if (isOwner && !isPrivileged && !this.isEditable(contribution)) {
      throw new BadRequestException({
        code: CONTRIBUTION_ERROR_CODES.CONTRIBUTION_NOT_EDITABLE,
        message: `Contribution is not editable in its current state (${contribution.status}).`,
      });
    }
    if (dto.evidenceMediaAssetId) {
      await this.media.assertOwnedByOrPrivileged(dto.evidenceMediaAssetId, actor);
    }

    const created = await this.prisma.contributionSource.create({ data: { contributionId: id, ...dto } });
    await this.audit.log({ actorId: actor.id, action: 'contribution.provenanceSource.added', entityType: 'CONTRIBUTION', entityId: id, metadata: { referenceType: dto.referenceType } });
    return created;
  }

  // ---------------------------------------------------------------------
  // reviewer/admin queue
  // ---------------------------------------------------------------------

  async queue(filters: ContributionQueueQueryDto) {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const where: Prisma.ContributionWhereInput = {
      status: filters.status,
      type: filters.type,
      sensitivity: filters.sensitivity,
      contributorId: filters.submitterId,
      correctionTargetType: filters.correctionTargetType,
      createdAt: filters.from || filters.to ? { gte: filters.from ? new Date(filters.from) : undefined, lte: filters.to ? new Date(filters.to) : undefined } : undefined,
      reviewNotes: filters.reviewerId ? { some: { reviewerId: filters.reviewerId } } : undefined,
    };

    const [total, items] = await Promise.all([
      this.prisma.contribution.count({ where }),
      this.prisma.contribution.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { contributor: { select: { id: true, displayName: true } } },
      }),
    ]);

    return { items, total, page, pageSize };
  }

  /** Full reviewer/admin detail (spec section 48) - includes review history, provenance evidence, catalogue results. Never publicly reachable (route-gated). */
  async getAdminDetail(id: string) {
    const contribution = await this.prisma.contribution.findUnique({
      where: { id },
      include: {
        media: { include: { mediaAsset: true } },
        reviewNotes: { orderBy: { createdAt: 'asc' }, include: { reviewer: { select: { id: true, displayName: true } } } },
        provenanceEvidence: true,
        catalogueResults: true,
        contributor: { select: { id: true, displayName: true, email: true } },
      },
    });
    if (!contribution) throw new NotFoundException({ code: CONTRIBUTION_ERROR_CODES.CONTRIBUTION_NOT_FOUND, message: 'Contribution not found.' });
    return contribution;
  }

  // ---------------------------------------------------------------------
  // review workflow
  // ---------------------------------------------------------------------

  /**
   * The single review-action entrypoint (spec sections 27/49) - the server
   * decides the resulting status from `decision` + role + current stage;
   * the client never supplies an arbitrary next status directly. Self-
   * review is refused for every decision kind, not just APPROVE (spec
   * section 25 - "the submitter cannot be sole reviewer").
   */
  async submitReview(id: string, reviewer: Actor, dto: SubmitContributionReviewDto) {
    const contribution = await this.getOr404(id);
    this.assertVersion(contribution, dto.expectedVersion);
    this.assertNotSelfReview(contribution, reviewer);
    if (contribution.withdrawnAt) {
      throw new BadRequestException({ code: CONTRIBUTION_ERROR_CODES.CONTRIBUTION_NOT_EDITABLE, message: 'This contribution has been withdrawn.' });
    }

    let nextStatus: ContributionStatus = contribution.status;
    let needsInfo = contribution.needsInfo;
    let rejectionPatch: Prisma.ContributionUpdateInput = {};

    switch (dto.decision) {
      case 'APPROVE': {
        const allowedRoles = STAGE_COMPLETION_ROLES[contribution.status];
        const forward = FORWARD[contribution.status];
        if (!allowedRoles || !forward) {
          throw new BadRequestException({
            code: CONTRIBUTION_ERROR_CODES.CONTRIBUTION_INVALID_TRANSITION,
            message: `Cannot approve a contribution out of status ${contribution.status}.`,
          });
        }
        if (!this.hasAnyRole(reviewer, allowedRoles)) {
          throw new ForbiddenException({
            code: CONTRIBUTION_ERROR_CODES.CONTRIBUTION_REVIEW_REQUIRED,
            message: `Completing ${contribution.status} requires one of: ${allowedRoles.join(', ')}.`,
          });
        }
        nextStatus = forward;
        needsInfo = false;
        break;
      }
      case 'REJECT': {
        if (!this.hasAnyRole(reviewer, REVIEWER_ROLES)) {
          throw new ForbiddenException({ code: CONTRIBUTION_ERROR_CODES.CONTRIBUTION_REVIEW_REQUIRED, message: `Rejecting requires one of: ${REVIEWER_ROLES.join(', ')}.` });
        }
        if (!dto.notes) throw new BadRequestException('A rejection requires a documented reason (notes).');
        nextStatus = ContributionStatus.REJECTED;
        needsInfo = false;
        rejectionPatch = { rejectionReason: dto.notes, rejectedById: reviewer.id, rejectedAt: new Date() };
        break;
      }
      case 'REQUEST_INFO': {
        if (!this.hasAnyRole(reviewer, REVIEWER_ROLES)) {
          throw new ForbiddenException({ code: CONTRIBUTION_ERROR_CODES.CONTRIBUTION_REVIEW_REQUIRED, message: `Requesting info requires one of: ${REVIEWER_ROLES.join(', ')}.` });
        }
        needsInfo = true; // status is unchanged - spec section 23
        break;
      }
      case 'RETURN_TO_PREVIOUS_STAGE': {
        if (!this.hasAnyRole(reviewer, REVIEWER_ROLES)) {
          throw new ForbiddenException({ code: CONTRIBUTION_ERROR_CODES.CONTRIBUTION_REVIEW_REQUIRED, message: `Returning to a previous stage requires one of: ${REVIEWER_ROLES.join(', ')}.` });
        }
        const backward = BACKWARD[contribution.status];
        if (!backward) {
          throw new BadRequestException({ code: CONTRIBUTION_ERROR_CODES.CONTRIBUTION_INVALID_TRANSITION, message: `Cannot return a contribution from status ${contribution.status}.` });
        }
        if (!dto.notes) throw new BadRequestException('Returning a contribution to a previous stage requires a documented reason (notes).');
        nextStatus = backward;
        needsInfo = false;
        break;
      }
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.contribution.update({
        where: { id },
        data: { status: nextStatus, needsInfo, version: { increment: 1 }, lastReviewedById: reviewer.id, lastReviewedAt: new Date(), ...rejectionPatch },
      }),
      this.prisma.contributionReviewNote.create({
        data: { contributionId: id, reviewerId: reviewer.id, stage: contribution.status, decision: dto.decision, note: dto.notes ?? '' },
      }),
    ]);

    await this.audit.log({
      actorId: reviewer.id,
      action: 'contribution.reviewed',
      entityType: 'CONTRIBUTION',
      entityId: id,
      metadata: { decision: dto.decision, fromStatus: contribution.status, toStatus: nextStatus },
    });
    return updated;
  }

  /** Reviewer-only, never the submitter (spec section 12/72) - entirely separate from `submitterDeclaration`. */
  async setRightsReview(id: string, reviewer: Actor, dto: SetRightsReviewDto) {
    const contribution = await this.getOr404(id);
    this.assertVersion(contribution, dto.expectedVersion);
    this.assertNotSelfReview(contribution, reviewer);

    const updated = await this.prisma.contribution.update({
      where: { id },
      data: { rightsReviewState: dto.rightsReviewState, version: { increment: 1 }, lastReviewedById: reviewer.id, lastReviewedAt: new Date() },
    });
    await this.audit.log({ actorId: reviewer.id, action: 'contribution.rightsReview.set', entityType: 'CONTRIBUTION', entityId: id, metadata: { rightsReviewState: dto.rightsReviewState, notes: dto.notes } });
    return updated;
  }

  /** Reviewer-only assessment (spec section 11) - never historical certainty, never derived from submitter input. */
  async setProvenanceConfidence(id: string, reviewer: Actor, dto: SetProvenanceConfidenceDto) {
    const contribution = await this.getOr404(id);
    this.assertVersion(contribution, dto.expectedVersion);
    this.assertNotSelfReview(contribution, reviewer);

    const updated = await this.prisma.contribution.update({
      where: { id },
      data: { provenanceConfidence: dto.provenanceConfidence, version: { increment: 1 }, lastReviewedById: reviewer.id, lastReviewedAt: new Date() },
    });
    await this.audit.log({ actorId: reviewer.id, action: 'contribution.provenanceConfidence.set', entityType: 'CONTRIBUTION', entityId: id, metadata: { provenanceConfidence: dto.provenanceConfidence, notes: dto.notes } });
    return updated;
  }

  /** Workflow-control sensitivity, same semantics as HistoricalFact.sensitivity (spec section 40) - never a special-cased place/topic check. */
  async setSensitivity(id: string, reviewer: Actor, dto: SetSensitivityDto) {
    const contribution = await this.getOr404(id);
    this.assertVersion(contribution, dto.expectedVersion);
    this.assertNotSelfReview(contribution, reviewer);

    const updated = await this.prisma.contribution.update({
      where: { id },
      data: { sensitivity: dto.sensitivity, version: { increment: 1 }, lastReviewedById: reviewer.id, lastReviewedAt: new Date() },
    });
    await this.audit.log({ actorId: reviewer.id, action: 'contribution.sensitivity.set', entityType: 'CONTRIBUTION', entityId: id, metadata: { sensitivity: dto.sensitivity, notes: dto.notes } });
    return updated;
  }

  // ---------------------------------------------------------------------
  // cataloguing (spec sections 28-39, 50-52)
  // ---------------------------------------------------------------------

  private assertCatalogueAllowed(contribution: ContributionRow) {
    if (contribution.status !== ContributionStatus.ACCEPTED && contribution.status !== ContributionStatus.CATALOGUED) {
      throw new BadRequestException({
        code: CONTRIBUTION_ERROR_CODES.CONTRIBUTION_CATALOGUE_NOT_ALLOWED,
        message: `Only an ACCEPTED (or already-CATALOGUED) contribution can be catalogued (current: ${contribution.status}).`,
      });
    }
    if (contribution.rightsReviewState !== ContributionRightsReviewState.APPROVED_FOR_CATALOGUE) {
      throw new BadRequestException({
        code: CONTRIBUTION_ERROR_CODES.CONTRIBUTION_RIGHTS_INCOMPLETE,
        message: 'Rights review must be APPROVED_FOR_CATALOGUE before any catalogue action.',
      });
    }
  }

  /** Marks the contribution CATALOGUED the first time any catalogue result lands - never regresses an already-CATALOGUED contribution. */
  private async markCataloguedIfNeeded(tx: Prisma.TransactionClient, contribution: ContributionRow) {
    if (contribution.status === ContributionStatus.ACCEPTED) {
      await tx.contribution.update({ where: { id: contribution.id }, data: { status: ContributionStatus.CATALOGUED, version: { increment: 1 } } });
    }
  }

  /**
   * Promotes a contribution's provenance into a canonical Source (spec
   * section 30). Reuses SourcesService's own dedup (ISBN/ISSN) and audit
   * logging - never blindly copies every submitter-supplied field, and
   * `credibilityLevel` is always the reviewer's own explicit input on
   * `CatalogueSourceDto`, never anything read off the Contribution/
   * ContributionSource rows (test #30). Idempotent (spec section 52): a
   * second call for the same contribution returns the existing result
   * instead of creating a duplicate Source.
   */
  async catalogueSource(id: string, reviewer: Actor, dto: CatalogueSourceDto) {
    const contribution = await this.getOr404(id);
    this.assertVersion(contribution, dto.expectedVersion);
    this.assertNotSelfReview(contribution, reviewer);
    if (!this.hasAnyRole(reviewer, CATALOGUE_ROLES)) {
      throw new ForbiddenException({ code: CONTRIBUTION_ERROR_CODES.CONTRIBUTION_REVIEW_REQUIRED, message: `Cataloguing requires one of: ${CATALOGUE_ROLES.join(', ')}.` });
    }
    this.assertCatalogueAllowed(contribution);

    const existing = await this.prisma.contributionCatalogueResult.findFirst({ where: { contributionId: id, resultType: 'SOURCE' } });
    if (existing) return existing;

    // Only real Source fields are forwarded - `expectedVersion`/`notes` are
    // this action's own concurrency guard and review comment, never part of
    // the canonical bibliographic record.
    const sourceFields = {
      sourceType: dto.sourceType,
      title: dto.title,
      author: dto.author,
      organization: dto.organization,
      publisher: dto.publisher,
      publicationYear: dto.publicationYear,
      isbn: dto.isbn,
      issn: dto.issn,
      archiveName: dto.archiveName,
      archiveCode: dto.archiveCode,
      originalLanguage: dto.originalLanguage,
      url: dto.url,
      credibilityLevel: dto.credibilityLevel,
    };

    const result = await this.prisma.$transaction(async (tx) => {
      const source = await this.sources.create(sourceFields as any, reviewer.id, tx);
      const catalogueResult = await tx.contributionCatalogueResult.create({
        data: { contributionId: id, resultType: 'SOURCE', sourceId: source.id, createdById: reviewer.id },
      });
      await this.markCataloguedIfNeeded(tx, contribution);
      return catalogueResult;
    });

    await this.audit.log({ actorId: reviewer.id, action: 'contribution.catalogued.source', entityType: 'CONTRIBUTION', entityId: id, metadata: { sourceId: result.sourceId } });
    return result;
  }

  /**
   * A SourceDocument may only be created after this contribution already
   * has a catalogued Source (spec section 33) - never a bare mediaAssetId
   * with no Source to attach to. Defaults to METADATA_ONLY, same as
   * `SourcesService.addDocument`, so an unknown-rights contributed document
   * is never defaulted to PUBLIC (spec section 63). Idempotent per
   * mediaAssetId.
   */
  async catalogueDocument(id: string, reviewer: Actor, dto: CatalogueDocumentDto) {
    const contribution = await this.getOr404(id);
    this.assertVersion(contribution, dto.expectedVersion);
    this.assertNotSelfReview(contribution, reviewer);
    if (!this.hasAnyRole(reviewer, CATALOGUE_ROLES)) {
      throw new ForbiddenException({ code: CONTRIBUTION_ERROR_CODES.CONTRIBUTION_REVIEW_REQUIRED, message: `Cataloguing requires one of: ${CATALOGUE_ROLES.join(', ')}.` });
    }
    this.assertCatalogueAllowed(contribution);

    const sourceResult = await this.prisma.contributionCatalogueResult.findFirst({ where: { contributionId: id, resultType: 'SOURCE' } });
    if (!sourceResult?.sourceId) {
      throw new BadRequestException({
        code: CONTRIBUTION_ERROR_CODES.CONTRIBUTION_CATALOGUE_NOT_ALLOWED,
        message: 'A SourceDocument can only be catalogued after this contribution already has a catalogued Source.',
      });
    }

    const existing = await this.prisma.contributionCatalogueResult.findFirst({ where: { contributionId: id, resultType: 'SOURCE_DOCUMENT', mediaAssetId: dto.mediaAssetId } });
    if (existing) return existing;

    await this.media.assertOwnedByOrPrivileged(dto.mediaAssetId, reviewer);

    const docFields = {
      mediaAssetId: dto.mediaAssetId,
      pageCount: dto.pageCount,
      usageRights: dto.usageRights,
      rightsHolder: dto.rightsHolder,
      accessPolicy: dto.accessPolicy,
    };
    const result = await this.prisma.$transaction(async (tx) => {
      const doc = await this.sources.addDocument(sourceResult.sourceId as string, docFields as any, reviewer.id, tx);
      const catalogueResult = await tx.contributionCatalogueResult.create({
        data: { contributionId: id, resultType: 'SOURCE_DOCUMENT', sourceId: sourceResult.sourceId, sourceDocumentId: doc.id, mediaAssetId: dto.mediaAssetId, createdById: reviewer.id },
      });
      await this.markCataloguedIfNeeded(tx, contribution);
      return catalogueResult;
    });

    await this.audit.log({ actorId: reviewer.id, action: 'contribution.catalogued.document', entityType: 'CONTRIBUTION', entityId: id, metadata: { sourceDocumentId: result.sourceDocumentId } });
    return result;
  }

  /**
   * Promotes a contribution's already-attached MediaAsset (spec sections
   * 34-36) - e.g. a plain PHOTO to ARCHIVAL_PHOTO, optionally linked to the
   * Source already catalogued for this contribution. Refuses a media id not
   * attached to this contribution (spec section 14). Promoting to MAP never
   * creates TerritoryGeometry - `MediaService.promote` only ever touches
   * MediaAsset columns (see `schema-graph.spec.ts`). Idempotent per
   * mediaAssetId.
   */
  async catalogueMedia(id: string, reviewer: Actor, dto: CatalogueMediaDto) {
    const contribution = await this.getOr404(id);
    this.assertVersion(contribution, dto.expectedVersion);
    this.assertNotSelfReview(contribution, reviewer);
    if (!this.hasAnyRole(reviewer, CATALOGUE_ROLES)) {
      throw new ForbiddenException({ code: CONTRIBUTION_ERROR_CODES.CONTRIBUTION_REVIEW_REQUIRED, message: `Cataloguing requires one of: ${CATALOGUE_ROLES.join(', ')}.` });
    }
    this.assertCatalogueAllowed(contribution);

    const attached = await this.prisma.contributionMedia.findUnique({ where: { contributionId_mediaAssetId: { contributionId: id, mediaAssetId: dto.mediaAssetId } } });
    if (!attached) {
      throw new BadRequestException({
        code: CONTRIBUTION_ERROR_CODES.CONTRIBUTION_MEDIA_NOT_OWNED,
        message: 'This media asset is not attached to this contribution.',
      });
    }

    const existing = await this.prisma.contributionCatalogueResult.findFirst({ where: { contributionId: id, resultType: 'MEDIA_ASSET', mediaAssetId: dto.mediaAssetId } });
    if (existing) return existing;

    let sourceId: string | undefined;
    if (dto.linkToCataloguedSource) {
      const sourceResult = await this.prisma.contributionCatalogueResult.findFirst({ where: { contributionId: id, resultType: 'SOURCE' } });
      sourceId = sourceResult?.sourceId ?? undefined;
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await this.media.promote(dto.mediaAssetId, { type: dto.promoteToType, sourceId }, reviewer.id, tx);
      const catalogueResult = await tx.contributionCatalogueResult.create({
        data: { contributionId: id, resultType: 'MEDIA_ASSET', mediaAssetId: dto.mediaAssetId, sourceId, createdById: reviewer.id },
      });
      await this.markCataloguedIfNeeded(tx, contribution);
      return catalogueResult;
    });

    await this.audit.log({ actorId: reviewer.id, action: 'contribution.catalogued.media', entityType: 'CONTRIBUTION', entityId: id, metadata: { mediaAssetId: dto.mediaAssetId, promoteToType: dto.promoteToType } });
    return result;
  }
}
