import { BadRequestException } from '@nestjs/common';
import { DateEra, DatePrecision, DateQualifier } from '@prisma/client';
import {
  HistoricalDateColumns,
  HistoricalDateInput,
  HistoricalDateResponse,
  HistoricalPeriodColumns,
  HistoricalPeriodResponse,
  SupportedLocale,
} from './historical-date.types';

/**
 * Historical date model (spec section 3, CRITICAL; extended G03 for BCE/CE -
 * see docs/backend/HISTORICAL_DATE_V2.md for the full contract).
 *
 * The database never stores a fabricated day/month for a date whose
 * precision is coarser than DAY. `year`/`month`/`day` are nullable columns
 * that hold exactly what is known - nothing more.
 *
 * BCE/CE (G03): `year` is always a POSITIVE, 1-based, in-era display number
 * - 1 BCE and 1 CE are adjacent, there is no historical year zero exposed
 * anywhere, in either era.
 *
 * Chronology storage (G03, revised): the pre-existing `sortStart`/`sortEnd`
 * `DateTime` columns are computed via `Date.UTC`, which has a legacy
 * two-digit-year special case - `Date.UTC(0..99, ...)` silently maps to
 * 1900-1999. Since the astronomical-year conversion below produces exactly
 * astronomical years 0-99 for CE years 1-99 and for BCE year 1, using
 * `Date.UTC`/`DateTime` as the AUTHORITATIVE sort/range-filter key would
 * corrupt chronology for that entire window. `chronologyStart`/
 * `chronologyEnd` (pure integer arithmetic, no `Date`/`DateTime`/timestamp
 * of any kind) are the authoritative fields as of G03 and are ALWAYS
 * populated whenever a year is known, regardless of era.
 *
 * Legacy timestamp policy (G03, explicit): `sortStart`/`sortEnd` remain a
 * backward-compatible artifact only, and are ONLY populated when they can
 * SAFELY represent the date under legacy CE semantics - i.e. CE year >= 100
 * (see `isLegacyDateTimeSafe`). A BCE date, or a CE date in the unsafe 1-99
 * window, gets `sortStart`/`sortEnd` = `null`, NEVER a fabricated timestamp
 * (no "1 BCE -> 1900", "50 CE -> 1950" or similar). Every value in the
 * existing Vietnam Golden Dataset is CE >= 100, so this changes nothing for
 * any pre-G03 row or caller.
 */

/** BCE year N -> astronomical/proleptic year -(N-1) (1 BCE = year 0, 2 BCE = year -1, ...). CE year N -> N unchanged. */
function toAstronomicalYear(year: number, era: DateEra): number {
  return era === DateEra.BCE ? -(year - 1) : year;
}

/**
 * Product-supported year range (G03, revised - not derived from `Date`'s
 * range). MAX_BCE_YEAR (100,000 BCE) comfortably covers every named ancient
 * civilization and early-archaeology reference this platform is expected to
 * carry (Neolithic Vietnam/Japan, Bronze-Age Greece/Egypt, Sumer, and
 * further back) with wide margin, without reaching for an arbitrary huge
 * ceiling. MAX_CE_YEAR (9999) keeps the CE side a normal four-digit calendar
 * year with millennia of headroom past the present.
 */
const MAX_CE_YEAR = 9999;
const MAX_BCE_YEAR = 100000;
const MIN_ASTRONOMICAL_YEAR = toAstronomicalYear(MAX_BCE_YEAR, DateEra.BCE); // -99999
const MAX_ASTRONOMICAL_YEAR = toAstronomicalYear(MAX_CE_YEAR, DateEra.CE); // 9999

