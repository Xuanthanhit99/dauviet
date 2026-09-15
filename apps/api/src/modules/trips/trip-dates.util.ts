/**
 * Enumerates every calendar date (inclusive) between two `YYYY-MM-DD`
 * strings, in order. Pure and timezone-safe: operates entirely on UTC
 * midnight instants of date-only strings, never on a real (potentially
 * DST-affected) timezone, so a one-day trip (`startDate === endDate`)
 * correctly returns exactly one date (spec section 11/16 - "do not
 * materialize impossible days").
 */
export function enumerateDates(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  let cursor = Date.parse(`${startDate}T00:00:00.000Z`);
  while (cursor <= end) {
    dates.push(new Date(cursor).toISOString().slice(0, 10));
    cursor += 24 * 60 * 60 * 1000;
  }
  return dates;
}
