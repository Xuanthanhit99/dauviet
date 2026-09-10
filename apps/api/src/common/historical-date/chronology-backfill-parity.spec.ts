import { DatePrecision, DateQualifier } from '@prisma/client';
import { buildHistoricalDateColumns, buildHistoricalPeriodColumns, ORDINAL_FAR_FUTURE, ORDINAL_FAR_PAST } from './historical-date.util';

/**
 * G03 (2nd architecture review) - proves the G03 migration's SQL backfill
 * (`prisma/migrations/20260908000000_g03_global_historical_knowledge/
 * migration.sql`, "CHRONOLOGY BACKFILL" section) computes EXACTLY the same
 * chronologyStart/chronologyEnd values the application's own TypeScript
 * utility (`historical-date.util.ts`) would compute for the same row.
 *
 * The functions below are a byte-for-byte transcription of the migration's
 * SQL CASE expressions into JS (see the migration file's own comments for
 * the SQL source of truth) - restricted to positive (CE) years only, since
 * every row the backfill ever touches predates BCE's existence and is CE by
 * construction. This is the strongest STATIC proof achievable without a
 * live Postgres instance; the corresponding LIVE proof (querying the real
 * backfilled columns after running the migration against a real pre-G03
 * database and diffing them against these same TypeScript-computed values)
 * is Migration Path B live QA, not a unit test.
 */

const CHRONOLOGY_DAYS_PER_YEAR = 372;
const ORDINAL_DAYS_PER_MONTH = 31;

function sqlOrdinalStart(year: number, month: number | null, day: number | null, precision: DatePrecision): number | null {
  switch (precision) {
    case DatePrecision.DAY:
      return year * CHRONOLOGY_DAYS_PER_YEAR + (month! - 1) * ORDINAL_DAYS_PER_MONTH + (day! - 1);
    case DatePrecision.MONTH:
      return year * CHRONOLOGY_DAYS_PER_YEAR + (month! - 1) * ORDINAL_DAYS_PER_MONTH;
    case DatePrecision.YEAR:
      return year * CHRONOLOGY_DAYS_PER_YEAR;
    case DatePrecision.DECADE:
      return Math.trunc(year / 10) * 10 * CHRONOLOGY_DAYS_PER_YEAR;
    case DatePrecision.CENTURY:
      return (Math.trunc((year - 1) / 100) * 100 + 1) * CHRONOLOGY_DAYS_PER_YEAR;
    default:
      return null;
  }
}

function sqlOrdinalEnd(year: number, month: number | null, day: number | null, precision: DatePrecision): number | null {
  switch (precision) {
    case DatePrecision.DAY:
      return year * CHRONOLOGY_DAYS_PER_YEAR + (month! - 1) * ORDINAL_DAYS_PER_MONTH + (day! - 1);
    case DatePrecision.MONTH:
      return year * CHRONOLOGY_DAYS_PER_YEAR + (month! - 1) * ORDINAL_DAYS_PER_MONTH + 30;
    case DatePrecision.YEAR:
      return year * CHRONOLOGY_DAYS_PER_YEAR + 371;
    case DatePrecision.DECADE:
      return (Math.trunc(year / 10) * 10 + 9) * CHRONOLOGY_DAYS_PER_YEAR + 371;
    case DatePrecision.CENTURY:
      return (Math.trunc((year - 1) / 100) * 100 + 100) * CHRONOLOGY_DAYS_PER_YEAR + 371;
    default:
      return null;
  }
}

/** Mirrors the HistoricalEvent/HistoricalFact/Person.birth/Person.death UPDATE (single date slot, BETWEEN uses the row's own end* columns). */
function sqlBackfillSingleSlot(
  year: number | null,
  month: number | null,
  day: number | null,
  precision: DatePrecision,
  qualifier: DateQualifier,
  endYear: number | null,
  endMonth: number | null,
  endDay: number | null,
): { chronologyStart: number | null; chronologyEnd: number | null } {
  const unknown = precision === DatePrecision.UNKNOWN || year == null;
  const chronologyStart = unknown ? null : qualifier === DateQualifier.BEFORE ? ORDINAL_FAR_PAST : sqlOrdinalStart(year!, month, day, precision);
  const chronologyEnd = unknown
    ? null
    : qualifier === DateQualifier.AFTER
      ? ORDINAL_FAR_FUTURE
      : qualifier === DateQualifier.BETWEEN
        ? sqlOrdinalEnd(endYear!, endMonth, endDay, precision)
        : sqlOrdinalEnd(year!, month, day, precision);
  return { chronologyStart, chronologyEnd };
}

