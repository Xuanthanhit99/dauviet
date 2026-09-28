import { ValidationOptions, registerDecorator } from 'class-validator';

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True only for a real proleptic-Gregorian calendar date written as `YYYY-MM-DD` (no timezone involved). */
export function isCalendarDate(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const m = DATE_ONLY.exec(value);
  if (!m) return false;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // setUTCFullYear, not Date.UTC: Date.UTC maps years 0-99 to 1900-1999 (the legacy quirk
  // historical-date.util.ts documents), which would misjudge e.g. 0001-01-01.
  const d = new Date(0);
  d.setUTCFullYear(year, month - 1, day);
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

/**
 * G12: `YYYY-MM-DD` that is also a real calendar day. The previous `@Matches(/^\d{4}-\d{2}-\d{2}$/)`
 * checked the shape only, so `2026-02-30` was silently stored as 2 March (JS Date rolls it over) and
 * `2026-13-01` reached Prisma as an Invalid Date and surfaced as a 500.
 */
export function IsCalendarDate(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isCalendarDate',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: { validate: isCalendarDate, defaultMessage: () => `${propertyName} must be a real calendar date in YYYY-MM-DD form` },
    });
}
