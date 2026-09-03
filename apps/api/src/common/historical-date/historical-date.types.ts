import { DatePrecision, DateQualifier } from '@prisma/client';

/**
 * A single historical date "value" as authored by an editor. This is the
 * shape DTOs accept - never a bare ISO string. See docs/backend/HISTORICAL_DOMAIN.md
 * ("Historical date model") for the full contract.
 *
 * `year`/`month`/`day` are the ONLY source of truth for what is actually
 * known. A YEAR-precision value has `month`/`day` left `undefined` forever -
 * nothing here ever fabricates a January 1st.
 */
export interface HistoricalDateInput {
  year?: number | null;
  month?: number | null;
  day?: number | null;
  precision: DatePrecision;
  qualifier?: DateQualifier | null;
  /** Only meaningful when qualifier === BETWEEN. */
  rangeEndYear?: number | null;
  rangeEndMonth?: number | null;
  rangeEndDay?: number | null;
  /** Editor-authored display override, wins over the generated display string. */
  label?: string | null;
}

/**
 * Flat column shape persisted for a single-point date slot (Event.date,
 * HistoricalFact.date, Person.birth/death). `sortStart`/`sortEnd` are
 * internal-only ordering aids - never returned as "the" date over the API.
 */
export interface HistoricalDateColumns {
  year: number | null;
  month: number | null;
  day: number | null;
  precision: DatePrecision;
  qualifier: DateQualifier;
  endYear: number | null;
  endMonth: number | null;
  endDay: number | null;
  label: string | null;
  sortStart: Date | null;
  sortEnd: Date | null;
}

/** Column shape persisted for a period slot (Era, Dynasty, Territory validity). */
export interface HistoricalPeriodColumns {
  startYear: number | null;
  startMonth: number | null;
  startDay: number | null;
  startPrecision: DatePrecision;
  startQualifier: DateQualifier;
  endYear: number | null;
  endMonth: number | null;
  endDay: number | null;
  endPrecision: DatePrecision | null;
  endQualifier: DateQualifier | null;
  dateLabel: string | null;
  sortStart: Date | null;
  sortEnd: Date | null;
}

/** API-facing representation (spec section 4). */
export interface HistoricalDateResponse {
  year: number | null;
  month: number | null;
  day: number | null;
  precision: DatePrecision;
  qualifier: DateQualifier;
  rangeEnd: { year: number | null; month: number | null; day: number | null } | null;
  display: string;
}

export interface HistoricalPeriodResponse {
  start: HistoricalDateResponse | null;
  end: HistoricalDateResponse | null;
  display: string;
}

export type SupportedLocale = 'vi' | 'en';
