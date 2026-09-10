-- GLOBAL PHASE G04: Destination Discovery (Global Backend V2 Extension).
-- Hand-written offline, same approach as every prior migration in this repo
-- (no live shadow database available for `prisma migrate diff`). Purely
-- additive: one new enum (DestinationPlaceRole), two new nullable columns
-- on DestinationTranslation (tagline, whyVisit), one new nullable FK column
-- on Destination (heroMediaId), and eight new tables (DestinationPlace,
-- DestinationTheme, DestinationStory, DestinationJourney, DestinationEvent,
-- DestinationCollection, DestinationCollectionTranslation,
-- DestinationCollectionMember). No existing Phase 00-12.1/G01/G02/G03
-- column, table, enum value, or migration is modified, dropped, or
-- retyped. No existing Destination row's identity/canonicalSlug is touched.
--
-- Trust boundary (see schema.prisma's own G04 section comment for the full
-- rationale): every relation below means "editorially associated with",
-- never a historical claim - no HistoricalFact/Citation/Source row is
-- implied by any table here.

-- CreateEnum
CREATE TYPE "DestinationPlaceRole" AS ENUM ('CORE', 'LANDMARK', 'HISTORICAL', 'CULTURAL', 'NATURAL', 'CONTEXTUAL');

-- AlterTable: DestinationTranslation gains short, non-operational discovery
-- copy fields (spec section 16/17 - never live price/hours/availability).
ALTER TABLE "DestinationTranslation"
  ADD COLUMN "tagline" TEXT,
  ADD COLUMN "whyVisit" TEXT;

