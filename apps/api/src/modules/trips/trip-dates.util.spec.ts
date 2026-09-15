import { enumerateDates } from './trip-dates.util';

describe('enumerateDates', () => {
  it('returns exactly one date for a one-day trip (spec section 11/16)', () => {
    expect(enumerateDates('2026-11-01', '2026-11-01')).toEqual(['2026-11-01']);
  });

  it('returns every date inclusive of both endpoints', () => {
    expect(enumerateDates('2026-11-01', '2026-11-05')).toEqual(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']);
  });

  it('crosses a month boundary correctly', () => {
    expect(enumerateDates('2026-11-29', '2026-12-02')).toEqual(['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02']);
  });

  it('crosses a year boundary correctly', () => {
    expect(enumerateDates('2026-12-30', '2027-01-02')).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
  });

  it('handles a leap-day range correctly (2028 is a leap year)', () => {
    expect(enumerateDates('2028-02-27', '2028-03-01')).toEqual(['2028-02-27', '2028-02-28', '2028-02-29', '2028-03-01']);
  });
});
