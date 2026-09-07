import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ContributionStatus, ContributionType, ContributionRightsReviewState } from '@prisma/client';
import { ContributionsService } from './contributions.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MediaService } from '../media/media.service';
import { SourcesService } from '../sources/sources.service';

/** Builds a ContributionsService with minimal jest-mocked collaborators, only wiring what each test group actually touches. */
function build(overrides: { prisma?: Record<string, unknown>; media?: Record<string, unknown>; sources?: Record<string, unknown> } = {}) {
  const audit = { log: jest.fn() };
  const media = { assertOwnedByOrPrivileged: jest.fn(), promote: jest.fn(), ...overrides.media };
  const sources = { create: jest.fn(), addDocument: jest.fn(), ...overrides.sources };
  const prisma: any = {
    $transaction: jest.fn((arg: unknown) => (Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(prisma))),
    ...overrides.prisma,
  };
  const service = new ContributionsService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    media as unknown as MediaService,
    sources as unknown as SourcesService,
  );
  return { service, prisma, audit, media, sources };
}

const CONTRIBUTOR = { id: 'user-1', roles: ['USER'] };
const EDITOR = { id: 'editor-1', roles: ['EDITOR'] };
const HISTORIAN = { id: 'historian-1', roles: ['HISTORIAN_REVIEWER'] };
const ADMIN = { id: 'admin-1', roles: ['ADMIN'] };

function baseContribution(overrides: Record<string, unknown> = {}) {
  return {
    id: 'contrib-1',
    contributorId: CONTRIBUTOR.id,
    status: ContributionStatus.SUBMITTED,
    type: ContributionType.PHOTO,
    needsInfo: false,
    withdrawnAt: null,
    version: 0,
    rightsReviewState: ContributionRightsReviewState.UNREVIEWED,
    rejectionReason: null,
    rejectedById: null,
    rejectedAt: null,
    ...overrides,
  };
}

/** Covers spec section 74 tests #2-#4/#11: submitterId is server-controlled and media ownership is enforced on create. */
describe('ContributionsService.create', () => {
  it('rejects a mediaAssetId the caller does not own', async () => {
    const { service, media, prisma } = build();
    prisma.contribution = { create: jest.fn() };
    media.assertOwnedByOrPrivileged.mockRejectedValue(new ForbiddenException('You do not own this media asset.'));

    await expect(service.create({ title: 'Old photo', mediaAssetIds: ['not-mine'] } as any, CONTRIBUTOR)).rejects.toThrow(ForbiddenException);
    expect(prisma.contribution.create).not.toHaveBeenCalled();
  });

  it('creates a contribution with contributorId taken from the authenticated actor, never from the DTO', async () => {
    const { service, prisma } = build();
    prisma.contribution = { create: jest.fn().mockResolvedValue({ id: 'contrib-1' }) };

    await service.create({ title: 'Old photo' } as any, CONTRIBUTOR);
    const createArgs = prisma.contribution.create.mock.calls[0][0];
    expect(createArgs.data.contributorId).toBe(CONTRIBUTOR.id);
  });

  it('rejects a linkedEntityType outside the allowed contextual kinds', async () => {
    const { service } = build();
    await expect(
      service.create({ title: 'x', linkedEntityType: 'STORY', linkedEntityId: 's1' } as any, CONTRIBUTOR),
    ).rejects.toThrow(BadRequestException);
  });

  it('requires both correctionTargetType and correctionTargetId for a CORRECTION contribution', async () => {
    const { service } = build();
    await expect(service.create({ title: 'fix', type: ContributionType.CORRECTION } as any, CONTRIBUTOR)).rejects.toThrow(BadRequestException);
  });

  it('preserves originalLocale verbatim rather than defaulting away a supplied value', async () => {
    const { service, prisma } = build();
    prisma.contribution = { create: jest.fn().mockResolvedValue({ id: 'c1' }) };
    await service.create({ title: 'x', originalLocale: 'fr' } as any, CONTRIBUTOR);
    expect(prisma.contribution.create.mock.calls[0][0].data.originalLocale).toBe('fr');
  });
});