-- AlterTable: Destination gains an optional cover image, reusing the exact
-- MediaAsset lifecycle/rights/access-policy machinery every other
-- heroMediaId relation in this schema already uses.
ALTER TABLE "Destination" ADD COLUMN "heroMediaId" TEXT;
CREATE INDEX "Destination_heroMediaId_idx" ON "Destination"("heroMediaId");
ALTER TABLE "Destination" ADD CONSTRAINT "Destination_heroMediaId_fkey" FOREIGN KEY ("heroMediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: DestinationPlace - the core G04 relation (spec section 13).
-- Real many-to-many: a Place may be relevant to several Destinations.
CREATE TABLE "DestinationPlace" (
  "id"            TEXT NOT NULL,
  "destinationId" TEXT NOT NULL,
  "placeId"       TEXT NOT NULL,
  "role"          "DestinationPlaceRole" NOT NULL DEFAULT 'CONTEXTUAL',
  "sortOrder"     INTEGER NOT NULL DEFAULT 0,
  "isFeatured"    BOOLEAN NOT NULL DEFAULT false,
  "editorialNote" TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DestinationPlace_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DestinationPlace_destinationId_placeId_key" ON "DestinationPlace"("destinationId", "placeId");
CREATE INDEX "DestinationPlace_placeId_idx" ON "DestinationPlace"("placeId");
CREATE INDEX "DestinationPlace_destinationId_sortOrder_idx" ON "DestinationPlace"("destinationId", "sortOrder");

ALTER TABLE "DestinationPlace"
  ADD CONSTRAINT "DestinationPlace_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "DestinationPlace_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: DestinationTheme - reuses the existing V1 Theme domain as-is.
CREATE TABLE "DestinationTheme" (
  "id"            TEXT NOT NULL,
  "destinationId" TEXT NOT NULL,
  "themeId"       TEXT NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DestinationTheme_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DestinationTheme_destinationId_themeId_key" ON "DestinationTheme"("destinationId", "themeId");
CREATE INDEX "DestinationTheme_themeId_idx" ON "DestinationTheme"("themeId");

ALTER TABLE "DestinationTheme"
  ADD CONSTRAINT "DestinationTheme_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "DestinationTheme_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "Theme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: DestinationStory - explicit, minimal curation (spec section 22).
CREATE TABLE "DestinationStory" (
  "id"            TEXT NOT NULL,
  "destinationId" TEXT NOT NULL,
  "storyId"       TEXT NOT NULL,
  "sortOrder"     INTEGER NOT NULL DEFAULT 0,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DestinationStory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DestinationStory_destinationId_storyId_key" ON "DestinationStory"("destinationId", "storyId");
CREATE INDEX "DestinationStory_storyId_idx" ON "DestinationStory"("storyId");

ALTER TABLE "DestinationStory"
  ADD CONSTRAINT "DestinationStory_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "DestinationStory_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: DestinationJourney - explicit, minimal curation (spec section 23).
CREATE TABLE "DestinationJourney" (
  "id"            TEXT NOT NULL,
  "destinationId" TEXT NOT NULL,
  "journeyId"     TEXT NOT NULL,
  "sortOrder"     INTEGER NOT NULL DEFAULT 0,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DestinationJourney_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DestinationJourney_destinationId_journeyId_key" ON "DestinationJourney"("destinationId", "journeyId");
CREATE INDEX "DestinationJourney_journeyId_idx" ON "DestinationJourney"("journeyId");

ALTER TABLE "DestinationJourney"
  ADD CONSTRAINT "DestinationJourney_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "DestinationJourney_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: DestinationEvent - curated historical turning points (spec
-- section 101/102), only because no existing relation can deterministically
-- express "these specific N events, in this order, are this Destination's
-- editorial turning points."
CREATE TABLE "DestinationEvent" (
  "id"            TEXT NOT NULL,
  "destinationId" TEXT NOT NULL,
  "eventId"       TEXT NOT NULL,
  "sortOrder"     INTEGER NOT NULL DEFAULT 0,
  "role"          TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DestinationEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DestinationEvent_destinationId_eventId_key" ON "DestinationEvent"("destinationId", "eventId");
CREATE INDEX "DestinationEvent_eventId_idx" ON "DestinationEvent"("eventId");

ALTER TABLE "DestinationEvent"
  ADD CONSTRAINT "DestinationEvent_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "DestinationEvent_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "HistoricalEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: DestinationCollection - editorial grouping (spec section 24),
-- only introduced because EditorialSlot has no slug/translations/
-- publication status of its own. Not personalized.
CREATE TABLE "DestinationCollection" (
  "id"            TEXT NOT NULL,
  "canonicalSlug" TEXT NOT NULL,
  "countryId"     TEXT,
  "status"        "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DestinationCollection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DestinationCollection_canonicalSlug_key" ON "DestinationCollection"("canonicalSlug");
CREATE INDEX "DestinationCollection_countryId_idx" ON "DestinationCollection"("countryId");
CREATE INDEX "DestinationCollection_status_idx" ON "DestinationCollection"("status");

ALTER TABLE "DestinationCollection"
  ADD CONSTRAINT "DestinationCollection_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "DestinationCollectionTranslation" (
  "id"           TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "locale"       TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "slug"         TEXT NOT NULL,
  "summary"      TEXT,
  "description"  TEXT,
  "status"       "TranslationStatus" NOT NULL DEFAULT 'DRAFT',
  "method"       "TranslationMethod" NOT NULL DEFAULT 'ORIGINAL',
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DestinationCollectionTranslation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DestinationCollectionTranslation_collectionId_locale_key" ON "DestinationCollectionTranslation"("collectionId", "locale");
CREATE UNIQUE INDEX "DestinationCollectionTranslation_locale_slug_key" ON "DestinationCollectionTranslation"("locale", "slug");

ALTER TABLE "DestinationCollectionTranslation"
  ADD CONSTRAINT "DestinationCollectionTranslation_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "DestinationCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DestinationCollectionMember" (
  "id"            TEXT NOT NULL,
  "collectionId"  TEXT NOT NULL,
  "destinationId" TEXT NOT NULL,
  "sortOrder"     INTEGER NOT NULL DEFAULT 0,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DestinationCollectionMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DestinationCollectionMember_collectionId_destinationId_key" ON "DestinationCollectionMember"("collectionId", "destinationId");
CREATE INDEX "DestinationCollectionMember_destinationId_idx" ON "DestinationCollectionMember"("destinationId");

ALTER TABLE "DestinationCollectionMember"
  ADD CONSTRAINT "DestinationCollectionMember_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "DestinationCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "DestinationCollectionMember_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE CASCADE ON UPDATE CASCADE;
