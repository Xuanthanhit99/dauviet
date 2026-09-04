import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { FactCertainty, FactEditorialStatus, FactSensitivity, FactType, ReviewDecision } from '@prisma/client';
import { FactsService } from './facts.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * Covers spec section 57 tests #1, #3, and #9: a fact cannot publish without
 * a verified citation, a sensitive fact cannot be self-approved by its own
 * creator even if that creator holds a reviewer role, and every transition
 * leaves a FactReview + Revision history trail rather than silently
 * mutating the record.
 */
describe('FactsService.setEditorialStatus', () => {
  let prisma: {
    historicalFact: { findUnique: jest.Mock; update: jest.Mock };
    revision: { create: jest.Mock };
    factReview: { create: jest.Mock; findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let audit: { log: jest.Mock };
  let service: FactsService;

  const baseFact = {
    id: 'fact-1',
    factType: FactType.EVENT_DETAIL,
    certainty: FactCertainty.HIGH_CONFIDENCE,
    sensitivity: FactSensitivity.NORMAL,
    editorialStatus: FactEditorialStatus.READY,
    createdById: 'creator-1',
    translations: [{ id: 't1', locale: 'vi', statement: 'Statement' }],
    citations: [] as { verificationState: string }[],
    placeLinks: [],
    personLinks: [],
    eventLinks: [],
    eraLinks: [],
    territoryLinks: [],
  };

  beforeEach(() => {
    prisma = {
      historicalFact: { findUnique: jest.fn(), update: jest.fn() },
      revision: { create: jest.fn() },
      factReview: { create: jest.fn(), findMany: jest.fn() },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
    };
    audit = { log: jest.fn() };
    service = new FactsService(prisma as unknown as PrismaService, audit as unknown as AuditService);
  });

  it('refuses to publish a fact with no verified citation', async () => {
    prisma.historicalFact.findUnique.mockResolvedValue({ ...baseFact, citations: [] });

    await expect(
      service.setEditorialStatus('fact-1', FactEditorialStatus.PUBLISHED, {
        id: 'editor-1',
        email: 'editor@dauviet.vn',
        roles: ['EDITOR'],
      }),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.historicalFact.update).not.toHaveBeenCalled();
  });

  it('publishes once at least one citation is VERIFIED', async () => {
    prisma.historicalFact.findUnique
      .mockResolvedValueOnce({ ...baseFact, citations: [{ verificationState: 'VERIFIED' }] })
      .mockResolvedValueOnce({ ...baseFact, citations: [{ verificationState: 'VERIFIED' }] });
    prisma.historicalFact.update.mockResolvedValue({ ...baseFact, editorialStatus: FactEditorialStatus.PUBLISHED });

    const result = await service.setEditorialStatus('fact-1', FactEditorialStatus.PUBLISHED, {
      id: 'editor-1',
      email: 'editor@dauviet.vn',
      roles: ['EDITOR'],
    });

    expect(prisma.historicalFact.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ editorialStatus: FactEditorialStatus.PUBLISHED, reviewedById: 'editor-1' }),
      }),
    );
    expect(result.editorialStatus).toBe(FactEditorialStatus.PUBLISHED);
  });

  it('blocks a sensitive fact from being self-approved by its creator', async () => {
    prisma.historicalFact.findUnique.mockResolvedValue({
      ...baseFact,
      sensitivity: FactSensitivity.TERRITORIAL,
      citations: [{ verificationState: 'VERIFIED' }],
    });

    await expect(
      service.setEditorialStatus('fact-1', FactEditorialStatus.PUBLISHED, {
        id: 'creator-1',
        email: 'creator@dauviet.vn',
        roles: ['HISTORIAN_REVIEWER'],
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.historicalFact.update).not.toHaveBeenCalled();
  });

  it('requires a HISTORIAN_REVIEWER/ADMIN role to publish a sensitive fact even by a different user', async () => {
    prisma.historicalFact.findUnique.mockResolvedValue({
      ...baseFact,
      sensitivity: FactSensitivity.HIGH,
      citations: [{ verificationState: 'VERIFIED' }],
    });

    await expect(
      service.setEditorialStatus('fact-1', FactEditorialStatus.PUBLISHED, {
        id: 'editor-2',
        email: 'editor2@dauviet.vn',
        roles: ['EDITOR'],
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows a different reviewer to publish a sensitive fact', async () => {
    prisma.historicalFact.findUnique
      .mockResolvedValueOnce({
        ...baseFact,
        sensitivity: FactSensitivity.TERRITORIAL,
        citations: [{ verificationState: 'VERIFIED' }],
      })
      .mockResolvedValueOnce({
        ...baseFact,
        sensitivity: FactSensitivity.TERRITORIAL,
        citations: [{ verificationState: 'VERIFIED' }],
      });
    prisma.historicalFact.update.mockResolvedValue({ ...baseFact, editorialStatus: FactEditorialStatus.PUBLISHED });

    await expect(
      service.setEditorialStatus('fact-1', FactEditorialStatus.PUBLISHED, {
        id: 'reviewer-1',
        email: 'reviewer@dauviet.vn',
        roles: ['HISTORIAN_REVIEWER'],
      }),
    ).resolves.toBeDefined();
  });

  it('rejects an invalid state transition', async () => {
    prisma.historicalFact.findUnique.mockResolvedValue({ ...baseFact, editorialStatus: FactEditorialStatus.DRAFT });

    await expect(
      service.setEditorialStatus('fact-1', FactEditorialStatus.PUBLISHED, {
        id: 'editor-1',
        email: 'editor@dauviet.vn',
        roles: ['EDITOR'],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('records a FactReview alongside every successful transition (full history, not just the latest reviewer)', async () => {
    prisma.historicalFact.findUnique
      .mockResolvedValueOnce({ ...baseFact, citations: [{ verificationState: 'VERIFIED' }] })
      .mockResolvedValueOnce({ ...baseFact, citations: [{ verificationState: 'VERIFIED' }] });
    prisma.historicalFact.update.mockResolvedValue({ ...baseFact, editorialStatus: FactEditorialStatus.PUBLISHED });

    await service.setEditorialStatus('fact-1', FactEditorialStatus.PUBLISHED, {
      id: 'editor-1',
      email: 'editor@dauviet.vn',
      roles: ['EDITOR'],
    });

    expect(prisma.factReview.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          factId: 'fact-1',
          reviewerId: 'editor-1',
          stage: FactEditorialStatus.READY,
          decision: ReviewDecision.APPROVED,
        }),
      }),
    );
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('requires a documented reason to send an in-progress fact back to DRAFT', async () => {
    prisma.historicalFact.findUnique.mockResolvedValue({ ...baseFact, editorialStatus: FactEditorialStatus.EDITORIAL_REVIEW });

    await expect(
      service.setEditorialStatus('fact-1', FactEditorialStatus.DRAFT, {
        id: 'editor-1',
        email: 'editor@dauviet.vn',
        roles: ['EDITOR'],
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.historicalFact.update).not.toHaveBeenCalled();
  });

  it('accepts a documented reason when sending a fact back to DRAFT', async () => {
    prisma.historicalFact.findUnique
      .mockResolvedValueOnce({ ...baseFact, editorialStatus: FactEditorialStatus.EDITORIAL_REVIEW })
      .mockResolvedValueOnce({ ...baseFact, editorialStatus: FactEditorialStatus.EDITORIAL_REVIEW });
    prisma.historicalFact.update.mockResolvedValue({ ...baseFact, editorialStatus: FactEditorialStatus.DRAFT });

    await expect(
      service.setEditorialStatus(
        'fact-1',
        FactEditorialStatus.DRAFT,
        { id: 'editor-1', email: 'editor@dauviet.vn', roles: ['EDITOR'] },
        { notes: 'Statement is unsupported by the cited page.' },
      ),
    ).resolves.toBeDefined();
    expect(prisma.factReview.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ decision: ReviewDecision.REJECTED }) }),
    );
  });

  it('completing FACT_REVIEW requires a historian reviewer or admin, not any editor', async () => {
    prisma.historicalFact.findUnique.mockResolvedValue({ ...baseFact, editorialStatus: FactEditorialStatus.FACT_REVIEW });

    await expect(
      service.setEditorialStatus('fact-1', FactEditorialStatus.EDITORIAL_REVIEW, {
        id: 'editor-1',
        email: 'editor@dauviet.vn',
        roles: ['EDITOR'],
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.historicalFact.update).not.toHaveBeenCalled();
  });

  it('retracts a published fact only for a reviewer with a documented reason', async () => {
    const published = { ...baseFact, editorialStatus: FactEditorialStatus.PUBLISHED, citations: [{ verificationState: 'VERIFIED' }] };
    prisma.historicalFact.findUnique.mockResolvedValue(published);

    await expect(
      service.setEditorialStatus('fact-1', FactEditorialStatus.RETRACTED, {
        id: 'editor-1',
        email: 'editor@dauviet.vn',
        roles: ['EDITOR'],
      }),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      service.setEditorialStatus(
        'fact-1',
        FactEditorialStatus.RETRACTED,
        { id: 'reviewer-1', email: 'reviewer@dauviet.vn', roles: ['HISTORIAN_REVIEWER'] },
      ),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.historicalFact.update).not.toHaveBeenCalled();
  });

  it('allows a reviewer to retract a published fact when a reason is given', async () => {
    const published = { ...baseFact, editorialStatus: FactEditorialStatus.PUBLISHED, citations: [{ verificationState: 'VERIFIED' }] };
    prisma.historicalFact.findUnique.mockResolvedValueOnce(published).mockResolvedValueOnce(published);
    prisma.historicalFact.update.mockResolvedValue({ ...published, editorialStatus: FactEditorialStatus.RETRACTED });

    await expect(
      service.setEditorialStatus(
        'fact-1',
        FactEditorialStatus.RETRACTED,
        { id: 'reviewer-1', email: 'reviewer@dauviet.vn', roles: ['HISTORIAN_REVIEWER'] },
        { notes: 'New archival evidence contradicts this claim.' },
      ),
    ).resolves.toBeDefined();
    expect(prisma.factReview.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ decision: ReviewDecision.REJECTED, stage: FactEditorialStatus.PUBLISHED }) }),
    );
  });

  it('retains full review history via listReviews', async () => {
    prisma.historicalFact.findUnique.mockResolvedValue({ ...baseFact });
    const rows = [{ id: 'r1' }, { id: 'r2' }];
    prisma.factReview.findMany.mockResolvedValue(rows);

    const result = await service.listReviews('fact-1');
    expect(result).toBe(rows);
    expect(prisma.factReview.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { factId: 'fact-1' } }),
    );
  });
});