/**
 * Chronology ordinal (G03 authoritative sort/range-filter key). A virtual,
 * fixed 12-month x 31-day calendar packed into one integer - NOT a real
 * proleptic-Gregorian day count, and never used to reconstruct a real
 * calendar date (only `year`/`month`/`day` + `precision` do that). It only
 * has to be a correct, deterministic, purely-arithmetic ORDERING key, and
 * this is provably one: for a fixed astronomical year, the ordinal strictly
 * increases with month then day; across different astronomical years, the
 * per-year coefficient (372) exceeds the maximum possible month/day
 * contribution (11*31 + 30 = 371), so the year term always dominates and
 * years can never interleave incorrectly regardless of month/day. No
 * Date/DateTime/timestamp of any kind is involved.
 *
 * Range/magnitude proof: with MIN_ASTRONOMICAL_YEAR/MAX_ASTRONOMICAL_YEAR at
 * +/-99999, the largest possible |ordinal| is on the order of
 * 99999 * 372 ~= 37.2 million - comfortably inside a 32-bit signed Int
 * (max ~2.15 billion, ~57x headroom), so a plain `Int` column (not BigInt)
 * is sufficient and is what the schema uses.
 */
const ORDINAL_DAYS_PER_MONTH = 31;
export const CHRONOLOGY_DAYS_PER_YEAR = 12 * ORDINAL_DAYS_PER_MONTH; // 372

function toOrdinal(astronomicalYear: number, month: number, day: number): number {
  return astronomicalYear * CHRONOLOGY_DAYS_PER_YEAR + (month - 1) * ORDINAL_DAYS_PER_MONTH + (day - 1);
}

/**
 * One past the earliest/latest representable ordinal - used as BEFORE/AFTER
 * open-ended sentinels, never a historical claim. Exported (read-only) so
 * the G03 migration backfill's hardcoded SQL copies of these two constants
 * can be asserted equal to this, real, computed value - see
 * chronology-backfill-parity.spec.ts.
 */
export const ORDINAL_FAR_PAST = toOrdinal(MIN_ASTRONOMICAL_YEAR, 1, 1) - 1;
export const ORDINAL_FAR_FUTURE = toOrdinal(MAX_ASTRONOMICAL_YEAR, 12, ORDINAL_DAYS_PER_MONTH) + 1;

/** Converts an in-era year+era to the chronology ordinal of that year's first virtual day - exported for TimelineQueryDto's explicit fromYear/fromEra query bound. */
export function toChronologyYearStart(year: number, era: DateEra): number {
  return toOrdinal(toAstronomicalYear(year, era), 1, 1);
}

/** Converts an in-era year+era to the chronology ordinal of that year's last virtual day - exported for TimelineQueryDto's explicit toYear/toEra query bound. */
export function toChronologyYearEnd(year: number, era: DateEra): number {
  return toOrdinal(toAstronomicalYear(year, era), 12, ORDINAL_DAYS_PER_MONTH);
}

/**
 * Chronological distance, in WHOLE YEARS, between two (year, era) points -
 * `astronomicalYear(to) - astronomicalYear(from)`. Deliberately NOT an
 * ordinal subtraction (`toChronologyYearEnd(to) - toChronologyYearStart(from)`
 * would be off by up to 371 - the "rest of the end year" span baked into
 * `toChronologyYearEnd`) - this is exact whole-year arithmetic, safe for a
 * range-size guard like TimelineQueryDto's MAX_RANGE_YEARS, including across
 * a BCE->CE boundary (300 BCE -> 200 BCE is a 100-year span despite 300 and
 * 200 both being positive in-era numbers moving the "wrong" numeric
 * direction).
 */
export function chronologyYearSpan(fromYear: number, fromEra: DateEra, toYear: number, toEra: DateEra): number {
  return toAstronomicalYear(toYear, toEra) - toAstronomicalYear(fromYear, fromEra);
}

/** G03: `sortStart`/`sortEnd` (legacy) are only safe to populate for CE year >= 100 - see file header "Legacy timestamp policy". A BCE date, or CE 1-99, gets null legacy fields instead of a Date.UTC-corrupted value. */
function isLegacyDateTimeSafe(year: number | null, era: DateEra): boolean {
  if (year == null) return true;
  if (era === DateEra.BCE) return false;
  return year >= 100;
}

