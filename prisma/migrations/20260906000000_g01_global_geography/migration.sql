-- GLOBAL PHASE G01: Global Geography Foundation (Global Backend V2
-- Extension). Hand-written offline, same approach as every prior migration
-- in this repo (no live shadow database available for
-- `prisma migrate diff --from-migrations`). Purely additive: two new enums,
-- two `AlterEnum ... ADD VALUE` statements, and eight new tables with their
-- indexes/FKs. No existing Phase 00-12.1 column, table, or migration is
-- modified, dropped, or retyped.

-- AlterEnum: EntityKind gains COUNTRY/REGION/CITY/DESTINATION so the
-- existing EntityAlias/AuditLog architecture can reference the new global
-- geography entities without a parallel alias mechanism (spec section 13).
-- Existing values are untouched.
ALTER TYPE "EntityKind" ADD VALUE 'COUNTRY';
ALTER TYPE "EntityKind" ADD VALUE 'REGION';
ALTER TYPE "EntityKind" ADD VALUE 'CITY';
ALTER TYPE "EntityKind" ADD VALUE 'DESTINATION';

-- CreateEnum
CREATE TYPE "RegionType" AS ENUM ('PROVINCE', 'STATE', 'PREFECTURE', 'AUTONOMOUS_REGION', 'METROPOLITAN_CITY', 'TERRITORY', 'OTHER');

-- CreateEnum
CREATE TYPE "DestinationType" AS ENUM ('CITY_AREA', 'NEIGHBORHOOD', 'HISTORIC_DISTRICT', 'HERITAGE_AREA', 'ISLAND', 'ARCHIPELAGO', 'NATURAL_AREA', 'NATIONAL_PARK', 'COAST', 'BAY', 'TOURISM_AREA', 'OTHER');

