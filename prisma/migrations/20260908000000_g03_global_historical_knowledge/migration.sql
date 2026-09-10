-- GLOBAL PHASE G03: Global Historical Knowledge Extension (Global Backend V2
-- Extension). Hand-written offline, same approach as every prior migration
-- in this repo (no live shadow database available for
-- `prisma migrate diff --from-migrations`). Purely additive: three new enums
-- (DateEra, EventCountryRole, PersonPlaceRole), the DateEra + chronology-
-- ordinal columns across six existing historical tables (every existing row
-- gets DateEra.CE via DEFAULT - zero reinterpretation of any existing date;
-- chronologyStart/End columns are nullable Int columns, IMMEDIATELY
-- BACKFILLED for every existing row within this same migration - see the
-- "CHRONOLOGY BACKFILL" section at the end of this file - never left NULL
-- pending a future unrelated write, and never inferred beyond what the
-- row's own existing date columns already state), three new nullable FK
-- columns on Place, and three new join tables (EventCountry/EraCountry/
-- PersonPlace), plus CHECK constraints enforcing "no historical year zero"
-- (spec section 63). No existing Phase 00-12.1/G01/G02 column, table, or
-- migration is modified, dropped, or retyped.
--
-- Chronology ordinals (docs/backend/HISTORICAL_DATE_V2.md): the legacy
-- `*SortStart`/`*SortEnd` DateTime columns (Phase 03) are NOT the
-- authoritative ordering/range-filter key for G03 onward - JS `Date.UTC`'s
-- legacy two-digit-year behavior silently remaps astronomical years 0-99
-- (i.e. CE years 1-99, and BCE year 1) to 1900-1999, which would corrupt
-- chronology for exactly that range. The new `*ChronologyStart`/
-- `*ChronologyEnd` Int columns hold a pure-arithmetic proleptic ordinal
-- (astronomicalYear * 372 + (month-1) * 31 + (day-1) - see
-- historical-date.util.ts `toOrdinal`) that involves no Date/DateTime/
-- timestamp machinery at all, and are what every service now orders/filters
-- by. The legacy DateTime columns are left in place, untouched, still
-- populated by application code exactly as before G03 (correct for every
-- year outside the narrow 0-99 astronomical window, which is also every
-- year in the existing Vietnam Golden Dataset) for any consumer that reads
-- them directly - nothing is dropped.
--
-- DB/application invariant split (G03, 3rd architecture review): every
-- `*_range` CHECK constraint below enforces, for ALL FUTURE writes, that a
-- non-null year is positive AND within the era-specific ceiling
-- (CE <= 9999, BCE <= 100000) - not just "positive" as an earlier revision
-- of this migration had it. This is a real, permanent database-level
-- invariant, not merely an application-layer one. What stays
-- application-owned: the "no historical year zero" wording/messaging and
-- the MONTH/DAY/precision-granularity cross-field validation
-- (`validatePrecisionGranularity` in historical-date.util.ts) - encoding
-- "DAY precision requires year+month+day, YEAR precision must not carry a
-- day" etc. as CHECK constraints would require a much larger, genuinely
-- duplicative expression per column (one CASE per DatePrecision value,
-- repeated 14 times) for a rule the application already enforces on every
-- write path (there is no raw-SQL write path into these tables outside the
-- application). The year/era RANGE, by contrast, is cheap and mechanical
-- to express as a real constraint and is added here as true defense in
-- depth. Before any of this applies to EXISTING data, the guard below
-- fails the migration loudly rather than silently deriving a chronology
-- ordinal from a value it cannot trust.

-- CreateEnum
CREATE TYPE "DateEra" AS ENUM ('BCE', 'CE');

-- CreateEnum: explicit occurrence-vs-scope semantics for EventCountry.role
-- (see EventCountry below) - RELATED is the conservative default.
CREATE TYPE "EventCountryRole" AS ENUM ('OCCURRED_IN', 'AFFECTED', 'ORIGIN', 'DESTINATION', 'RELATED');

-- CreateEnum: PersonPlace.role (see PersonPlace below).
CREATE TYPE "PersonPlaceRole" AS ENUM ('BIRTH', 'DEATH', 'RESIDENCE', 'ACTIVITY', 'RULE', 'EXILE', 'OTHER');

-- =========================================================================
-- LEGACY YEAR VALIDATION GUARD (G03, 3rd architecture review)
-- =========================================================================
-- V1 never enforced year >= 1 or an upper bound at the database level - the
-- `*_range` CHECK constraints added later in this migration only start
-- applying to writes from this migration onward. Before this migration
-- adds any column, backfills any chronology ordinal, or adds those
-- constraints, this guard verifies every EXISTING legacy year value
-- already in the database is a plausible CE year (1..9999, matching
-- MAX_CE_YEAR in historical-date.util.ts - every pre-G03 row is
-- unconditionally CE). If ANY existing row violates this, the migration
-- ABORTS (RAISE EXCEPTION rolls back the whole transaction, including
-- every DDL statement above) with a diagnostic naming the exact
-- table/column and how many rows are affected. It does NOT auto-correct,
-- reinterpret, delete, or clamp the offending value - an operator must
-- resolve the underlying data by hand and re-run the migration. The
-- backfill later in this file will never silently derive a chronology
-- ordinal from a value it cannot trust.
DO $$
DECLARE
  bad_count INT;
BEGIN
  SELECT COUNT(*) INTO bad_count FROM "HistoricalEvent" WHERE "dateYear" IS NOT NULL AND ("dateYear" <= 0 OR "dateYear" > 9999);
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'G03 migration aborted: % row(s) in "HistoricalEvent"."dateYear" are outside the supported legacy CE range (1..9999) - resolve manually before retrying.', bad_count;
  END IF;

  SELECT COUNT(*) INTO bad_count FROM "HistoricalEvent" WHERE "dateEndYear" IS NOT NULL AND ("dateEndYear" <= 0 OR "dateEndYear" > 9999);
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'G03 migration aborted: % row(s) in "HistoricalEvent"."dateEndYear" are outside the supported legacy CE range (1..9999) - resolve manually before retrying.', bad_count;
  END IF;

  SELECT COUNT(*) INTO bad_count FROM "HistoricalFact" WHERE "dateYear" IS NOT NULL AND ("dateYear" <= 0 OR "dateYear" > 9999);
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'G03 migration aborted: % row(s) in "HistoricalFact"."dateYear" are outside the supported legacy CE range (1..9999) - resolve manually before retrying.', bad_count;
  END IF;

  SELECT COUNT(*) INTO bad_count FROM "HistoricalFact" WHERE "dateEndYear" IS NOT NULL AND ("dateEndYear" <= 0 OR "dateEndYear" > 9999);
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'G03 migration aborted: % row(s) in "HistoricalFact"."dateEndYear" are outside the supported legacy CE range (1..9999) - resolve manually before retrying.', bad_count;
  END IF;

  SELECT COUNT(*) INTO bad_count FROM "Person" WHERE "birthYear" IS NOT NULL AND ("birthYear" <= 0 OR "birthYear" > 9999);
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'G03 migration aborted: % row(s) in "Person"."birthYear" are outside the supported legacy CE range (1..9999) - resolve manually before retrying.', bad_count;
  END IF;

  SELECT COUNT(*) INTO bad_count FROM "Person" WHERE "birthEndYear" IS NOT NULL AND ("birthEndYear" <= 0 OR "birthEndYear" > 9999);
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'G03 migration aborted: % row(s) in "Person"."birthEndYear" are outside the supported legacy CE range (1..9999) - resolve manually before retrying.', bad_count;
  END IF;

  SELECT COUNT(*) INTO bad_count FROM "Person" WHERE "deathYear" IS NOT NULL AND ("deathYear" <= 0 OR "deathYear" > 9999);
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'G03 migration aborted: % row(s) in "Person"."deathYear" are outside the supported legacy CE range (1..9999) - resolve manually before retrying.', bad_count;
  END IF;

  SELECT COUNT(*) INTO bad_count FROM "Person" WHERE "deathEndYear" IS NOT NULL AND ("deathEndYear" <= 0 OR "deathEndYear" > 9999);
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'G03 migration aborted: % row(s) in "Person"."deathEndYear" are outside the supported legacy CE range (1..9999) - resolve manually before retrying.', bad_count;
  END IF;

  SELECT COUNT(*) INTO bad_count FROM "HistoricalEra" WHERE "startYear" IS NOT NULL AND ("startYear" <= 0 OR "startYear" > 9999);
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'G03 migration aborted: % row(s) in "HistoricalEra"."startYear" are outside the supported legacy CE range (1..9999) - resolve manually before retrying.', bad_count;
  END IF;

  SELECT COUNT(*) INTO bad_count FROM "HistoricalEra" WHERE "endYear" IS NOT NULL AND ("endYear" <= 0 OR "endYear" > 9999);
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'G03 migration aborted: % row(s) in "HistoricalEra"."endYear" are outside the supported legacy CE range (1..9999) - resolve manually before retrying.', bad_count;
  END IF;

  SELECT COUNT(*) INTO bad_count FROM "Dynasty" WHERE "startYear" IS NOT NULL AND ("startYear" <= 0 OR "startYear" > 9999);
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'G03 migration aborted: % row(s) in "Dynasty"."startYear" are outside the supported legacy CE range (1..9999) - resolve manually before retrying.', bad_count;
  END IF;

  SELECT COUNT(*) INTO bad_count FROM "Dynasty" WHERE "endYear" IS NOT NULL AND ("endYear" <= 0 OR "endYear" > 9999);
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'G03 migration aborted: % row(s) in "Dynasty"."endYear" are outside the supported legacy CE range (1..9999) - resolve manually before retrying.', bad_count;
  END IF;

  SELECT COUNT(*) INTO bad_count FROM "Territory" WHERE "startYear" IS NOT NULL AND ("startYear" <= 0 OR "startYear" > 9999);
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'G03 migration aborted: % row(s) in "Territory"."startYear" are outside the supported legacy CE range (1..9999) - resolve manually before retrying.', bad_count;
  END IF;

  SELECT COUNT(*) INTO bad_count FROM "Territory" WHERE "endYear" IS NOT NULL AND ("endYear" <= 0 OR "endYear" > 9999);
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'G03 migration aborted: % row(s) in "Territory"."endYear" are outside the supported legacy CE range (1..9999) - resolve manually before retrying.', bad_count;
  END IF;
END $$;

-- AlterTable: Person gains birthEra/deathEra (spec section 21/28 - additive,
-- defaults to CE so every existing birth/death date keeps its exact prior
-- meaning) and the chronology ordinal columns for birth/death.
ALTER TABLE "Person"
  ADD COLUMN "birthEra" "DateEra" NOT NULL DEFAULT 'CE',
  ADD COLUMN "deathEra" "DateEra" NOT NULL DEFAULT 'CE',
  ADD COLUMN "birthChronologyStart" INTEGER,
  ADD COLUMN "birthChronologyEnd" INTEGER,
  ADD COLUMN "deathChronologyStart" INTEGER,
  ADD COLUMN "deathChronologyEnd" INTEGER;

ALTER TABLE "Person" ADD CONSTRAINT "Person_birthYear_range" CHECK ("birthYear" IS NULL OR ("birthYear" > 0 AND ((("birthEra" = 'CE') AND ("birthYear" <= 9999)) OR (("birthEra" = 'BCE') AND ("birthYear" <= 100000)))));
ALTER TABLE "Person" ADD CONSTRAINT "Person_birthEndYear_range" CHECK ("birthEndYear" IS NULL OR ("birthEndYear" > 0 AND ((("birthEra" = 'CE') AND ("birthEndYear" <= 9999)) OR (("birthEra" = 'BCE') AND ("birthEndYear" <= 100000)))));
ALTER TABLE "Person" ADD CONSTRAINT "Person_deathYear_range" CHECK ("deathYear" IS NULL OR ("deathYear" > 0 AND ((("deathEra" = 'CE') AND ("deathYear" <= 9999)) OR (("deathEra" = 'BCE') AND ("deathYear" <= 100000)))));
ALTER TABLE "Person" ADD CONSTRAINT "Person_deathEndYear_range" CHECK ("deathEndYear" IS NULL OR ("deathEndYear" > 0 AND ((("deathEra" = 'CE') AND ("deathEndYear" <= 9999)) OR (("deathEra" = 'BCE') AND ("deathEndYear" <= 100000)))));

-- AlterTable: HistoricalEvent gains dateEra + chronology ordinal columns.
ALTER TABLE "HistoricalEvent"
  ADD COLUMN "dateEra" "DateEra" NOT NULL DEFAULT 'CE',
  ADD COLUMN "dateChronologyStart" INTEGER,
  ADD COLUMN "dateChronologyEnd" INTEGER;
ALTER TABLE "HistoricalEvent" ADD CONSTRAINT "HistoricalEvent_dateYear_range" CHECK ("dateYear" IS NULL OR ("dateYear" > 0 AND ((("dateEra" = 'CE') AND ("dateYear" <= 9999)) OR (("dateEra" = 'BCE') AND ("dateYear" <= 100000)))));
ALTER TABLE "HistoricalEvent" ADD CONSTRAINT "HistoricalEvent_dateEndYear_range" CHECK ("dateEndYear" IS NULL OR ("dateEndYear" > 0 AND ((("dateEra" = 'CE') AND ("dateEndYear" <= 9999)) OR (("dateEra" = 'BCE') AND ("dateEndYear" <= 100000)))));
CREATE INDEX "HistoricalEvent_dateChronologyStart_idx" ON "HistoricalEvent"("dateChronologyStart");

-- AlterTable: HistoricalFact gains dateEra + chronology ordinal columns.
ALTER TABLE "HistoricalFact"
  ADD COLUMN "dateEra" "DateEra" NOT NULL DEFAULT 'CE',
  ADD COLUMN "dateChronologyStart" INTEGER,
  ADD COLUMN "dateChronologyEnd" INTEGER;
ALTER TABLE "HistoricalFact" ADD CONSTRAINT "HistoricalFact_dateYear_range" CHECK ("dateYear" IS NULL OR ("dateYear" > 0 AND ((("dateEra" = 'CE') AND ("dateYear" <= 9999)) OR (("dateEra" = 'BCE') AND ("dateYear" <= 100000)))));
ALTER TABLE "HistoricalFact" ADD CONSTRAINT "HistoricalFact_dateEndYear_range" CHECK ("dateEndYear" IS NULL OR ("dateEndYear" > 0 AND ((("dateEra" = 'CE') AND ("dateEndYear" <= 9999)) OR (("dateEra" = 'BCE') AND ("dateEndYear" <= 100000)))));

-- AlterTable: HistoricalEra gains startEra (defaulted)/endEra (nullable, no
-- default - mirrors endPrecision/endQualifier's own "no end recorded"
-- convention) and the chronology ordinal columns.
ALTER TABLE "HistoricalEra"
  ADD COLUMN "startEra" "DateEra" NOT NULL DEFAULT 'CE',
  ADD COLUMN "endEra" "DateEra",
  ADD COLUMN "chronologyStart" INTEGER,
  ADD COLUMN "chronologyEnd" INTEGER;

ALTER TABLE "HistoricalEra" ADD CONSTRAINT "HistoricalEra_startYear_range" CHECK ("startYear" IS NULL OR ("startYear" > 0 AND ((("startEra" = 'CE') AND ("startYear" <= 9999)) OR (("startEra" = 'BCE') AND ("startYear" <= 100000)))));
ALTER TABLE "HistoricalEra" ADD CONSTRAINT "HistoricalEra_endYear_range" CHECK ("endYear" IS NULL OR ("endYear" > 0 AND ((("endEra" = 'CE') AND ("endYear" <= 9999)) OR (("endEra" = 'BCE') AND ("endYear" <= 100000)))));
CREATE INDEX "HistoricalEra_chronologyStart_idx" ON "HistoricalEra"("chronologyStart");

-- AlterTable: Dynasty gains startEra/endEra + chronology ordinal columns
-- (consistency with the other period-dated models - Dynasty is not part of
-- the G03 Japan fixture itself, but leaving it BCE-incapable while
-- Era/Territory gain it would be an arbitrary inconsistency).
ALTER TABLE "Dynasty"
  ADD COLUMN "startEra" "DateEra" NOT NULL DEFAULT 'CE',
  ADD COLUMN "endEra" "DateEra",
  ADD COLUMN "chronologyStart" INTEGER,
  ADD COLUMN "chronologyEnd" INTEGER;

ALTER TABLE "Dynasty" ADD CONSTRAINT "Dynasty_startYear_range" CHECK ("startYear" IS NULL OR ("startYear" > 0 AND ((("startEra" = 'CE') AND ("startYear" <= 9999)) OR (("startEra" = 'BCE') AND ("startYear" <= 100000)))));
ALTER TABLE "Dynasty" ADD CONSTRAINT "Dynasty_endYear_range" CHECK ("endYear" IS NULL OR ("endYear" > 0 AND ((("endEra" = 'CE') AND ("endYear" <= 9999)) OR (("endEra" = 'BCE') AND ("endYear" <= 100000)))));
CREATE INDEX "Dynasty_chronologyStart_idx" ON "Dynasty"("chronologyStart");

-- AlterTable: Territory gains startEra/endEra + chronology ordinal columns.
-- MapService's year-scoped bbox query filters on chronologyStart/End (see
-- HISTORICAL_DATE_V2.md and the "Territory year filter" note above) - its
-- `year` query param remains CE-only by contract (no G03 gate requires
-- broader BCE map support; that stays G11 scope).
ALTER TABLE "Territory"
  ADD COLUMN "startEra" "DateEra" NOT NULL DEFAULT 'CE',
  ADD COLUMN "endEra" "DateEra",
  ADD COLUMN "chronologyStart" INTEGER,
  ADD COLUMN "chronologyEnd" INTEGER;

