/**
 * Machine-readable media error codes (Phase 05.1). Same pattern as
 * `AUTH_ERROR_CODES`/`TRUST_ERROR_CODES` - passed as the `code` field of a
 * Nest HttpException, surfaced by `AllExceptionsFilter` as `error.code`.
 */
export const MEDIA_ERROR_CODES = {
  OBJECT_NOT_FOUND: 'MEDIA_OBJECT_NOT_FOUND',
  SIGNATURE_MISMATCH: 'MEDIA_SIGNATURE_MISMATCH',
  CHECKSUM_MISMATCH: 'MEDIA_CHECKSUM_MISMATCH',
  NOT_OWNED: 'MEDIA_NOT_OWNED',
  NOT_READY: 'MEDIA_NOT_READY',
} as const;