-- CreateTable: Country - first-class, stable global entity (spec section 5).
-- No translated display text lives here (nameVi/nameEn are forbidden by the
-- spec) - see CountryTranslation below.
CREATE TABLE "Country" (
  "id" TEXT NOT NULL,
  "canonicalSlug" TEXT NOT NULL,
  "iso2" TEXT NOT NULL,
  "iso3" TEXT NOT NULL,
  "defaultLocale" TEXT NOT NULL,
  "defaultCurrency" TEXT NOT NULL,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Country_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Country_canonicalSlug_key" ON "Country"("canonicalSlug");
CREATE UNIQUE INDEX "Country_iso2_key" ON "Country"("iso2");
CREATE UNIQUE INDEX "Country_iso3_key" ON "Country"("iso3");
CREATE INDEX "Country_status_idx" ON "Country"("status");

-- CreateTable: CountryTranslation - keeps the V1 global
-- `@@unique([locale, slug])` convention (real-world country-name collisions
-- are not a realistic risk, unlike City/Region/Destination below).
CREATE TABLE "CountryTranslation" (
  "id" TEXT NOT NULL,
  "countryId" TEXT NOT NULL,
  "locale" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "shortDescription" TEXT,
  "description" TEXT,
  "seoTitle" TEXT,
  "seoDescription" TEXT,
  "status" "TranslationStatus" NOT NULL DEFAULT 'DRAFT',
  "method" "TranslationMethod" NOT NULL DEFAULT 'ORIGINAL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CountryTranslation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CountryTranslation_countryId_locale_key" ON "CountryTranslation"("countryId", "locale");
CREATE UNIQUE INDEX "CountryTranslation_locale_slug_key" ON "CountryTranslation"("locale", "slug");

ALTER TABLE "CountryTranslation"
  ADD CONSTRAINT "CountryTranslation_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: Region - globally flexible (province/state/prefecture/direct-
-- administration municipality/etc, spec section 7). parentRegionId is a
-- self-relation for sub-regions; cycle prevention and same-country
-- consistency are enforced in RegionsService, not at the DB level.
CREATE TABLE "Region" (
  "id" TEXT NOT NULL,
  "canonicalSlug" TEXT NOT NULL,
  "countryId" TEXT NOT NULL,
  "parentRegionId" TEXT,
  "type" "RegionType" NOT NULL,
  "code" TEXT,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Region_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Region_canonicalSlug_key" ON "Region"("canonicalSlug");
CREATE INDEX "Region_countryId_idx" ON "Region"("countryId");
CREATE INDEX "Region_parentRegionId_idx" ON "Region"("parentRegionId");
CREATE INDEX "Region_type_idx" ON "Region"("type");
CREATE INDEX "Region_status_idx" ON "Region"("status");

ALTER TABLE "Region"
  ADD CONSTRAINT "Region_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Region_parentRegionId_fkey" FOREIGN KEY ("parentRegionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: RegionTranslation - deliberately NO global
-- `@@unique([locale, slug])` (spec section 14 - common region names collide
-- across countries worldwide); only scoped per (regionId, locale).
CREATE TABLE "RegionTranslation" (
  "id" TEXT NOT NULL,
  "regionId" TEXT NOT NULL,
  "locale" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "summary" TEXT,
  "description" TEXT,
  "seoTitle" TEXT,
  "seoDescription" TEXT,
  "status" "TranslationStatus" NOT NULL DEFAULT 'DRAFT',
  "method" "TranslationMethod" NOT NULL DEFAULT 'ORIGINAL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RegionTranslation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RegionTranslation_regionId_locale_key" ON "RegionTranslation"("regionId", "locale");

ALTER TABLE "RegionTranslation"
  ADD CONSTRAINT "RegionTranslation_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: City - Country is authoritative, Region is optional (spec
-- section 9). timezone is a validated IANA identifier (service layer),
-- never a fixed UTC offset.
CREATE TABLE "City" (
  "id" TEXT NOT NULL,
  "canonicalSlug" TEXT NOT NULL,
  "countryId" TEXT NOT NULL,
  "regionId" TEXT,
  "timezone" TEXT NOT NULL,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "importance" INTEGER NOT NULL DEFAULT 0,
  "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "City_canonicalSlug_key" ON "City"("canonicalSlug");
CREATE INDEX "City_countryId_idx" ON "City"("countryId");
CREATE INDEX "City_regionId_idx" ON "City"("regionId");
CREATE INDEX "City_status_idx" ON "City"("status");

ALTER TABLE "City"
  ADD CONSTRAINT "City_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "City_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: CityTranslation - deliberately NO global
-- `@@unique([locale, slug])` (Springfield/Victoria/San Jose - spec section
-- 14); only scoped per (cityId, locale).
CREATE TABLE "CityTranslation" (
  "id" TEXT NOT NULL,
  "cityId" TEXT NOT NULL,
  "locale" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "summary" TEXT,
  "description" TEXT,
  "seoTitle" TEXT,
  "seoDescription" TEXT,
  "status" "TranslationStatus" NOT NULL DEFAULT 'DRAFT',
  "method" "TranslationMethod" NOT NULL DEFAULT 'ORIGINAL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CityTranslation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CityTranslation_cityId_locale_key" ON "CityTranslation"("cityId", "locale");

ALTER TABLE "CityTranslation"
  ADD CONSTRAINT "CityTranslation_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: Destination - global travel/discovery concept, explicitly
-- NOT a V1 Place (spec section 11). Country is required; Region and City
-- are both optional and independently nullable, so "Country -> Destination"
-- and "Country -> Region -> Destination" and "Country -> City ->
-- Destination" are all valid shapes without forcing a rigid chain.
CREATE TABLE "Destination" (
  "id" TEXT NOT NULL,
  "canonicalSlug" TEXT NOT NULL,
  "countryId" TEXT NOT NULL,
  "regionId" TEXT,
  "cityId" TEXT,
  "type" "DestinationType" NOT NULL,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "importance" INTEGER NOT NULL DEFAULT 0,
  "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Destination_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Destination_canonicalSlug_key" ON "Destination"("canonicalSlug");
CREATE INDEX "Destination_countryId_idx" ON "Destination"("countryId");
CREATE INDEX "Destination_regionId_idx" ON "Destination"("regionId");
CREATE INDEX "Destination_cityId_idx" ON "Destination"("cityId");
CREATE INDEX "Destination_type_idx" ON "Destination"("type");
CREATE INDEX "Destination_status_idx" ON "Destination"("status");

ALTER TABLE "Destination"
  ADD CONSTRAINT "Destination_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Destination_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Destination_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: DestinationTranslation - deliberately NO global
-- `@@unique([locale, slug])`; only scoped per (destinationId, locale).
CREATE TABLE "DestinationTranslation" (
  "id" TEXT NOT NULL,
  "destinationId" TEXT NOT NULL,
  "locale" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "summary" TEXT,
  "description" TEXT,
  "seoTitle" TEXT,
  "seoDescription" TEXT,
  "status" "TranslationStatus" NOT NULL DEFAULT 'DRAFT',
  "method" "TranslationMethod" NOT NULL DEFAULT 'ORIGINAL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DestinationTranslation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DestinationTranslation_destinationId_locale_key" ON "DestinationTranslation"("destinationId", "locale");

ALTER TABLE "DestinationTranslation"
  ADD CONSTRAINT "DestinationTranslation_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE CASCADE ON UPDATE CASCADE;
