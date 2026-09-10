import { BadRequestException } from '@nestjs/common';
import { DateEra, DatePrecision, DateQualifier } from '@prisma/client';
import { buildHistoricalDateColumns, buildHistoricalPeriodColumns, formatHistoricalDate, toHistoricalDateResponse } from './historical-date.util';

describe('buildHistoricalDateColumns', () => {
  it('never fabricates a month/day for YEAR precision (spec section 3)', () => {
    const cols = buildHistoricalDateColumns({ year: 1288, precision: DatePrecision.YEAR });
    expect(cols.year).toBe(1288);
    expect(cols.month).toBeNull();
    expect(cols.day).toBeNull();
    // sortStart is an internal ordering aid only - it may land on Jan 1st
    // for range-query purposes, but the authoritative year/month/day fields
    // above must never claim that precision.
    expect(cols.sortStart?.getUTCFullYear()).toBe(1288);
  });

  it('rejects a day without a month', () => {
    expect(() => buildHistoricalDateColumns({ year: 1288, day: 5, precision: DatePrecision.YEAR })).toThrow(BadRequestException);
  });

  it('rejects DAY precision missing month or day', () => {
    expect(() => buildHistoricalDateColumns({ year: 1954, month: 5, precision: DatePrecision.DAY })).toThrow(BadRequestException);
  });

  it('rejects UNKNOWN precision carrying a year', () => {
    expect(() => buildHistoricalDateColumns({ year: 1954, precision: DatePrecision.UNKNOWN })).toThrow(BadRequestException);
  });

  it('accepts UNKNOWN precision with nothing known', () => {
    const cols = buildHistoricalDateColumns({ precision: DatePrecision.UNKNOWN });
    expect(cols.year).toBeNull();
    expect(cols.sortStart).toBeNull();
    expect(cols.sortEnd).toBeNull();
  });

  it('defaults qualifier to EXACT for a known precision', () => {
    const cols = buildHistoricalDateColumns({ year: 1954, month: 5, day: 7, precision: DatePrecision.DAY });
    expect(cols.qualifier).toBe(DateQualifier.EXACT);
  });

  it('rejects rangeEnd fields unless qualifier is BETWEEN', () => {
    expect(() =>
      buildHistoricalDateColumns({ year: 1400, precision: DatePrecision.YEAR, qualifier: DateQualifier.CIRCA, rangeEndYear: 1406 }),
    ).toThrow(BadRequestException);
  });

  it('requires rangeEndYear when qualifier is BETWEEN', () => {
    expect(() => buildHistoricalDateColumns({ year: 1400, precision: DatePrecision.YEAR, qualifier: DateQualifier.BETWEEN })).toThrow(
      BadRequestException,
    );
  });

  it('rejects a BETWEEN range end before the start', () => {
    expect(() =>
      buildHistoricalDateColumns({ year: 1406, precision: DatePrecision.YEAR, qualifier: DateQualifier.BETWEEN, rangeEndYear: 1400 }),
    ).toThrow(BadRequestException);
  });

  it('computes sort bounds spanning a BETWEEN range', () => {
    const cols = buildHistoricalDateColumns({ year: 1400, precision: DatePrecision.YEAR, qualifier: DateQualifier.BETWEEN, rangeEndYear: 1406 });
    expect(cols.sortStart?.getUTCFullYear()).toBe(1400);
    expect(cols.sortEnd?.getUTCFullYear()).toBe(1406);
    expect(cols.endYear).toBe(1406);
  });

  it('DECADE precision buckets by floor-10 and CENTURY by the 1-indexed century', () => {
    const decade = buildHistoricalDateColumns({ year: 1965, precision: DatePrecision.DECADE });
    expect(decade.sortStart?.getUTCFullYear()).toBe(1960);
    expect(decade.sortEnd?.getUTCFullYear()).toBe(1969);

    const century = buildHistoricalDateColumns({ year: 1288, precision: DatePrecision.CENTURY });
    expect(century.sortStart?.getUTCFullYear()).toBe(1201);
    expect(century.sortEnd?.getUTCFullYear()).toBe(1300);
  });

  it('BEFORE/AFTER leave one side of the sort window open via sentinels, never null', () => {
    const before = buildHistoricalDateColumns({ year: 1858, precision: DatePrecision.YEAR, qualifier: DateQualifier.BEFORE });
    expect(before.sortStart!.getUTCFullYear()).toBeLessThan(-1000);
    expect(before.sortEnd?.getUTCFullYear()).toBe(1858);

    const after = buildHistoricalDateColumns({ year: 1858, precision: DatePrecision.YEAR, qualifier: DateQualifier.AFTER });
    expect(after.sortStart?.getUTCFullYear()).toBe(1858);
    expect(after.sortEnd!.getUTCFullYear()).toBeGreaterThan(5000);
  });
});

