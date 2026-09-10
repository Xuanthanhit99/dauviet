import { DateEra, DatePrecision, DateQualifier } from '@prisma/client';

/**
 * A single historical date "value" as authored by an editor. This is the
 * shape DTOs accept - never a bare ISO string. See docs/backend/HISTORICAL_DOMAIN.md
 * ("Historical date model") and docs/backend/HISTORICAL_DATE_V2.md ("BCE/CE
 * model", G03) for the full contract.
 *
 * `year`/`month`/`day` are the ONLY source of truth for what is actually
 * known. A YEAR-precision value has `month`/`day` left `undefined` forever -
 * nothing here ever fabricates a January 1st. `year` is always a POSITIVE,
 * 1-based, in-era display number (there is no historical year zero) -
 * `era` says which side of the epoch it falls on.
 */
export interface HistoricalDateInput {
  year?: number | null;
  month?: number | null;
  day?: number | null;
  precision: DatePrecision;
  qualifier?: DateQualifier | null;
  /** Defaults to CE (G03) - every pre-G03 caller that never set this keeps its exact prior meaning. */
  era?: DateEra | null;
  /** Only meaningful when qualifier === BETWEEN. Shares `era` with the primary date - a single-slot BETWEEN range is not modeled as crossing eras (spec section 26/27's BCE->CE example applies to the period model below, which has fully independent start/end eras). */
  rangeEndYear?: number | null;
  rangeEndMonth?: number | null;
  rangeEndDay?: number | null;
  /** Editor-authored display override, wins over the generated display string. */
  label?: string | null;
}

/**
 * Flat column shape persisted for a single-point date slot (Event.date,
 * HistoricalFact.date, Person.birth/death).
 *
 * `sortStart`/`sortEnd` are the pre-G03, legacy, internal-only ordering aid -
 * a `Date` computed via `Date.UTC`, CE-safe but NOT trustworthy for
 * astronomical years 0-99 (CE 1-99, BCE 1) because of `Date.UTC`'s legacy
 * two-digit-year special case. Kept only for backward compatibility with any
 * existing direct reader; never returned as "the" date over the API.
 *
 * `chronologyStart`/`chronologyEnd` are the G03 AUTHORITATIVE ordering/
 * range-filter keys - a pure-integer proleptic ordinal (see
 * `historical-date.util.ts` `toOrdinal`) with no Date/DateTime/timestamp
 * involvement anywhere, correct across the full BCE/CE range. Every service
 * that orders or range-filters by date must use these, not `sortStart`/
 * `sortEnd`. Also internal-only - never returned over the API.
 */
export interface HistoricalDateColumns {
  year: number | null;
  month: number | null;
  day: number | null;
  precision: DatePrecision;
  qualifier: DateQualifier;
  era: DateEra;
  endYear: number | null;
  endMonth: number | null;
  endDay: number | null;
  label: string | null;
  sortStart: Date | null;
  sortEnd: Date | null;
  chronologyStart: number | null;
  chronologyEnd: number | null;
}

/** Column shape persisted for a period slot (Era, Dynasty, Territory validity). See HistoricalDateColumns for the sortStart/sortEnd vs chronologyStart/chronologyEnd distinction - the latter is authoritative as of G03. */
export interface HistoricalPeriodColumns {
  startYear: number | null;
  startMonth: number | null;
  startDay: number | null;
  startPrecision: DatePrecision;
  startQualifier: DateQualifier;
  startEra: DateEra;
  endYear: number | null;
  endMonth: number | null;
  endDay: number | null;
  endPrecision: DatePrecision | null;
  endQualifier: DateQualifier | null;
  /** null exactly when there is no recorded end (endPrecision is also null) - never defaults to CE in that state. */
  endEra: DateEra | null;
  dateLabel: string | null;
  sortStart: Date | null;
  sortEnd: Date | null;
  chronologyStart: number | null;
  chronologyEnd: number | null;
}

/** API-facing representation (spec section 4; era added additively in G03). */
export interface HistoricalDateResponse {
  year: number | null;
  month: number | null;
  day: number | null;
  precision: DatePrecision;
  qualifier: DateQualifier;
  era: DateEra;
  rangeEnd: { year: number | null; month: number | null; day: number | null } | null;
  display: string;
}

export interface HistoricalPeriodResponse {
  start: HistoricalDateResponse | null;
  end: HistoricalDateResponse | null;
  display: string;
}

export type SupportedLocale = 'vi' | 'en';