/**
 * Sentinels for the legacy Date-based `sortStart`/`sortEnd` pair only
 * (BEFORE/AFTER open ends). Pushed back to comfortably precede/follow any
 * plausible year while staying within JS `Date`'s valid range - this legacy
 * pair is not authoritative (see file header) so its own far-past/future
 * constants do not need to be as precisely bounded as the ordinal ones.
 */
const FAR_PAST = new Date(Date.UTC(-60000, 0, 1));
const FAR_FUTURE = new Date(Date.UTC(9999, 11, 31));

function assert(condition: boolean, message: string): void {
  if (!condition) throw new BadRequestException(message);
}

function assertMonthDay(month?: number | null, day?: number | null, ctx = ''): void {
  if (month != null) assert(month >= 1 && month <= 12, `Invalid month${ctx}: must be 1-12.`);
  if (day != null) assert(day >= 1 && day <= 31, `Invalid day${ctx}: must be 1-31.`);
}

/** G03 (spec section 23/63): year is always a positive, 1-based, in-era number - no historical year zero, in either era, ever. The ceiling is era-specific (MAX_BCE_YEAR vs MAX_CE_YEAR), not a single shared value. */
function assertYear(year: number | null | undefined, era: DateEra, ctx = ''): void {
  if (year == null) return;
  assert(year >= 1, `Invalid year${ctx}: there is no historical year zero - year must be >= 1 in either era.`);
  const max = era === DateEra.BCE ? MAX_BCE_YEAR : MAX_CE_YEAR;
  assert(year <= max, `Invalid year${ctx}: exceeds the maximum representable ${era} year (${max}).`);
}

/**
 * Validates that the year/month/day granularity actually matches the
 * declared precision - the mechanism that stops "1288" from silently
 * becoming "1288-01-01": DAY precision is the only precision allowed to
 * carry a day at all.
 */
function validatePrecisionGranularity(
  year: number | null | undefined,
  month: number | null | undefined,
  day: number | null | undefined,
  precision: DatePrecision,
  era: DateEra,
  ctx = '',
): void {
  assertMonthDay(month, day, ctx);
  assertYear(year, era, ctx);
  switch (precision) {
    case DatePrecision.UNKNOWN:
      assert(year == null && month == null && day == null, `UNKNOWN precision${ctx} must not carry year/month/day.`);
      break;
    case DatePrecision.CENTURY:
    case DatePrecision.DECADE:
    case DatePrecision.YEAR:
      assert(year != null, `${precision} precision${ctx} requires a year.`);
      assert(month == null && day == null, `${precision} precision${ctx} must not carry a month or day.`);
      break;
    case DatePrecision.MONTH:
      assert(year != null && month != null, `MONTH precision${ctx} requires a year and month.`);
      assert(day == null, `MONTH precision${ctx} must not carry a day.`);
      break;
    case DatePrecision.DAY:
      assert(year != null && month != null && day != null, `DAY precision${ctx} requires year, month and day.`);
      break;
  }
}

function lastDayOfMonth(astronomicalYear: number, month: number): number {
  return new Date(Date.UTC(astronomicalYear, month, 0)).getUTCDate();
}

/**
 * Legacy Date-based bounds (see file header - `sortStart`/`sortEnd` only,
 * NOT authoritative as of G03). Unchanged from pre-G03 other than the `era`
 * parameter/astronomical-year substitution, which existed before this
 * revision and is left as-is since this function is no longer relied on for
 * correctness in the 0-99 astronomical window.
 */