/** Mirrors the HistoricalEra/Dynasty/Territory UPDATE (independent start/end slots, neither can be BETWEEN). */
function sqlBackfillPeriod(
  startYear: number | null,
  startMonth: number | null,
  startDay: number | null,
  startPrecision: DatePrecision,
  startQualifier: DateQualifier,
  endPrecision: DatePrecision | null,
  endYear: number | null,
  endMonth: number | null,
  endDay: number | null,
  endQualifier: DateQualifier | null,
): { chronologyStart: number | null; chronologyEnd: number | null } {
  const startUnknown = startPrecision === DatePrecision.UNKNOWN || startYear == null;
  const chronologyStart = startUnknown ? null : startQualifier === DateQualifier.BEFORE ? ORDINAL_FAR_PAST : sqlOrdinalStart(startYear!, startMonth, startDay, startPrecision);

  let chronologyEnd: number | null;
  if (endPrecision == null) {
    chronologyEnd = ORDINAL_FAR_FUTURE;
  } else if (endPrecision === DatePrecision.UNKNOWN || endYear == null) {
    chronologyEnd = null;
  } else if (endQualifier === DateQualifier.AFTER) {
    chronologyEnd = ORDINAL_FAR_FUTURE;
  } else {
    chronologyEnd = sqlOrdinalEnd(endYear!, endMonth, endDay, endPrecision);
  }
  return { chronologyStart, chronologyEnd };
}

