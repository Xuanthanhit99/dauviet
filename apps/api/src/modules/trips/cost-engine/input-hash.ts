import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';

/**
 * Deterministic, stable-key-order JSON hash of a calculation's resolved
 * inputs (spec section 48/93) - used as `TripCostEstimateGeneration.
 * inputHash` for idempotent recalculation: the orchestrating service looks
 * up `@@unique([tripId, inputHash, engineVersion])` before writing a new
 * generation. Object key order must never affect the hash (a `Map` iterated
 * in a different order, or a caller reassembling the same object with
 * fields in a different sequence, must still hash identically) - this is
 * the one thing plain `JSON.stringify` cannot be trusted for on its own.
 *
 * Deliberately synchronous, no I/O, no current-time dependence (spec
 * section 46) - every timestamp/freshness decision (which offers were
 * eligible, which assumption version won) must already be baked into the
 * `input` object the caller passes in, not read again inside this function.
 */
export function computeInputHash(input: unknown): string {
  const canonical = canonicalize(input);
  return createHash('sha256').update(canonical).digest('hex');
}

function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  // `Prisma.Decimal` normalizes on construction/arithmetic, so two Decimals
  // built differently but numerically equal (`new Decimal('1.50')` vs
  // `new Decimal('1.5')`) must hash identically - `.toString()` already
  // gives that (decimal.js strips insignificant trailing zeros), whereas
  // hashing the internal digit/exponent/sign representation would not.
  if (value instanceof Prisma.Decimal) return JSON.stringify(value.toString());
  // `Date` has no own enumerable properties, so without this check it would
  // silently canonicalize as `{}` for every timestamp - an obvious
  // correctness bug (every date would hash the same).
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const entries = keys.map((key) => `${JSON.stringify(key)}:${canonicalize((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}