function boundsFor(
  year: number | null,
  month: number | null,
  day: number | null,
  precision: DatePrecision,
  era: DateEra,
): { start: Date; end: Date } | null {
  if (precision === DatePrecision.UNKNOWN || year == null) return null;
  const astro = (y: number) => toAstronomicalYear(y, era);
  switch (precision) {
    case DatePrecision.DAY: {
      const d = new Date(Date.UTC(astro(year), month! - 1, day!));
      return { start: d, end: d };
    }
    case DatePrecision.MONTH: {
      const y = astro(year);
      return {
        start: new Date(Date.UTC(y, month! - 1, 1)),
        end: new Date(Date.UTC(y, month! - 1, lastDayOfMonth(y, month!))),
      };
    }
    case DatePrecision.YEAR: {
      const y = astro(year);
      return { start: new Date(Date.UTC(y, 0, 1)), end: new Date(Date.UTC(y, 11, 31)) };
    }
    case DatePrecision.DECADE: {
      const decadeStart = Math.floor(year / 10) * 10;
      const decadeEnd = decadeStart + 9;
      const [earliest, latest] = [astro(decadeStart), astro(decadeEnd)].sort((a, b) => a - b);
      return { start: new Date(Date.UTC(earliest, 0, 1)), end: new Date(Date.UTC(latest, 11, 31)) };
    }
    case DatePrecision.CENTURY: {
      const centuryStart = Math.floor((year - 1) / 100) * 100 + 1;
      const centuryEnd = centuryStart + 99;
      const [earliest, latest] = [astro(centuryStart), astro(centuryEnd)].sort((a, b) => a - b);
      return { start: new Date(Date.UTC(earliest, 0, 1)), end: new Date(Date.UTC(latest, 11, 31)) };
    }
    default:
      return null;
  }
}

/**
 * Authoritative ordinal bounds (G03) - structurally mirrors `boundsFor`
 * above (same DECADE/CENTURY boundary-year math, including the
 * independently-converted-then-sorted astronomical years for the BCE
 * chronological-inversion case), but every bound is a `toOrdinal(...)`
 * integer, never a `Date`. For MONTH precision, the virtual calendar's
 * fixed 31-day month means the end bound is always `toOrdinal(y, month, 31)`
 * - no real-calendar `lastDayOfMonth` lookup is needed (or wanted) here.
 */
function ordinalBoundsFor(
  year: number | null,
  month: number | null,
  day: number | null,
  precision: DatePrecision,
  era: DateEra,
): { start: number; end: number } | null {
  if (precision === DatePrecision.UNKNOWN || year == null) return null;
  const astro = (y: number) => toAstronomicalYear(y, era);
  switch (precision) {
    case DatePrecision.DAY: {
      const o = toOrdinal(astro(year), month!, day!);
      return { start: o, end: o };
    }
    case DatePrecision.MONTH: {
      const y = astro(year);
      return { start: toOrdinal(y, month!, 1), end: toOrdinal(y, month!, ORDINAL_DAYS_PER_MONTH) };
    }
    case DatePrecision.YEAR: {
      const y = astro(year);
      return { start: toOrdinal(y, 1, 1), end: toOrdinal(y, 12, ORDINAL_DAYS_PER_MONTH) };
    }
    case DatePrecision.DECADE: {
      const decadeStart = Math.floor(year / 10) * 10;
      const decadeEnd = decadeStart + 9;
      const [earliest, latest] = [astro(decadeStart), astro(decadeEnd)].sort((a, b) => a - b);
      return { start: toOrdinal(earliest, 1, 1), end: toOrdinal(latest, 12, ORDINAL_DAYS_PER_MONTH) };
    }
    case DatePrecision.CENTURY: {
      const centuryStart = Math.floor((year - 1) / 100) * 100 + 1;
      const centuryEnd = centuryStart + 99;
      const [earliest, latest] = [astro(centuryStart), astro(centuryEnd)].sort((a, b) => a - b);
      return { start: toOrdinal(earliest, 1, 1), end: toOrdinal(latest, 12, ORDINAL_DAYS_PER_MONTH) };
    }
    default:
      return null;
  }
}

