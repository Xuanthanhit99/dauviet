-- Phase 03: Historical Knowledge Graph, Historical Dates, Geography & Entity Integrity
--
-- Generated offline via:
--   prisma migrate diff --from-schema-datamodel <pre-phase03 schema.prisma>
--                        --to-schema-datamodel prisma/schema.prisma --script
-- (same offline method used for the init and phase02 migrations - no live
-- shadow database was reachable in this sandbox; see
-- docs/backend/BACKEND_FREEZE_REPORT.md). Reviewed by inspection below.
--
-- Classification: PASS_STATIC_MIGRATION_REVIEW. This has NOT been applied to
-- any live database (UNVERIFIED_LIVE_DB) - run `pnpm db:migrate:deploy`
-- against a real Postgres+PostGIS instance and re-verify before relying on
-- this in production.
--
-- Why the DROP COLUMNs below are safe: `Person.birthDateStart`,
-- `HistoricalEvent.dateStart`, `Territory.validFrom`, etc. (the old flat
-- ISO-DateTime date columns from Phase 01) have never held real production
-- data - migration 20260903000000_init itself was never applied to a live
-- database either (see BACKEND_FREEZE_REPORT.md "Why infra is blocked").
-- There is no data-loss risk here; if this repository's migration history
-- is ever applied to a database that already has real rows, back up first.
--
-- NOTE for anyone re-running `db:seed` against an already-seeded dev DB:
-- the new `EntityAlias_entityType_entityId_locale_alias_key` unique index
-- will reject the migration if duplicate (entityType, entityId, '', alias)
-- rows already exist from a prior seed run - reset the dev DB
-- (`pnpm db:migrate:reset`) rather than re-seeding on top of Phase 01 data.

-- CreateEnum
CREATE TYPE "DateQualifier" AS ENUM ('EXACT', 'CIRCA', 'BEFORE', 'AFTER', 'BETWEEN', 'UNCERTAIN', 'TRADITIONAL');

-- CreateEnum
CREATE TYPE "ThemeCategory" AS ENUM ('POLITICAL', 'MILITARY', 'CULTURAL', 'DIPLOMATIC', 'RELIGIOUS', 'ECONOMIC', 'SOCIAL', 'SCIENTIFIC', 'TERRITORIAL', 'HERITAGE', 'OTHER');

