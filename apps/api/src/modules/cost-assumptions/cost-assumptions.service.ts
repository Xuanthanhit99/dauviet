import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CostAssumptionScope, CostAssumptionStatus, Prisma, PublicationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { GEOGRAPHY_ERROR_CODES } from '../../common/errors/geography-error-codes';
import { TRIP_ERROR_CODES } from '../../common/errors/trip-error-codes';
import { CreateCostAssumptionDto, ListCostAssumptionsQueryDto, SetCostAssumptionStatusDto, UpdateCostAssumptionDto } from './dto/cost-assumption.dto';

/** DRAFT -> ACTIVE -> RETIRED, forward-only (spec section 97) - same shape as Journey/Story's `FORWARD_TRANSITIONS`. */
const FORWARD_TRANSITIONS: Record<CostAssumptionStatus, CostAssumptionStatus[]> = {
  DRAFT: [CostAssumptionStatus.ACTIVE, CostAssumptionStatus.RETIRED],
  ACTIVE: [CostAssumptionStatus.RETIRED],
  RETIRED: [],
};

/**
 * Admin-managed planning-cost configuration feeding the (not yet wired)
 * deterministic Cost Engine (spec section 31-33/79-81/96-99). ADMIN-only
 * mutation (pre-implementation report section 1.10 - same RBAC tier as
 * `ProviderLicense`, not the looser EDITOR/ADMIN used for public catalogue
 * content). Never itself a live price - see
 * docs/backend/G06_PRE_IMPLEMENTATION_REPORT.md section 3.6 for why this
 * phase ships zero real `ACTIVE` production figures.
 */
