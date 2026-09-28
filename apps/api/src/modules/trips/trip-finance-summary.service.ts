import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TripAuthorizationService, TripCapability } from './trip-authorization.service';

interface UserInfo {
  id: string;
  displayName: string;
  avatarMediaId: string | null;
}

/**
 * Balance is a PROJECTION, never a stored source of truth (spec section
 * 39) - every number here is recomputed live from `TripExpense`/
 * `TripExpenseShare`/`TripSettlement` rows on every read, never from a
 * cached/mutable balance column. Deleted expenses are excluded (spec
 * section 31); archived trips remain readable here (VIEW_TRIP only, no
 * mutation happens in this service at all).
 *
 * Balance sign convention (locked in
 * docs/backend/G09_PRE_IMPLEMENTATION_REPORT.md section 8, spec section
 * 40): for user U, currency C -
 *   net(U,C) = paid(U,C) - owed(U,C) + settlementEffect(U,C)
 * `net > 0` -> should receive. `net < 0` -> owes. Conservation
 * (`sum(net) == 0` per currency, spec section 41) holds BY CONSTRUCTION,
 * not by a corrective step - see the class-level proof in the
 * pre-implementation report, and the real-PostgreSQL conservation test
 * matrix in `trip-expenses.e2e-spec.ts`.
 */
@Injectable()
export class TripFinanceSummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: TripAuthorizationService,
  ) {}

  private async computeBalances(tripId: string) {
    const [expenses, shares, settlements] = await Promise.all([
      this.prisma.tripExpense.findMany({ where: { tripId, deletedAt: null }, select: { amount: true, currency: true, payerUserId: true } }),
      this.prisma.tripExpenseShare.findMany({ where: { expense: { tripId, deletedAt: null } }, select: { amount: true, userId: true, expense: { select: { currency: true } } } }),
      this.prisma.tripSettlement.findMany({ where: { tripId }, select: { amount: true, currency: true, fromUserId: true, toUserId: true } }),
    ]);

    const net = new Map<string, Map<string, Prisma.Decimal>>();
    const totals = new Map<string, Prisma.Decimal>();
    const bump = (currency: string, userId: string, delta: Prisma.Decimal) => {
      if (!net.has(currency)) net.set(currency, new Map());
      const perCurrency = net.get(currency)!;
      perCurrency.set(userId, (perCurrency.get(userId) ?? new Prisma.Decimal(0)).plus(delta));
    };

    for (const expense of expenses) {
      bump(expense.currency, expense.payerUserId, expense.amount);
      totals.set(expense.currency, (totals.get(expense.currency) ?? new Prisma.Decimal(0)).plus(expense.amount));
    }
    for (const share of shares) {
      bump(share.expense.currency, share.userId, share.amount.negated());
    }
    for (const settlement of settlements) {
      bump(settlement.currency, settlement.fromUserId, settlement.amount);
      bump(settlement.currency, settlement.toUserId, settlement.amount.negated());
    }

    return { net, totals };
  }

  private async userInfoMap(userIds: string[]): Promise<Map<string, UserInfo>> {
    const users = await this.prisma.user.findMany({ where: { id: { in: [...new Set(userIds)] } }, select: { id: true, displayName: true, avatarMediaId: true } });
    return new Map(users.map((u) => [u.id, u]));
  }

  /** `totalsByCurrency`/`balancesByCurrency` (spec section 43) - no implicit FX, currencies never combined. */
  async summary(tripId: string, actorId: string) {
    await this.authz.authorize(tripId, actorId, TripCapability.VIEW_TRIP);
    const { net, totals } = await this.computeBalances(tripId);

    const allUserIds = [...net.values()].flatMap((m) => [...m.keys()]);
    const users = await this.userInfoMap(allUserIds);

    const balancesByCurrency = [...net.entries()].map(([currency, balances]) => ({
      currency,
      balances: [...balances.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([userId, netAmount]) => ({ userId, displayName: users.get(userId)?.displayName ?? null, avatarMediaId: users.get(userId)?.avatarMediaId ?? null, netAmount })),
    }));
    const totalsByCurrency = [...totals.entries()].map(([currency, totalAmount]) => ({ currency, totalAmount }));

    return { totalsByCurrency, balancesByCurrency };
  }

  /**
   * Deterministic debtor/creditor projection (spec section 44/45) - pure
   * read, never mutates the ledger. Simple greedy matching, sorted by
   * `userId` ascending on both sides for stable, deterministic output - not
   * the mathematically-minimal-transaction-count algorithm (spec section 45
   * explicitly discourages over-engineering this).
   */
  async suggestions(tripId: string, actorId: string) {
    await this.authz.authorize(tripId, actorId, TripCapability.VIEW_TRIP);
    const { net } = await this.computeBalances(tripId);

    const allUserIds = [...net.values()].flatMap((m) => [...m.keys()]);
    const users = await this.userInfoMap(allUserIds);

    const suggestionsByCurrency = [...net.entries()].map(([currency, balances]) => {
      const debtors = [...balances.entries()]
        .filter(([, amount]) => amount.lessThan(0))
        .map(([userId, amount]) => ({ userId, remaining: amount.negated() }))
        .sort((a, b) => (a.userId < b.userId ? -1 : 1));
      const creditors = [...balances.entries()]
        .filter(([, amount]) => amount.greaterThan(0))
        .map(([userId, amount]) => ({ userId, remaining: amount }))
        .sort((a, b) => (a.userId < b.userId ? -1 : 1));

      const suggestions: { fromUserId: string; toUserId: string; amount: Prisma.Decimal; fromDisplayName: string | null; toDisplayName: string | null }[] = [];
      let i = 0;
      let j = 0;
      while (i < debtors.length && j < creditors.length) {
        const debtor = debtors[i];
        const creditor = creditors[j];
        const amount = Prisma.Decimal.min(debtor.remaining, creditor.remaining);
        if (amount.greaterThan(0)) {
          suggestions.push({ fromUserId: debtor.userId, toUserId: creditor.userId, amount, fromDisplayName: users.get(debtor.userId)?.displayName ?? null, toDisplayName: users.get(creditor.userId)?.displayName ?? null });
          debtor.remaining = debtor.remaining.minus(amount);
          creditor.remaining = creditor.remaining.minus(amount);
        }
        if (debtor.remaining.isZero()) i++;
        if (creditor.remaining.isZero()) j++;
      }

      return { currency, suggestions };
    });

    return { suggestionsByCurrency };
  }
}
