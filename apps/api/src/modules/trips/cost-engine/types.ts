import { Prisma } from '@prisma/client';

/**
 * Shared types for the G06 Cost Engine's pure calculation core (spec section
 * 101: "Calculation core should be testable without DB/network... aim for
 * pure deterministic functions for arithmetic"). Nothing in this directory
 * imports PrismaService, ProviderRegistryService, or any Nest DI token - the
 * orchestrating service (trip-cost-estimates.service.ts, not yet written)
 * resolves all DB/provider-gate state first and passes plain data in here.
 */

export type CostScenario = 'LOW' | 'TYPICAL' | 'HIGH';

export const COST_SCENARIOS: readonly CostScenario[] = ['LOW', 'TYPICAL', 'HIGH'];

export type CostCategory = 'STAY' | 'FOOD' | 'ACTIVITY' | 'TRANSPORT' | 'OTHER';

export type CostUnit = 'PER_PERSON' | 'PER_PERSON_PER_DAY' | 'PER_ROOM_PER_NIGHT' | 'PER_TRIP' | 'PER_ITEM' | 'PER_LEG';

export type TripCostProvenance = 'USER_INPUT' | 'RULE_BASED_ESTIMATE' | 'PROVIDER_EVIDENCE' | 'UNKNOWN';

export type CostAssumptionScope = 'GLOBAL' | 'COUNTRY' | 'REGION' | 'CITY' | 'DESTINATION';

export type EstimateCompleteness = 'COMPLETE' | 'PARTIAL';

export type EstimateConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * One eligible, currently-ACTIVE `CostAssumption` row, already filtered by
 * the caller for date validity (`effectiveFrom <= tripDate <
 * (effectiveTo ?? +infinity)`) and status = ACTIVE. `resolveComponent` does
 * not re-check status/dates - it trusts the caller's filtering and only
 * applies precedence + unit-quantity arithmetic.
 */
export interface AssumptionCandidate {
  id: string;
  scope: CostAssumptionScope;
  scopeId: string | null;
  unit: CostUnit;
  currency: string;
  lowAmount: Prisma.Decimal;
  typicalAmount: Prisma.Decimal;
  highAmount: Prisma.Decimal;
  version: number;
  effectiveFrom: Date;
}

/**
 * A single fresh, eligible G05 offer, already resolved and provider-gate
 * checked by the caller (`ProviderRegistryService.getExecutionContext` +
 * `expiresAt` freshness - this module never talks to either). One fixed
 * amount, not a range - a live offer has one price.
 */
export interface OfferEvidence {
  offerId: string;
  amount: Prisma.Decimal;
  currency: string;
}

/** A user-entered planning override (spec section 78/79 precedence tier 1). */
export interface UserOverride {
  amount: Prisma.Decimal;
  currency: string;
}

/**
 * Quantities the caller has already computed from Trip/TripDestination/
 * TripDay/TripItem state. This module never performs date arithmetic itself
 * (spec section 82/83's night/day-count off-by-one risk lives entirely in
 * the orchestrating service, where it can be unit-tested against real
 * calendar dates once).
 */
export interface UnitQuantities {
  travelerCount: number;
  roomCount: number;
  nights: number;
  days: number;
}

/** Per-scenario amount, `null` exactly when `provenance = 'UNKNOWN'`. */
export type ScenarioAmounts = Record<CostScenario, Prisma.Decimal | null>;

export interface ResolvedComponent {
  provenance: TripCostProvenance;
  /** The evidence's own currency - `null` exactly when `provenance = 'UNKNOWN'`. Never assumed equal to the trip's target currency; see `aggregateEstimate`. */
  currency: string | null;
  amounts: ScenarioAmounts;
  assumptionId: string | null;
  /** Set only when `provenance = 'RULE_BASED_ESTIMATE'` - the winning assumption's scope, so `aggregateEstimate` can apply the "GLOBAL-only evidence -> LOW confidence" rule (spec section 44) without re-deriving it from `assumptionId`. */
  assumptionScope: CostAssumptionScope | null;
  offerId: string | null;
}

export interface ResolveComponentInput {
  userOverride?: UserOverride;
  offer?: OfferEvidence;
  /**
   * Precedence-ordered by the caller, most specific first
   * (DESTINATION > CITY > REGION > COUNTRY > GLOBAL - spec section 79),
   * already tie-broken (newest `effectiveFrom`, highest `version` - spec
   * section 33/98). `resolveComponent` takes the first eligible entry and
   * never re-sorts.
   */
  assumptionCandidates: AssumptionCandidate[];
  quantities: UnitQuantities;
}

/** One line item ready for `aggregateEstimate`, tagging a resolved component with the category/target-currency context needed to sum it correctly. */
export interface EstimateLineItem {
  category: CostCategory;
  targetCurrency: string;
  resolved: ResolvedComponent;
  tripDayId?: string;
  tripItemId?: string;
  transportLegId?: string;
  description?: string;
}

export interface ScenarioTotal {
  scenario: CostScenario;
  currency: string;
  totalAmount: Prisma.Decimal;
  completeness: EstimateCompleteness;
  confidence: EstimateConfidence;
  unknownCount: number;
}

export interface AggregatedEstimate {
  scenarios: Record<CostScenario, ScenarioTotal>;
}
