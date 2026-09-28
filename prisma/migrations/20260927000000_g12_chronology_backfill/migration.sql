-- =========================================================================
-- G12 - Chronology backfill (pre-freeze remediation A). DATA ONLY: no table,
-- column, index, constraint, trigger or enum is created, altered or dropped.
-- =========================================================================
-- Defect: prisma/seed.ts wrote each Golden-Dataset row's cited year/month/day
-- + precision/qualifier but never the G03 authoritative chronology ordinals
-- (the G03 migration backfilled only rows that already existed when it ran;
-- on every database seeded afterwards they stayed NULL). Timeline/era/dynasty
-- ordering and the G11 strict period filters therefore treated every seeded
-- event/era/dynasty/person/fact as unknown-dated.
--
-- Fix, two halves:
-- 1. prisma/seed.ts now writes the ordinals (new rows; parity with the real
--    historical-date.util proven by seed-chronology-parity.spec.ts).
-- 2. This migration derives them for rows that already exist.
--
-- Evidence: nothing here is new historical knowledge. Each ordinal is a pure
-- function of the row's OWN stored, cited date columns (year/month/day/
-- precision/qualifier - see docs/backend/golden-data/sources-manifest.md),
-- using exactly the G03 formula (20260908000000_g03_global_historical_
-- knowledge "CHRONOLOGY BACKFILL", proven equal to historical-date.util.ts by
-- chronology-backfill-parity.spec.ts). The functions are recreated under g12_
-- names and dropped at the end; the accepted G03 migration is not modified.
--
-- Scope guards (UNKNOWN chronology != active in every period):
-- - only rows whose ordinals are BOTH NULL (never overwrites a value that the
--   API or an earlier backfill wrote);
-- - only rows with a known start (year NOT NULL, precision <> 'UNKNOWN') -
--   an undated row is left entirely untouched and stays unknown;
-- - only CE rows (the G03 formula is the CE branch of the ordinal packing;
--   no seeded row is BCE, and API-created BCE rows always carry ordinals);
-- - a BETWEEN event/fact needs its end year.
-- Idempotent: a second run matches no row.

CREATE FUNCTION g12_backfill_ordinal_start(p_year INT, p_month INT, p_day INT, p_precision "DatePrecision")
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

CREATE FUNCTION g12_backfill_ordinal_end(p_year INT, p_month INT, p_day INT, p_precision "DatePrecision")
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

-- HistoricalEvent.date
UPDATE "HistoricalEvent" SET
  "dateChronologyStart" = CASE
    WHEN "dateQualifier" = 'BEFORE' THEN -37199629
    ELSE g12_backfill_ordinal_start("dateYear", "dateMonth", "dateDay", "datePrecision")
  END,
  "dateChronologyEnd" = CASE
    WHEN "dateQualifier" = 'AFTER' THEN 3720000
    WHEN "dateQualifier" = 'BETWEEN' THEN g12_backfill_ordinal_end("dateEndYear", "dateEndMonth", "dateEndDay", "datePrecision")
    ELSE g12_backfill_ordinal_end("dateYear", "dateMonth", "dateDay", "datePrecision")
  END
WHERE "dateChronologyStart" IS NULL AND "dateChronologyEnd" IS NULL
  AND "dateYear" IS NOT NULL AND "dateYear" >= 1 AND "datePrecision" <> 'UNKNOWN' AND "dateEra" = 'CE'
  AND ("dateQualifier" <> 'BETWEEN' OR "dateEndYear" IS NOT NULL);

-- HistoricalFact.date
UPDATE "HistoricalFact" SET
  "dateChronologyStart" = CASE
    WHEN "dateQualifier" = 'BEFORE' THEN -37199629
    ELSE g12_backfill_ordinal_start("dateYear", "dateMonth", "dateDay", "datePrecision")
  END,
  "dateChronologyEnd" = CASE
    WHEN "dateQualifier" = 'AFTER' THEN 3720000
    WHEN "dateQualifier" = 'BETWEEN' THEN g12_backfill_ordinal_end("dateEndYear", "dateEndMonth", "dateEndDay", "datePrecision")
    ELSE g12_backfill_ordinal_end("dateYear", "dateMonth", "dateDay", "datePrecision")
  END
WHERE "dateChronologyStart" IS NULL AND "dateChronologyEnd" IS NULL
  AND "dateYear" IS NOT NULL AND "dateYear" >= 1 AND "datePrecision" <> 'UNKNOWN' AND "dateEra" = 'CE'
  AND ("dateQualifier" <> 'BETWEEN' OR "dateEndYear" IS NOT NULL);

-- Person.birth
UPDATE "Person" SET
  "birthChronologyStart" = CASE
    WHEN "birthQualifier" = 'BEFORE' THEN -37199629
    ELSE g12_backfill_ordinal_start("birthYear", "birthMonth", "birthDay", "birthPrecision")
  END,
  "birthChronologyEnd" = CASE
    WHEN "birthQualifier" = 'AFTER' THEN 3720000
    WHEN "birthQualifier" = 'BETWEEN' THEN g12_backfill_ordinal_end("birthEndYear", "birthEndMonth", "birthEndDay", "birthPrecision")
    ELSE g12_backfill_ordinal_end("birthYear", "birthMonth", "birthDay", "birthPrecision")
  END
