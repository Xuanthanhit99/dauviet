import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { FactCertainty, FactEditorialStatus, FactSensitivity, FactType } from '@prisma/client';
import { FactsService } from './facts.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * Covers spec section 57 tests #1 and #3: a fact cannot publish without a
 * verified citation, and a sensitive fact cannot be self-approved by its
 * own creator even if that creator holds a reviewer role.
 */
describe('FactsService.setEditorialStatus', () => {
  let prisma: {
    historicalFact: { findUnique: jest.Mock; update: jest.Mock };
    revision: { create: jest.Mock };
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
});