describe('buildHistoricalPeriodColumns', () => {
  it('allows an open-ended period (no end recorded) distinct from an explicitly unknown end', () => {
    const ongoing = buildHistoricalPeriodColumns({ year: 1945, precision: DatePrecision.YEAR });
    expect(ongoing.endPrecision).toBeNull();
    expect(ongoing.sortEnd!.getUTCFullYear()).toBeGreaterThan(5000);
  });

  it('rejects an end before the start', () => {
    expect(() =>
      buildHistoricalPeriodColumns(
        { year: 1225, precision: DatePrecision.YEAR },
        { year: 1009, precision: DatePrecision.YEAR },
      ),
    ).toThrow(BadRequestException);
  });

  it('allows start and end to carry independent qualifiers', () => {
    const period = buildHistoricalPeriodColumns(
      { year: 1009, precision: DatePrecision.YEAR, qualifier: DateQualifier.CIRCA },
      { year: 1225, precision: DatePrecision.YEAR, qualifier: DateQualifier.EXACT },
    );
    expect(period.startQualifier).toBe(DateQualifier.CIRCA);
    expect(period.endQualifier).toBe(DateQualifier.EXACT);
  });
});

describe('formatHistoricalDate', () => {
  it('formats an EXACT year plainly in both locales', () => {
    const value = { year: 1288, month: null, day: null, precision: DatePrecision.YEAR, qualifier: DateQualifier.EXACT };
    expect(formatHistoricalDate(value, 'vi')).toBe('Năm 1288');
    expect(formatHistoricalDate(value, 'en')).toBe('1288');
  });

  it('formats CIRCA per-locale (matches spec section 4 example)', () => {
    const value = { year: 1802, month: null, day: null, precision: DatePrecision.YEAR, qualifier: DateQualifier.CIRCA };
    expect(formatHistoricalDate(value, 'vi')).toBe('Khoảng năm 1802');
    expect(formatHistoricalDate(value, 'en')).toBe('Circa 1802');
  });

  it('formats UNKNOWN precision without inventing a year', () => {
    const value = { year: null, month: null, day: null, precision: DatePrecision.UNKNOWN, qualifier: DateQualifier.UNCERTAIN };
    expect(formatHistoricalDate(value, 'vi')).toBe('Không rõ ngày tháng');
    expect(formatHistoricalDate(value, 'en')).toBe('Date unknown');
  });

  it('an editor-authored label always wins over the generated display', () => {
    const value = { year: 1010, month: null, day: null, precision: DatePrecision.YEAR, qualifier: DateQualifier.EXACT, label: 'Năm Canh Tuất' };
    expect(formatHistoricalDate(value, 'vi')).toBe('Năm Canh Tuất');
    expect(formatHistoricalDate(value, 'en')).toBe('Năm Canh Tuất');
  });

  it('falls back to en for an unsupported locale rather than defaulting to Vietnamese text', () => {
    const value = { year: 1288, month: null, day: null, precision: DatePrecision.YEAR, qualifier: DateQualifier.EXACT };
    expect(formatHistoricalDate(value, 'fr')).toBe('1288');
  });
});

describe('toHistoricalDateResponse', () => {
  it('matches the API contract shape from spec section 4', () => {
    const cols = buildHistoricalDateColumns({ year: 1288, precision: DatePrecision.YEAR });
    const response = toHistoricalDateResponse(cols, 'en');
    expect(response).toEqual({
      year: 1288,
      month: null,
      day: null,
      precision: 'YEAR',
      qualifier: 'EXACT',
      era: 'CE',
      rangeEnd: null,
      display: '1288',
    });
  });

  it('never exposes chronologyStart/chronologyEnd - they are internal-only, like sortStart/sortEnd', () => {
    const cols = buildHistoricalDateColumns({ year: 1288, precision: DatePrecision.YEAR });
    const response = toHistoricalDateResponse(cols, 'en') as unknown as Record<string, unknown>;
    expect(response.chronologyStart).toBeUndefined();
    expect(response.chronologyEnd).toBeUndefined();
    expect(response.sortStart).toBeUndefined();
    expect(response.sortEnd).toBeUndefined();
  });
});

