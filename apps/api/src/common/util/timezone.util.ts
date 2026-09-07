/**
 * IANA timezone validation for City.timezone (G01 spec section 17) - never
 * just a fixed UTC offset (DST exists). Uses the runtime's own ICU timezone
 * database via `Intl.DateTimeFormat` rather than a hand-maintained list, so
 * it stays correct as the IANA database updates.
 *
 * Deliberately NOT `Intl.supportedValuesOf('timeZone')`: that only
 * enumerates CANONICAL zone names and excludes long-standing IANA "link"
 * aliases such as `Asia/Ho_Chi_Minh` (linked to `Asia/Saigon`) or
 * `Asia/Calcutta` - real, still-valid identifiers that a human would
 * reasonably type. `Intl.DateTimeFormat` accepts any zone name ICU's
 * timezone database recognises, canonical or link, and throws a
 * `RangeError` otherwise - confirmed directly against this runtime's ICU
 * data before relying on it here.
 */
export function isValidIanaTimezone(timezone: string): boolean {
  if (!timezone) return false;
  try {
    // eslint-disable-next-line no-new
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}