-- AlterEnum
BEGIN;
CREATE TYPE "DatePrecision_new" AS ENUM ('DAY', 'MONTH', 'YEAR', 'DECADE', 'CENTURY', 'UNKNOWN');
ALTER TABLE "MediaAsset" ALTER COLUMN "captureDatePrecision" DROP DEFAULT;
ALTER TABLE "Person" ALTER COLUMN "birthDatePrecision" DROP DEFAULT;
ALTER TABLE "Person" ALTER COLUMN "deathDatePrecision" DROP DEFAULT;
ALTER TABLE "HistoricalEvent" ALTER COLUMN "datePrecision" DROP DEFAULT;
ALTER TABLE "HistoricalEra" ALTER COLUMN "datePrecision" DROP DEFAULT;
ALTER TABLE "Dynasty" ALTER COLUMN "datePrecision" DROP DEFAULT;
ALTER TABLE "Territory" ALTER COLUMN "datePrecision" DROP DEFAULT;
ALTER TABLE "HistoricalFact" ALTER COLUMN "datePrecision" DROP DEFAULT;
ALTER TABLE "CommunityStory" ALTER COLUMN "eventDatePrecision" DROP DEFAULT;
ALTER TABLE "MediaAsset" ALTER COLUMN "capturePrecision" TYPE "DatePrecision_new" USING ("capturePrecision"::text::"DatePrecision_new");
ALTER TABLE "Person" ALTER COLUMN "birthPrecision" TYPE "DatePrecision_new" USING ("birthPrecision"::text::"DatePrecision_new");
ALTER TABLE "Person" ALTER COLUMN "deathPrecision" TYPE "DatePrecision_new" USING ("deathPrecision"::text::"DatePrecision_new");
ALTER TABLE "HistoricalEvent" ALTER COLUMN "datePrecision" TYPE "DatePrecision_new" USING ("datePrecision"::text::"DatePrecision_new");
ALTER TABLE "HistoricalEra" ALTER COLUMN "startPrecision" TYPE "DatePrecision_new" USING ("startPrecision"::text::"DatePrecision_new");
ALTER TABLE "HistoricalEra" ALTER COLUMN "endPrecision" TYPE "DatePrecision_new" USING ("endPrecision"::text::"DatePrecision_new");
ALTER TABLE "Dynasty" ALTER COLUMN "startPrecision" TYPE "DatePrecision_new" USING ("startPrecision"::text::"DatePrecision_new");
ALTER TABLE "Dynasty" ALTER COLUMN "endPrecision" TYPE "DatePrecision_new" USING ("endPrecision"::text::"DatePrecision_new");
ALTER TABLE "Territory" ALTER COLUMN "startPrecision" TYPE "DatePrecision_new" USING ("startPrecision"::text::"DatePrecision_new");
ALTER TABLE "Territory" ALTER COLUMN "endPrecision" TYPE "DatePrecision_new" USING ("endPrecision"::text::"DatePrecision_new");
ALTER TABLE "HistoricalFact" ALTER COLUMN "datePrecision" TYPE "DatePrecision_new" USING ("datePrecision"::text::"DatePrecision_new");
ALTER TABLE "CommunityStory" ALTER COLUMN "eventDatePrecision" TYPE "DatePrecision_new" USING ("eventDatePrecision"::text::"DatePrecision_new");
ALTER TYPE "DatePrecision" RENAME TO "DatePrecision_old";
ALTER TYPE "DatePrecision_new" RENAME TO "DatePrecision";
DROP TYPE "DatePrecision_old";
ALTER TABLE "HistoricalEvent" ALTER COLUMN "datePrecision" SET DEFAULT 'UNKNOWN';
ALTER TABLE "HistoricalFact" ALTER COLUMN "datePrecision" SET DEFAULT 'UNKNOWN';
ALTER TABLE "CommunityStory" ALTER COLUMN "eventDatePrecision" SET DEFAULT 'UNKNOWN';
COMMIT;

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AliasType" ADD VALUE 'TRANSLITERATION';
ALTER TYPE "AliasType" ADD VALUE 'ALTERNATE_SPELLING';
ALTER TYPE "AliasType" ADD VALUE 'BIRTH_NAME';
ALTER TYPE "AliasType" ADD VALUE 'REGNAL_NAME';
ALTER TYPE "AliasType" ADD VALUE 'TEMPLE_NAME';
ALTER TYPE "AliasType" ADD VALUE 'TITLE';
ALTER TYPE "AliasType" ADD VALUE 'EPITHET';

-- AlterTable
ALTER TABLE "MediaAsset" DROP COLUMN "captureDate",
DROP COLUMN "captureDatePrecision",
ADD COLUMN     "captureDay" INTEGER,
ADD COLUMN     "captureMonth" INTEGER,
ADD COLUMN     "capturePrecision" "DatePrecision" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "captureYear" INTEGER;

-- AlterTable
ALTER TABLE "EntityAlias" ALTER COLUMN "locale" SET NOT NULL,
ALTER COLUMN "locale" SET DEFAULT '';

