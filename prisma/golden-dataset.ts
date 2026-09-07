/**
 * Stable re-export (docs/backend/HISTORICAL_DOMAIN.md: "prisma/golden-
 * dataset.ts is the single source of truth for this data"). Phase 10
 * (spec section 44) moved the actual domain-separated definitions into
 * `prisma/golden/*` for maintainability; this file's import path is kept
 * unchanged so `golden-dataset.spec.ts` and every doc reference that
 * already points here continue to work without modification.
 */
export { GOLDEN_PLACES, type PlaceSeedSpec } from './golden/places';