/**
 * Validates a raw editor input and normalizes it into the flat column shape
 * for a single-point date slot (Event.date, HistoricalFact.date, Person
 * birth/death). Throws `BadRequestException` on invalid combinations
 * (section 35) - never silently coerces.
 */
export function buildHistoricalDateColumns(input: HistoricalDateInput | null | undefined): HistoricalDateColumns {
  if (!input) {
    return {
      year: null,
      month: null,
      day: null,
      precision: DatePrecision.UNKNOWN,
      qualifier: DateQualifier.UNCERTAIN,
      era: DateEra.CE,
      endYear: null,
      endMonth: null,
      endDay: null,
      label: null,
      sortStart: null,
      sortEnd: null,
      chronologyStart: null,
      chronologyEnd: null,
    };
  }

  const year = input.year ?? null;
  const month = input.month ?? null;
  const day = input.day ?? null;
  const precision = input.precision;
  const qualifier = input.qualifier ?? (precision === DatePrecision.UNKNOWN ? DateQualifier.UNCERTAIN : DateQualifier.EXACT);
  // G03: defaults to CE - every pre-G03 caller that never set `era` keeps its exact prior meaning.
  const era = input.era ?? DateEra.CE;

  validatePrecisionGranularity(year, month, day, precision, era);

  const hasRangeEnd = input.rangeEndYear != null || input.rangeEndMonth != null || input.rangeEndDay != null;
  if (qualifier === DateQualifier.BETWEEN) {
    assert(input.rangeEndYear != null, 'BETWEEN qualifier requires rangeEndYear.');
    validatePrecisionGranularity(input.rangeEndYear, input.rangeEndMonth ?? null, input.rangeEndDay ?? null, precision, era, ' (range end)');
  } else {
    assert(!hasRangeEnd, 'rangeEnd* fields are only valid when qualifier is BETWEEN.');
  }

  const primaryOrdinal = ordinalBoundsFor(year, month, day, precision, era);
  // Legacy sortStart/sortEnd are computed independently of chronologyStart/
  // chronologyEnd (see file header "Legacy timestamp policy") - the legacy
  // Date-based bounds are only even looked at when isLegacyDateTimeSafe
  // passes; a BCE (or unsafe-window CE 1-99) date never sets them.
  const legacySafe = isLegacyDateTimeSafe(year, era);
  const primaryBounds = legacySafe ? boundsFor(year, month, day, precision, era) : null;
  let sortStart: Date | null = null;
  let sortEnd: Date | null = null;
  let chronologyStart: number | null = null;
  let chronologyEnd: number | null = null;

  // Authoritative chronology (always populated whenever a year is known, regardless of era or legacy safety).
  if (primaryOrdinal) {
    switch (qualifier) {
      case DateQualifier.BEFORE:
        chronologyStart = ORDINAL_FAR_PAST;
        chronologyEnd = primaryOrdinal.end;
        break;
      case DateQualifier.AFTER:
        chronologyStart = primaryOrdinal.start;
        chronologyEnd = ORDINAL_FAR_FUTURE;
        break;
      case DateQualifier.BETWEEN: {
        // Shares `era` with the primary date (see HistoricalDateInput.rangeEnd* doc comment).
        const endOrdinal = ordinalBoundsFor(input.rangeEndYear ?? null, input.rangeEndMonth ?? null, input.rangeEndDay ?? null, precision, era);
        // Authoritative check is ordinal-based (Date.UTC-based comparison is not trustworthy in the 0-99 astronomical-year window - see file header).
        assert(!!endOrdinal && endOrdinal.end >= primaryOrdinal.start, 'rangeEnd must not be before the start date.');
        chronologyStart = primaryOrdinal.start;
        chronologyEnd = endOrdinal!.end;
        break;
      }
      default:
        chronologyStart = primaryOrdinal.start;
        chronologyEnd = primaryOrdinal.end;
    }
  }

  // Legacy sortStart/sortEnd - only when primaryBounds exists (year known AND legacy-safe for the primary date).
  if (primaryBounds) {
    switch (qualifier) {
      case DateQualifier.BEFORE:
        sortStart = FAR_PAST;
        sortEnd = primaryBounds.end;
        break;
      case DateQualifier.AFTER:
        sortStart = primaryBounds.start;
        sortEnd = FAR_FUTURE;
        break;
      case DateQualifier.BETWEEN: {
        // The range end may independently be legacy-unsafe even when the start isn't - sortEnd stays null in that case rather than a corrupted value.
        const endLegacySafe = isLegacyDateTimeSafe(input.rangeEndYear ?? null, era);
        const endBounds = endLegacySafe ? boundsFor(input.rangeEndYear ?? null, input.rangeEndMonth ?? null, input.rangeEndDay ?? null, precision, era) : null;
        sortStart = primaryBounds.start;
        sortEnd = endBounds ? endBounds.end : null;
        break;
      }
      default:
        sortStart = primaryBounds.start;
        sortEnd = primaryBounds.end;
    }
  }

  return {
    year,
    month,
    day,
    precision,
    qualifier,
    era,
    endYear: qualifier === DateQualifier.BETWEEN ? input.rangeEndYear ?? null : null,
    endMonth: qualifier === DateQualifier.BETWEEN ? input.rangeEndMonth ?? null : null,
    endDay: qualifier === DateQualifier.BETWEEN ? input.rangeEndDay ?? null : null,
    label: input.label ?? null,
    sortStart,
    sortEnd,
    chronologyStart,
    chronologyEnd,
  };
}

