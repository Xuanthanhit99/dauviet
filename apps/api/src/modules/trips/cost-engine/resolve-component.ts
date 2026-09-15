import { Prisma } from '@prisma/client';
import { COST_SCENARIOS, CostScenario, CostUnit, ResolveComponentInput, ResolvedComponent, ScenarioAmounts, UnitQuantities } from './types';

/**
 * Cost precedence resolution for a single itinerary/transport cost line
 * (spec section 78/79), in this exact, non-negotiable order:
 *
 *   1. USER_OVERRIDE                  (caller-supplied `userOverride`)
 *   2. SELECTED_FRESH_PROVIDER_OFFER  (caller-supplied `offer`)
 *   3. CostAssumption, most specific eligible scope first
 *      (DESTINATION > CITY > REGION > COUNTRY > GLOBAL)
 *   4. UNKNOWN
 *
 * Never nested conditionals scattered across the caller (spec section 79) -
 * this single function is the one place precedence is decided. Pure and
 * synchronous: no Date.now(), no randomness, no I/O (spec section 46).
 */
export function resolveComponent(input: ResolveComponentInput): ResolvedComponent {
  if (input.userOverride) {
    const { amount, currency } = input.userOverride;
    return {
      provenance: 'USER_INPUT',
      currency,
      amounts: fixedScenarioAmounts(amount),
      assumptionId: null,
      assumptionScope: null,
      offerId: null,
    };
  }

  if (input.offer) {
    const { offerId, amount, currency } = input.offer;
    return {
      provenance: 'PROVIDER_EVIDENCE',
      currency,
      amounts: fixedScenarioAmounts(amount),
      assumptionId: null,
      assumptionScope: null,
      offerId,
    };
  }

  const candidate = input.assumptionCandidates[0];
  if (candidate) {
    const multiplier = unitMultiplier(candidate.unit, input.quantities);
    return {
      provenance: 'RULE_BASED_ESTIMATE',
      currency: candidate.currency,
      amounts: {
        LOW: candidate.lowAmount.times(multiplier),
        TYPICAL: candidate.typicalAmount.times(multiplier),
        HIGH: candidate.highAmount.times(multiplier),
      },
      assumptionId: candidate.id,
      assumptionScope: candidate.scope,
      offerId: null,
    };
  }

  return {
    provenance: 'UNKNOWN',
    currency: null,
    amounts: { LOW: null, TYPICAL: null, HIGH: null },
    assumptionId: null,
    assumptionScope: null,
    offerId: null,
  };
}

/**
 * A user override or a live offer is a single fixed number, not a range -
 * it applies identically to LOW/TYPICAL/HIGH (spec section 30: the
 * LOW <= TYPICAL <= HIGH invariant holds trivially here since all three are
 * equal, never derived from an arbitrary percentage spread).
 */
function fixedScenarioAmounts(amount: Prisma.Decimal): ScenarioAmounts {
  return COST_SCENARIOS.reduce((acc, scenario) => {
    acc[scenario] = amount;
    return acc;
  }, {} as ScenarioAmounts);
}

/**
 * Per-unit quantity multiplier (spec section 81/84) - the only place a
 * CostAssumption's low/typical/high is scaled by travelers/rooms/nights/
 * days. `PER_TRIP`/`PER_ITEM`/`PER_LEG` are all "exactly once", by design:
 * the caller already produced one line item per trip/item/leg, so no further
 * multiplication is correct here (multiplying by travelerCount for a
 * PER_TRIP assumption would double-count against a PER_PERSON accommodation
 * line, for example).
 */
export function unitMultiplier(unit: CostUnit, quantities: UnitQuantities): number {
  switch (unit) {
    case 'PER_PERSON':
      return quantities.travelerCount;
    case 'PER_PERSON_PER_DAY':
      return quantities.travelerCount * quantities.days;
    case 'PER_ROOM_PER_NIGHT':
      return quantities.roomCount * quantities.nights;
    case 'PER_TRIP':
    case 'PER_ITEM':
    case 'PER_LEG':
      return 1;
  }
}

// Re-exported so callers building `CostScenario`-keyed structures don't need
// a second import from `./types` just for this constant.
export { COST_SCENARIOS };
export type { CostScenario };