-- AlterTable
ALTER TABLE "Person" DROP COLUMN "birthDateEnd",
DROP COLUMN "birthDateLabel",
DROP COLUMN "birthDatePrecision",
DROP COLUMN "birthDateStart",
DROP COLUMN "deathDateEnd",
DROP COLUMN "deathDateLabel",
DROP COLUMN "deathDatePrecision",
DROP COLUMN "deathDateStart",
ADD COLUMN     "birthDay" INTEGER,
ADD COLUMN     "birthEndDay" INTEGER,
ADD COLUMN     "birthEndMonth" INTEGER,
ADD COLUMN     "birthEndYear" INTEGER,
ADD COLUMN     "birthLabel" TEXT,
ADD COLUMN     "birthMonth" INTEGER,
ADD COLUMN     "birthPrecision" "DatePrecision" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "birthQualifier" "DateQualifier" NOT NULL DEFAULT 'UNCERTAIN',
ADD COLUMN     "birthSortEnd" TIMESTAMP(3),
ADD COLUMN     "birthSortStart" TIMESTAMP(3),
ADD COLUMN     "birthYear" INTEGER,
ADD COLUMN     "deathDay" INTEGER,
ADD COLUMN     "deathEndDay" INTEGER,
ADD COLUMN     "deathEndMonth" INTEGER,
ADD COLUMN     "deathEndYear" INTEGER,
ADD COLUMN     "deathLabel" TEXT,
ADD COLUMN     "deathMonth" INTEGER,
ADD COLUMN     "deathPrecision" "DatePrecision" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "deathQualifier" "DateQualifier" NOT NULL DEFAULT 'UNCERTAIN',
ADD COLUMN     "deathSortEnd" TIMESTAMP(3),
ADD COLUMN     "deathSortStart" TIMESTAMP(3),
ADD COLUMN     "deathYear" INTEGER;

-- AlterTable
ALTER TABLE "HistoricalEvent" DROP COLUMN "dateEnd",
DROP COLUMN "dateStart",
ADD COLUMN     "dateDay" INTEGER,
ADD COLUMN     "dateEndDay" INTEGER,
ADD COLUMN     "dateEndMonth" INTEGER,
ADD COLUMN     "dateEndYear" INTEGER,
ADD COLUMN     "dateMonth" INTEGER,
ADD COLUMN     "dateQualifier" "DateQualifier" NOT NULL DEFAULT 'UNCERTAIN',
ADD COLUMN     "dateSortEnd" TIMESTAMP(3),
ADD COLUMN     "dateSortStart" TIMESTAMP(3),
ADD COLUMN     "dateYear" INTEGER;

-- AlterTable
ALTER TABLE "HistoricalEra" DROP COLUMN "dateEnd",
DROP COLUMN "datePrecision",
DROP COLUMN "dateStart",
ADD COLUMN     "endDay" INTEGER,
ADD COLUMN     "endMonth" INTEGER,
ADD COLUMN     "endPrecision" "DatePrecision",
ADD COLUMN     "endQualifier" "DateQualifier",
ADD COLUMN     "endYear" INTEGER,
ADD COLUMN     "sortEnd" TIMESTAMP(3),
ADD COLUMN     "sortStart" TIMESTAMP(3),
ADD COLUMN     "startDay" INTEGER,
ADD COLUMN     "startMonth" INTEGER,
ADD COLUMN     "startPrecision" "DatePrecision" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "startQualifier" "DateQualifier" NOT NULL DEFAULT 'UNCERTAIN',
ADD COLUMN     "startYear" INTEGER;

-- AlterTable
ALTER TABLE "Dynasty" DROP COLUMN "dateEnd",
DROP COLUMN "datePrecision",
DROP COLUMN "dateStart",
ADD COLUMN     "endDay" INTEGER,
ADD COLUMN     "endMonth" INTEGER,
ADD COLUMN     "endPrecision" "DatePrecision",
ADD COLUMN     "endQualifier" "DateQualifier",
ADD COLUMN     "endYear" INTEGER,
ADD COLUMN     "sortEnd" TIMESTAMP(3),
ADD COLUMN     "sortStart" TIMESTAMP(3),
ADD COLUMN     "startDay" INTEGER,
ADD COLUMN     "startMonth" INTEGER,
ADD COLUMN     "startPrecision" "DatePrecision" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "startQualifier" "DateQualifier" NOT NULL DEFAULT 'UNCERTAIN',
ADD COLUMN     "startYear" INTEGER;

