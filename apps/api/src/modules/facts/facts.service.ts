import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CitationVerificationState, EntityKind, FactEditorialStatus, FactSensitivity, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { buildHistoricalDateColumns } from '../../common/historical-date/historical-date.util';
import { CreateFactDto } from './dto/fact.dto';

const FORWARD_TRANSITIONS: Record<FactEditorialStatus, FactEditorialStatus[]> = {
  DRAFT: [FactEditorialStatus.SOURCE_CHECK, FactEditorialStatus.DRAFT],
  SOURCE_CHECK: [FactEditorialStatus.FACT_REVIEW, FactEditorialStatus.DRAFT],
  FACT_REVIEW: [FactEditorialStatus.EDITORIAL_REVIEW, FactEditorialStatus.DRAFT],
  EDITORIAL_REVIEW: [FactEditorialStatus.READY, FactEditorialStatus.DRAFT],
  READY: [FactEditorialStatus.PUBLISHED, FactEditorialStatus.DRAFT],
  PUBLISHED: [FactEditorialStatus.DRAFT],
};

const REVIEWER_ROLES = ['HISTORIAN_REVIEWER', 'ADMIN'];

/**
 * Trust-layer core (spec sections 14/17/36). This is where the "source-first"
 * guarantee is actually enforced, not just documented: a HistoricalFact cannot
 * reach PUBLISHED without at least one VERIFIED citation, and a fact flagged
 * with non-NORMAL sensitivity cannot be self-approved by its own creator.
 */
@Injectable()
export class FactsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async create(dto: CreateFactDto, actorId: string) {
    const date = buildHistoricalDateColumns(dto.date);
    const fact = await this.prisma.historicalFact.create({
      data: {
        factType: dto.factType,
        dateYear: date.year,
        dateMonth: date.month,
        dateDay: date.day,
        datePrecision: date.precision,
        dateQualifier: date.qualifier,
        dateEndYear: date.endYear,
        dateEndMonth: date.endMonth,
        dateEndDay: date.endDay,
        dateLabel: date.label,
        dateSortStart: date.sortStart,
        dateSortEnd: date.sortEnd,
        certainty: dto.certainty,
        sensitivity: dto.sensitivity ?? FactSensitivity.NORMAL,
        createdById: actorId,
        translations: {
          create: [{ locale: dto.locale, statement: dto.statement, method: 'ORIGINAL' }],
        },
      },
      include: { translations: true },
    });

    await this.snapshot(fact.id, actorId, 'fact.created');
    return fact;
  }

  async findById(id: string) {
    const fact = await this.prisma.historicalFact.findUnique({
      where: { id },
      include: {
        translations: true,
        citations: { include: { source: true } },
        placeLinks: true,
        personLinks: true,
        eventLinks: true,
        eraLinks: true,
        territoryLinks: true,
      },
    });
    if (!fact) throw new NotFoundException('Historical fact not found.');
    return fact;
  }

  async list(params: { editorialStatus?: FactEditorialStatus; sensitivity?: FactSensitivity }) {
    return this.prisma.historicalFact.findMany({
      where: params,
      include: { translations: true, citations: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async linkEntity(
    factId: string,
    kind: 'place' | 'person' | 'event' | 'era' | 'territory',
    entityId: string,
    actorId: string,
  ) {
    await this.findById(factId);

    const create = {
      place: () => this.prisma.factPlace.create({ data: { factId, placeId: entityId } }),
      person: () => this.prisma.factPerson.create({ data: { factId, personId: entityId } }),
      event: () => this.prisma.factEvent.create({ data: { factId, eventId: entityId } }),
      era: () => this.prisma.factEra.create({ data: { factId, eraId: entityId } }),
      territory: () => this.prisma.factTerritory.create({ data: { factId, territoryId: entityId } }),
    }[kind];

    const link = await create();
    await this.audit.log({ actorId, action: `fact.linked.${kind}`, entityType: EntityKind.FACT, entityId: factId, metadata: { entityId } });
    return link;
  }

  async setEditorialStatus(factId: string, newStatus: FactEditorialStatus, actor: AuthUser) {
    const fact = await this.findById(factId);

    const allowed = FORWARD_TRANSITIONS[fact.editorialStatus] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Cannot transition a fact from ${fact.editorialStatus} to ${newStatus}.`,
      );
    }

    if (newStatus === FactEditorialStatus.PUBLISHED) {
      if (fact.translations.length === 0) {
        throw new BadRequestException('Cannot publish a fact with no translated statement.');
      }

      const hasVerifiedCitation = fact.citations.some(
        (c) => c.verificationState === CitationVerificationState.VERIFIED,
      );
      if (!hasVerifiedCitation) {
        throw new BadRequestException(
          'A historical fact cannot be published without at least one verified citation.',
        );
      }

      if (fact.sensitivity !== FactSensitivity.NORMAL) {
        const isReviewer = actor.roles.some((r) => REVIEWER_ROLES.includes(r));
        if (!isReviewer) {
          throw new ForbiddenException(
            `Publishing a fact with sensitivity ${fact.sensitivity} requires a historian reviewer or admin.`,
          );
        }
        if (fact.createdById === actor.id) {
          throw new ForbiddenException(
            'A sensitive fact cannot be self-approved by the user who created it (separation of duties).',
          );
        }
      }
    }

    const updateData: Prisma.HistoricalFactUpdateInput = { editorialStatus: newStatus };
    if (newStatus === FactEditorialStatus.PUBLISHED) {
      updateData.reviewedById = actor.id;
      updateData.reviewedAt = new Date();
    }

    const updated = await this.prisma.historicalFact.update({ where: { id: factId }, data: updateData });
    await this.snapshot(factId, actor.id, `fact.editorialStatus.${newStatus}`);
    return updated;
  }

  private async snapshot(factId: string, actorId: string, note: string) {
    const fact = await this.prisma.historicalFact.findUnique({
      where: { id: factId },
      include: { translations: true, citations: true },
    });
    await this.prisma.revision.create({
      data: {
        entityType: EntityKind.FACT,
        entityId: factId,
        factId,
        snapshot: fact as unknown as Prisma.InputJsonValue,
        changeNote: note,
        changedById: actorId,
      },
    });
    await this.audit.log({ actorId, action: note, entityType: EntityKind.FACT, entityId: factId });
  }
}