/**
 * G03 (revised architecture review) - the required pure BCE/CE chronology
 * test matrix. `chronologyStart`/`chronologyEnd` are pure-integer proleptic
 * ordinals (see historical-date.util.ts `toOrdinal`) with NO Date/DateTime/
 * timestamp involvement - these tests assert on that ordinal directly, never
 * via `Date.UTC` or `.getUTCFullYear()`, since the entire point of this
 * revision was to stop depending on `Date.UTC` as the authoritative sort key
 * (its legacy two-digit-year special case silently remaps astronomical
 * years 0-99 - CE 1-99 and BCE year 1 - to 1900-1999).
 */
describe('G03 chronology ordinals (authoritative BCE/CE sort key)', () => {
  const yearCols = (year: number, era: DateEra) => buildHistoricalDateColumns({ year, precision: DatePrecision.YEAR, era });

  it('orders 500 BCE < 300 BCE < 100 BCE < 2 BCE < 1 BCE < 1 CE < 2 CE < 99 CE < 100 CE < 300 CE strictly by chronologyStart', () => {
    const sequence: Array<[number, DateEra]> = [
      [500, DateEra.BCE],
      [300, DateEra.BCE],
      [100, DateEra.BCE],
      [2, DateEra.BCE],
      [1, DateEra.BCE],
      [1, DateEra.CE],
      [2, DateEra.CE],
      [99, DateEra.CE],
      [100, DateEra.CE],
      [300, DateEra.CE],
    ];
    const ordinals = sequence.map(([year, era]) => yearCols(year, era).chronologyStart!);
    for (let i = 1; i < ordinals.length; i += 1) {
      expect(ordinals[i]).toBeGreaterThan(ordinals[i - 1]);
    }
  });

  it('correctly orders across the astronomical-year 0-99 window that Date.UTC silently corrupts (e.g. 50 CE must sort before 150 CE)', () => {
    // Historical note: `Date.UTC(50, ...)` silently remaps to 1950 due to
    // the legacy two-digit-year special case, which would make "50 CE"
    // sort AFTER "150 CE" (a real, non-remapped date) under the old
    // Date-based sortStart - exactly the corruption this ordinal model
    // exists to avoid. This assertion is on the ordinal field only.
    const fiftyCE = yearCols(50, DateEra.CE).chronologyStart!;
    const oneFiftyCE = yearCols(150, DateEra.CE).chronologyStart!;
    expect(fiftyCE).toBeLessThan(oneFiftyCE);
  });

  it('orders centuries correctly: 5th century BCE < 3rd century BCE < 1st century BCE < 1st century CE', () => {
    // "Nth century BCE" in-era year convention: the Nth century BCE spans
    // in-era years ((N-1)*100 + 1) to (N*100) - e.g. 5th century BCE = 401-500 BCE.
    const fifthCenturyBCE = buildHistoricalDateColumns({ year: 450, precision: DatePrecision.CENTURY, era: DateEra.BCE }).chronologyStart!;
    const thirdCenturyBCE = buildHistoricalDateColumns({ year: 250, precision: DatePrecision.CENTURY, era: DateEra.BCE }).chronologyStart!;
    const firstCenturyBCE = buildHistoricalDateColumns({ year: 50, precision: DatePrecision.CENTURY, era: DateEra.BCE }).chronologyStart!;
    const firstCenturyCE = buildHistoricalDateColumns({ year: 50, precision: DatePrecision.CENTURY, era: DateEra.CE }).chronologyStart!;
    expect(fifthCenturyBCE).toBeLessThan(thirdCenturyBCE);
    expect(thirdCenturyBCE).toBeLessThan(firstCenturyBCE);
    expect(firstCenturyBCE).toBeLessThan(firstCenturyCE);
  });

  it('BCE exact day/month orders correctly within the same BCE year', () => {
    const early = buildHistoricalDateColumns({ year: 44, month: 3, day: 1, precision: DatePrecision.DAY, era: DateEra.BCE });
    const late = buildHistoricalDateColumns({ year: 44, month: 3, day: 15, precision: DatePrecision.DAY, era: DateEra.BCE });
    expect(early.chronologyStart!).toBeLessThan(late.chronologyStart!);
    expect(early.chronologyStart).toBe(early.chronologyEnd);
  });

  it('CE exact day/month orders correctly within the same CE year', () => {
    const early = buildHistoricalDateColumns({ year: 1288, month: 4, day: 1, precision: DatePrecision.DAY, era: DateEra.CE });
    const late = buildHistoricalDateColumns({ year: 1288, month: 9, day: 15, precision: DatePrecision.DAY, era: DateEra.CE });
    expect(early.chronologyStart!).toBeLessThan(late.chronologyStart!);
  });

  it('a BCE BETWEEN range computes chronology bounds spanning start to end (both BCE)', () => {
    const cols = buildHistoricalDateColumns({
      year: 300,
      precision: DatePrecision.YEAR,
      qualifier: DateQualifier.BETWEEN,
      rangeEndYear: 250,
      era: DateEra.BCE,
    });
    // 300 BCE is chronologically EARLIER than 250 BCE.
    expect(cols.chronologyStart!).toBeLessThan(cols.chronologyEnd!);
  });

  it('a CE BETWEEN range computes chronology bounds spanning start to end (both CE)', () => {
    const cols = buildHistoricalDateColumns({
      year: 1400,
      precision: DatePrecision.YEAR,
      qualifier: DateQualifier.BETWEEN,
      rangeEndYear: 1406,
      era: DateEra.CE,
    });
    expect(cols.chronologyStart!).toBeLessThan(cols.chronologyEnd!);
  });

  it('rejects a BCE BETWEEN range end that is chronologically before the start, even though the in-era year number is smaller', () => {
    // 250 BCE is chronologically AFTER 300 BCE (smaller BCE number = later) -
    // so start=250 BCE, rangeEnd=300 BCE goes backward in time and must be rejected.
    expect(() =>
      buildHistoricalDateColumns({ year: 250, precision: DatePrecision.YEAR, qualifier: DateQualifier.BETWEEN, rangeEndYear: 300, era: DateEra.BCE }),
    ).toThrow(BadRequestException);
  });

  it('a BCE -> CE period (start/end, independent eras) computes chronologyEnd after chronologyStart', () => {
    const period = buildHistoricalPeriodColumns(
      { year: 1, precision: DatePrecision.YEAR, era: DateEra.BCE },
      { year: 1, precision: DatePrecision.YEAR, era: DateEra.CE },
    );
    expect(period.chronologyStart!).toBeLessThan(period.chronologyEnd!);
  });

  it('rejects a period whose CE end is chronologically before its BCE start', () => {
    expect(() =>
      buildHistoricalPeriodColumns(
        { year: 1, precision: DatePrecision.YEAR, era: DateEra.CE },
        { year: 1, precision: DatePrecision.YEAR, era: DateEra.BCE },
      ),
    ).toThrow(BadRequestException);
  });

  it('CIRCA/UNCERTAIN/TRADITIONAL do not alter the chronology bounds relative to EXACT', () => {
    const exact = buildHistoricalDateColumns({ year: 1802, precision: DatePrecision.YEAR, qualifier: DateQualifier.EXACT });
    const circa = buildHistoricalDateColumns({ year: 1802, precision: DatePrecision.YEAR, qualifier: DateQualifier.CIRCA });
    const uncertain = buildHistoricalDateColumns({ year: 1802, precision: DatePrecision.YEAR, qualifier: DateQualifier.UNCERTAIN });
    const traditional = buildHistoricalDateColumns({ year: 1802, precision: DatePrecision.YEAR, qualifier: DateQualifier.TRADITIONAL });
    expect(circa.chronologyStart).toBe(exact.chronologyStart);
    expect(uncertain.chronologyStart).toBe(exact.chronologyStart);
    expect(traditional.chronologyStart).toBe(exact.chronologyStart);
  });

  it('BEFORE/AFTER open one chronology bound via a far sentinel, never null, for both eras', () => {
    const beforeCE = buildHistoricalDateColumns({ year: 1858, precision: DatePrecision.YEAR, qualifier: DateQualifier.BEFORE, era: DateEra.CE });
    expect(beforeCE.chronologyStart).not.toBeNull();
    expect(beforeCE.chronologyStart!).toBeLessThan(yearCols(500, DateEra.BCE).chronologyStart!);
    expect(beforeCE.chronologyEnd).toBe(yearCols(1858, DateEra.CE).chronologyEnd);

    const afterBCE = buildHistoricalDateColumns({ year: 500, precision: DatePrecision.YEAR, qualifier: DateQualifier.AFTER, era: DateEra.BCE });
    expect(afterBCE.chronologyEnd).not.toBeNull();
    expect(afterBCE.chronologyEnd!).toBeGreaterThan(yearCols(9999, DateEra.CE).chronologyEnd!);
  });

  it('UNKNOWN precision yields null chronology bounds, never a fabricated ordinal', () => {
    const cols = buildHistoricalDateColumns({ precision: DatePrecision.UNKNOWN });
    expect(cols.chronologyStart).toBeNull();
    expect(cols.chronologyEnd).toBeNull();
  });

  it('rejects year 0 in either era - there is no historical year zero', () => {
    expect(() => buildHistoricalDateColumns({ year: 0, precision: DatePrecision.YEAR, era: DateEra.CE })).toThrow(BadRequestException);
    expect(() => buildHistoricalDateColumns({ year: 0, precision: DatePrecision.YEAR, era: DateEra.BCE })).toThrow(BadRequestException);
  });

  it('rejects a year beyond the era-specific supported ceiling', () => {
    expect(() => buildHistoricalDateColumns({ year: 10000, precision: DatePrecision.YEAR, era: DateEra.CE })).toThrow(BadRequestException);
    expect(() => buildHistoricalDateColumns({ year: 100001, precision: DatePrecision.YEAR, era: DateEra.BCE })).toThrow(BadRequestException);
    // The BCE ceiling (100,000) is far higher than the CE ceiling (9,999) - a year that would be
    // rejected in CE can be legitimately representable in BCE.
    expect(() => buildHistoricalDateColumns({ year: 99999, precision: DatePrecision.YEAR, era: DateEra.BCE })).not.toThrow();
  });

  it('range overlap (BETWEEN) is validated against the chronology ordinal, not the legacy Date - a same-instant edge case at the 0-99 boundary must not falsely reject', () => {
    // start = 1 BCE (astronomical year 0), end = 1 CE (astronomical year 1) -
    // exactly the window where Date.UTC's legacy remap lands (1900/1901).
    // The ordinal-based check must accept this as a valid, forward-moving range.
    expect(() =>
      buildHistoricalPeriodColumns({ year: 1, precision: DatePrecision.YEAR, era: DateEra.BCE }, { year: 1, precision: DatePrecision.YEAR, era: DateEra.CE }),
    ).not.toThrow();
  });

  it('is deterministic/stable - the same input always produces the same chronology ordinal', () => {
    const a = yearCols(44, DateEra.BCE).chronologyStart;
    const b = yearCols(44, DateEra.BCE).chronologyStart;
    expect(a).toBe(b);
  });
});