/** Covers spec section 74 tests #12/#13 and section 58: editability windows and the needsInfo reset. */
describe('ContributionsService.update', () => {
  it('allows an edit while SUBMITTED', async () => {
    const contribution = baseContribution();
    const { service, prisma } = build({ prisma: { contribution: { findUnique: jest.fn().mockResolvedValue(contribution), update: jest.fn().mockResolvedValue({ ...contribution, title: 'new' }) }, revision: { create: jest.fn() }, contributionMedia: { deleteMany: jest.fn(), createMany: jest.fn() } } });
    const result = await service.update('contrib-1', { title: 'new' } as any, CONTRIBUTOR);
    expect(result.title).toBe('new');
    expect(prisma.revision.create).toHaveBeenCalled();
  });

  it('refuses an edit once the contribution has moved past SUBMITTED with no pending info request', async () => {
    const contribution = baseContribution({ status: ContributionStatus.HISTORICAL_REVIEW });
    const { service } = build({ prisma: { contribution: { findUnique: jest.fn().mockResolvedValue(contribution) } } });
    await expect(service.update('contrib-1', { title: 'new' } as any, CONTRIBUTOR)).rejects.toThrow(BadRequestException);
  });

  it('allows an edit mid-review when a reviewer has requested more information (needsInfo)', async () => {
    const contribution = baseContribution({ status: ContributionStatus.PROVENANCE_REVIEW, needsInfo: true });
    const { service } = build({ prisma: { contribution: { findUnique: jest.fn().mockResolvedValue(contribution), update: jest.fn().mockResolvedValue({ ...contribution, needsInfo: false }) }, revision: { create: jest.fn() }, contributionMedia: { deleteMany: jest.fn(), createMany: jest.fn() } } });
    const result = await service.update('contrib-1', { title: 'answered' } as any, CONTRIBUTOR);
    expect(result.needsInfo).toBe(false);
  });

  it('refuses an edit from anyone but the contribution owner', async () => {
    const contribution = baseContribution();
    const { service } = build({ prisma: { contribution: { findUnique: jest.fn().mockResolvedValue(contribution) } } });
    await expect(service.update('contrib-1', { title: 'x' } as any, EDITOR)).rejects.toThrow(ForbiddenException);
  });
});

/** Covers spec section 46/74 tests #14: withdrawal preserves audit/review history and is blocked once catalogued. */
describe('ContributionsService.withdraw', () => {
  it('sets withdrawnAt without touching status', async () => {
    const contribution = baseContribution();
    const { service, audit } = build({ prisma: { contribution: { findUnique: jest.fn().mockResolvedValue(contribution), update: jest.fn().mockResolvedValue({ ...contribution, withdrawnAt: new Date() }) } } });
    const result = await service.withdraw('contrib-1', {}, CONTRIBUTOR);
    expect(result.withdrawnAt).toBeDefined();
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'contribution.withdrawn' }));
  });

  it('refuses to withdraw an already-CATALOGUED contribution', async () => {
    const contribution = baseContribution({ status: ContributionStatus.CATALOGUED });
    const { service } = build({ prisma: { contribution: { findUnique: jest.fn().mockResolvedValue(contribution) } } });
    await expect(service.withdraw('contrib-1', {}, CONTRIBUTOR)).rejects.toThrow(BadRequestException);
  });
});

