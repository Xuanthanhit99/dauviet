/**
 * Machine-readable Affiliate & Commercial Attribution (G10) error codes.
 * Same pattern as `PROVIDER_ERROR_CODES`/`TRIP_ERROR_CODES`. Provider
 * activation-gate failures (disabled/blocked/license-invalid/capability-
 * inactive/attribution-missing) reuse `PROVIDER_ERROR_CODES` directly -
 * never duplicated here (spec section 16/17 - "every provider-dependent
 * commercial action must use the existing G02 policy gate").
 */
export const AFFILIATE_ERROR_CODES = {
  AFFILIATE_PROVIDER_ENTITY_REQUIRED: 'AFFILIATE_PROVIDER_ENTITY_REQUIRED',
  AFFILIATE_REDIRECT_INVALID: 'AFFILIATE_REDIRECT_INVALID',
  AFFILIATE_REDIRECT_TOKEN_INVALID: 'AFFILIATE_REDIRECT_TOKEN_INVALID',
  AFFILIATE_REDIRECT_TOKEN_EXPIRED: 'AFFILIATE_REDIRECT_TOKEN_EXPIRED',
  AFFILIATE_ADAPTER_NOT_FOUND: 'AFFILIATE_ADAPTER_NOT_FOUND',
  AFFILIATE_CONVERSION_INVALID: 'AFFILIATE_CONVERSION_INVALID',
  AFFILIATE_CONVERSION_STALE_EVIDENCE: 'AFFILIATE_CONVERSION_STALE_EVIDENCE',
} as const;