describe('chronology backfill SQL/TypeScript parity', () => {
  it('the hardcoded SQL sentinel constants (-37199629 / 3720000) exactly equal the real computed ORDINAL_FAR_PAST/ORDINAL_FAR_FUTURE', () => {
    expect(ORDINAL_FAR_PAST).toBe(-37199629);
    expect(ORDINAL_FAR_FUTURE).toBe(3720000);
  });

  describe('single date slot (HistoricalEvent.date / HistoricalFact.date / Person.birth / Person.death shape)', () => {
    const REPRESENTATIVE_CE_YEARS = [1010, 1288, 1789, 1945, 1954, 1975];

    it.each(REPRESENTATIVE_CE_YEARS)('YEAR precision, EXACT qualifier: %i', (year) => {
      const cols = buildHistoricalDateColumns({ year, precision: DatePrecision.YEAR });
      const sql = sqlBackfillSingleSlot(cols.year, cols.month, cols.day, cols.precision, cols.qualifier, cols.endYear, cols.endMonth, cols.endDay);
      expect(sql.chronologyStart).toBe(cols.chronologyStart);
      expect(sql.chronologyEnd).toBe(cols.chronologyEnd);
    });

    it('DECADE precision', () => {
      const cols = buildHistoricalDateColumns({ year: 1965, precision: DatePrecision.DECADE });
      const sql = sqlBackfillSingleSlot(cols.year, cols.month, cols.day, cols.precision, cols.qualifier, cols.endYear, cols.endMonth, cols.endDay);
      expect(sql).toEqual({ chronologyStart: cols.chronologyStart, chronologyEnd: cols.chronologyEnd });
    });

    it('CENTURY precision', () => {
      const cols = buildHistoricalDateColumns({ year: 1288, precision: DatePrecision.CENTURY });
      const sql = sqlBackfillSingleSlot(cols.year, cols.month, cols.day, cols.precision, cols.qualifier, cols.endYear, cols.endMonth, cols.endDay);
      expect(sql).toEqual({ chronologyStart: cols.chronologyStart, chronologyEnd: cols.chronologyEnd });
    });

    it('MONTH precision', () => {
      const cols = buildHistoricalDateColumns({ year: 1954, month: 5, precision: DatePrecision.MONTH });
      const sql = sqlBackfillSingleSlot(cols.year, cols.month, cols.day, cols.precision, cols.qualifier, cols.endYear, cols.endMonth, cols.endDay);
      expect(sql).toEqual({ chronologyStart: cols.chronologyStart, chronologyEnd: cols.chronologyEnd });
    });

    it('DAY precision', () => {
      const cols = buildHistoricalDateColumns({ year: 1975, month: 4, day: 30, precision: DatePrecision.DAY });
      const sql = sqlBackfillSingleSlot(cols.year, cols.month, cols.day, cols.precision, cols.qualifier, cols.endYear, cols.endMonth, cols.endDay);
      expect(sql).toEqual({ chronologyStart: cols.chronologyStart, chronologyEnd: cols.chronologyEnd });
    });

    it.each([DateQualifier.CIRCA, DateQualifier.UNCERTAIN, DateQualifier.TRADITIONAL])('%s qualifier (no bound change vs EXACT)', (qualifier) => {
      const cols = buildHistoricalDateColumns({ year: 1802, precision: DatePrecision.YEAR, qualifier });
      const sql = sqlBackfillSingleSlot(cols.year, cols.month, cols.day, cols.precision, cols.qualifier, cols.endYear, cols.endMonth, cols.endDay);
      expect(sql).toEqual({ chronologyStart: cols.chronologyStart, chronologyEnd: cols.chronologyEnd });
    });

    it('BEFORE qualifier', () => {
      const cols = buildHistoricalDateColumns({ year: 1858, precision: DatePrecision.YEAR, qualifier: DateQualifier.BEFORE });
      const sql = sqlBackfillSingleSlot(cols.year, cols.month, cols.day, cols.precision, cols.qualifier, cols.endYear, cols.endMonth, cols.endDay);
      expect(sql).toEqual({ chronologyStart: cols.chronologyStart, chronologyEnd: cols.chronologyEnd });
    });

    it('AFTER qualifier', () => {
      const cols = buildHistoricalDateColumns({ year: 1858, precision: DatePrecision.YEAR, qualifier: DateQualifier.AFTER });
      const sql = sqlBackfillSingleSlot(cols.year, cols.month, cols.day, cols.precision, cols.qualifier, cols.endYear, cols.endMonth, cols.endDay);
      expect(sql).toEqual({ chronologyStart: cols.chronologyStart, chronologyEnd: cols.chronologyEnd });
    });

    it('BETWEEN qualifier (end uses the row\'s own end* columns)', () => {
      const cols = buildHistoricalDateColumns({ year: 1400, precision: DatePrecision.YEAR, qualifier: DateQualifier.BETWEEN, rangeEndYear: 1406 });
      const sql = sqlBackfillSingleSlot(cols.year, cols.month, cols.day, cols.precision, cols.qualifier, cols.endYear, cols.endMonth, cols.endDay);
      expect(sql).toEqual({ chronologyStart: cols.chronologyStart, chronologyEnd: cols.chronologyEnd });
    });

    it('UNKNOWN precision (both null)', () => {
      const cols = buildHistoricalDateColumns({ precision: DatePrecision.UNKNOWN });
      const sql = sqlBackfillSingleSlot(cols.year, cols.month, cols.day, cols.precision, cols.qualifier, cols.endYear, cols.endMonth, cols.endDay);
      expect(sql).toEqual({ chronologyStart: null, chronologyEnd: null });
    });
  });

  describe('period slot (HistoricalEra / Dynasty / Territory shape)', () => {
    it.each([1010, 1288, 1789, 1945, 1954, 1975])('YEAR precision start, open-ended (no end recorded): %i', (year) => {
      const period = buildHistoricalPeriodColumns({ year, precision: DatePrecision.YEAR });
      const sql = sqlBackfillPeriod(
        period.startYear,
        period.startMonth,
        period.startDay,
        period.startPrecision,
        period.startQualifier,
        period.endPrecision,
        period.endYear,
        period.endMonth,
        period.endDay,
        period.endQualifier,
      );
      expect(sql).toEqual({ chronologyStart: period.chronologyStart, chronologyEnd: period.chronologyEnd });
    });

    it('start and end both given, YEAR precision (e.g. a dynasty/era span)', () => {
      const period = buildHistoricalPeriodColumns({ year: 1009, precision: DatePrecision.YEAR, qualifier: DateQualifier.CIRCA }, { year: 1225, precision: DatePrecision.YEAR });
      const sql = sqlBackfillPeriod(
        period.startYear,
        period.startMonth,
        period.startDay,
        period.startPrecision,
        period.startQualifier,
        period.endPrecision,
        period.endYear,
        period.endMonth,
        period.endDay,
        period.endQualifier,
      );
      expect(sql).toEqual({ chronologyStart: period.chronologyStart, chronologyEnd: period.chronologyEnd });
    });

    it('DECADE precision start/end', () => {
      const period = buildHistoricalPeriodColumns({ year: 1960, precision: DatePrecision.DECADE }, { year: 1970, precision: DatePrecision.DECADE });
      const sql = sqlBackfillPeriod(
        period.startYear,
        period.startMonth,
        period.startDay,
        period.startPrecision,
        period.startQualifier,
        period.endPrecision,
        period.endYear,
        period.endMonth,
        period.endDay,
        period.endQualifier,
      );
      expect(sql).toEqual({ chronologyStart: period.chronologyStart, chronologyEnd: period.chronologyEnd });
    });

    it('CENTURY precision start/end', () => {
      const period = buildHistoricalPeriodColumns({ year: 1201, precision: DatePrecision.CENTURY }, { year: 1300, precision: DatePrecision.CENTURY });
      const sql = sqlBackfillPeriod(
        period.startYear,
        period.startMonth,
        period.startDay,
        period.startPrecision,
        period.startQualifier,
        period.endPrecision,
        period.endYear,
        period.endMonth,
        period.endDay,
        period.endQualifier,
      );
      expect(sql).toEqual({ chronologyStart: period.chronologyStart, chronologyEnd: period.chronologyEnd });
    });

    it('MONTH/DAY precision start', () => {
      const period = buildHistoricalPeriodColumns({ year: 1010, month: 7, day: 1, precision: DatePrecision.DAY });
      const sql = sqlBackfillPeriod(
        period.startYear,
        period.startMonth,
        period.startDay,
        period.startPrecision,
        period.startQualifier,
        period.endPrecision,
        period.endYear,
        period.endMonth,
        period.endDay,
        period.endQualifier,
      );
      expect(sql).toEqual({ chronologyStart: period.chronologyStart, chronologyEnd: period.chronologyEnd });
    });

    it('start qualifier BEFORE, end qualifier AFTER', () => {
      const period = buildHistoricalPeriodColumns(
        { year: 1858, precision: DatePrecision.YEAR, qualifier: DateQualifier.BEFORE },
        { year: 1945, precision: DatePrecision.YEAR, qualifier: DateQualifier.AFTER },
      );
      const sql = sqlBackfillPeriod(
        period.startYear,
        period.startMonth,
        period.startDay,
        period.startPrecision,
        period.startQualifier,
        period.endPrecision,
        period.endYear,
        period.endMonth,
        period.endDay,
        period.endQualifier,
      );
      expect(sql).toEqual({ chronologyStart: period.chronologyStart, chronologyEnd: period.chronologyEnd });
    });

    it('explicitly UNKNOWN end (recorded but unknown), distinct from no end recorded', () => {
      const period = buildHistoricalPeriodColumns({ year: 1009, precision: DatePrecision.YEAR }, { precision: DatePrecision.UNKNOWN });
      expect(period.endPrecision).toBe(DatePrecision.UNKNOWN);
      const sql = sqlBackfillPeriod(
        period.startYear,
        period.startMonth,
        period.startDay,
        period.startPrecision,
        period.startQualifier,
        period.endPrecision,
        period.endYear,
        period.endMonth,
        period.endDay,
        period.endQualifier,
      );
      expect(sql).toEqual({ chronologyStart: period.chronologyStart, chronologyEnd: period.chronologyEnd });
      expect(sql.chronologyEnd).toBeNull();
    });
  });
});

