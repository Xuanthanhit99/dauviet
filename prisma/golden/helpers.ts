/**
 * Shared, pure helpers for the domain-separated Golden Dataset (Phase 10,
 * spec section 44) - no Prisma calls, no side effects. Mirrors
 * `HistoricalDateInput`/`buildHistoricalDateColumns` from
 * `apps/api/src/common/historical-date` without importing across the
 * package boundary (same convention the original `prisma/seed.ts` already
 * used - see docs/backend/HISTORICAL_DOMAIN.md).
 */
import { DatePrecision, DateQualifier } from '@prisma/client';
import slugify from 'slugify';

export function slug(input: string): string {
  return slugify(input, { lower: true, strict: true, locale: 'vi' });
}

/** Mirrors HistoricalDateInput. `precision`/`qualifier` are independent axes (spec section 17) - never conflate "coarse" with "uncertain". */
export interface HistoricalDateSeed {
  year?: number;
  month?: number;
  day?: number;
  precision: DatePrecision;
  qualifier?: DateQualifier;
}

export const UNKNOWN_DATE: HistoricalDateSeed = { precision: DatePrecision.UNKNOWN, qualifier: DateQualifier.UNCERTAIN };

/** Only a year is reliably known (spec section 17 CRITICAL) - never fabricate a Jan-1 day. */
export function yearOnly(year: number, qualifier: DateQualifier = DateQualifier.EXACT): HistoricalDateSeed {
  return { year, precision: DatePrecision.YEAR, qualifier };
}

/** A specific day is independently, reliably sourced. */
export function exactDate(year: number, month: number, day: number): HistoricalDateSeed {
  return { year, month, day, precision: DatePrecision.DAY, qualifier: DateQualifier.EXACT };
}

/** Approximate/traditional dating - the qualifier communicates the uncertainty honestly rather than a false-precision exact date. */
export function circaYear(year: number): HistoricalDateSeed {
  return { year, precision: DatePrecision.YEAR, qualifier: DateQualifier.CIRCA };
}

/** Century-level precision only (e.g. a legendary/traditional founding). */
export function circaCentury(year: number): HistoricalDateSeed {
  return { year, precision: DatePrecision.CENTURY, qualifier: DateQualifier.CIRCA };
}

/** Deterministic sort-only bounds - mirrors the authoritative (validated) version in apps/api's historical-date.util.ts. */
export function sortBounds(d: HistoricalDateSeed): { start: Date | null; end: Date | null } {
  if (d.precision === DatePrecision.UNKNOWN || d.year == null) return { start: null, end: null };
  if (d.precision === DatePrecision.DAY) {
    const dt = new Date(Date.UTC(d.year, (d.month ?? 1) - 1, d.day ?? 1));
    return { start: dt, end: dt };
  }
  return { start: new Date(Date.UTC(d.year, 0, 1)), end: new Date(Date.UTC(d.year, 11, 31)) };
}

/** Golden Dataset version identifier (spec section 52) - bump when the dataset's scope/content is meaningfully revised, document why in GOLDEN_DATASET.md. */
export const GOLDEN_DATASET_VERSION = '2026-09-v1';
/** The date this dataset's source research was last performed/reviewed (spec sections 51/64) - distinct from any individual current-context fact's own review date. */
export const GOLDEN_DATASET_REVIEWED_AT = '2026-09-04';