/** Covers spec section 75 tests #15-#25: the centralized transition policy. */
describe('ContributionsService.submitReview', () => {
  function withStatus(status: ContributionStatus, patch: Record<string, unknown> = {}) {
    const contribution = baseContribution({ status, ...patch });
    const prisma: any = {
      contribution: { findUnique: jest.fn().mockResolvedValue(contribution), update: jest.fn().mockResolvedValue({ ...contribution }) },
      contributionReviewNote: { create: jest.fn() },
    };
    return { contribution, ...build({ prisma }) };
  }

  it('SUBMITTED -> TRIAGE is a valid APPROVE transition for an EDITOR', async () => {
    const { service } = withStatus(ContributionStatus.SUBMITTED);
    const result = await service.submitReview('contrib-1', EDITOR, { decision: 'APPROVE', expectedVersion: 0 } as any);
    expect(result).toBeDefined();
  });

  it('TRIAGE -> PROVENANCE_REVIEW is valid', async () => {
    const { service } = withStatus(ContributionStatus.TRIAGE);
    await expect(service.submitReview('contrib-1', EDITOR, { decision: 'APPROVE', expectedVersion: 0 } as any)).resolves.toBeDefined();
  });

  it('PROVENANCE_REVIEW -> HISTORICAL_REVIEW is valid', async () => {
    const { service } = withStatus(ContributionStatus.PROVENANCE_REVIEW);
    await expect(service.submitReview('contrib-1', EDITOR, { decision: 'APPROVE', expectedVersion: 0 } as any)).resolves.toBeDefined();
  });

  it('HISTORICAL_REVIEW -> ACCEPTED requires HISTORIAN_REVIEWER/ADMIN - a plain EDITOR is refused', async () => {
    const { service } = withStatus(ContributionStatus.HISTORICAL_REVIEW);
    await expect(service.submitReview('contrib-1', EDITOR, { decision: 'APPROVE', expectedVersion: 0 } as any)).rejects.toThrow(ForbiddenException);
  });

  it('HISTORICAL_REVIEW -> ACCEPTED succeeds for a HISTORIAN_REVIEWER', async () => {
    const { service } = withStatus(ContributionStatus.HISTORICAL_REVIEW);
    await expect(service.submitReview('contrib-1', HISTORIAN, { decision: 'APPROVE', expectedVersion: 0 } as any)).resolves.toBeDefined();
  });

  it('ACCEPTED cannot be advanced by APPROVE - CATALOGUED only happens through a catalogue action', async () => {
    const { service } = withStatus(ContributionStatus.ACCEPTED);
    await expect(service.submitReview('contrib-1', ADMIN, { decision: 'APPROVE', expectedVersion: 0 } as any)).rejects.toThrow(BadRequestException);
  });

  it('rejects with a documented reason moves status to REJECTED', async () => {
    const { service, prisma } = withStatus(ContributionStatus.TRIAGE);
    await service.submitReview('contrib-1', EDITOR, { decision: 'REJECT', notes: 'not in scope', expectedVersion: 0 } as any);
    expect(prisma.contribution.update.mock.calls[0][0].data.status).toBe(ContributionStatus.REJECTED);
  });

  it('rejection without a reason is refused', async () => {
    const { service } = withStatus(ContributionStatus.TRIAGE);
    await expect(service.submitReview('contrib-1', EDITOR, { decision: 'REJECT', expectedVersion: 0 } as any)).rejects.toThrow(BadRequestException);
  });

  it('the contributor cannot review their own contribution even holding a reviewer role', async () => {
    const { service } = withStatus(ContributionStatus.TRIAGE, { contributorId: EDITOR.id });
    await expect(service.submitReview('contrib-1', EDITOR, { decision: 'APPROVE', expectedVersion: 0 } as any)).rejects.toThrow(ForbiddenException);
  });

  it('a stale expectedVersion is refused with CONTRIBUTION_VERSION_CONFLICT', async () => {
    const { service } = withStatus(ContributionStatus.TRIAGE, { version: 3 });
    await expect(service.submitReview('contrib-1', EDITOR, { decision: 'APPROVE', expectedVersion: 0 } as any)).rejects.toThrow(BadRequestException);
  });

  it('REQUEST_INFO leaves status unchanged and sets needsInfo', async () => {
    const { service, prisma } = withStatus(ContributionStatus.PROVENANCE_REVIEW);
    await service.submitReview('contrib-1', EDITOR, { decision: 'REQUEST_INFO', notes: 'need more detail', expectedVersion: 0 } as any);
    const patch = prisma.contribution.update.mock.calls[0][0].data;
    expect(patch.status).toBe(ContributionStatus.PROVENANCE_REVIEW);
    expect(patch.needsInfo).toBe(true);
  });

  it('RETURN_TO_PREVIOUS_STAGE requires a documented reason', async () => {
    const { service } = withStatus(ContributionStatus.HISTORICAL_REVIEW);
    await expect(service.submitReview('contrib-1', HISTORIAN, { decision: 'RETURN_TO_PREVIOUS_STAGE', expectedVersion: 0 } as any)).rejects.toThrow(BadRequestException);
  });

  it('RETURN_TO_PREVIOUS_STAGE moves the contribution back exactly one stage', async () => {
    const { service, prisma } = withStatus(ContributionStatus.HISTORICAL_REVIEW);
    await service.submitReview('contrib-1', HISTORIAN, { decision: 'RETURN_TO_PREVIOUS_STAGE', notes: 'incomplete', expectedVersion: 0 } as any);
    expect(prisma.contribution.update.mock.calls[0][0].data.status).toBe(ContributionStatus.PROVENANCE_REVIEW);
  });

  it('every review decision appends a ContributionReviewNote - review history is never overwritten', async () => {
    const { service, prisma } = withStatus(ContributionStatus.TRIAGE);
    await service.submitReview('contrib-1', EDITOR, { decision: 'APPROVE', expectedVersion: 0 } as any);
    expect(prisma.contributionReviewNote.create).toHaveBeenCalledTimes(1);
  });
});

