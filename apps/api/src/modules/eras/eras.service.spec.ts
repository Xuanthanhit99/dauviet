import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ErasService } from './eras.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * Covers spec section 14/39 test #11: an era can never become its own
 * ancestor, whether directly (parent = self) or through a deeper cycle
 * introduced by re-parenting an existing era.
 */
describe('ErasService cycle prevention', () => {
  let prisma: {
    historicalEra: { findUnique: jest.Mock; update: jest.Mock };
  };
  let audit: { log: jest.Mock };
  let service: ErasService;

  beforeEach(() => {
    prisma = {
      historicalEra: { findUnique: jest.fn(), update: jest.fn() },
    };
    audit = { log: jest.fn() };
    service = new ErasService(prisma as unknown as PrismaService, audit as unknown as AuditService);
  });

  it('rejects an era being set as its own parent', async () => {
    prisma.historicalEra.findUnique.mockResolvedValueOnce({ id: 'era-a' });

    await expect(service.setParent('era-a', 'era-a', 'actor-1')).rejects.toThrow(BadRequestException);
    expect(prisma.historicalEra.update).not.toHaveBeenCalled();
  });

  it('rejects a deeper cycle: A -> B -> C, then trying to set C as parent of A', async () => {
    // era-a exists (the one being edited)
    prisma.historicalEra.findUnique.mockImplementation(({ where, select }: { where: { id: string }; select?: unknown }) => {
      if (!select) {
        // existence check for the era being edited
        return Promise.resolve({ id: where.id });
      }
      // ancestor-walk lookups (select: { parentEraId: true })
      const chain: Record<string, string | null> = { 'era-c': 'era-b', 'era-b': 'era-a', 'era-a': null };
      return Promise.resolve({ parentEraId: chain[where.id] ?? null });
    });

    // era-a -> era-b -> era-c already; setting era-c's parent to era-a would cycle back to era-a
    await expect(service.setParent('era-a', 'era-c', 'actor-1')).rejects.toThrow(BadRequestException);
    expect(prisma.historicalEra.update).not.toHaveBeenCalled();
  });

  it('allows a valid, acyclic re-parent', async () => {
    prisma.historicalEra.findUnique.mockImplementation(({ where, select }: { where: { id: string }; select?: unknown }) => {
      if (!select) return Promise.resolve({ id: where.id });
      const chain: Record<string, string | null> = { 'era-root': null };
      return Promise.resolve({ parentEraId: chain[where.id] ?? null });
    });
    prisma.historicalEra.update.mockResolvedValue({ id: 'era-x', parentEraId: 'era-root' });

    const result = await service.setParent('era-x', 'era-root', 'actor-1');
    expect(result.parentEraId).toBe('era-root');
  });

  it('404s when the era being edited does not exist', async () => {
    prisma.historicalEra.findUnique.mockResolvedValueOnce(null);
    await expect(service.setParent('missing', 'era-root', 'actor-1')).rejects.toThrow(NotFoundException);
  });
});
