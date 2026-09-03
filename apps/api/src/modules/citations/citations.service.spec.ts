import { BadRequestException } from '@nestjs/common';
import { CitationsService } from './citations.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/** Covers spec section 57 test #2: a citation cannot reference a nonexistent source (or fact). */
describe('CitationsService.create', () => {
  let prisma: {
    historicalFact: { findUnique: jest.Mock };
    source: { findUnique: jest.Mock };
    citation: { create: jest.Mock };
  };
  let audit: { log: jest.Mock };
  let service: CitationsService;

  beforeEach(() => {
    prisma = {
      historicalFact: { findUnique: jest.fn() },
      source: { findUnique: jest.fn() },
      citation: { create: jest.fn() },
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
});