/** Covers spec section 12/72: rights review is reviewer-only and never self-approved. */
describe('ContributionsService.setRightsReview', () => {
  it('refuses when the actor is the contribution author', async () => {
    const contribution = baseContribution({ contributorId: EDITOR.id });
    const { service } = build({ prisma: { contribution: { findUnique: jest.fn().mockResolvedValue(contribution) } } });
    await expect(
      service.setRightsReview('contrib-1', EDITOR, { rightsReviewState: 'APPROVED_FOR_CATALOGUE', expectedVersion: 0 } as any),
    ).rejects.toThrow(ForbiddenException);
  });

  it('sets the reviewer-controlled rights state', async () => {
    const contribution = baseContribution();
    const { service } = build({
      prisma: { contribution: { findUnique: jest.fn().mockResolvedValue(contribution), update: jest.fn().mockResolvedValue({ ...contribution, rightsReviewState: 'APPROVED_FOR_CATALOGUE' }) } },
    });
    const result = await service.setRightsReview('contrib-1', EDITOR, { rightsReviewState: 'APPROVED_FOR_CATALOGUE', expectedVersion: 0 } as any);
    expect(result.rightsReviewState).toBe('APPROVED_FOR_CATALOGUE');
  });
});

/** Covers spec sections 28-30, 32, 52: cataloguing a Source is gated, idempotent, and never inherits submitter-supplied trust. */
describe('ContributionsService.catalogueSource', () => {
  function acceptedContribution(overrides: Record<string, unknown> = {}) {
    return baseContribution({ status: ContributionStatus.ACCEPTED, rightsReviewState: ContributionRightsReviewState.APPROVED_FOR_CATALOGUE, ...overrides });
  }

  it('refuses when the contribution is not ACCEPTED/CATALOGUED', async () => {
    const contribution = baseContribution({ status: ContributionStatus.HISTORICAL_REVIEW });
    const { service } = build({ prisma: { contribution: { findUnique: jest.fn().mockResolvedValue(contribution) } } });
    await expect(service.catalogueSource('contrib-1', ADMIN, { credibilityLevel: 'SECONDARY', title: 't', sourceType: 'BOOK', expectedVersion: 0 } as any)).rejects.toThrow(BadRequestException);
  });

  it('refuses when rights review is not APPROVED_FOR_CATALOGUE', async () => {
    const contribution = acceptedContribution({ rightsReviewState: ContributionRightsReviewState.UNREVIEWED });
    const { service } = build({ prisma: { contribution: { findUnique: jest.fn().mockResolvedValue(contribution) } } });
    await expect(service.catalogueSource('contrib-1', ADMIN, { credibilityLevel: 'SECONDARY', title: 't', sourceType: 'BOOK', expectedVersion: 0 } as any)).rejects.toThrow(BadRequestException);
  });

  it('refuses a plain EDITOR - cataloguing requires HISTORIAN_REVIEWER/ADMIN', async () => {
    const contribution = acceptedContribution();
    const { service } = build({ prisma: { contribution: { findUnique: jest.fn().mockResolvedValue(contribution) } } });
    await expect(service.catalogueSource('contrib-1', EDITOR, { credibilityLevel: 'SECONDARY', title: 't', sourceType: 'BOOK', expectedVersion: 0 } as any)).rejects.toThrow(ForbiddenException);
  });

  it('creates a Source using only the reviewer-supplied credibilityLevel and marks the contribution CATALOGUED', async () => {
    const contribution = acceptedContribution();
    const prisma: any = {
      contribution: { findUnique: jest.fn().mockResolvedValue(contribution), update: jest.fn() },
      contributionCatalogueResult: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'result-1', sourceId: 'source-1' }) },
    };
    const sources = { create: jest.fn().mockResolvedValue({ id: 'source-1' }) };
    const { service } = build({ prisma, sources });

    const result = await service.catalogueSource('contrib-1', ADMIN, { credibilityLevel: 'PRIMARY', title: 'A Book', sourceType: 'BOOK', expectedVersion: 0 } as any);

    expect(sources.create).toHaveBeenCalledWith(expect.objectContaining({ credibilityLevel: 'PRIMARY' }), ADMIN.id, expect.anything());
    expect(prisma.contribution.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: ContributionStatus.CATALOGUED }) }));
    expect(result.sourceId).toBe('source-1');
  });

  it('is idempotent - a second call returns the existing catalogue result without creating a second Source', async () => {
    const contribution = acceptedContribution({ status: ContributionStatus.CATALOGUED });
    const existing = { id: 'result-1', sourceId: 'source-1' };
    const prisma: any = {
      contribution: { findUnique: jest.fn().mockResolvedValue(contribution) },
      contributionCatalogueResult: { findFirst: jest.fn().mockResolvedValue(existing) },
    };
    const sources = { create: jest.fn() };
    const { service } = build({ prisma, sources });

    const result = await service.catalogueSource('contrib-1', ADMIN, { credibilityLevel: 'PRIMARY', title: 'A Book', sourceType: 'BOOK', expectedVersion: 0 } as any);
    expect(result).toBe(existing);
    expect(sources.create).not.toHaveBeenCalled();
  });

  it('refuses self-cataloguing by the contribution author', async () => {
    const contribution = acceptedContribution({ contributorId: ADMIN.id });
    const { service } = build({ prisma: { contribution: { findUnique: jest.fn().mockResolvedValue(contribution) } } });
    await expect(service.catalogueSource('contrib-1', ADMIN, { credibilityLevel: 'PRIMARY', title: 't', sourceType: 'BOOK', expectedVersion: 0 } as any)).rejects.toThrow(ForbiddenException);
  });
});