/**
 * G03 (2nd architecture review) - legacy timestamp policy: sortStart/sortEnd
 * must NEVER store a Date.UTC-corrupted value (no "1 BCE -> 1900",
 * "50 CE -> 1950"). They are only populated when safely representable under
 * legacy CE semantics (CE year >= 100); otherwise they are null. This is
 * fully independent of chronologyStart/chronologyEnd, which are always
 * populated whenever a year is known, regardless of era or legacy safety -
 * the two null-conditions must never be conflated.
 */
describe('G03 legacy timestamp policy (sortStart/sortEnd null-safety)', () => {
  it('a BCE date never receives a legacy sortStart/sortEnd, but chronologyStart/chronologyEnd are still populated', () => {
    const cols = buildHistoricalDateColumns({ year: 44, precision: DatePrecision.YEAR, era: DateEra.BCE });
    expect(cols.sortStart).toBeNull();
    expect(cols.sortEnd).toBeNull();
    expect(cols.chronologyStart).not.toBeNull();
    expect(cols.chronologyEnd).not.toBeNull();
  });

  it('a CE date in the unsafe 1-99 window never receives a legacy sortStart/sortEnd, but chronology is still populated', () => {
    const cols = buildHistoricalDateColumns({ year: 50, precision: DatePrecision.YEAR, era: DateEra.CE });
    expect(cols.sortStart).toBeNull();
    expect(cols.sortEnd).toBeNull();
    expect(cols.chronologyStart).not.toBeNull();
    expect(cols.chronologyEnd).not.toBeNull();
  });

  it('a CE date at exactly the unsafe/safe boundary (year 99 vs year 100) switches legacy behavior at the documented boundary', () => {
    const unsafe = buildHistoricalDateColumns({ year: 99, precision: DatePrecision.YEAR, era: DateEra.CE });
    const safe = buildHistoricalDateColumns({ year: 100, precision: DatePrecision.YEAR, era: DateEra.CE });
    expect(unsafe.sortStart).toBeNull();
    expect(safe.sortStart).not.toBeNull();
    expect(safe.sortStart!.getUTCFullYear()).toBe(100);
  });

  it('a CE date >= 100 keeps the exact pre-G03 legacy sortStart/sortEnd behavior unchanged (e.g. 1288)', () => {
    const cols = buildHistoricalDateColumns({ year: 1288, precision: DatePrecision.YEAR, era: DateEra.CE });
    expect(cols.sortStart?.getUTCFullYear()).toBe(1288);
    expect(cols.sortEnd?.getUTCFullYear()).toBe(1288);
  });

  it('a BETWEEN range whose PRIMARY (start) year is legacy-unsafe nulls both sortStart/sortEnd, but chronology stays fully populated', () => {
    // start = 50 CE (legacy-UNSAFE), end = 150 CE (legacy-safe) - the
    // BETWEEN direction check is chronology-based so this is still accepted
    // as a valid forward range even though the legacy pair is entirely null.
    const cols = buildHistoricalDateColumns({ year: 50, precision: DatePrecision.YEAR, qualifier: DateQualifier.BETWEEN, rangeEndYear: 150, era: DateEra.CE });
    expect(cols.sortStart).toBeNull();
    expect(cols.sortEnd).toBeNull();
    expect(cols.chronologyStart).not.toBeNull();
    expect(cols.chronologyEnd).not.toBeNull();
  });

  it('a BETWEEN range where both start and end are legacy-safe (CE >= 100) populates sortStart/sortEnd as before G03', () => {
    // Note: a "legacy-safe start with a legacy-unsafe end" combination cannot
    // occur - a single date's BETWEEN shares one era, and legacy safety for
    // CE is a simple year >= 100 floor, so a chronologically-forward CE
    // range starting at a safe year always ends at an equal-or-later
    // (therefore also safe) year. Only "both unsafe" (covered above) and
    // "both safe" (here) are reachable states.
    const cols = buildHistoricalDateColumns({ year: 150, precision: DatePrecision.YEAR, qualifier: DateQualifier.BETWEEN, rangeEndYear: 200, era: DateEra.CE });
    expect(cols.sortStart?.getUTCFullYear()).toBe(150);
    expect(cols.sortEnd?.getUTCFullYear()).toBe(200);
  });

  it('BCE never receives a fabricated 1900s-window legacy timestamp - explicit anti-corruption check', () => {
    const oneBCE = buildHistoricalDateColumns({ year: 1, precision: DatePrecision.YEAR, era: DateEra.BCE });
    const oneCE = buildHistoricalDateColumns({ year: 1, precision: DatePrecision.YEAR, era: DateEra.CE });
    const fiftyCE = buildHistoricalDateColumns({ year: 50, precision: DatePrecision.YEAR, era: DateEra.CE });
    expect(oneBCE.sortStart).toBeNull();
    expect(oneCE.sortStart).toBeNull();
    expect(fiftyCE.sortStart).toBeNull();
  });
});

