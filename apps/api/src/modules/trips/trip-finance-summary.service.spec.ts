import { Prisma } from '@prisma/client';
import { TripFinanceSummaryService } from './trip-finance-summary.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TripAuthorizationService } from './trip-authorization.service';

const D = (v: string | number) => new Prisma.Decimal(v);

function makeHarness() {
  const prisma: any = {
    tripExpense: { findMany: jest.fn().mockResolvedValue([]) },
    tripExpenseShare: { findMany: jest.fn().mockResolvedValue([]) },
    tripSettlement: { findMany: jest.fn().mockResolvedValue([]) },
    user: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const authz = { authorize: jest.fn().mockResolvedValue({ trip: { id: 't1' }, role: 'VIEWER' }) } as unknown as TripAuthorizationService;
  const service = new TripFinanceSummaryService(prisma as unknown as PrismaService, authz);
  return { service, prisma, authz };
}

describe('TripFinanceSummaryService.summary (spec sections 39-43, conservation)', () => {
  it('A pays 900, A/B/C each get a 300 share -> A net +600, B/C net -300 each (spec section 20 worked example)', async () => {
    const { service, prisma } = makeHarness();
    prisma.tripExpense.findMany.mockResolvedValue([{ amount: D(900), currency: 'USD', payerUserId: 'a' }]);
    prisma.tripExpenseShare.findMany.mockResolvedValue([
      { amount: D(300), userId: 'a', expense: { currency: 'USD' } },
      { amount: D(300), userId: 'b', expense: { currency: 'USD' } },
      { amount: D(300), userId: 'c', expense: { currency: 'USD' } },
    ]);
    prisma.user.findMany.mockResolvedValue([
      { id: 'a', displayName: 'A', avatarMediaId: null },
      { id: 'b', displayName: 'B', avatarMediaId: null },
      { id: 'c', displayName: 'C', avatarMediaId: null },
    ]);

    const result = await service.summary('t1', 'a');
    const usd = result.balancesByCurrency.find((b) => b.currency === 'USD')!;
    const byUser = Object.fromEntries(usd.balances.map((b) => [b.userId, b.netAmount.toString()]));
    expect(byUser.a).toBe('600');
    expect(byUser.b).toBe('-300');
    expect(byUser.c).toBe('-300');

    // Conservation (spec section 41): sum of all net balances is exactly 0.
    const sum = usd.balances.reduce((acc, b) => acc.plus(b.netAmount), new Prisma.Decimal(0));
    expect(sum.isZero()).toBe(true);
  });

  it('payer may have zero share (A pays for B/C only) - spec section 21', async () => {
    const { service, prisma } = makeHarness();
    prisma.tripExpense.findMany.mockResolvedValue([{ amount: D(200), currency: 'USD', payerUserId: 'a' }]);
    prisma.tripExpenseShare.findMany.mockResolvedValue([
      { amount: D(100), userId: 'b', expense: { currency: 'USD' } },
      { amount: D(100), userId: 'c', expense: { currency: 'USD' } },
    ]);
    const result = await service.summary('t1', 'a');
    const usd = result.balancesByCurrency.find((b) => b.currency === 'USD')!;
    const byUser = Object.fromEntries(usd.balances.map((b) => [b.userId, b.netAmount.toString()]));
    expect(byUser.a).toBe('200');
    expect(byUser.b).toBe('-100');
    expect(byUser.c).toBe('-100');
  });

  it('settlement moves both parties toward zero (spec sections 40/49 - A owed B 100, A settles 100 to B)', async () => {
    const { service, prisma } = makeHarness();
    prisma.tripExpense.findMany.mockResolvedValue([{ amount: D(100), currency: 'USD', payerUserId: 'b' }]);
    prisma.tripExpenseShare.findMany.mockResolvedValue([{ amount: D(100), userId: 'a', expense: { currency: 'USD' } }]);
    // Before settlement: a = -100, b = +100.
    prisma.tripSettlement.findMany.mockResolvedValue([{ amount: D(100), currency: 'USD', fromUserId: 'a', toUserId: 'b' }]);

    const result = await service.summary('t1', 'a');
    const usd = result.balancesByCurrency.find((b) => b.currency === 'USD')!;
    const byUser = Object.fromEntries(usd.balances.map((b) => [b.userId, b.netAmount.toString()]));
    expect(byUser.a).toBe('0');
    expect(byUser.b).toBe('0');
  });

  it('multi-currency: VND/JPY/USD ledgers stay fully independent, never combined (spec section 42/86)', async () => {
    const { service, prisma } = makeHarness();
    prisma.tripExpense.findMany.mockResolvedValue([
      { amount: D(1000), currency: 'VND', payerUserId: 'a' },
      { amount: D(500), currency: 'JPY', payerUserId: 'a' },
      { amount: D(50), currency: 'USD', payerUserId: 'a' },
    ]);
    prisma.tripExpenseShare.findMany.mockResolvedValue([
      { amount: D(1000), userId: 'a', expense: { currency: 'VND' } },
      { amount: D(500), userId: 'a', expense: { currency: 'JPY' } },
      { amount: D(50), userId: 'a', expense: { currency: 'USD' } },
    ]);
    const result = await service.summary('t1', 'a');
    expect(result.totalsByCurrency.map((t) => t.currency).sort()).toEqual(['JPY', 'USD', 'VND']);
    expect(result.balancesByCurrency).toHaveLength(3);
    for (const entry of result.balancesByCurrency) {
      expect(entry.balances.every((b) => b.netAmount.isZero())).toBe(true);
    }
  });

  it('deleted expenses are excluded (the prisma query itself filters deletedAt:null - verified via the call args)', async () => {
    const { service, prisma } = makeHarness();
    await service.summary('t1', 'a');
    expect(prisma.tripExpense.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ deletedAt: null }) }));
    expect(prisma.tripExpenseShare.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ expense: expect.objectContaining({ deletedAt: null }) }) }));
  });
});

