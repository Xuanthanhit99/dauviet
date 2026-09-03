import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AliasType, EntityKind, Prisma } from '@prisma/client';
import { AliasesService } from './aliases.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * Covers spec section 24/39 test #5: the same alias must not be attachable
 * to the same entity/locale twice, and an alias can never be created
 * against an entityId that does not actually exist (spec section 19's
 * "safely resolvable" requirement for the generic entityType+entityId
 * pattern).
 */
describe('AliasesService', () => {
  let prisma: {
    place: { findUnique: jest.Mock };
    person: { findUnique: jest.Mock };
    entityAlias: { create: jest.Mock; findMany: jest.Mock; findUnique: jest.Mock; delete: jest.Mock };
  };
  let audit: { log: jest.Mock };
  let service: AliasesService;

  beforeEach(() => {
    prisma = {
      place: { findUnique: jest.fn() },
      person: { findUnique: jest.fn() },
      entityAlias: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), delete: jest.fn() },
    };
    audit = { log: jest.fn() };
    service = new AliasesService(prisma as unknown as PrismaService, audit as unknown as AuditService);
  });

  it('rejects an alias for an entityId that does not exist', async () => {
    prisma.place.findUnique.mockResolvedValue(null);

    await expect(
      service.create({ entityType: EntityKind.PLACE, entityId: 'missing-place', alias: 'Hue' }, 'actor-1'),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.entityAlias.create).not.toHaveBeenCalled();
  });

  it('rejects alias creation for an entityType that does not support aliases', async () => {
    await expect(
      service.create({ entityType: EntityKind.COMMENT, entityId: 'x', alias: 'y' }, 'actor-1'),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.entityAlias.create).not.toHaveBeenCalled();
  });

  it('creates an alias when the target entity exists', async () => {
    prisma.person.findUnique.mockResolvedValue({ id: 'person-1' });
    prisma.entityAlias.create.mockResolvedValue({ id: 'alias-1', entityType: 'PERSON', entityId: 'person-1', alias: 'Nguyen Hue', aliasType: AliasType.BIRTH_NAME });

    const result = await service.create({ entityType: EntityKind.PERSON, entityId: 'person-1', alias: 'Nguyen Hue', aliasType: AliasType.BIRTH_NAME }, 'actor-1');

    expect(result.id).toBe('alias-1');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'alias.created' }));
  });

  it('translates a DB unique-constraint violation into a 409, not a 500', async () => {
    prisma.place.findUnique.mockResolvedValue({ id: 'place-1' });
    const dupError = new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '5.20.0' });
    prisma.entityAlias.create.mockRejectedValue(dupError);

    await expect(
      service.create({ entityType: EntityKind.PLACE, entityId: 'place-1', alias: 'Hue' }, 'actor-1'),
    ).rejects.toThrow(ConflictException);
  });

  it('deletes an existing alias and 404s for a missing one', async () => {
    prisma.entityAlias.findUnique.mockResolvedValueOnce(null);
    await expect(service.delete('missing', 'actor-1')).rejects.toThrow(NotFoundException);

    prisma.entityAlias.findUnique.mockResolvedValueOnce({ id: 'alias-1', entityType: 'PLACE', entityId: 'place-1', alias: 'Hue' });
    prisma.entityAlias.delete.mockResolvedValue({});
    const result = await service.delete('alias-1', 'actor-1');
    expect(result).toEqual({ id: 'alias-1' });
  });
});