/**
 * Validates/normalizes a period (Era, Dynasty, Territory validity): an
 * independently-qualified `start` and an optional `end` (absent `end` means
 * "still ongoing / no known end", distinct from an explicitly UNKNOWN end).
 */
export function buildHistoricalPeriodColumns(
  start: HistoricalDateInput,
  end?: HistoricalDateInput | null,
  label?: string | null,
): HistoricalPeriodColumns {
  const startCols = buildHistoricalDateColumns(start);
  assert(startCols.qualifier !== DateQualifier.BETWEEN, 'A period start cannot itself be a BETWEEN range - use start/end instead.');

  let endYear: number | null = null;
  let endMonth: number | null = null;
  let endDay: number | null = null;
  let endPrecision: DatePrecision | null = null;
  let endQualifier: DateQualifier | null = null;
  // G03: null exactly when there is no recorded end (mirrors endPrecision/
  // endQualifier's own convention) - a period's start/end eras are fully
  // independent, which is exactly what makes a BCE->CE period (e.g. "1 BCE
  // - 1 CE") representable without ever exposing a year zero.
  let endEra: DateEra | null = null;
  let sortEnd: Date | null = null;
  let chronologyEnd: number | null = null;

  if (end) {
    const endCols = buildHistoricalDateColumns(end);
    assert(endCols.qualifier !== DateQualifier.BETWEEN, 'A period end cannot itself be a BETWEEN range.');
    endYear = endCols.year;
    endMonth = endCols.month;
    endDay = endCols.day;
    endPrecision = endCols.precision;
    endQualifier = endCols.qualifier;
    endEra = endCols.era;
    sortEnd = endCols.sortEnd;
    chronologyEnd = endCols.chronologyEnd;

    // Authoritative check is ordinal-based (see buildHistoricalDateColumns BETWEEN case for why sortEnd/sortStart are not trustworthy here).
    if (startCols.chronologyStart != null && endCols.chronologyEnd != null) {
      assert(endCols.chronologyEnd >= startCols.chronologyStart, 'Period end must not be before period start.');
    }
  } else {
    sortEnd = FAR_FUTURE;
    chronologyEnd = ORDINAL_FAR_FUTURE;
  }

  return {
    startYear: startCols.year,
    startMonth: startCols.month,
    startDay: startCols.day,
    startPrecision: startCols.precision,
    startQualifier: startCols.qualifier,
    startEra: startCols.era,
    endYear,
    endMonth,
    endDay,
    endPrecision,
    endQualifier,
    endEra,
    dateLabel: label ?? null,
    sortStart: startCols.sortStart,
    sortEnd,
    chronologyStart: startCols.chronologyStart,
    chronologyEnd,
  };
}