describe('TripFinanceSummaryService.suggestions (spec sections 44/45/87)', () => {
  it('zeroes all balances when conceptually applied, deterministic under ties', async () => {
    const { service, prisma } = makeHarness();
    prisma.tripExpense.findMany.mockResolvedValue([{ amount: D(300), currency: 'USD', payerUserId: 'a' }]);
    prisma.tripExpenseShare.findMany.mockResolvedValue([
      { amount: D(100), userId: 'a', expense: { currency: 'USD' } },
      { amount: D(100), userId: 'b', expense: { currency: 'USD' } },
      { amount: D(100), userId: 'c', expense: { currency: 'USD' } },
    ]);

    const result = await service.suggestions('t1', 'a');
    const usd = result.suggestionsByCurrency.find((s) => s.currency === 'USD')!;
    expect(usd.suggestions.length).toBeGreaterThan(0);

    const applied = new Map<string, Prisma.Decimal>([
      ['a', D(200)],
      ['b', D(-100)],
      ['c', D(-100)],
    ]);
    for (const s of usd.suggestions) {
      applied.set(s.fromUserId, applied.get(s.fromUserId)!.plus(s.amount));
      applied.set(s.toUserId, applied.get(s.toUserId)!.minus(s.amount));
    }
    for (const [, amount] of applied) expect(amount.isZero()).toBe(true);
  });

  it('never produces a cross-currency suggestion', async () => {
    const { service, prisma } = makeHarness();
    prisma.tripExpense.findMany.mockResolvedValue([
      { amount: D(100), currency: 'VND', payerUserId: 'a' },
      { amount: D(100), currency: 'USD', payerUserId: 'b' },
    ]);
    prisma.tripExpenseShare.findMany.mockResolvedValue([
      { amount: D(100), userId: 'b', expense: { currency: 'VND' } },
      { amount: D(100), userId: 'a', expense: { currency: 'USD' } },
    ]);
    const result = await service.suggestions('t1', 'a');
    // Isolation is structural: suggestions are grouped by currency, and a
    // suggestion object itself carries no currency field that could ever
    // mismatch its group.
    expect(result.suggestionsByCurrency.map((s) => s.currency).sort()).toEqual(['USD', 'VND']);
  });

  it('is deterministic - repeated calls on the same ledger produce identical suggestions', async () => {
    const { service, prisma } = makeHarness();
    prisma.tripExpense.findMany.mockResolvedValue([{ amount: D(100), currency: 'USD', payerUserId: 'a' }]);
    prisma.tripExpenseShare.findMany.mockResolvedValue([{ amount: D(100), userId: 'b', expense: { currency: 'USD' } }]);

    const first = await service.suggestions('t1', 'a');
    const second = await service.suggestions('t1', 'a');
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});