ALTER TABLE "Territory" ADD CONSTRAINT "Territory_startYear_range" CHECK ("startYear" IS NULL OR ("startYear" > 0 AND ((("startEra" = 'CE') AND ("startYear" <= 9999)) OR (("startEra" = 'BCE') AND ("startYear" <= 100000)))));
ALTER TABLE "Territory" ADD CONSTRAINT "Territory_endYear_range" CHECK ("endYear" IS NULL OR ("endYear" > 0 AND ((("endEra" = 'CE') AND ("endYear" <= 9999)) OR (("endEra" = 'BCE') AND ("endYear" <= 100000)))));
CREATE INDEX "Territory_chronologyStart_idx" ON "Territory"("chronologyStart");

-- AlterTable: Place gains current (modern-day) geography context - direct
-- nullable FKs, not a join table (spec section 9/12 - a physical Place has
-- at most one current country/region/city, mirroring the exact shape G01's
-- Destination already uses). currentAdminRegion is untouched.
ALTER TABLE "Place"
  ADD COLUMN "currentCountryId" TEXT,
  ADD COLUMN "currentRegionId" TEXT,
  ADD COLUMN "currentCityId" TEXT;

CREATE INDEX "Place_currentCountryId_idx" ON "Place"("currentCountryId");
CREATE INDEX "Place_currentRegionId_idx" ON "Place"("currentRegionId");
CREATE INDEX "Place_currentCityId_idx" ON "Place"("currentCityId");

