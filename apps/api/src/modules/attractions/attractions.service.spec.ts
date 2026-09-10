import { NotFoundException } from '@nestjs/common';
import { AttractionsService } from './attractions.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('AttractionsService', () => {
  let prisma: any;
  let audit: { log: jest.Mock };
  let service: AttractionsService;

  beforeEach(() => {
    prisma = {
      country: { findUnique: jest.fn(), findFirst: jest.fn() },
      region: { findUnique: jest.fn(), findFirst: jest.fn() },
      city: { findUnique: jest.fn(), findFirst: jest.fn() },
      place: { findUnique: jest.fn() },
      destination: { findMany: jest.fn().mockResolvedValue([]) },
      attraction: { findUnique: jest.fn(), create: jest.fn(), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      attractionTranslation: { upsert: jest.fn() },
      destinationAttraction: { deleteMany: jest.fn(), createMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma))),
    };
    audit = { log: jest.fn() };
    service = new AttractionsService(prisma as unknown as PrismaService, audit as unknown as AuditService);
  });

  const dto = { countryId: 'country-vn', translations: [{ locale: 'vi', name: 'Điểm tham quan Test' }] } as any;

  it('rejects a placeId that does not exist (typed mapping, never a merge)', async () => {
    prisma.country.findUnique.mockResolvedValue({ id: 'country-vn' });
    prisma.place.findUnique.mockResolvedValue(null);
    await expect(service.create({ ...dto, placeId: 'missing-place' }, 'actor-1')).rejects.toThrow(NotFoundException);
  });

  it('creates and audits with entityType ATTRACTION when placeId is valid', async () => {
    prisma.country.findUnique.mockResolvedValue({ id: 'country-vn' });
    prisma.place.findUnique.mockResolvedValue({ id: 'place-1' });
    prisma.attraction.create.mockResolvedValue({ id: 'attr-1' });
    await service.create({ ...dto, placeId: 'place-1' }, 'actor-1');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'attraction.created', entityType: 'ATTRACTION' }));
  });

  it('creates fine with no placeId at all (not every Attraction maps to a Place)', async () => {
    prisma.country.findUnique.mockResolvedValue({ id: 'country-vn' });
    prisma.attraction.create.mockResolvedValue({ id: 'attr-2' });
    await service.create(dto, 'actor-1');
    expect(prisma.place.findUnique).not.toHaveBeenCalled();
  });
});