@Injectable()
export class CostAssumptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async getOrThrow(id: string) {
    const row = await this.prisma.costAssumption.findUnique({ where: { id } });
    if (!row) throw new NotFoundException({ code: TRIP_ERROR_CODES.COST_ASSUMPTION_NOT_FOUND, message: 'Cost assumption not found.' });
    return row;
  }

  private assertAmountRange(low: string, typical: string, high: string) {
    const lowD = new Prisma.Decimal(low);
    const typicalD = new Prisma.Decimal(typical);
    const highD = new Prisma.Decimal(high);
    if (!(lowD.lessThanOrEqualTo(typicalD) && typicalD.lessThanOrEqualTo(highD))) {
      throw new BadRequestException({
        code: TRIP_ERROR_CODES.COST_ASSUMPTION_INVALID_RANGE,
        message: 'lowAmount must be <= typicalAmount, and typicalAmount must be <= highAmount.',
      });
    }
  }

  private assertEffectiveRange(effectiveFrom: string, effectiveTo?: string) {
    if (effectiveTo && effectiveTo < effectiveFrom) {
      throw new BadRequestException({ code: TRIP_ERROR_CODES.COST_ASSUMPTION_INVALID_EFFECTIVE_RANGE, message: 'effectiveTo must be on or after effectiveFrom.' });
    }
  }

  /** Resolves `scopeSlug` against the concrete geography table `scope` names, or rejects if one was given for `GLOBAL` (which takes no scopeId) or omitted for anything else. */
  private async resolveScopeId(scope: CostAssumptionScope, scopeSlug?: string): Promise<string | null> {
    if (scope === CostAssumptionScope.GLOBAL) {
      if (scopeSlug) {
        throw new BadRequestException({ code: TRIP_ERROR_CODES.COST_ASSUMPTION_SCOPE_MISMATCH, message: 'GLOBAL scope must not set scopeSlug.' });
      }
      return null;
    }
    if (!scopeSlug) {
      throw new BadRequestException({ code: TRIP_ERROR_CODES.COST_ASSUMPTION_SCOPE_MISMATCH, message: `${scope} scope requires scopeSlug.` });
    }

    const lookup = { OR: [{ canonicalSlug: scopeSlug }, { id: scopeSlug }] };
    switch (scope) {
      case CostAssumptionScope.COUNTRY: {
        const row = await this.prisma.country.findFirst({ where: { status: PublicationStatus.PUBLISHED, ...lookup } });
        if (!row) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.COUNTRY_NOT_FOUND, message: `Country not found: ${scopeSlug}` });
        return row.id;
      }
      case CostAssumptionScope.REGION: {
        const row = await this.prisma.region.findFirst({ where: { status: PublicationStatus.PUBLISHED, ...lookup } });
        if (!row) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.REGION_NOT_FOUND, message: `Region not found: ${scopeSlug}` });
        return row.id;
      }
      case CostAssumptionScope.CITY: {
        const row = await this.prisma.city.findFirst({ where: { status: PublicationStatus.PUBLISHED, ...lookup } });
        if (!row) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.CITY_NOT_FOUND, message: `City not found: ${scopeSlug}` });
        return row.id;
      }
      case CostAssumptionScope.DESTINATION: {
        const row = await this.prisma.destination.findFirst({ where: { status: PublicationStatus.PUBLISHED, ...lookup } });
        if (!row) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.DESTINATION_NOT_FOUND, message: `Destination not found: ${scopeSlug}` });
        return row.id;
      }
      default:
        return null;
    }
  }

  /**
   * `@@unique([scope, scopeId, category, unit, effectiveFrom])` does NOT
   * actually enforce uniqueness for GLOBAL-scoped rows: Postgres treats
   * every NULL as distinct from every other NULL in a unique index, and
   * `scopeId` is always null for `GLOBAL`, so the DB constraint silently
   * never fires for that scope. `findFirst`'s `scopeId: null` filter does
   * correctly translate to `IS NULL` for matching purposes (this is a
   * conflict-detection-on-insert limitation, not a general query one), so
   * this explicit check closes the gap the DB constraint leaves open rather
   * than relying on it.
   */
  private async assertNoDuplicateIdentity(scope: CostAssumptionScope, scopeId: string | null, category: string, unit: string, effectiveFrom: string) {
    const existing = await this.prisma.costAssumption.findFirst({ where: { scope, scopeId, category: category as any, unit: unit as any, effectiveFrom: new Date(effectiveFrom) } });
    if (existing) {
      throw new ConflictException({
        code: TRIP_ERROR_CODES.COST_ASSUMPTION_DUPLICATE_IDENTITY,
        message: `A cost assumption with this exact scope/category/unit/effectiveFrom already exists (id ${existing.id}) - update it instead of creating a duplicate.`,
      });
    }
  }

  async create(dto: CreateCostAssumptionDto, actorId: string) {
    this.assertAmountRange(dto.lowAmount, dto.typicalAmount, dto.highAmount);
    this.assertEffectiveRange(dto.effectiveFrom, dto.effectiveTo);
    const scopeId = await this.resolveScopeId(dto.scope, dto.scopeSlug);
    await this.assertNoDuplicateIdentity(dto.scope, scopeId, dto.category, dto.unit, dto.effectiveFrom);

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.costAssumption.create({
        data: {
          scope: dto.scope,
          scopeId,
          category: dto.category,
          unit: dto.unit,
          currency: dto.currency,
          lowAmount: dto.lowAmount,
          typicalAmount: dto.typicalAmount,
          highAmount: dto.highAmount,
          effectiveFrom: new Date(dto.effectiveFrom),
          effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
          source: dto.source,
        },
      });
      await this.audit.log({ actorId, action: 'costAssumption.created', entityType: 'TRIP_COST_ASSUMPTION', entityId: row.id }, tx);
      return row;
    });
  }

  async list(query: ListCostAssumptionsQueryDto) {
    const where = { scope: query.scope, category: query.category, status: query.status };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.costAssumption.count({ where }),
      this.prisma.costAssumption.findMany({
        where,
        orderBy: [{ scope: 'asc' }, { category: 'asc' }, { effectiveFrom: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { items: rows, total, page: query.page, pageSize: query.pageSize };
  }

  async findOne(id: string) {
    return this.getOrThrow(id);
  }

  async update(id: string, dto: UpdateCostAssumptionDto, actorId: string) {
    const row = await this.getOrThrow(id);
    const lowAmount = dto.lowAmount ?? row.lowAmount.toString();
    const typicalAmount = dto.typicalAmount ?? row.typicalAmount.toString();
    const highAmount = dto.highAmount ?? row.highAmount.toString();
    this.assertAmountRange(lowAmount, typicalAmount, highAmount);
    const effectiveTo = dto.effectiveTo ?? (row.effectiveTo ? row.effectiveTo.toISOString().slice(0, 10) : undefined);
    this.assertEffectiveRange(row.effectiveFrom.toISOString().slice(0, 10), effectiveTo);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.costAssumption.update({
        where: { id },
        data: {
          currency: dto.currency,
          lowAmount: dto.lowAmount,
          typicalAmount: dto.typicalAmount,
          highAmount: dto.highAmount,
          effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : undefined,
          source: dto.source,
          version: { increment: 1 },
        },
      });
      await this.audit.log({ actorId, action: 'costAssumption.updated', entityType: 'TRIP_COST_ASSUMPTION', entityId: id }, tx);
      return updated;
    });
  }

  async setStatus(id: string, dto: SetCostAssumptionStatusDto, actorId: string) {
    const row = await this.getOrThrow(id);
    if (!FORWARD_TRANSITIONS[row.status].includes(dto.status)) {
      throw new BadRequestException({
        code: TRIP_ERROR_CODES.COST_ASSUMPTION_INVALID_STATUS_TRANSITION,
        message: `Cannot transition a ${row.status} cost assumption to ${dto.status}.`,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.costAssumption.update({ where: { id }, data: { status: dto.status, version: { increment: 1 } } });
      await this.audit.log({ actorId, action: `costAssumption.status.${dto.status.toLowerCase()}`, entityType: 'TRIP_COST_ASSUMPTION', entityId: id }, tx);
      return updated;
    });
  }
}