ALTER TABLE "Place"
  ADD CONSTRAINT "Place_currentCountryId_fkey" FOREIGN KEY ("currentCountryId") REFERENCES "Country"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Place_currentRegionId_fkey" FOREIGN KEY ("currentRegionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Place_currentCityId_fkey" FOREIGN KEY ("currentCityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: EventCountry - a HistoricalEvent may span multiple modern
-- countries (spec section 15/16). Real many-to-many, unlike Place's current-
-- geography FKs above, because plurality is a genuine requirement here.
-- `role` is an explicit enum (not a free-text string) so a link's historical
-- meaning ("this happened here" vs "merely related") is never ambiguous;
-- RELATED is the conservative default.
CREATE TABLE "EventCountry" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "countryId" TEXT NOT NULL,
  "role" "EventCountryRole" NOT NULL DEFAULT 'RELATED',
  CONSTRAINT "EventCountry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventCountry_eventId_countryId_key" ON "EventCountry"("eventId", "countryId");
CREATE INDEX "EventCountry_countryId_idx" ON "EventCountry"("countryId");

ALTER TABLE "EventCountry"
  ADD CONSTRAINT "EventCountry_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "HistoricalEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "EventCountry_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: EraCountry - a HistoricalEra may span multiple modern
-- countries (spec section 17/18). Deliberately no `role` column - an era's
-- country links are always geographic applicability/scope only, never
-- ownership, nationality, or exclusive territorial control.
CREATE TABLE "EraCountry" (
  "id" TEXT NOT NULL,
  "eraId" TEXT NOT NULL,
  "countryId" TEXT NOT NULL,
  CONSTRAINT "EraCountry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EraCountry_eraId_countryId_key" ON "EraCountry"("eraId", "countryId");
CREATE INDEX "EraCountry_countryId_idx" ON "EraCountry"("countryId");

ALTER TABLE "EraCountry"
  ADD CONSTRAINT "EraCountry_eraId_fkey" FOREIGN KEY ("eraId") REFERENCES "HistoricalEra"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "EraCountry_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: PersonPlace - minimal, explicit Person<->Place association
-- (spec's "people associated with multiple geographic contexts"
-- requirement). No prior direct Person<->Place relation existed (Person
-- only reached Place indirectly via a shared HistoricalEvent's
-- EventPerson+EventPlace links) - this is new, not an extension of an
-- existing join table. Not a nationality/citizenship field and does not
-- feed any nationality inference.
CREATE TABLE "PersonPlace" (
  "id" TEXT NOT NULL,
  "personId" TEXT NOT NULL,
  "placeId" TEXT NOT NULL,
  "role" "PersonPlaceRole" NOT NULL DEFAULT 'OTHER',
  CONSTRAINT "PersonPlace_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PersonPlace_personId_placeId_role_key" ON "PersonPlace"("personId", "placeId", "role");
CREATE INDEX "PersonPlace_placeId_idx" ON "PersonPlace"("placeId");

ALTER TABLE "PersonPlace"
  ADD CONSTRAINT "PersonPlace_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "PersonPlace_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =========================================================================
-- CHRONOLOGY BACKFILL (G03, 2nd architecture review)
-- =========================================================================
-- Historical chronology is a derived invariant, not something that may wait
-- for an unrelated future write. Every existing date-bearing row (Migration
-- Path B: a pre-G03 database) must have its authoritative
-- chronologyStart/chronologyEnd populated by the time this migration
-- finishes - Timeline/Era/Dynasty/Territory ordering already queries these
-- columns exclusively (see apps/api/src/modules/timeline/timeline.service.ts
-- and the .list() methods in eras/dynasties/territories services).
--
-- Every row that predates this migration is CE by construction (the *Era
-- columns above all default to 'CE', and BCE could not exist before this
-- migration introduced it) - this backfill therefore only ever needs the CE
-- branch of the ordinal formula (astronomical year = calendar year, no
-- BCE sign-flip/century-boundary-swap). It is NOT a general-purpose
-- replacement for the BCE-aware logic in historical-date.util.ts - it exists
-- only to backfill this one migration's pre-existing, CE-only data.
--
-- The two temporary functions below implement the exact same integer-
-- packing formula as toOrdinal()/ordinalBoundsFor() in
-- apps/api/src/common/historical-date/historical-date.util.ts, restricted
-- to positive (CE) years, where Postgres integer/integer division already
-- truncates toward zero - i.e. floors, for any positive dividend - so no
-- FLOOR()/float cast is needed here (unlike the general TS implementation,
-- which must also handle negative astronomical years for BCE). Proven equal
-- to the TypeScript implementation, case by case, by
-- apps/api/src/common/historical-date/chronology-backfill-parity.spec.ts.
-- Dropped at the end of this section - they exist only for this one-time
-- backfill, never as permanent schema.
--
-- -37199629 / 3720000 below are ORDINAL_FAR_PAST / ORDINAL_FAR_FUTURE from
-- historical-date.util.ts (exported specifically so the parity test can
-- assert these hardcoded copies are exactly equal to the real computed
-- constants - see that spec file).

CREATE FUNCTION g03_backfill_ordinal_start(p_year INT, p_month INT, p_day INT, p_precision "DatePrecision")
RETURNS INT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_precision
    WHEN 'DAY' THEN p_year * 372 + (p_month - 1) * 31 + (p_day - 1)
    WHEN 'MONTH' THEN p_year * 372 + (p_month - 1) * 31
    WHEN 'YEAR' THEN p_year * 372
    WHEN 'DECADE' THEN ((p_year / 10) * 10) * 372
    WHEN 'CENTURY' THEN (((p_year - 1) / 100) * 100 + 1) * 372
    ELSE NULL
  END;
$$;

CREATE FUNCTION g03_backfill_ordinal_end(p_year INT, p_month INT, p_day INT, p_precision "DatePrecision")
RETURNS INT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_precision
    WHEN 'DAY' THEN p_year * 372 + (p_month - 1) * 31 + (p_day - 1)
    WHEN 'MONTH' THEN p_year * 372 + (p_month - 1) * 31 + 30
    WHEN 'YEAR' THEN p_year * 372 + 371
    WHEN 'DECADE' THEN ((p_year / 10) * 10 + 9) * 372 + 371
    WHEN 'CENTURY' THEN (((p_year - 1) / 100) * 100 + 100) * 372 + 371
    ELSE NULL
  END;
$$;

-- HistoricalEvent.date (single slot; BETWEEN's end uses dateEnd*).
UPDATE "HistoricalEvent" SET
  "dateChronologyStart" = CASE
    WHEN "datePrecision" = 'UNKNOWN' OR "dateYear" IS NULL THEN NULL
    WHEN "dateQualifier" = 'BEFORE' THEN -37199629
    ELSE g03_backfill_ordinal_start("dateYear", "dateMonth", "dateDay", "datePrecision")
  END,
  "dateChronologyEnd" = CASE
    WHEN "datePrecision" = 'UNKNOWN' OR "dateYear" IS NULL THEN NULL
    WHEN "dateQualifier" = 'AFTER' THEN 3720000
    WHEN "dateQualifier" = 'BETWEEN' THEN g03_backfill_ordinal_end("dateEndYear", "dateEndMonth", "dateEndDay", "datePrecision")
    ELSE g03_backfill_ordinal_end("dateYear", "dateMonth", "dateDay", "datePrecision")
  END;

-- HistoricalFact.date (same shape as HistoricalEvent.date).
UPDATE "HistoricalFact" SET
  "dateChronologyStart" = CASE
    WHEN "datePrecision" = 'UNKNOWN' OR "dateYear" IS NULL THEN NULL
    WHEN "dateQualifier" = 'BEFORE' THEN -37199629
    ELSE g03_backfill_ordinal_start("dateYear", "dateMonth", "dateDay", "datePrecision")
  END,
  "dateChronologyEnd" = CASE
    WHEN "datePrecision" = 'UNKNOWN' OR "dateYear" IS NULL THEN NULL
    WHEN "dateQualifier" = 'AFTER' THEN 3720000
    WHEN "dateQualifier" = 'BETWEEN' THEN g03_backfill_ordinal_end("dateEndYear", "dateEndMonth", "dateEndDay", "datePrecision")
    ELSE g03_backfill_ordinal_end("dateYear", "dateMonth", "dateDay", "datePrecision")
  END;

-- Person.birth and Person.death (two independent single-date slots on one row).
UPDATE "Person" SET
  "birthChronologyStart" = CASE
    WHEN "birthPrecision" = 'UNKNOWN' OR "birthYear" IS NULL THEN NULL
    WHEN "birthQualifier" = 'BEFORE' THEN -37199629
    ELSE g03_backfill_ordinal_start("birthYear", "birthMonth", "birthDay", "birthPrecision")
  END,
  "birthChronologyEnd" = CASE
    WHEN "birthPrecision" = 'UNKNOWN' OR "birthYear" IS NULL THEN NULL
    WHEN "birthQualifier" = 'AFTER' THEN 3720000
    WHEN "birthQualifier" = 'BETWEEN' THEN g03_backfill_ordinal_end("birthEndYear", "birthEndMonth", "birthEndDay", "birthPrecision")
    ELSE g03_backfill_ordinal_end("birthYear", "birthMonth", "birthDay", "birthPrecision")
  END,
  "deathChronologyStart" = CASE
    WHEN "deathPrecision" = 'UNKNOWN' OR "deathYear" IS NULL THEN NULL
    WHEN "deathQualifier" = 'BEFORE' THEN -37199629
    ELSE g03_backfill_ordinal_start("deathYear", "deathMonth", "deathDay", "deathPrecision")
  END,
  "deathChronologyEnd" = CASE
    WHEN "deathPrecision" = 'UNKNOWN' OR "deathYear" IS NULL THEN NULL
    WHEN "deathQualifier" = 'AFTER' THEN 3720000
    WHEN "deathQualifier" = 'BETWEEN' THEN g03_backfill_ordinal_end("deathEndYear", "deathEndMonth", "deathEndDay", "deathPrecision")
    ELSE g03_backfill_ordinal_end("deathYear", "deathMonth", "deathDay", "deathPrecision")
  END;

-- HistoricalEra / Dynasty / Territory: period shape (independent start/end
-- slots, neither can be BETWEEN - see buildHistoricalPeriodColumns). A NULL
-- endPrecision means "no end recorded" (chronologyEnd = FAR_FUTURE
-- sentinel), distinct from an explicitly UNKNOWN end (endPrecision =
-- 'UNKNOWN' literally stored, endYear NULL - chronologyEnd stays NULL).
UPDATE "HistoricalEra" SET
  "chronologyStart" = CASE
    WHEN "startPrecision" = 'UNKNOWN' OR "startYear" IS NULL THEN NULL
    WHEN "startQualifier" = 'BEFORE' THEN -37199629
    ELSE g03_backfill_ordinal_start("startYear", "startMonth", "startDay", "startPrecision")
  END,
  "chronologyEnd" = CASE
    WHEN "endPrecision" IS NULL THEN 3720000
    WHEN "endPrecision" = 'UNKNOWN' OR "endYear" IS NULL THEN NULL
    WHEN "endQualifier" = 'AFTER' THEN 3720000
    ELSE g03_backfill_ordinal_end("endYear", "endMonth", "endDay", "endPrecision")
  END;

UPDATE "Dynasty" SET
  "chronologyStart" = CASE
    WHEN "startPrecision" = 'UNKNOWN' OR "startYear" IS NULL THEN NULL
    WHEN "startQualifier" = 'BEFORE' THEN -37199629
    ELSE g03_backfill_ordinal_start("startYear", "startMonth", "startDay", "startPrecision")
  END,
  "chronologyEnd" = CASE
    WHEN "endPrecision" IS NULL THEN 3720000
    WHEN "endPrecision" = 'UNKNOWN' OR "endYear" IS NULL THEN NULL
    WHEN "endQualifier" = 'AFTER' THEN 3720000
    ELSE g03_backfill_ordinal_end("endYear", "endMonth", "endDay", "endPrecision")
  END;

UPDATE "Territory" SET
  "chronologyStart" = CASE
    WHEN "startPrecision" = 'UNKNOWN' OR "startYear" IS NULL THEN NULL
    WHEN "startQualifier" = 'BEFORE' THEN -37199629
    ELSE g03_backfill_ordinal_start("startYear", "startMonth", "startDay", "startPrecision")
  END,
  "chronologyEnd" = CASE
    WHEN "endPrecision" IS NULL THEN 3720000
    WHEN "endPrecision" = 'UNKNOWN' OR "endYear" IS NULL THEN NULL
    WHEN "endQualifier" = 'AFTER' THEN 3720000
    ELSE g03_backfill_ordinal_end("endYear", "endMonth", "endDay", "endPrecision")
  END;

DROP FUNCTION g03_backfill_ordinal_start(INT, INT, INT, "DatePrecision");
DROP FUNCTION g03_backfill_ordinal_end(INT, INT, INT, "DatePrecision");
