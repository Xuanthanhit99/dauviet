import { BadRequestException } from '@nestjs/common';
import { DatePrecision, DateQualifier } from '@prisma/client';
import {
  HistoricalDateColumns,
  HistoricalDateInput,
  HistoricalDateResponse,
  HistoricalPeriodColumns,
  HistoricalPeriodResponse,
  SupportedLocale,
} from './historical-date.types';

/**
 * Historical date model (spec section 3, CRITICAL).
 *
 * The database never stores a fabricated day/month for a date whose
 * precision is coarser than DAY. `year`/`month`/`day` are nullable columns
 * that hold exactly what is known - nothing more. `sortStart`/`sortEnd` are
 * separate, clearly-internal `DateTime` columns computed here purely so
 * Postgres can `ORDER BY`/range-query uncertain dates deterministically
 * (spec section 42) - they are never returned to a client as "the" date.
 *
 * Sentinels: BEFORE/AFTER qualifiers are open-ended on one side. Rather than
 * leaving that bound `null` (which would sort inconsistently across DB
 * engines), an intentionally implausible sentinel date is used - never a
 * historical claim, just a sort fence.
 */
const FAR_PAST = new Date(Date.UTC(-6000, 0, 1));
const FAR_FUTURE = new Date(Date.UTC(9999, 11, 31));

function assert(condition: boolean, message: string): void {
  if (!condition) throw new BadRequestException(message);
}

function assertMonthDay(month?: number | null, day?: number | null, ctx = ''): void {
  if (month != null) assert(month >= 1 && month <= 12, `Invalid month${ctx}: must be 1-12.`);
  if (day != null) assert(day >= 1 && day <= 31, `Invalid day${ctx}: must be 1-31.`);
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
  ctx = '',
): void {
  assertMonthDay(month, day, ctx);
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

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Earliest/latest plausible instant covered by a year/month/day + precision, ignoring qualifier. */
function boundsFor(
  year: number | null,
  month: number | null,
  day: number | null,
  precision: DatePrecision,
): { start: Date; end: Date } | null {
  if (precision === DatePrecision.UNKNOWN || year == null) return null;
  switch (precision) {
    case DatePrecision.DAY:
      return { start: new Date(Date.UTC(year, month! - 1, day!)), end: new Date(Date.UTC(year, month! - 1, day!)) };
    case DatePrecision.MONTH:
      return {
        start: new Date(Date.UTC(year, month! - 1, 1)),
        end: new Date(Date.UTC(year, month! - 1, lastDayOfMonth(year, month!))),
      };
    case DatePrecision.YEAR:
      return { start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year, 11, 31)) };
    case DatePrecision.DECADE: {
      const decadeStart = Math.floor(year / 10) * 10;
      return { start: new Date(Date.UTC(decadeStart, 0, 1)), end: new Date(Date.UTC(decadeStart + 9, 11, 31)) };
    }
    case DatePrecision.CENTURY: {
      const centuryStart = Math.floor((year - 1) / 100) * 100 + 1;
      return { start: new Date(Date.UTC(centuryStart, 0, 1)), end: new Date(Date.UTC(centuryStart + 99, 11, 31)) };
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
      endYear: null,
      endMonth: null,
      endDay: null,
      label: null,
      sortStart: null,
      sortEnd: null,
    };
  }

  const year = input.year ?? null;
  const month = input.month ?? null;
  const day = input.day ?? null;
  const precision = input.precision;
  const qualifier = input.qualifier ?? (precision === DatePrecision.UNKNOWN ? DateQualifier.UNCERTAIN : DateQualifier.EXACT);

  validatePrecisionGranularity(year, month, day, precision);

  const hasRangeEnd = input.rangeEndYear != null || input.rangeEndMonth != null || input.rangeEndDay != null;
  if (qualifier === DateQualifier.BETWEEN) {
    assert(input.rangeEndYear != null, 'BETWEEN qualifier requires rangeEndYear.');
    validatePrecisionGranularity(input.rangeEndYear, input.rangeEndMonth ?? null, input.rangeEndDay ?? null, precision, ' (range end)');
  } else {
    assert(!hasRangeEnd, 'rangeEnd* fields are only valid when qualifier is BETWEEN.');
  }

  const primaryBounds = boundsFor(year, month, day, precision);
  let sortStart: Date | null = null;
  let sortEnd: Date | null = null;

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
        const endBounds = boundsFor(input.rangeEndYear ?? null, input.rangeEndMonth ?? null, input.rangeEndDay ?? null, precision);
        assert(!!endBounds && endBounds.end.getTime() >= primaryBounds.start.getTime(), 'rangeEnd must not be before the start date.');
        sortStart = primaryBounds.start;
        sortEnd = endBounds!.end;
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
    endYear: qualifier === DateQualifier.BETWEEN ? input.rangeEndYear ?? null : null,
    endMonth: qualifier === DateQualifier.BETWEEN ? input.rangeEndMonth ?? null : null,
    endDay: qualifier === DateQualifier.BETWEEN ? input.rangeEndDay ?? null : null,
    label: input.label ?? null,
    sortStart,
    sortEnd,
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
  let sortEnd: Date | null = null;

  if (end) {
    const endCols = buildHistoricalDateColumns(end);
    assert(endCols.qualifier !== DateQualifier.BETWEEN, 'A period end cannot itself be a BETWEEN range.');
    endYear = endCols.year;
    endMonth = endCols.month;
    endDay = endCols.day;
    endPrecision = endCols.precision;
    endQualifier = endCols.qualifier;
    sortEnd = endCols.sortEnd;

    if (startCols.sortStart && endCols.sortEnd) {
      assert(endCols.sortEnd.getTime() >= startCols.sortStart.getTime(), 'Period end must not be before period start.');
    }
  } else {
    sortEnd = FAR_FUTURE;
  }

  return {
    startYear: startCols.year,
    startMonth: startCols.month,
    startDay: startCols.day,
    startPrecision: startCols.precision,
    startQualifier: startCols.qualifier,
    endYear,
    endMonth,
    endDay,
    endPrecision,
    endQualifier,
    dateLabel: label ?? null,
    sortStart: startCols.sortStart,
    sortEnd,
  };
}

