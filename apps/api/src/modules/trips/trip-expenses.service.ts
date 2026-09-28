import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityKind, Prisma, TripExpenseSplitMode } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TRIP_ERROR_CODES } from '../../common/errors/trip-error-codes';
import { TripAuthorizationService, TripCapability } from './trip-authorization.service';
import { TripCollaborationEventService } from './trip-collaboration-event.service';
import { CreateTripExpenseDto, DeleteTripExpenseDto, ListTripExpensesQueryDto, TripExpenseShareInputDto, UpdateTripExpenseDto } from './dto/trip-expense.dto';
import { exactSplitSumMatches, isPositive, parseMoney, resolveEqualSplit, resolvePercentageSplit } from './split-money.util';
import { isCurrentTripParticipant, lockTripAndAssertMutable, withDeadlockRetry } from './trip-financial-guard.util';

/**
 * Actual trip expenses + their per-participant allocation (spec sections
 * 5-25, 31-38). PLANNED COST != ACTUAL EXPENSE - this service never reads
 * from or writes to `TripCostEstimate`/`CostAssumption` (G06) at all.
 *
 * Every mutation runs `lockTripAndAssertMutable` as the transaction's first
 * statement (docs/backend/G09_PRE_IMPLEMENTATION_REPORT.md section 12) -
 * the same "re-validate authority against a row lock, not just a
 * pre-transaction read" discipline G08 established for its own race family,
 * applied here to close the member-removal/role-downgrade/archive-vs-
 * mutation races (spec sections 36-38).
 */
