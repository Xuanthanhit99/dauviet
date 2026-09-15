import { Prisma } from '@prisma/client';
import { AggregatedEstimate, COST_SCENARIOS, EstimateLineItem, EstimateCompleteness, EstimateConfidence, ScenarioTotal } from './types';

/**
 * Sums resolved line items into LOW/TYPICAL/HIGH scenario totals (spec
 * section 26-30, 42-44, 54). Pure and synchronous - no I/O, no rounding
 * beyond what `Prisma.Decimal` itself does internally (final currency-minor-
 * unit rounding, if any, is a presentation-layer concern, not this
 * function's - spec section 58).
 *
 * Multi-currency policy (spec section 54, resolved as documented in
 * docs/backend/G06_PRE_IMPLEMENTATION_REPORT.md section 4.1, "Option B with
 * a stricter twist"): a line item counts toward the total only when its own
 * resolved currency equals `targetCurrency`. A resolved-but-wrong-currency
 * item is never added to another currency's total (that would silently mix
 * currencies) and is never converted (no FX capability exists - spec
 * section 55) - it is instead treated as an unknown contribution to the
 * total, exactly like a genuine `UNKNOWN` provenance item, and increments
 * `unknownCount` accordingly. The line item's own resolved amount/currency
 * are preserved for the caller to persist/display regardless (never
 * discarded) - only whether it is SUMMED is affected here.
 */
export function aggregateEstimate(targetCurrency: string, items: EstimateLineItem[]): AggregatedEstimate {
  const scenarios = COST_SCENARIOS.reduce((acc, scenario) => {
    acc[scenario] = aggregateScenario(targetCurrency, scenario, items);
    return acc;
  }, {} as Record<(typeof COST_SCENARIOS)[number], ScenarioTotal>);

  return { scenarios };
}

function aggregateScenario(targetCurrency: string, scenario: (typeof COST_SCENARIOS)[number], items: EstimateLineItem[]): ScenarioTotal {
  let total = new Prisma.Decimal(0);
  let unknownCount = 0;
  let everyIncludedIsStrongEvidence = true;
  let anyExcluded = false;
  let anyGlobalScope = false;

  for (const item of items) {
    const { resolved } = item;
    const amount = resolved.amounts[scenario];
    const currencyMatches = resolved.currency !== null && resolved.currency === item.targetCurrency && item.targetCurrency === targetCurrency;

    if (resolved.provenance === 'UNKNOWN' || amount === null || !currencyMatches) {
      unknownCount += 1;
      anyExcluded = true;
      continue;
    }

    total = total.plus(amount);

    if (resolved.provenance !== 'USER_INPUT' && resolved.provenance !== 'PROVIDER_EVIDENCE') {
      everyIncludedIsStrongEvidence = false;
    }
    if (resolved.assumptionScope === 'GLOBAL') {
      anyGlobalScope = true;
    }
  }

  const completeness: EstimateCompleteness = unknownCount > 0 ? 'PARTIAL' : 'COMPLETE';
  const confidence: EstimateConfidence = deriveConfidence(everyIncludedIsStrongEvidence, anyExcluded, anyGlobalScope, items.length);

  return { scenario, currency: targetCurrency, totalAmount: total, completeness, confidence, unknownCount };
}

/**
 * Estimate quality, explicitly NOT a statistical confidence interval (spec
 * section 44) - a simple, documented function of evidence composition:
 * HIGH when every included component is a user override or a live offer;
 * LOW when anything is excluded (UNKNOWN or a currency mismatch) or
 * resolved only at GLOBAL scope; MEDIUM otherwise (a mix, or specific-scope
 * rule-based estimates only).
 */
function deriveConfidence(everyIncludedIsStrongEvidence: boolean, anyExcluded: boolean, anyGlobalScope: boolean, itemCount: number): EstimateConfidence {
  if (itemCount === 0) return 'LOW';
  if (anyExcluded || anyGlobalScope) return 'LOW';
  if (everyIncludedIsStrongEvidence) return 'HIGH';
  return 'MEDIUM';
}