const ORDINALS_EN: Record<number, string> = { 1: 'st', 2: 'nd', 3: 'rd' };
function ordinalEn(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ORDINALS_EN[n % 10] ?? 'th';
  return `${n}${suffix}`;
}

const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function formatCore(
  year: number | null,
  month: number | null,
  day: number | null,
  precision: DatePrecision,
  locale: SupportedLocale,
): string {
  if (year == null) return locale === 'vi' ? 'không rõ' : 'unknown';
  switch (precision) {
    case DatePrecision.DAY:
      return locale === 'vi' ? `ngày ${day} tháng ${month} năm ${year}` : `${day} ${EN_MONTHS[month! - 1]} ${year}`;
    case DatePrecision.MONTH:
      return locale === 'vi' ? `tháng ${month} năm ${year}` : `${EN_MONTHS[month! - 1]} ${year}`;
    case DatePrecision.YEAR:
      return locale === 'vi' ? `năm ${year}` : `${year}`;
    case DatePrecision.DECADE: {
      const decadeStart = Math.floor(year / 10) * 10;
      return locale === 'vi' ? `thập niên ${decadeStart}` : `the ${decadeStart}s`;
    }
    case DatePrecision.CENTURY: {
      const centuryNumber = Math.floor((year - 1) / 100) + 1;
      return locale === 'vi' ? `thế kỷ ${centuryNumber}` : `the ${ordinalEn(centuryNumber)} century`;
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
    rangeEnd?: { year: number | null; month: number | null; day: number | null } | null;
    label?: string | null;
  },
  locale: string,
): string {
  if (value.label) return value.label;
  const loc: SupportedLocale = locale === 'vi' ? 'vi' : 'en';

  if (value.precision === DatePrecision.UNKNOWN || value.year == null) {
    return loc === 'vi' ? 'Không rõ ngày tháng' : 'Date unknown';
  }

  const core = formatCore(value.year, value.month, value.day, value.precision, loc);

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
      const endCore = value.rangeEnd
        ? formatCore(value.rangeEnd.year, value.rangeEnd.month, value.rangeEnd.day, value.precision, loc)
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
    rangeEnd,
    display: formatHistoricalDate(
      { year: columns.year, month: columns.month, day: columns.day, precision: columns.precision, qualifier: columns.qualifier, rangeEnd, label: columns.label },
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
    rangeEnd: null,
    display: formatHistoricalDate(
      { year: columns.startYear, month: columns.startMonth, day: columns.startDay, precision: columns.startPrecision, qualifier: columns.startQualifier },
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
          rangeEnd: null,
          display: formatHistoricalDate(
            { year: columns.endYear, month: columns.endMonth, day: columns.endDay, precision: columns.endPrecision, qualifier: columns.endQualifier ?? DateQualifier.EXACT },
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
