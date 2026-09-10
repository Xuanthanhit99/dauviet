import { NotFoundException } from '@nestjs/common';
import { DishesService } from './dishes.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('DishesService', () => {
  let prisma: any;
  let audit: { log: jest.Mock };
  let service: DishesService;

  beforeEach(() => {
    prisma = {
      cuisine: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
      destination: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
      dish: { findUnique: jest.fn(), create: jest.fn(), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      dishTranslation: { upsert: jest.fn() },
      dishCuisine: { deleteMany: jest.fn(), createMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      destinationDish: { deleteMany: jest.fn(), createMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma))),
    };
    audit = { log: jest.fn() };
    service = new DishesService(prisma as unknown as PrismaService, audit as unknown as AuditService);
  });

  it('creates and audits with entityType DISH', async () => {
    prisma.dish.create.mockResolvedValue({ id: 'dish-1' });
    await service.create({ translations: [{ locale: 'vi', name: 'Phở Test' }] } as any, 'actor-1');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'dish.created', entityType: 'DISH' }));
  });

  it('setCuisines 404s if a cuisineId does not exist', async () => {
    prisma.dish.findUnique.mockResolvedValue({ id: 'dish-1' });
    prisma.cuisine.findMany.mockResolvedValue([]);
    await expect(service.setCuisines('dish-1', ['missing-cuisine'], 'actor-1')).rejects.toThrow(NotFoundException);
  });

  it('setDestinations replaces the full set transactionally', async () => {
    prisma.dish.findUnique.mockResolvedValue({ id: 'dish-1' });
    prisma.destination.findMany.mockResolvedValue([{ id: 'dest-1' }]);
    await service.setDestinations('dish-1', ['dest-1'], 'actor-1');
    expect(prisma.destinationDish.deleteMany).toHaveBeenCalledWith({ where: { dishId: 'dish-1' } });
    expect(prisma.destinationDish.createMany).toHaveBeenCalledWith({ data: [{ destinationId: 'dest-1', dishId: 'dish-1', sortOrder: 0 }] });
  });

  it('listPublic: an unresolvable cuisine 404s', async () => {
    prisma.cuisine.findFirst.mockResolvedValue(null);
    await expect(service.listPublic({ cuisine: 'nope', locale: 'vi', page: 1, pageSize: 20 })).rejects.toThrow(NotFoundException);
  });
});
