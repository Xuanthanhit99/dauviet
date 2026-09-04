import { BadRequestException, ConflictException } from '@nestjs/common';
import { CitationsService } from './citations.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/** Covers spec section 57 test #2: a citation cannot reference a nonexistent source (or fact). */
describe('CitationsService.create', () => {
  let prisma: {
    historicalFact: { findUnique: jest.Mock };
    source: { findUnique: jest.Mock };
    citation: { create: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
  };
  let audit: { log: jest.Mock };
  let service: CitationsService;

  beforeEach(() => {
    prisma = {
      historicalFact: { findUnique: jest.fn() },
      source: { findUnique: jest.fn() },
      citation: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    };
    audit = { log: jest.fn() };
    service = new CitationsService(prisma as unknown as PrismaService, audit as unknown as AuditService);
  });

  it('rejects a citation referencing a nonexistent source', async () => {
    prisma.historicalFact.findUnique.mockResolvedValue({ id: 'fact-1' });
    prisma.source.findUnique.mockResolvedValue(null);

    await expect(service.create({ factId: 'fact-1', sourceId: 'missing-source' }, 'user-1')).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.citation.create).not.toHaveBeenCalled();
  });

  it('rejects a citation referencing a nonexistent fact', async () => {
    prisma.historicalFact.findUnique.mockResolvedValue(null);
    prisma.source.findUnique.mockResolvedValue({ id: 'source-1' });

    await expect(service.create({ factId: 'missing-fact', sourceId: 'source-1' }, 'user-1')).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.citation.create).not.toHaveBeenCalled();
  });

  it('creates a citation when both fact and source exist', async () => {
    prisma.historicalFact.findUnique.mockResolvedValue({ id: 'fact-1' });
    prisma.source.findUnique.mockResolvedValue({ id: 'source-1' });
    prisma.citation.create.mockResolvedValue({ id: 'citation-1', factId: 'fact-1', sourceId: 'source-1' });

    const result = await service.create({ factId: 'fact-1', sourceId: 'source-1' }, 'user-1');
    expect(result.id).toBe('citation-1');
  });

  it('refuses to cite an archived source', async () => {
    prisma.historicalFact.findUnique.mockResolvedValue({ id: 'fact-1' });
    prisma.source.findUnique.mockResolvedValue({ id: 'source-1', archivedAt: new Date() });

    await expect(service.create({ factId: 'fact-1', sourceId: 'source-1' }, 'user-1')).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.citation.create).not.toHaveBeenCalled();
  });
});

describe('CitationsService.verify/reject', () => {
  let prisma: {
    citation: { findUnique: jest.Mock; update: jest.Mock };
  };
  let audit: { log: jest.Mock };
  let service: CitationsService;

  beforeEach(() => {
    prisma = { citation: { findUnique: jest.fn(), update: jest.fn() } };
    audit = { log: jest.fn() };
    service = new CitationsService(prisma as unknown as PrismaService, audit as unknown as AuditService);
  });

  it('refuses to re-verify an already-verified citation', async () => {
    prisma.citation.findUnique.mockResolvedValue({ id: 'c1', factId: 'fact-1', verificationState: 'VERIFIED' });

    await expect(service.verify('c1', 'reviewer-1')).rejects.toThrow(ConflictException);
    expect(prisma.citation.update).not.toHaveBeenCalled();
  });

  it('verifies an unverified citation', async () => {
    prisma.citation.findUnique.mockResolvedValue({ id: 'c1', factId: 'fact-1', verificationState: 'UNVERIFIED' });
    prisma.citation.update.mockResolvedValue({ id: 'c1', verificationState: 'VERIFIED' });

    const result = await service.verify('c1', 'reviewer-1');
    expect(result.verificationState).toBe('VERIFIED');
  });

  it('rejects a citation that does not support the claim, distinct from disputing it', async () => {
    prisma.citation.findUnique.mockResolvedValue({ id: 'c1', factId: 'fact-1', verificationState: 'UNVERIFIED' });
    prisma.citation.update.mockResolvedValue({ id: 'c1', verificationState: 'REJECTED' });

    const result = await service.reject('c1', 'reviewer-1', 'Page does not mention this claim.');
    expect(result.verificationState).toBe('REJECTED');
    expect(prisma.citation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { verificationState: 'REJECTED' } }),
    );
  });
});
