import { BadRequestException } from '@nestjs/common';
import { DatePrecision, DateQualifier } from '@prisma/client';
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
      rangeEnd: null,
      display: '1288',
    });
  });
});
