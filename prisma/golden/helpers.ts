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

/**
 * G12 chronology remediation. The seed wrote each row's cited year/month/day/
 * precision/qualifier but never the G03 authoritative chronology ordinals, so
 * a freshly seeded database had every Golden-Dataset event/era/dynasty/person/
 * fact "unknown-dated" for timeline ordering and G11 strict period filters.
 * These mirror `ordinalBoundsFor`/`buildHistoricalDateColumns`/
 * `buildHistoricalPeriodColumns` in apps/api's historical-date.util.ts (and
 * the G03 migration's backfill SQL) for CE years - `HistoricalDateSeed` has no
 * `era`, so every seed date is CE by construction. Nothing is derived from an
 * UNKNOWN precision or a missing year: those stay null (unknown != every
 * period). Parity with the real util is asserted for every Golden-Dataset spec
 * by apps/api/src/common/historical-date/seed-chronology-parity.spec.ts.
 */
export const CHRONOLOGY_FAR_PAST = -37199629;
export const CHRONOLOGY_FAR_FUTURE = 3720000;
const DAYS_PER_YEAR = 372;
const DAYS_PER_MONTH = 31;

function ordinalBounds(year: number | undefined, month: number | undefined, day: number | undefined, precision: DatePrecision): { start: number; end: number } | null {
  if (year == null || precision === DatePrecision.UNKNOWN) return null;
  if (year < 1) throw new Error(`Seed chronology is CE-only; got year ${year}.`);
  const at = (y: number, m: number, d: number) => y * DAYS_PER_YEAR + (m - 1) * DAYS_PER_MONTH + (d - 1);
  switch (precision) {
    case DatePrecision.DAY:
      return { start: at(year, month!, day!), end: at(year, month!, day!) };
    case DatePrecision.MONTH:
      return { start: at(year, month!, 1), end: at(year, month!, DAYS_PER_MONTH) };
    case DatePrecision.YEAR:
      return { start: at(year, 1, 1), end: at(year, 12, DAYS_PER_MONTH) };
    case DatePrecision.DECADE: {
      const from = Math.floor(year / 10) * 10;
      return { start: at(from, 1, 1), end: at(from + 9, 12, DAYS_PER_MONTH) };
    }
    case DatePrecision.CENTURY: {
      const from = Math.floor((year - 1) / 100) * 100 + 1;
      return { start: at(from, 1, 1), end: at(from + 99, 12, DAYS_PER_MONTH) };
    }
    default:
      return null;
  }
}

/** Single-date slot (event, fact, person birth/death). `rangeEndYear` is the BETWEEN end, sharing the start's precision. */
export function chronologyForDate(d: HistoricalDateSeed, rangeEndYear?: number): { start: number | null; end: number | null } {
  const primary = ordinalBounds(d.year, d.month, d.day, d.precision);
  if (!primary) return { start: null, end: null };
  if (rangeEndYear != null) {
    const end = ordinalBounds(rangeEndYear, undefined, undefined, d.precision);
    return { start: primary.start, end: end!.end };
  }
  switch (d.qualifier) {
    case DateQualifier.BEFORE:
      return { start: CHRONOLOGY_FAR_PAST, end: primary.end };
    case DateQualifier.AFTER:
      return { start: primary.start, end: CHRONOLOGY_FAR_FUTURE };
    default:
      return primary;
  }
}

/** Period (era, dynasty): no `end` means still ongoing (FAR_FUTURE), not unknown - the Phase 03 convention. */
export function chronologyForPeriod(start: HistoricalDateSeed, end?: HistoricalDateSeed): { start: number | null; end: number | null } {
  const s = chronologyForDate(start);
  const e = end ? chronologyForDate(end).end : CHRONOLOGY_FAR_FUTURE;
  return { start: s.start, end: e };
}

/** Golden Dataset version identifier (spec section 52) - bump when the dataset's scope/content is meaningfully revised, document why in GOLDEN_DATASET.md. */
export const GOLDEN_DATASET_VERSION = '2026-09-v1';
/** The date this dataset's source research was last performed/reviewed (spec sections 51/64) - distinct from any individual current-context fact's own review date. */
export const GOLDEN_DATASET_REVIEWED_AT = '2026-09-04';