WHERE "birthChronologyStart" IS NULL AND "birthChronologyEnd" IS NULL
  AND "birthYear" IS NOT NULL AND "birthYear" >= 1 AND "birthPrecision" <> 'UNKNOWN' AND "birthEra" = 'CE'
  AND ("birthQualifier" <> 'BETWEEN' OR "birthEndYear" IS NOT NULL);

-- Person.death
UPDATE "Person" SET
  "deathChronologyStart" = CASE
    WHEN "deathQualifier" = 'BEFORE' THEN -37199629
    ELSE g12_backfill_ordinal_start("deathYear", "deathMonth", "deathDay", "deathPrecision")
  END,
  "deathChronologyEnd" = CASE
    WHEN "deathQualifier" = 'AFTER' THEN 3720000
    WHEN "deathQualifier" = 'BETWEEN' THEN g12_backfill_ordinal_end("deathEndYear", "deathEndMonth", "deathEndDay", "deathPrecision")
    ELSE g12_backfill_ordinal_end("deathYear", "deathMonth", "deathDay", "deathPrecision")
  END
WHERE "deathChronologyStart" IS NULL AND "deathChronologyEnd" IS NULL
  AND "deathYear" IS NOT NULL AND "deathYear" >= 1 AND "deathPrecision" <> 'UNKNOWN' AND "deathEra" = 'CE'
  AND ("deathQualifier" <> 'BETWEEN' OR "deathEndYear" IS NOT NULL);

-- HistoricalEra / Dynasty / Territory (period shape). A NULL endPrecision means
-- "no end recorded" (ongoing -> FAR_FUTURE); an explicitly UNKNOWN end keeps
-- chronologyEnd NULL. A NULL endEra with a recorded end is CE (the seed never
-- set endEra; the G03 backfill made the same CE-by-construction assumption).
UPDATE "HistoricalEra" SET
  "chronologyStart" = CASE
    WHEN "startQualifier" = 'BEFORE' THEN -37199629
    ELSE g12_backfill_ordinal_start("startYear", "startMonth", "startDay", "startPrecision")
  END,
  "chronologyEnd" = CASE
    WHEN "endPrecision" IS NULL THEN 3720000
    WHEN "endPrecision" = 'UNKNOWN' OR "endYear" IS NULL THEN NULL
    WHEN "endQualifier" = 'AFTER' THEN 3720000
    ELSE g12_backfill_ordinal_end("endYear", "endMonth", "endDay", "endPrecision")
  END
WHERE "chronologyStart" IS NULL AND "chronologyEnd" IS NULL
  AND "startYear" IS NOT NULL AND "startYear" >= 1 AND "startPrecision" <> 'UNKNOWN' AND "startEra" = 'CE'
  AND ("endEra" IS NULL OR "endEra" = 'CE') AND ("endYear" IS NULL OR "endYear" >= 1);

UPDATE "Dynasty" SET
  "chronologyStart" = CASE
    WHEN "startQualifier" = 'BEFORE' THEN -37199629
    ELSE g12_backfill_ordinal_start("startYear", "startMonth", "startDay", "startPrecision")
  END,
  "chronologyEnd" = CASE
    WHEN "endPrecision" IS NULL THEN 3720000
    WHEN "endPrecision" = 'UNKNOWN' OR "endYear" IS NULL THEN NULL
    WHEN "endQualifier" = 'AFTER' THEN 3720000
    ELSE g12_backfill_ordinal_end("endYear", "endMonth", "endDay", "endPrecision")
  END
WHERE "chronologyStart" IS NULL AND "chronologyEnd" IS NULL
  AND "startYear" IS NOT NULL AND "startYear" >= 1 AND "startPrecision" <> 'UNKNOWN' AND "startEra" = 'CE'
  AND ("endEra" IS NULL OR "endEra" = 'CE') AND ("endYear" IS NULL OR "endYear" >= 1);

UPDATE "Territory" SET
  "chronologyStart" = CASE
    WHEN "startQualifier" = 'BEFORE' THEN -37199629
    ELSE g12_backfill_ordinal_start("startYear", "startMonth", "startDay", "startPrecision")
  END,
  "chronologyEnd" = CASE
    WHEN "endPrecision" IS NULL THEN 3720000
    WHEN "endPrecision" = 'UNKNOWN' OR "endYear" IS NULL THEN NULL
    WHEN "endQualifier" = 'AFTER' THEN 3720000
    ELSE g12_backfill_ordinal_end("endYear", "endMonth", "endDay", "endPrecision")
  END
WHERE "chronologyStart" IS NULL AND "chronologyEnd" IS NULL
  AND "startYear" IS NOT NULL AND "startYear" >= 1 AND "startPrecision" <> 'UNKNOWN' AND "startEra" = 'CE'
  AND ("endEra" IS NULL OR "endEra" = 'CE') AND ("endYear" IS NULL OR "endYear" >= 1);

DROP FUNCTION g12_backfill_ordinal_start(INT, INT, INT, "DatePrecision");
DROP FUNCTION g12_backfill_ordinal_end(INT, INT, INT, "DatePrecision");
