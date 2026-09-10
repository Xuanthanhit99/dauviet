import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PublicationStatus } from '@prisma/client';
import { DestinationCollectionsService } from './destination-collections.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('DestinationCollectionsService (G04)', () => {
  let prisma: any;
  let audit: { log: jest.Mock };
  let service: DestinationCollectionsService;

  beforeEach(() => {
    prisma = {
      country: { findUnique: jest.fn() },
      destination: { findMany: jest.fn() },
      destinationCollection: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      destinationCollectionTranslation: { upsert: jest.fn() },
      destinationCollectionMember: { deleteMany: jest.fn(), create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'm1', ...data })) },
      $transaction: jest.fn().mockImplementation((cb: any) => cb(prisma)),
    };
    audit = { log: jest.fn() };
    service = new DestinationCollectionsService(prisma as unknown as PrismaService, audit as unknown as AuditService);
  });

  it('rejects create with an unknown countryId', async () => {
    prisma.country.findUnique.mockResolvedValue(null);
    await expect(
      service.create({ countryId: 'nope', translations: [{ locale: 'vi', name: 'Ancient Capitals' }] } as any, 'actor-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('creates a cross-country collection (no countryId) fine', async () => {
    prisma.destinationCollection.findUnique.mockResolvedValue(null);
    prisma.destinationCollection.create.mockResolvedValue({ id: 'c1', canonicalSlug: 'ancient-capitals', translations: [] });
    const result = await service.create({ translations: [{ locale: 'vi', name: 'Ancient Capitals' }] } as any, 'actor-1');
    expect(result.id).toBe('c1');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'destinationCollection.created' }));
  });

  it('refuses to publish a collection with no translations', async () => {
    prisma.destinationCollection.findUnique.mockResolvedValue({ id: 'c1', translations: [] });
    await expect(service.setStatus('c1', PublicationStatus.PUBLISHED, 'actor-1')).rejects.toThrow(BadRequestException);
  });

  describe('setMembers (transactional replace)', () => {
    beforeEach(() => {
      prisma.destinationCollection.findUnique.mockResolvedValue({ id: 'c1' });
    });

    it('rejects a duplicate destinationId', async () => {
      await expect(
        service.setMembers('c1', { members: [{ destinationId: 'd1' }, { destinationId: 'd1' }] } as any, 'actor-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a destinationId that does not exist', async () => {
      prisma.destination.findMany.mockResolvedValue([]);
      await expect(service.setMembers('c1', { members: [{ destinationId: 'd1' }] } as any, 'actor-1')).rejects.toThrow(NotFoundException);
    });

    it('replaces membership atomically and audits inside the same transaction', async () => {
      prisma.destination.findMany.mockResolvedValue([{ id: 'd1' }]);
      await service.setMembers('c1', { members: [{ destinationId: 'd1', sortOrder: 0 }] } as any, 'actor-1');
      expect(prisma.destinationCollectionMember.deleteMany).toHaveBeenCalledWith({ where: { collectionId: 'c1' } });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'destinationCollection.members.set' }), prisma);
    });
  });
});