/** Covers spec section 33: a SourceDocument requires an already-catalogued Source. */
describe('ContributionsService.catalogueDocument', () => {
  it('refuses when no Source has been catalogued yet for this contribution', async () => {
    const contribution = baseContribution({ status: ContributionStatus.ACCEPTED, rightsReviewState: ContributionRightsReviewState.APPROVED_FOR_CATALOGUE });
    const prisma: any = {
      contribution: { findUnique: jest.fn().mockResolvedValue(contribution) },
      contributionCatalogueResult: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const { service } = build({ prisma });
    await expect(service.catalogueDocument('contrib-1', ADMIN, { mediaAssetId: 'm1', expectedVersion: 0 } as any)).rejects.toThrow(BadRequestException);
  });

  it('defaults accessPolicy to METADATA_ONLY, never PUBLIC, for an unknown-rights document', async () => {
    const contribution = baseContribution({ status: ContributionStatus.ACCEPTED, rightsReviewState: ContributionRightsReviewState.APPROVED_FOR_CATALOGUE });
    const sourceResult = { id: 'r1', sourceId: 'source-1' };
    const prisma: any = {
      contribution: { findUnique: jest.fn().mockResolvedValue(contribution), update: jest.fn() },
      contributionCatalogueResult: {
        findFirst: jest.fn().mockImplementation(({ where }: any) => (where.resultType === 'SOURCE' ? sourceResult : null)),
        create: jest.fn().mockResolvedValue({ id: 'r2' }),
      },
    };
    const media = { assertOwnedByOrPrivileged: jest.fn() };
    const sources = { addDocument: jest.fn().mockResolvedValue({ id: 'doc-1' }) };
    const { service } = build({ prisma, media, sources });

    await service.catalogueDocument('contrib-1', ADMIN, { mediaAssetId: 'm1', expectedVersion: 0 } as any);
    expect(sources.addDocument.mock.calls[0][1].accessPolicy).toBeUndefined();
  });
});

/** Covers spec sections 14, 34-36, 52: media promotion is scoped to attached media, never fabricates territory, and is idempotent. */
describe('ContributionsService.catalogueMedia', () => {
  const acceptedApproved = baseContribution({ status: ContributionStatus.ACCEPTED, rightsReviewState: ContributionRightsReviewState.APPROVED_FOR_CATALOGUE });

  it('refuses a mediaAssetId not attached to this contribution', async () => {
    const prisma: any = {
      contribution: { findUnique: jest.fn().mockResolvedValue(acceptedApproved) },
      contributionMedia: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const { service } = build({ prisma });
    await expect(service.catalogueMedia('contrib-1', ADMIN, { mediaAssetId: 'not-attached', expectedVersion: 0 } as any)).rejects.toThrow(BadRequestException);
  });

  it('promotes attached media type and never touches Territory (MediaService.promote only ever writes MediaAsset columns)', async () => {
    const prisma: any = {
      contribution: { findUnique: jest.fn().mockResolvedValue(acceptedApproved), update: jest.fn() },
      contributionMedia: { findUnique: jest.fn().mockResolvedValue({ contributionId: 'contrib-1', mediaAssetId: 'm1' }) },
      contributionCatalogueResult: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'r1' }) },
      territory: { update: jest.fn() },
    };
    const media = { promote: jest.fn().mockResolvedValue({}) };
    const { service } = build({ prisma, media });

    await service.catalogueMedia('contrib-1', ADMIN, { mediaAssetId: 'm1', promoteToType: 'MAP', expectedVersion: 0 } as any);
    expect(media.promote).toHaveBeenCalledWith('m1', expect.objectContaining({ type: 'MAP' }), ADMIN.id, expect.anything());
    expect(prisma.territory.update).not.toHaveBeenCalled();
  });

  it('is idempotent per mediaAssetId', async () => {
    const existing = { id: 'r1', mediaAssetId: 'm1' };
    const prisma: any = {
      contribution: { findUnique: jest.fn().mockResolvedValue(acceptedApproved) },
      contributionMedia: { findUnique: jest.fn().mockResolvedValue({ contributionId: 'contrib-1', mediaAssetId: 'm1' }) },
      contributionCatalogueResult: { findFirst: jest.fn().mockResolvedValue(existing) },
    };
    const media = { promote: jest.fn() };
    const { service } = build({ prisma, media });

    const result = await service.catalogueMedia('contrib-1', ADMIN, { mediaAssetId: 'm1', expectedVersion: 0 } as any);
    expect(result).toBe(existing);
    expect(media.promote).not.toHaveBeenCalled();
  });
});