/**
 * G03 (3rd architecture review) - mirrors the migration's "LEGACY YEAR
 * VALIDATION GUARD" boolean predicate (`year IS NOT NULL AND (year <= 0 OR
 * year > 9999)` - see the DO block near the top of migration.sql) so its
 * exact classification of legacy data can be pinned in a pure unit test.
 * The migration guard itself can only be proven live, against a real
 * database that actually contains bad data (Migration Path B live QA); this
 * is the static proof that the boolean condition it uses is the right one.
 */
describe('migration legacy-year validation guard predicate', () => {
  function isRejectedByGuard(year: number | null): boolean {
    return year !== null && (year <= 0 || year > 9999);
  }

  it('rejects a zero legacy year', () => {
    expect(isRejectedByGuard(0)).toBe(true);
  });

  it('rejects a negative legacy year', () => {
    expect(isRejectedByGuard(-500)).toBe(true);
  });

  it('rejects an out-of-supported-range legacy CE year', () => {
    expect(isRejectedByGuard(10000)).toBe(true);
    expect(isRejectedByGuard(100000)).toBe(true);
  });

  it('accepts every representative existing CE year', () => {
    for (const year of [1010, 1288, 1789, 1945, 1954, 1975]) {
      expect(isRejectedByGuard(year)).toBe(false);
    }
  });

  it('accepts the CE boundary years (1 and 9999) and a null (UNKNOWN) year', () => {
    expect(isRejectedByGuard(1)).toBe(false);
    expect(isRejectedByGuard(9999)).toBe(false);
    expect(isRejectedByGuard(null)).toBe(false);
  });
});
