import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AliasType, EntityKind, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateAliasDto } from './dto/alias.dto';

/**
 * Shared alias architecture (spec sections 9/19). A single, validated
 * `entityType + entityId` table backs Place/Person/Event aliases (and any
 * future entity that needs them) rather than one bespoke join table per
 * entity - the tradeoff called out in spec section 19: a generic table is
 * acceptable as long as `entityType` is validated against a real row (this
 * service does that below) and duplicates are rejected at the DB level
 * (the `@@unique([entityType, entityId, locale, alias])` constraint).
 */
@Injectable()
export class AliasesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private async assertEntityExists(entityType: EntityKind, entityId: string): Promise<void> {
    const exists = await {
      PLACE: () => this.prisma.place.findUnique({ where: { id: entityId }, select: { id: true } }),
      PERSON: () => this.prisma.person.findUnique({ where: { id: entityId }, select: { id: true } }),
      EVENT: () => this.prisma.historicalEvent.findUnique({ where: { id: entityId }, select: { id: true } }),
      ERA: () => this.prisma.historicalEra.findUnique({ where: { id: entityId }, select: { id: true } }),
      DYNASTY: () => this.prisma.dynasty.findUnique({ where: { id: entityId }, select: { id: true } }),
      TERRITORY: () => this.prisma.territory.findUnique({ where: { id: entityId }, select: { id: true } }),
    }[entityType as 'PLACE' | 'PERSON' | 'EVENT' | 'ERA' | 'DYNASTY' | 'TERRITORY']?.();

    if (exists === undefined) {
      throw new BadRequestException(`Aliases are not supported for entityType ${entityType}.`);
    }
    if (!(await exists)) {
      throw new NotFoundException(`No ${entityType} entity with id ${entityId}.`);
    }
  }

  async create(dto: CreateAliasDto, actorId: string) {
    await this.assertEntityExists(dto.entityType, dto.entityId);

    try {
      const alias = await this.prisma.entityAlias.create({
        data: {
          entityType: dto.entityType,
          entityId: dto.entityId,
          alias: dto.alias,
          aliasType: dto.aliasType ?? AliasType.ALTERNATE_NAME,
          locale: dto.locale ?? '',
        },
      });
      await this.audit.log({
        actorId,
        action: 'alias.created',
        entityType: dto.entityType,
        entityId: dto.entityId,
        metadata: { alias: dto.alias, aliasType: alias.aliasType },
      });
      return alias;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('This alias already exists for this entity/locale.');
      }
      throw err;
    }
  }

  async listForEntity(entityType: EntityKind, entityId: string) {
    return this.prisma.entityAlias.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async delete(id: string, actorId: string) {
    const alias = await this.prisma.entityAlias.findUnique({ where: { id } });
    if (!alias) throw new NotFoundException('Alias not found.');

    await this.prisma.entityAlias.delete({ where: { id } });
    await this.audit.log({ actorId, action: 'alias.deleted', entityType: alias.entityType, entityId: alias.entityId, metadata: { alias: alias.alias } });
    return { id };
  }
}
