import { Prisma } from '@prisma/client';

/**
 * Centralized, deterministic money arithmetic for G09 (spec sections 9/17/
 * 19/54-57) - the first rounding/remainder-distribution utility in this
 * codebase (`aggregate-estimate.ts` only sums pre-resolved amounts, never
 * splits or rounds). Every currency is treated at a uniform 2-decimal-place
 * scale, matching every `Decimal @db.Decimal(12, 2)` column already in this
 * schema (`Trip.targetBudgetAmount`, `CostAssumption.*Amount`,
 * `TripCostEstimate.totalAmount`) - no per-currency ISO 4217 minor-unit
 * metadata table exists anywhere in this codebase, so none is invented here
 * either (docs/backend/G09_PRE_IMPLEMENTATION_REPORT.md section 3/7).
 *
 * `Prisma.Decimal` (decimal.js under the hood) is used throughout - never a
 * JS `number`/`Math.round`/`toFixed` for a business-money value (spec
 * section 56).
 */
export const MONEY_SCALE = 2;
/** `Decimal(12,2)` - 12 total digits, 2 after the point -> max 10 integer digits. */
export const MAX_MONEY_INTEGER_DIGITS = 10;

export class InvalidMoneyError extends Error {}

/** Parses a client-supplied amount string into an exact `Decimal` at the schema's 2dp scale. Throws `InvalidMoneyError` (never silently rounds/truncates) on more than 2 decimal places, a non-finite value, or a value that would overflow `Decimal(12,2)`. */
export function parseMoney(input: string): Prisma.Decimal {
  let value: Prisma.Decimal;
  try {
    value = new Prisma.Decimal(input);
  } catch {
    throw new InvalidMoneyError(`"${input}" is not a valid decimal amount.`);
  }
  if (!value.isFinite()) {
    throw new InvalidMoneyError(`"${input}" is not a finite amount.`);
  }
  if (value.decimalPlaces() > MONEY_SCALE) {
    throw new InvalidMoneyError(`"${input}" has more than ${MONEY_SCALE} decimal places - this schema supports exactly ${MONEY_SCALE} for every currency.`);
  }
  if (value.abs().greaterThanOrEqualTo(new Prisma.Decimal(10).pow(MAX_MONEY_INTEGER_DIGITS))) {
    throw new InvalidMoneyError(`"${input}" exceeds the maximum supported magnitude (Decimal(12,2)).`);
  }
  return value;
}

export function isPositive(amount: Prisma.Decimal): boolean {
  return amount.greaterThan(0);
}

/**
 * Deterministic remainder distribution shared by EQUAL and PERCENTAGE
 * (spec section 17/19): every participant gets `total / N` (or their
 * percentage share) floored to 2dp, then the leftover minor-unit remainder
 * (always `0 <= remainder < participants.length`) is handed out one minor
 * unit (0.01) at a time to participants sorted by `userId` ascending - a
 * stable order independent of client-submitted array order, so the exact
 * same `(total, participant set)` always resolves to the exact same shares.
 */
function distributeRemainder(total: Prisma.Decimal, rawShares: { userId: string; raw: Prisma.Decimal }[]): Map<string, Prisma.Decimal> {
  const floored = rawShares.map((s) => ({ userId: s.userId, amount: s.raw.toDecimalPlaces(MONEY_SCALE, Prisma.Decimal.ROUND_DOWN) }));
  const flooredSum = floored.reduce((acc, s) => acc.plus(s.amount), new Prisma.Decimal(0));
  const minorUnit = new Prisma.Decimal(10).pow(-MONEY_SCALE);
  let remainderUnits = total.minus(flooredSum).dividedBy(minorUnit).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toNumber();

  const sortedByUserId = [...floored].sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));
  const resolved = new Map(floored.map((s) => [s.userId, s.amount]));
  for (let i = 0; i < sortedByUserId.length && remainderUnits > 0; i++, remainderUnits--) {
    const entry = sortedByUserId[i];
    resolved.set(entry.userId, (resolved.get(entry.userId) as Prisma.Decimal).plus(minorUnit));
  }
  return resolved;
}

/** Equal split (spec section 17) - resolves to exact monetary shares; `sum(shares) === total` always. */
export function resolveEqualSplit(total: Prisma.Decimal, userIds: string[]): Map<string, Prisma.Decimal> {
  const raw = total.dividedBy(userIds.length);
  return distributeRemainder(
    total,
    userIds.map((userId) => ({ userId, raw })),
  );
}

/** Percentage split (spec section 19) - percentages (as `Decimal`, e.g. 33.34) must already have been validated to sum to exactly 100 by the caller. Resolves to exact monetary shares; `sum(shares) === total` always. */
export function resolvePercentageSplit(total: Prisma.Decimal, shares: { userId: string; percentage: Prisma.Decimal }[]): Map<string, Prisma.Decimal> {
  return distributeRemainder(
    total,
    shares.map((s) => ({ userId: s.userId, raw: total.times(s.percentage).dividedBy(100) })),
  );
}

/** Exact split (spec section 18) - validates the client-declared shares sum to exactly `total`. Never auto-corrects. */
export function exactSplitSumMatches(total: Prisma.Decimal, shares: { userId: string; amount: Prisma.Decimal }[]): boolean {
  const sum = shares.reduce((acc, s) => acc.plus(s.amount), new Prisma.Decimal(0));
  return sum.equals(total);
}