/**
 * G03 (2nd architecture review) - the NULL chronology invariant:
 * chronologyStart/chronologyEnd are null if and only if no year is known at
 * all (UNKNOWN precision, or an open-ended period end). They must NOT be
 * null merely because a row predates G03, has ordinary CE data, or has not
 * been touched since migration - see the migration backfill (STEP 19/20
 * live QA) for the corresponding database-level guarantee.
 */
describe('G03 null chronology invariant', () => {
  it('is null only for UNKNOWN precision (no year at all)', () => {
    expect(buildHistoricalDateColumns({ precision: DatePrecision.UNKNOWN }).chronologyStart).toBeNull();
  });

  it('is never null for a known year, in either era, at any precision', () => {
    const cases: Array<[number, DatePrecision, DateEra]> = [
      [1288, DatePrecision.YEAR, DateEra.CE],
      [44, DatePrecision.YEAR, DateEra.BCE],
      [50, DatePrecision.YEAR, DateEra.CE],
      [1965, DatePrecision.DECADE, DateEra.CE],
      [250, DatePrecision.CENTURY, DateEra.BCE],
    ];
    for (const [year, precision, era] of cases) {
      const cols = buildHistoricalDateColumns({ year, precision, era });
      expect(cols.chronologyStart).not.toBeNull();
      expect(cols.chronologyEnd).not.toBeNull();
    }
  });

  it('an open-ended period (no end recorded) has a non-null chronologyEnd sentinel, never null', () => {
    const period = buildHistoricalPeriodColumns({ year: 1945, precision: DatePrecision.YEAR, era: DateEra.CE });
    expect(period.endPrecision).toBeNull();
    expect(period.chronologyEnd).not.toBeNull();
  });
});
