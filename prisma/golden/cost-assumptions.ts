/**
 * G06 - Trip Planner + Cost Engine. Deliberately DRAFT-only, GLOBAL-scoped
 * illustrative fixture rows - NOT real production cost figures.
 *
 * Real `ACTIVE` `CostAssumption` values (per-diem food costs, accommodation
 * fallback ranges, local transport allowances, activity allowances - and any
 * country/destination-specific override for Vietnam/Japan) are a genuine
 * product/finance decision this seed does not fabricate, exactly per
 * docs/backend/G06_PRE_IMPLEMENTATION_REPORT.md section 3.6: "This report
 * does not invent real-world cost figures... doing so would itself violate
 * the brief's own repeated instruction never to invent numeric costs."
 * These rows exist only so the precedence engine and its deterministic unit/
 * e2e tests have something real to resolve against - they must never be
 * promoted to ACTIVE without an explicit product/finance sign-off (mirrors
 * G02's own precedent of shipping zero real production provider licenses by
 * design).
 */

export interface CostAssumptionFixtureSpec {
  key: string;
  category: string;
  unit: string;
  currency: string;
  lowAmount: string;
  typicalAmount: string;
  highAmount: string;
  effectiveFrom: string;
  source: string;
}

export const GOLDEN_COST_ASSUMPTIONS: CostAssumptionFixtureSpec[] = [
  {
    key: 'COST_ASSUMPTION_GLOBAL_FOOD',
    category: 'FOOD',
    unit: 'PER_PERSON_PER_DAY',
    currency: 'USD',
    lowAmount: '10',
    typicalAmount: '25',
    highAmount: '60',
    effectiveFrom: '2026-01-01',
    source: 'DRAFT illustrative placeholder - not a product/finance-sourced figure (see file doc comment).',
  },
  {
    key: 'COST_ASSUMPTION_GLOBAL_STAY',
    category: 'STAY',
    unit: 'PER_ROOM_PER_NIGHT',
    currency: 'USD',
    lowAmount: '20',
    typicalAmount: '60',
    highAmount: '150',
    effectiveFrom: '2026-01-01',
    source: 'DRAFT illustrative placeholder - not a product/finance-sourced figure (see file doc comment).',
  },
  {
    key: 'COST_ASSUMPTION_GLOBAL_ACTIVITY',
    category: 'ACTIVITY',
    unit: 'PER_PERSON',
    currency: 'USD',
    lowAmount: '5',
    typicalAmount: '20',
    highAmount: '50',
    effectiveFrom: '2026-01-01',
    source: 'DRAFT illustrative placeholder - not a product/finance-sourced figure (see file doc comment).',
  },
  {
    key: 'COST_ASSUMPTION_GLOBAL_TRANSPORT',
    category: 'TRANSPORT',
    unit: 'PER_PERSON_PER_DAY',
    currency: 'USD',
    lowAmount: '3',
    typicalAmount: '10',
    highAmount: '25',
    effectiveFrom: '2026-01-01',
    source: 'DRAFT illustrative placeholder - not a product/finance-sourced figure (see file doc comment).',
  },
];