/** Covers spec sections 9/10: provenance evidence never becomes a canonical Source by itself, and evidence media is ownership-checked. */
describe('ContributionsService.addProvenanceSource', () => {
  it('checks ownership of any attached evidence media', async () => {
    const contribution = baseContribution();
    const prisma: any = { contribution: { findUnique: jest.fn().mockResolvedValue(contribution) }, contributionSource: { create: jest.fn().mockResolvedValue({ id: 'ps-1' }) } };
    const media = { assertOwnedByOrPrivileged: jest.fn() };
    const { service } = build({ prisma, media });

    await service.addProvenanceSource('contrib-1', { referenceType: 'BOOK', evidenceMediaAssetId: 'm1' } as any, CONTRIBUTOR);
    expect(media.assertOwnedByOrPrivileged).toHaveBeenCalledWith('m1', CONTRIBUTOR);
  });

  it('refuses an unrelated user with no reviewer role', async () => {
    const contribution = baseContribution();
    const prisma: any = { contribution: { findUnique: jest.fn().mockResolvedValue(contribution) } };
    const { service } = build({ prisma });
    await expect(service.addProvenanceSource('contrib-1', { referenceType: 'BOOK' } as any, { id: 'stranger', roles: ['USER'] })).rejects.toThrow(ForbiddenException);
  });
});

describe('ContributionsService 404 handling', () => {
  it('throws NotFoundException for an unknown contribution id', async () => {
    const { service } = build({ prisma: { contribution: { findUnique: jest.fn().mockResolvedValue(null) } } });
    await expect(service.withdraw('missing', {}, CONTRIBUTOR)).rejects.toThrow(NotFoundException);
  });
});