@Injectable()
export class TripExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly authz: TripAuthorizationService,
    private readonly collaborationEvents: TripCollaborationEventService,
  ) {}

  /** Structural share validation (spec section 15-19) - shape-only, no DB access; participant/currency validation happens inside the transaction (see `resolveShares`). */
  private resolveSplit(splitMode: TripExpenseSplitMode, amount: Prisma.Decimal, shares: TripExpenseShareInputDto[]): Map<string, { amount: Prisma.Decimal; percentage: Prisma.Decimal | null }> {
    const userIds = shares.map((s) => s.userId);
    if (new Set(userIds).size !== userIds.length) {
      throw new BadRequestException({ code: TRIP_ERROR_CODES.TRIP_EXPENSE_SPLIT_INVALID, message: 'Duplicate userId in shares - at most one share per user per expense.' });
    }
    if (userIds.length === 0) {
      throw new BadRequestException({ code: TRIP_ERROR_CODES.TRIP_EXPENSE_SPLIT_INVALID, message: 'At least one share is required.' });
    }

    if (splitMode === 'EQUAL') {
      if (shares.some((s) => s.amount !== undefined || s.percentage !== undefined)) {
        throw new BadRequestException({ code: TRIP_ERROR_CODES.TRIP_EXPENSE_SPLIT_INVALID, message: 'EQUAL split shares must not set amount/percentage.' });
      }
      const resolved = resolveEqualSplit(amount, userIds);
      return new Map(userIds.map((userId) => [userId, { amount: resolved.get(userId)!, percentage: null }]));
    }

    if (splitMode === 'EXACT') {
      const parsed = shares.map((s) => {
        if (s.amount === undefined || s.percentage !== undefined) {
          throw new BadRequestException({ code: TRIP_ERROR_CODES.TRIP_EXPENSE_SPLIT_INVALID, message: 'EXACT split shares must set amount and must not set percentage.' });
        }
        return { userId: s.userId, amount: this.parseShareAmount(s.amount) };
      });
      if (!exactSplitSumMatches(amount, parsed)) {
        throw new BadRequestException({ code: TRIP_ERROR_CODES.TRIP_EXPENSE_SPLIT_INVALID, message: 'Sum of exact shares must equal the expense amount exactly.' });
      }
      return new Map(parsed.map((s) => [s.userId, { amount: s.amount, percentage: null }]));
    }

    // PERCENTAGE
    const parsedPct = shares.map((s) => {
      if (s.percentage === undefined || s.amount !== undefined) {
        throw new BadRequestException({ code: TRIP_ERROR_CODES.TRIP_EXPENSE_SPLIT_INVALID, message: 'PERCENTAGE split shares must set percentage and must not set amount.' });
      }
      let percentage: Prisma.Decimal;
      try {
        percentage = new Prisma.Decimal(s.percentage);
      } catch {
        throw new BadRequestException({ code: TRIP_ERROR_CODES.TRIP_EXPENSE_SPLIT_INVALID, message: `"${s.percentage}" is not a valid percentage.` });
      }
      // G12: each percentage must be 0..100 (no negative hidden transfer) and fit the stored
      // Decimal(5,2) scale - otherwise the column would silently round what the split was computed from.
      if (!percentage.isFinite() || percentage.isNegative() || percentage.greaterThan(100) || percentage.decimalPlaces() > 2) {
        throw new BadRequestException({ code: TRIP_ERROR_CODES.TRIP_EXPENSE_SPLIT_INVALID, message: `"${s.percentage}" must be between 0 and 100 with at most 2 decimal places.` });
      }
      return { userId: s.userId, percentage };
    });
    const totalPct = parsedPct.reduce((acc, s) => acc.plus(s.percentage), new Prisma.Decimal(0));
    if (!totalPct.equals(100)) {
      throw new BadRequestException({ code: TRIP_ERROR_CODES.TRIP_EXPENSE_SPLIT_INVALID, message: `Percentages must sum to exactly 100 (got ${totalPct.toString()}).` });
    }
    const resolved = resolvePercentageSplit(amount, parsedPct);
    return new Map(parsedPct.map((s) => [s.userId, { amount: resolved.get(s.userId)!, percentage: s.percentage }]));
  }

  private parseShareAmount(input: string): Prisma.Decimal {
    let amount: Prisma.Decimal;
    try {
      amount = parseMoney(input);
    } catch {
      throw new BadRequestException({ code: TRIP_ERROR_CODES.TRIP_EXPENSE_SPLIT_INVALID, message: `"${input}" is not a valid share amount.` });
    }
    // G12: a share is what one participant consumed - zero is legitimate (G09-GATE-051), negative
    // is a hidden transfer that still satisfies the sum check (G09-GATE-028). DB CHECK enforces it too.
    if (amount.isNegative()) {
      throw new BadRequestException({ code: TRIP_ERROR_CODES.TRIP_EXPENSE_SPLIT_INVALID, message: 'A share amount must not be negative.' });
    }
    return amount;
  }

  private parseAmount(input: string): Prisma.Decimal {
    let amount: Prisma.Decimal;
    try {
      amount = parseMoney(input);
    } catch {
      throw new BadRequestException({ code: TRIP_ERROR_CODES.TRIP_EXPENSE_INVALID, message: `"${input}" is not a valid amount.` });
    }
    if (!isPositive(amount)) {
      // Refunds are out of scope (spec section 10) - a normal expense is always > 0.
      throw new BadRequestException({ code: TRIP_ERROR_CODES.TRIP_EXPENSE_INVALID, message: 'amount must be greater than 0.' });
    }
    return amount;
  }

  /** Re-validates every referenced userId is a CURRENT trip participant, inside the transaction (spec section 22/24). */
  private async assertParticipants(tx: Prisma.TransactionClient, tripId: string, ownerId: string, userIds: string[]) {
    for (const userId of new Set(userIds)) {
      if (!(await isCurrentTripParticipant(tx, tripId, ownerId, userId))) {
        throw new BadRequestException({ code: TRIP_ERROR_CODES.TRIP_EXPENSE_PARTICIPANT_INVALID, message: `${userId} is not a current accepted participant of this trip.` });
      }
    }
  }

  async create(tripId: string, actorId: string, dto: CreateTripExpenseDto) {
    await this.authz.authorize(tripId, actorId, TripCapability.EDIT_TRIP);
    const amount = this.parseAmount(dto.amount);
    const resolvedShares = this.resolveSplit(dto.splitMode, amount, dto.shares);

    return withDeadlockRetry(() =>
      this.prisma.$transaction(async (tx) => {
        const trip = await lockTripAndAssertMutable(tx, tripId, actorId);
        await this.assertParticipants(tx, tripId, trip.ownerId, [dto.payerUserId, ...resolvedShares.keys()]);

        const expense = await tx.tripExpense.create({
          data: {
            tripId,
            title: dto.title,
            category: dto.category,
            amount,
            currency: dto.currency,
            payerUserId: dto.payerUserId,
            splitMode: dto.splitMode,
            occurredOn: new Date(dto.occurredOn),
            note: dto.note,
            createdByUserId: actorId,
            shares: { createMany: { data: [...resolvedShares.entries()].map(([userId, s]) => ({ userId, amount: s.amount, percentage: s.percentage })) } },
          },
          include: { shares: true },
        });

        await this.audit.log(
          {
            actorId,
            action: 'tripExpense.created',
            entityType: EntityKind.TRIP_EXPENSE,
            entityId: expense.id,
            metadata: { category: dto.category, currency: dto.currency, amount: amount.toString(), payerUserId: dto.payerUserId, splitMode: dto.splitMode },
          },
          tx,
        );
        await this.collaborationEvents.record({ tripId, type: 'EXPENSE_ADDED', actorUserId: actorId, metadata: { category: dto.category, currency: dto.currency } }, tx);

        return expense;
      }),
    );
  }

  /** Full replace of the expense's mutable fields + share set (spec section 32/64) - true conditional `updateMany` for optimistic concurrency (spec section 33/34). */
  async update(tripId: string, expenseId: string, actorId: string, dto: UpdateTripExpenseDto) {
    await this.authz.authorize(tripId, actorId, TripCapability.EDIT_TRIP);
    const amount = this.parseAmount(dto.amount);
    const resolvedShares = this.resolveSplit(dto.splitMode, amount, dto.shares);

    return withDeadlockRetry(() =>
      this.prisma.$transaction(async (tx) => {
        const trip = await lockTripAndAssertMutable(tx, tripId, actorId);
        await this.assertParticipants(tx, tripId, trip.ownerId, [dto.payerUserId, ...resolvedShares.keys()]);

        const result = await tx.tripExpense.updateMany({
          where: { id: expenseId, tripId, version: dto.expectedVersion, deletedAt: null },
          data: {
            title: dto.title,
            category: dto.category,
            amount,
            currency: dto.currency,
            payerUserId: dto.payerUserId,
            splitMode: dto.splitMode,
            occurredOn: new Date(dto.occurredOn),
            note: dto.note,
            version: { increment: 1 },
          },
        });
        if (result.count !== 1) {
          await this.throwEditConflict(tx, tripId, expenseId, dto.expectedVersion);
        }

        await tx.tripExpenseShare.deleteMany({ where: { expenseId } });
        await tx.tripExpenseShare.createMany({ data: [...resolvedShares.entries()].map(([userId, s]) => ({ expenseId, userId, amount: s.amount, percentage: s.percentage })) } as any);

        await this.audit.log(
          { actorId, action: 'tripExpense.updated', entityType: EntityKind.TRIP_EXPENSE, entityId: expenseId, metadata: { category: dto.category, currency: dto.currency, amount: amount.toString() } },
          tx,
        );
        await this.collaborationEvents.record({ tripId, type: 'EXPENSE_UPDATED', actorUserId: actorId, metadata: { category: dto.category, currency: dto.currency } }, tx);

        return tx.tripExpense.findUniqueOrThrow({ where: { id: expenseId }, include: { shares: true } });
      }),
    );
  }

  /** Soft delete (spec section 31) - true conditional `updateMany`, same concurrency strength as `update`. */
  async delete(tripId: string, expenseId: string, actorId: string, dto: DeleteTripExpenseDto) {
    await this.authz.authorize(tripId, actorId, TripCapability.EDIT_TRIP);

    return withDeadlockRetry(() =>
      this.prisma.$transaction(async (tx) => {
        await lockTripAndAssertMutable(tx, tripId, actorId);

        const result = await tx.tripExpense.updateMany({
          where: { id: expenseId, tripId, version: dto.expectedVersion, deletedAt: null },
          data: { deletedAt: new Date(), version: { increment: 1 } },
        });
        if (result.count !== 1) {
          await this.throwEditConflict(tx, tripId, expenseId, dto.expectedVersion);
        }

        await this.audit.log({ actorId, action: 'tripExpense.deleted', entityType: EntityKind.TRIP_EXPENSE, entityId: expenseId }, tx);
        await this.collaborationEvents.record({ tripId, type: 'EXPENSE_DELETED', actorUserId: actorId }, tx);

        return { deleted: true };
      }),
    );
  }

  /** Disambiguates a failed conditional updateMany into the correct error (spec section 33-35): NOT_FOUND for missing/already-deleted, VERSION_CONFLICT for a genuine stale edit. */
  private async throwEditConflict(tx: Prisma.TransactionClient, tripId: string, expenseId: string, expectedVersion: number): Promise<never> {
    const current = await tx.tripExpense.findFirst({ where: { id: expenseId, tripId } });
    if (!current || current.deletedAt) {
      throw new NotFoundException({ code: TRIP_ERROR_CODES.TRIP_EXPENSE_NOT_FOUND, message: 'Expense not found.' });
    }
    throw new ConflictException({
      code: TRIP_ERROR_CODES.TRIP_VERSION_CONFLICT,
      message: `This expense changed since you last read it (expected version ${expectedVersion}, current is ${current.version}) - reload and retry.`,
    });
  }

  /** Excludes soft-deleted expenses by default (spec section 31), paginated, deterministic order (spec section 63). */
  async list(tripId: string, actorId: string, query: ListTripExpensesQueryDto) {
    await this.authz.authorize(tripId, actorId, TripCapability.VIEW_TRIP);
    const where = { tripId, deletedAt: null };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.tripExpense.count({ where }),
      this.prisma.tripExpense.findMany({
        where,
        orderBy: [{ occurredOn: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  /** Detail remains readable even once soft-deleted (spec section 31 - "audit remains available") - mirrors Trip.archivedAt's own "never hidden, only excluded from the default list" precedent. */
  async detail(tripId: string, expenseId: string, actorId: string) {
    await this.authz.authorize(tripId, actorId, TripCapability.VIEW_TRIP);
    const expense = await this.prisma.tripExpense.findFirst({ where: { id: expenseId, tripId }, include: { shares: true } });
    if (!expense) throw new NotFoundException({ code: TRIP_ERROR_CODES.TRIP_EXPENSE_NOT_FOUND, message: 'Expense not found.' });
    return expense;
  }
}
