/**
 * Machine-readable trust-layer error codes (Phase 04, spec section 51).
 * Passed as the `code` field of Nest's HttpException response body, which
 * `AllExceptionsFilter` surfaces as `error.code` - same pattern as
 * `AUTH_ERROR_CODES` (see `modules/auth/auth-error-codes.ts`).
 */
export const TRUST_ERROR_CODES = {
  FACT_CITATION_REQUIRED: 'FACT_CITATION_REQUIRED',
  FACT_REVIEW_REQUIRED: 'FACT_REVIEW_REQUIRED',
  FACT_SELF_APPROVAL_FORBIDDEN: 'FACT_SELF_APPROVAL_FORBIDDEN',
  FACT_INVALID_TRANSITION: 'FACT_INVALID_TRANSITION',

  CITATION_NOT_VERIFIED: 'CITATION_NOT_VERIFIED',
  CITATION_ALREADY_VERIFIED: 'CITATION_ALREADY_VERIFIED',

  SOURCE_IN_USE: 'SOURCE_IN_USE',
  SOURCE_RESTRICTED: 'SOURCE_RESTRICTED',

  DOCUMENT_ACCESS_DENIED: 'DOCUMENT_ACCESS_DENIED',
} as const;