const ORDINALS_EN: Record<number, string> = { 1: 'st', 2: 'nd', 3: 'rd' };
function ordinalEn(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ORDINALS_EN[n % 10] ?? 'th';
  return `${n}${suffix}`;
}

const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * G03: `era` appends the honest BCE marker (" TCN" vi / " BCE" en) after the
 * otherwise-unchanged core string. CE is deliberately left UNMARKED (spec
 * section 28) - this is both standard historical convention (CE is usually
 * implicit, BCE is always marked) and what makes every pre-G03 display
 * string byte-for-byte identical to before.
 */
function formatCore(
  year: number | null,
  month: number | null,
  day: number | null,
  precision: DatePrecision,
  locale: SupportedLocale,
  era: DateEra = DateEra.CE,
): string {
  if (year == null) return locale === 'vi' ? 'không rõ' : 'unknown';
  const eraSuffix = era === DateEra.BCE ? (locale === 'vi' ? ' TCN' : ' BCE') : '';
  switch (precision) {
    case DatePrecision.DAY:
      return (locale === 'vi' ? `ngày ${day} tháng ${month} năm ${year}` : `${day} ${EN_MONTHS[month! - 1]} ${year}`) + eraSuffix;
    case DatePrecision.MONTH:
      return (locale === 'vi' ? `tháng ${month} năm ${year}` : `${EN_MONTHS[month! - 1]} ${year}`) + eraSuffix;
    case DatePrecision.YEAR:
      return (locale === 'vi' ? `năm ${year}` : `${year}`) + eraSuffix;
    case DatePrecision.DECADE: {
      const decadeStart = Math.floor(year / 10) * 10;
      return (locale === 'vi' ? `thập niên ${decadeStart}` : `the ${decadeStart}s`) + eraSuffix;
    }
    case DatePrecision.CENTURY: {
      const centuryNumber = Math.floor((year - 1) / 100) + 1;
      return (locale === 'vi' ? `thế kỷ ${centuryNumber}` : `the ${ordinalEn(centuryNumber)} century`) + eraSuffix;
    }
    default:
      return locale === 'vi' ? 'không rõ' : 'unknown';
  }
}

/**
 * Centralized display formatting (spec section 4: "do not hardcode
 * Vietnamese display if locale-aware formatting belongs elsewhere"). This is
 * that one place. Currently supports vi/en; unrecognised locales fall back
 * to en. An editor-supplied `label` always wins - it is an intentional
 * override, not a fallback.
 */
