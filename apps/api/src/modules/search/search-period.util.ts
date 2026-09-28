import { BadRequestException } from '@nestjs/common';
import { DateEra } from '@prisma/client';
import { DISCOVERY_ERROR_CODES } from '../../common/errors/discovery-error-codes';
import { ORDINAL_FAR_FUTURE, ORDINAL_FAR_PAST, toChronologyYearEnd, toChronologyYearStart } from '../../common/historical-date/historical-date.util';

const MAX_YEAR: Record<DateEra, number> = { BCE: 100000, CE: 9999 };

export interface PeriodRange {
  startOrdinal: number;
  endOrdinal: number;
}

/**
 * Converts an explicit era-qualified year range to G03 chronology ordinals.
 * Pure integer arithmetic - never a JavaScript Date, so BCE works. A missing
 * bound is open-ended (an explicit query choice, not an assumption about any
 * entity). Returns null when no period was requested.
 */
export function resolvePeriod(input: { fromYear?: number; fromEra?: DateEra; toYear?: number; toEra?: DateEra }): PeriodRange | null {
  const { fromYear, toYear } = input;
  if (fromYear === undefined && toYear === undefined) {
    if (input.fromEra !== undefined || input.toEra !== undefined) {
      throw new BadRequestException({ code: DISCOVERY_ERROR_CODES.SEARCH_INVALID_PERIOD, message: 'fromEra/toEra require fromYear/toYear.' });
    }
    return null;
  }
  const fromEra = input.fromEra ?? DateEra.CE;
  const toEra = input.toEra ?? DateEra.CE;
  for (const [year, era] of [[fromYear, fromEra], [toYear, toEra]] as Array<[number | undefined, DateEra]>) {
    if (year !== undefined && (!Number.isInteger(year) || year < 1 || year > MAX_YEAR[era])) {
      throw new BadRequestException({ code: DISCOVERY_ERROR_CODES.SEARCH_INVALID_PERIOD, message: `year must be an integer between 1 and ${MAX_YEAR[era]} for ${era}.` });
    }
  }
  const startOrdinal = fromYear === undefined ? ORDINAL_FAR_PAST : toChronologyYearStart(fromYear, fromEra);
  const endOrdinal = toYear === undefined ? ORDINAL_FAR_FUTURE : toChronologyYearEnd(toYear, toEra);
  if (startOrdinal > endOrdinal) {
    throw new BadRequestException({ code: DISCOVERY_ERROR_CODES.SEARCH_INVALID_PERIOD, message: 'the period start must not be after its end.' });
  }
  return { startOrdinal, endOrdinal };
}
