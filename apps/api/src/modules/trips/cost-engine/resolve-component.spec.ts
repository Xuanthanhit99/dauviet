import { Prisma } from '@prisma/client';
import { resolveComponent, unitMultiplier } from './resolve-component';
import { AssumptionCandidate, ResolvedComponent, UnitQuantities } from './types';

const quantities: UnitQuantities = { travelerCount: 2, roomCount: 1, nights: 3, days: 4 };

/** Test-only helper: every case below that reaches for `.LOW`/`.TYPICAL`/`.HIGH` has already asserted `provenance !== 'UNKNOWN'`, so the amount is known non-null. */
function amount(result: ResolvedComponent, scenario: 'LOW' | 'TYPICAL' | 'HIGH'): Prisma.Decimal {
  const value = result.amounts[scenario];
  if (value === null) throw new Error(`expected a resolved ${scenario} amount, got null`);
  return value;
}

function assumption(overrides: Partial<AssumptionCandidate> = {}): AssumptionCandidate {
  return {
    id: 'assumption-1',
    scope: 'GLOBAL',
    scopeId: null,
    unit: 'PER_PERSON_PER_DAY',
    currency: 'VND',
    lowAmount: new Prisma.Decimal(100_000),
    typicalAmount: new Prisma.Decimal(150_000),
    highAmount: new Prisma.Decimal(200_000),
    version: 1,
    effectiveFrom: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('resolveComponent (spec section 78/79 precedence)', () => {
  it('prefers USER_OVERRIDE over everything else, using the same fixed amount for all three scenarios', () => {
    const result = resolveComponent({
      userOverride: { amount: new Prisma.Decimal(999), currency: 'USD' },
      offer: { offerId: 'offer-1', amount: new Prisma.Decimal(500), currency: 'USD' },
      assumptionCandidates: [assumption()],
      quantities,
    });

    expect(result.provenance).toBe('USER_INPUT');
    expect(result.currency).toBe('USD');
    expect(amount(result, 'LOW').toString()).toBe('999');
    expect(amount(result, 'TYPICAL').toString()).toBe('999');
    expect(amount(result, 'HIGH').toString()).toBe('999');
    expect(result.assumptionId).toBeNull();
    expect(result.offerId).toBeNull();
  });

  it('prefers SELECTED_FRESH_PROVIDER_OFFER over a CostAssumption when there is no user override', () => {
    const result = resolveComponent({
      offer: { offerId: 'offer-1', amount: new Prisma.Decimal(500), currency: 'USD' },
      assumptionCandidates: [assumption()],
      quantities,
    });

    expect(result.provenance).toBe('PROVIDER_EVIDENCE');
    expect(result.offerId).toBe('offer-1');
    expect(amount(result, 'LOW').toString()).toBe('500');
    expect(amount(result, 'HIGH').toString()).toBe('500');
  });

  it('falls through to the first (most specific) CostAssumption candidate and applies its unit multiplier', () => {
    const result = resolveComponent({
      assumptionCandidates: [assumption({ scope: 'DESTINATION', unit: 'PER_PERSON_PER_DAY' })],
      quantities,
    });

    expect(result.provenance).toBe('RULE_BASED_ESTIMATE');
    expect(result.assumptionScope).toBe('DESTINATION');
    // PER_PERSON_PER_DAY * travelerCount(2) * days(4) = *8
    expect(amount(result, 'LOW').toString()).toBe('800000');
    expect(amount(result, 'TYPICAL').toString()).toBe('1200000');
    expect(amount(result, 'HIGH').toString()).toBe('1600000');
  });

  it('never re-sorts assumptionCandidates - trusts the caller\'s precedence ordering', () => {
    const result = resolveComponent({
      assumptionCandidates: [assumption({ scope: 'CITY', id: 'city-assumption' }), assumption({ scope: 'GLOBAL', id: 'global-assumption' })],
      quantities,
    });

    expect(result.assumptionId).toBe('city-assumption');
  });

  it('resolves to UNKNOWN with null amounts/currency when no evidence is available at all', () => {
    const result = resolveComponent({ assumptionCandidates: [], quantities });

    expect(result.provenance).toBe('UNKNOWN');
    expect(result.currency).toBeNull();
    expect(result.assumptionScope).toBeNull();
    expect(result.amounts).toEqual({ LOW: null, TYPICAL: null, HIGH: null });
  });

  it('a known-free item (userOverride amount = 0) resolves as USER_INPUT with an explicit zero, never UNKNOWN (recovery spec gate 271: known-zero must be distinguishable from UNKNOWN)', () => {
    const result = resolveComponent({
      userOverride: { amount: new Prisma.Decimal(0), currency: 'VND' },
      assumptionCandidates: [assumption()],
      quantities,
    });

    expect(result.provenance).toBe('USER_INPUT');
    expect(result.currency).toBe('VND');
    expect(amount(result, 'LOW').toString()).toBe('0');
    expect(amount(result, 'TYPICAL').toString()).toBe('0');
    expect(amount(result, 'HIGH').toString()).toBe('0');
  });

  it('produces a non-decreasing LOW <= TYPICAL <= HIGH by construction for a rule-based estimate (spec section 30)', () => {
    const result = resolveComponent({ assumptionCandidates: [assumption()], quantities });
    const low = result.amounts.LOW as Prisma.Decimal;
    const typical = result.amounts.TYPICAL as Prisma.Decimal;
    const high = result.amounts.HIGH as Prisma.Decimal;

    expect(low.lessThanOrEqualTo(typical)).toBe(true);
    expect(typical.lessThanOrEqualTo(high)).toBe(true);
  });
});

describe('unitMultiplier (spec section 81/84)', () => {
  it('scales PER_PERSON by travelerCount only', () => {
    expect(unitMultiplier('PER_PERSON', quantities)).toBe(2);
  });

  it('scales PER_PERSON_PER_DAY by travelerCount * days', () => {
    expect(unitMultiplier('PER_PERSON_PER_DAY', quantities)).toBe(8);
  });

  it('scales PER_ROOM_PER_NIGHT by roomCount * nights, never travelerCount', () => {
    expect(unitMultiplier('PER_ROOM_PER_NIGHT', quantities)).toBe(3);
  });

  it('never scales PER_TRIP/PER_ITEM/PER_LEG - each is applied exactly once', () => {
    expect(unitMultiplier('PER_TRIP', quantities)).toBe(1);
    expect(unitMultiplier('PER_ITEM', quantities)).toBe(1);
    expect(unitMultiplier('PER_LEG', quantities)).toBe(1);
  });
});