export function formatHistoricalDate(
  value: {
    year: number | null;
    month: number | null;
    day: number | null;
    precision: DatePrecision;
    qualifier: DateQualifier;
    /** Defaults to CE - every pre-G03 caller that never set this displays exactly as before. */
    era?: DateEra;
    rangeEnd?: { year: number | null; month: number | null; day: number | null } | null;
    label?: string | null;
  },
  locale: string,
): string {
  if (value.label) return value.label;
  const loc: SupportedLocale = locale === 'vi' ? 'vi' : 'en';
  const era = value.era ?? DateEra.CE;

  if (value.precision === DatePrecision.UNKNOWN || value.year == null) {
    return loc === 'vi' ? 'Không rõ ngày tháng' : 'Date unknown';
  }

  const core = formatCore(value.year, value.month, value.day, value.precision, loc, era);

  switch (value.qualifier) {
    case DateQualifier.EXACT:
      return loc === 'vi' ? capitalize(core) : capitalize(core);
    case DateQualifier.CIRCA:
      return loc === 'vi' ? `Khoảng ${core}` : `Circa ${core}`;
    case DateQualifier.BEFORE:
      return loc === 'vi' ? `Trước ${core}` : `Before ${core}`;
    case DateQualifier.AFTER:
      return loc === 'vi' ? `Sau ${core}` : `After ${core}`;
    case DateQualifier.UNCERTAIN:
      return loc === 'vi' ? `${capitalize(core)} (chưa chắc chắn)` : `${capitalize(core)} (uncertain)`;
    case DateQualifier.TRADITIONAL:
      return loc === 'vi' ? `${capitalize(core)} (theo truyền thuyết)` : `${capitalize(core)} (traditional account)`;
    case DateQualifier.BETWEEN: {
      // Range end shares `era` with the primary date (see HistoricalDateInput.rangeEnd* doc comment).
      const endCore = value.rangeEnd
        ? formatCore(value.rangeEnd.year, value.rangeEnd.month, value.rangeEnd.day, value.precision, loc, era)
        : core;
      return loc === 'vi' ? `Giữa ${core} và ${endCore}` : `Between ${core} and ${endCore}`;
    }
    default:
      return capitalize(core);
  }
}

function capitalize(s: string): string {
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function toHistoricalDateResponse(columns: HistoricalDateColumns, locale: string): HistoricalDateResponse {
  const rangeEnd =
    columns.qualifier === DateQualifier.BETWEEN
      ? { year: columns.endYear, month: columns.endMonth, day: columns.endDay }
      : null;
  return {
    year: columns.year,
    month: columns.month,
    day: columns.day,
    precision: columns.precision,
    qualifier: columns.qualifier,
    era: columns.era,
    rangeEnd,
    display: formatHistoricalDate(
      { year: columns.year, month: columns.month, day: columns.day, precision: columns.precision, qualifier: columns.qualifier, era: columns.era, rangeEnd, label: columns.label },
      locale,
    ),
  };
}

export function toHistoricalPeriodResponse(columns: HistoricalPeriodColumns, locale: string): HistoricalPeriodResponse {
  const start: HistoricalDateResponse = {
    year: columns.startYear,
    month: columns.startMonth,
    day: columns.startDay,
    precision: columns.startPrecision,
    qualifier: columns.startQualifier,
    era: columns.startEra,
    rangeEnd: null,
    display: formatHistoricalDate(
      { year: columns.startYear, month: columns.startMonth, day: columns.startDay, precision: columns.startPrecision, qualifier: columns.startQualifier, era: columns.startEra },
      locale,
    ),
  };
  const end: HistoricalDateResponse | null =
    columns.endPrecision != null
      ? {
          year: columns.endYear,
          month: columns.endMonth,
          day: columns.endDay,
          precision: columns.endPrecision,
          qualifier: columns.endQualifier ?? DateQualifier.EXACT,
          era: columns.endEra ?? DateEra.CE,
          rangeEnd: null,
          display: formatHistoricalDate(
            { year: columns.endYear, month: columns.endMonth, day: columns.endDay, precision: columns.endPrecision, qualifier: columns.endQualifier ?? DateQualifier.EXACT, era: columns.endEra ?? DateEra.CE },
            locale,
          ),
        }
      : null;

  const loc: SupportedLocale = locale === 'vi' ? 'vi' : 'en';
  let display: string;
  if (columns.dateLabel) {
    display = columns.dateLabel;
  } else if (end) {
    display = loc === 'vi' ? `${start.display} – ${end.display}` : `${start.display} – ${end.display}`;
  } else {
    display = loc === 'vi' ? `${start.display} – nay` : `${start.display} – present`;
  }

  return { start, end, display };
}
