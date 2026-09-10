import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CuisinesService } from './cuisines.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('CuisinesService', () => {
  let prisma: any;
  let audit: { log: jest.Mock };
  let service: CuisinesService;

  beforeEach(() => {
    prisma = {
      country: { findFirst: jest.fn() },
      cuisine: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      cuisineTranslation: { upsert: jest.fn() },
      $transaction: jest.fn((ops: any[]) => Promise.all(ops)),
    };
    audit = { log: jest.fn() };
    service = new CuisinesService(prisma as unknown as PrismaService, audit as unknown as AuditService);
  });

  it('rejects a regionId without a countryId (a Cuisine cannot be region-scoped without a country)', async () => {
    await expect(service.create({ regionId: 'region-1', translations: [{ locale: 'vi', name: 'X' }] } as any, 'actor-1')).rejects.toThrow(BadRequestException);
  });

  it('creates and audits with entityType CUISINE', async () => {
    prisma.cuisine.create.mockResolvedValue({ id: 'cuisine-1' });
    await service.create({ translations: [{ locale: 'vi', name: 'Ẩm thực Test' }] } as any, 'actor-1');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'cuisine.created', entityType: 'CUISINE' }));
  });

  it('listPublic: an unresolvable country 404s', async () => {
    prisma.country.findFirst.mockResolvedValue(null);
    await expect(service.listPublic({ country: 'nope', locale: 'vi', page: 1, pageSize: 20 })).rejects.toThrow(NotFoundException);
  });

  it('setStatus 404s for an unknown id', async () => {
    prisma.cuisine.findUnique.mockResolvedValue(null);
    await expect(service.setStatus('nope', 'PUBLISHED' as any, 'actor-1')).rejects.toThrow(NotFoundException);
  });
});