-- AlterTable
ALTER TABLE "Territory" DROP COLUMN "datePrecision",
DROP COLUMN "validFrom",
DROP COLUMN "validTo",
ADD COLUMN     "endDay" INTEGER,
ADD COLUMN     "endMonth" INTEGER,
ADD COLUMN     "endPrecision" "DatePrecision",
ADD COLUMN     "endQualifier" "DateQualifier",
ADD COLUMN     "endYear" INTEGER,
ADD COLUMN     "geometryReviewedAt" TIMESTAMP(3),
ADD COLUMN     "geometryReviewedById" TEXT,
ADD COLUMN     "geometryStatus" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "sortEnd" TIMESTAMP(3),
ADD COLUMN     "sortStart" TIMESTAMP(3),
ADD COLUMN     "startDay" INTEGER,
ADD COLUMN     "startMonth" INTEGER,
ADD COLUMN     "startPrecision" "DatePrecision" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "startQualifier" "DateQualifier" NOT NULL DEFAULT 'UNCERTAIN',
ADD COLUMN     "startYear" INTEGER;

-- AlterTable
ALTER TABLE "HistoricalFact" DROP COLUMN "dateEnd",
DROP COLUMN "dateStart",
ADD COLUMN     "dateDay" INTEGER,
ADD COLUMN     "dateEndDay" INTEGER,
ADD COLUMN     "dateEndMonth" INTEGER,
ADD COLUMN     "dateEndYear" INTEGER,
ADD COLUMN     "dateMonth" INTEGER,
ADD COLUMN     "dateQualifier" "DateQualifier" NOT NULL DEFAULT 'UNCERTAIN',
ADD COLUMN     "dateSortEnd" TIMESTAMP(3),
ADD COLUMN     "dateSortStart" TIMESTAMP(3),
ADD COLUMN     "dateYear" INTEGER;

-- AlterTable
ALTER TABLE "CommunityStory" DROP COLUMN "eventDateEnd",
DROP COLUMN "eventDateStart",
ADD COLUMN     "eventDateDay" INTEGER,
ADD COLUMN     "eventDateMonth" INTEGER,
ADD COLUMN     "eventDateYear" INTEGER;

-- CreateTable
CREATE TABLE "TerritoryGeometryRevision" (
    "id" TEXT NOT NULL,
    "territoryId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "geometry" geometry(Geometry, 4326),
    "sourceNote" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TerritoryGeometryRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Theme" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" "ThemeCategory" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Theme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThemeTranslation" (
    "id" TEXT NOT NULL,
    "themeId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "ThemeTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventTheme" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "themeId" TEXT NOT NULL,

    CONSTRAINT "EventTheme_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TerritoryGeometryRevision_territoryId_version_key" ON "TerritoryGeometryRevision"("territoryId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Theme_slug_key" ON "Theme"("slug");

-- CreateIndex
CREATE INDEX "Theme_category_idx" ON "Theme"("category");

-- CreateIndex
CREATE UNIQUE INDEX "ThemeTranslation_themeId_locale_key" ON "ThemeTranslation"("themeId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "EventTheme_eventId_themeId_key" ON "EventTheme"("eventId", "themeId");

-- CreateIndex
CREATE UNIQUE INDEX "EntityAlias_entityType_entityId_locale_alias_key" ON "EntityAlias"("entityType", "entityId", "locale", "alias");

-- CreateIndex
CREATE INDEX "HistoricalEvent_dateSortStart_idx" ON "HistoricalEvent"("dateSortStart");

-- CreateIndex
CREATE INDEX "HistoricalEra_sortStart_idx" ON "HistoricalEra"("sortStart");

-- CreateIndex
CREATE INDEX "Dynasty_sortStart_idx" ON "Dynasty"("sortStart");

-- CreateIndex
CREATE INDEX "Territory_sortStart_idx" ON "Territory"("sortStart");

-- AddForeignKey
ALTER TABLE "TerritoryGeometryRevision" ADD CONSTRAINT "TerritoryGeometryRevision_territoryId_fkey" FOREIGN KEY ("territoryId") REFERENCES "Territory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThemeTranslation" ADD CONSTRAINT "ThemeTranslation_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "Theme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTheme" ADD CONSTRAINT "EventTheme_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "HistoricalEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTheme" ADD CONSTRAINT "EventTheme_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "Theme"("id") ON DELETE CASCADE ON UPDATE CASCADE;
