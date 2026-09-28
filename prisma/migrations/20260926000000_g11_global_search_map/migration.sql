-- G11 Global Search & Map - additive only.
-- Generated with `prisma migrate diff --from-url <dev DB> --to-schema-datamodel` (no shadow DB); the
-- pre-existing drift artifact (an `EntityKind.FACT` ALTER TYPE plus 17 DROP INDEX statements for the
-- raw-SQL trigram/GiST/importance indexes Prisma does not model) was stripped exactly as in every
-- phase since G04. Nothing below drops, renames or alters any accepted table, column or index.

-- Extensions are already installed by earlier migrations; guarded for fresh databases.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- CreateEnum
CREATE TYPE "SearchEntityKind" AS ENUM ('COUNTRY', 'REGION', 'CITY', 'DESTINATION', 'PLACE', 'PERSON', 'EVENT', 'ERA', 'DYNASTY', 'TERRITORY', 'THEME', 'STORY', 'JOURNEY', 'SOURCE', 'COMMUNITY_STORY');

-- CreateEnum
CREATE TYPE "SearchTermKind" AS ENUM ('CANONICAL_TITLE', 'LOCALIZED_TITLE', 'ALIAS');

-- CreateEnum
CREATE TYPE "SearchTrustClass" AS ENUM ('CANONICAL', 'EDITORIAL', 'SOURCE_RECORD', 'COMMUNITY');

-- CreateTable
CREATE TABLE "SearchDocument" (
    "id" TEXT NOT NULL,
    "entityKind" "SearchEntityKind" NOT NULL,
    "entityId" TEXT NOT NULL,
    "canonicalSlug" TEXT NOT NULL,
    "trustClass" "SearchTrustClass" NOT NULL,
    "subtype" TEXT,
    "importance" INTEGER NOT NULL DEFAULT 0,
    "titles" JSONB NOT NULL,
    "summaries" JSONB NOT NULL,
    "normalizedNames" TEXT NOT NULL,
    "normalizedSearchText" TEXT NOT NULL,
    "countryIds" TEXT[],
    "regionIds" TEXT[],
    "cityIds" TEXT[],
    "chronologyStart" INTEGER,
    "chronologyEnd" INTEGER,
    "geom" geometry(Geometry, 4326),
    "projectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchTerm" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "termKind" "SearchTermKind" NOT NULL,
    "locale" TEXT NOT NULL DEFAULT '',
    "aliasType" "AliasType",
    "text" TEXT NOT NULL,
    "normalizedText" TEXT NOT NULL,

    CONSTRAINT "SearchTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchProjectionQueue" (
    "entityKind" "SearchEntityKind" NOT NULL,
    "entityId" TEXT NOT NULL,
    "enqueuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,

    CONSTRAINT "SearchProjectionQueue_pkey" PRIMARY KEY ("entityKind","entityId")
);

-- CreateTable
CREATE TABLE "SearchProjectionRun" (
    "id" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "upserted" INTEGER NOT NULL DEFAULT 0,
    "deleted" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "SearchProjectionRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SearchDocument_entityKind_idx" ON "SearchDocument"("entityKind");

-- CreateIndex
CREATE INDEX "SearchDocument_chronologyStart_chronologyEnd_idx" ON "SearchDocument"("chronologyStart", "chronologyEnd");

-- CreateIndex
CREATE UNIQUE INDEX "SearchDocument_entityKind_entityId_key" ON "SearchDocument"("entityKind", "entityId");

-- CreateIndex
CREATE INDEX "SearchTerm_documentId_idx" ON "SearchTerm"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "SearchTerm_documentId_termKind_locale_normalizedText_key" ON "SearchTerm"("documentId", "termKind", "locale", "normalizedText");

-- CreateIndex
CREATE INDEX "SearchProjectionQueue_enqueuedAt_idx" ON "SearchProjectionQueue"("enqueuedAt");

-- CreateIndex
CREATE INDEX "SearchProjectionRun_startedAt_idx" ON "SearchProjectionRun"("startedAt");

-- AddForeignKey
ALTER TABLE "SearchTerm" ADD CONSTRAINT "SearchTerm_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "SearchDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Evidence-backed indexes (see docs/backend/G11_PERFORMANCE_REPORT.md).
-- ---------------------------------------------------------------------------
-- Full-text over normalized names + aliases + summary ('simple' config: no stemming, language-neutral).
CREATE INDEX "SearchDocument_fts_idx" ON "SearchDocument" USING GIN (to_tsvector('simple', "normalizedSearchText"));
CREATE INDEX "SearchDocument_countryIds_gin" ON "SearchDocument" USING GIN ("countryIds");
CREATE INDEX "SearchDocument_regionIds_gin" ON "SearchDocument" USING GIN ("regionIds");
CREATE INDEX "SearchDocument_cityIds_gin" ON "SearchDocument" USING GIN ("cityIds");
CREATE INDEX "SearchDocument_geom_gist" ON "SearchDocument" USING GIST ("geom");
-- Exact / prefix lookups. Queries compare `"normalizedText" COLLATE "C"` (equality and a byte-order
-- range for prefixes) so the same index is usable with Prisma's parameterized/generic plans, which a
-- `LIKE $1` prefix would not be.
CREATE INDEX "SearchTerm_normalizedText_c" ON "SearchTerm" (("normalizedText" COLLATE "C"));
CREATE INDEX "SearchTerm_normalizedText_trgm" ON "SearchTerm" USING GIN ("normalizedText" gin_trgm_ops);
-- Map bbox over current-geography points (G01 stores plain latitude/longitude). Only the two high-cardinality tables get an
-- index: measured on the perf dataset, City (5k rows) 0.36 ms vs 7.3 ms and Destination (20k rows) 0.6 ms vs 23 ms without it,
-- whereas Region (2k rows: 0.23 vs 1.7 ms) and Country (a few hundred rows) are served fine by a sequential scan.
CREATE INDEX "City_point_gist" ON "City" USING GIST ((ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326))) WHERE "latitude" IS NOT NULL AND "longitude" IS NOT NULL;
CREATE INDEX "Destination_point_gist" ON "Destination" USING GIST ((ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326))) WHERE "latitude" IS NOT NULL AND "longitude" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Projection queue triggers. The queue insert is a trivial upsert; a projection
-- problem can therefore never fail a canonical write. The worker recomputes each
-- queued entity from canonical truth (see SearchProjectionService).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION search_projection_enqueue_self() RETURNS trigger AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO "SearchProjectionQueue" ("entityKind", "entityId", "enqueuedAt", "attempts")
    VALUES (TG_ARGV[0]::"SearchEntityKind", OLD."id", clock_timestamp(), 0)
    ON CONFLICT ("entityKind", "entityId") DO UPDATE SET "enqueuedAt" = clock_timestamp(), "lockedAt" = NULL;
  ELSE
    INSERT INTO "SearchProjectionQueue" ("entityKind", "entityId", "enqueuedAt", "attempts")
    VALUES (TG_ARGV[0]::"SearchEntityKind", NEW."id", clock_timestamp(), 0)
    ON CONFLICT ("entityKind", "entityId") DO UPDATE SET "enqueuedAt" = clock_timestamp(), "lockedAt" = NULL;
  END IF;
  RETURN NULL;
END
$fn$ LANGUAGE plpgsql;

-- Child rows (translations / joins): TG_ARGV[0] = kind, TG_ARGV[1] = column holding the parent id.
-- Small rows only (no geometry), so the jsonb read is cheap.
CREATE OR REPLACE FUNCTION search_projection_enqueue_child() RETURNS trigger AS $fn$
DECLARE
  new_id text;
  old_id text;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_id := to_jsonb(OLD) ->> TG_ARGV[1]; END IF;
  IF TG_OP <> 'DELETE' THEN new_id := to_jsonb(NEW) ->> TG_ARGV[1]; END IF;
  IF new_id IS NOT NULL THEN
    INSERT INTO "SearchProjectionQueue" ("entityKind", "entityId", "enqueuedAt", "attempts")
    VALUES (TG_ARGV[0]::"SearchEntityKind", new_id, clock_timestamp(), 0)
    ON CONFLICT ("entityKind", "entityId") DO UPDATE SET "enqueuedAt" = clock_timestamp(), "lockedAt" = NULL;
  END IF;
  IF old_id IS NOT NULL AND old_id IS DISTINCT FROM new_id THEN
    INSERT INTO "SearchProjectionQueue" ("entityKind", "entityId", "enqueuedAt", "attempts")
    VALUES (TG_ARGV[0]::"SearchEntityKind", old_id, clock_timestamp(), 0)
    ON CONFLICT ("entityKind", "entityId") DO UPDATE SET "enqueuedAt" = clock_timestamp(), "lockedAt" = NULL;
  END IF;
  RETURN NULL;
END
$fn$ LANGUAGE plpgsql;

-- EntityAlias: the target kind comes from the row's own entityType; kinds outside the corpus are ignored.
CREATE OR REPLACE FUNCTION search_projection_enqueue_alias() RETURNS trigger AS $fn$
DECLARE
  rec jsonb;
  k text;
BEGIN
  IF TG_OP = 'DELETE' THEN rec := to_jsonb(OLD); ELSE rec := to_jsonb(NEW); END IF;
  k := rec ->> 'entityType';
  IF k IN ('COUNTRY','REGION','CITY','DESTINATION','PLACE','PERSON','EVENT','ERA','DYNASTY','TERRITORY','STORY','JOURNEY','SOURCE','COMMUNITY_STORY') THEN
    INSERT INTO "SearchProjectionQueue" ("entityKind", "entityId", "enqueuedAt", "attempts")
    VALUES (k::"SearchEntityKind", rec ->> 'entityId', clock_timestamp(), 0)
    ON CONFLICT ("entityKind", "entityId") DO UPDATE SET "enqueuedAt" = clock_timestamp(), "lockedAt" = NULL;
  END IF;
  RETURN NULL;
END
$fn$ LANGUAGE plpgsql;

CREATE TRIGGER "search_enqueue_Country" AFTER INSERT OR UPDATE OR DELETE ON "Country" FOR EACH ROW EXECUTE FUNCTION search_projection_enqueue_self('COUNTRY');
CREATE TRIGGER "search_enqueue_Region" AFTER INSERT OR UPDATE OR DELETE ON "Region" FOR EACH ROW EXECUTE FUNCTION search_projection_enqueue_self('REGION');
CREATE TRIGGER "search_enqueue_City" AFTER INSERT OR UPDATE OR DELETE ON "City" FOR EACH ROW EXECUTE FUNCTION search_projection_enqueue_self('CITY');
CREATE TRIGGER "search_enqueue_Destination" AFTER INSERT OR UPDATE OR DELETE ON "Destination" FOR EACH ROW EXECUTE FUNCTION search_projection_enqueue_self('DESTINATION');
CREATE TRIGGER "search_enqueue_Place" AFTER INSERT OR UPDATE OR DELETE ON "Place" FOR EACH ROW EXECUTE FUNCTION search_projection_enqueue_self('PLACE');
CREATE TRIGGER "search_enqueue_Person" AFTER INSERT OR UPDATE OR DELETE ON "Person" FOR EACH ROW EXECUTE FUNCTION search_projection_enqueue_self('PERSON');
CREATE TRIGGER "search_enqueue_HistoricalEvent" AFTER INSERT OR UPDATE OR DELETE ON "HistoricalEvent" FOR EACH ROW EXECUTE FUNCTION search_projection_enqueue_self('EVENT');
CREATE TRIGGER "search_enqueue_HistoricalEra" AFTER INSERT OR UPDATE OR DELETE ON "HistoricalEra" FOR EACH ROW EXECUTE FUNCTION search_projection_enqueue_self('ERA');
CREATE TRIGGER "search_enqueue_Dynasty" AFTER INSERT OR UPDATE OR DELETE ON "Dynasty" FOR EACH ROW EXECUTE FUNCTION search_projection_enqueue_self('DYNASTY');
CREATE TRIGGER "search_enqueue_Territory" AFTER INSERT OR UPDATE OR DELETE ON "Territory" FOR EACH ROW EXECUTE FUNCTION search_projection_enqueue_self('TERRITORY');
CREATE TRIGGER "search_enqueue_Theme" AFTER INSERT OR UPDATE OR DELETE ON "Theme" FOR EACH ROW EXECUTE FUNCTION search_projection_enqueue_self('THEME');
CREATE TRIGGER "search_enqueue_Story" AFTER INSERT OR UPDATE OR DELETE ON "Story" FOR EACH ROW EXECUTE FUNCTION search_projection_enqueue_self('STORY');
CREATE TRIGGER "search_enqueue_Journey" AFTER INSERT OR UPDATE OR DELETE ON "Journey" FOR EACH ROW EXECUTE FUNCTION search_projection_enqueue_self('JOURNEY');
CREATE TRIGGER "search_enqueue_Source" AFTER INSERT OR UPDATE OR DELETE ON "Source" FOR EACH ROW EXECUTE FUNCTION search_projection_enqueue_self('SOURCE');
CREATE TRIGGER "search_enqueue_CommunityStory" AFTER INSERT OR UPDATE OR DELETE ON "CommunityStory" FOR EACH ROW EXECUTE FUNCTION search_projection_enqueue_self('COMMUNITY_STORY');
CREATE TRIGGER "search_enqueue_CountryTranslation" AFTER INSERT OR UPDATE OR DELETE ON "CountryTranslation" FOR EACH ROW EXECUTE FUNCTION search_projection_enqueue_child('COUNTRY', 'countryId');
CREATE TRIGGER "search_enqueue_RegionTranslation" AFTER INSERT OR UPDATE OR DELETE ON "RegionTranslation" FOR EACH ROW EXECUTE FUNCTION search_projection_enqueue_child('REGION', 'regionId');
CREATE TRIGGER "search_enqueue_CityTranslation" AFTER INSERT OR UPDATE OR DELETE ON "CityTranslation" FOR EACH ROW EXECUTE FUNCTION search_projection_enqueue_child('CITY', 'cityId');
CREATE TRIGGER "search_enqueue_DestinationTranslation" AFTER INSERT OR UPDATE OR DELETE ON "DestinationTranslation" FOR EACH ROW EXECUTE FUNCTION search_projection_enqueue_child('DESTINATION', 'destinationId');
CREATE TRIGGER "search_enqueue_PlaceTranslation" AFTER INSERT OR UPDATE OR DELETE ON "PlaceTranslation" FOR EACH ROW EXECUTE FUNCTION search_projection_enqueue_child('PLACE', 'placeId');
CREATE TRIGGER "search_enqueue_PersonTranslation" AFTER INSERT OR UPDATE OR DELETE ON "PersonTranslation" FOR EACH ROW EXECUTE FUNCTION search_projection_enqueue_child('PERSON', 'personId');
CREATE TRIGGER "search_enqueue_HistoricalEventTranslation" AFTER INSERT OR UPDATE OR DELETE ON "HistoricalEventTranslation" FOR EACH ROW EXECUTE FUNCTION search_projection_enqueue_child('EVENT', 'eventId');
CREATE TRIGGER "search_enqueue_HistoricalEraTranslation" AFTER INSERT OR UPDATE OR DELETE ON "HistoricalEraTranslation" FOR EACH ROW EXECUTE FUNCTION search_projection_enqueue_child('ERA', 'eraId');
CREATE TRIGGER "search_enqueue_DynastyTranslation" AFTER INSERT OR UPDATE OR DELETE ON "DynastyTranslation" FOR EACH ROW EXECUTE FUNCTION search_projection_enqueue_child('DYNASTY', 'dynastyId');
CREATE TRIGGER "search_enqueue_TerritoryTranslation" AFTER INSERT OR UPDATE OR DELETE ON "TerritoryTranslation" FOR EACH ROW EXECUTE FUNCTION search_projection_enqueue_child('TERRITORY', 'territoryId');
CREATE TRIGGER "search_enqueue_ThemeTranslation" AFTER INSERT OR UPDATE OR DELETE ON "ThemeTranslation" FOR EACH ROW EXECUTE FUNCTION search_projection_enqueue_child('THEME', 'themeId');
CREATE TRIGGER "search_enqueue_StoryTranslation" AFTER INSERT OR UPDATE OR DELETE ON "StoryTranslation" FOR EACH ROW EXECUTE FUNCTION search_projection_enqueue_child('STORY', 'storyId');
CREATE TRIGGER "search_enqueue_JourneyTranslation" AFTER INSERT OR UPDATE OR DELETE ON "JourneyTranslation" FOR EACH ROW EXECUTE FUNCTION search_projection_enqueue_child('JOURNEY', 'journeyId');
CREATE TRIGGER "search_enqueue_CommunityStoryTranslation" AFTER INSERT OR UPDATE OR DELETE ON "CommunityStoryTranslation" FOR EACH ROW EXECUTE FUNCTION search_projection_enqueue_child('COMMUNITY_STORY', 'storyId');
CREATE TRIGGER "search_enqueue_EventCountry" AFTER INSERT OR UPDATE OR DELETE ON "EventCountry" FOR EACH ROW EXECUTE FUNCTION search_projection_enqueue_child('EVENT', 'eventId');
CREATE TRIGGER "search_enqueue_EventPlace" AFTER INSERT OR UPDATE OR DELETE ON "EventPlace" FOR EACH ROW EXECUTE FUNCTION search_projection_enqueue_child('EVENT', 'eventId');
CREATE TRIGGER "search_enqueue_EraCountry" AFTER INSERT OR UPDATE OR DELETE ON "EraCountry" FOR EACH ROW EXECUTE FUNCTION search_projection_enqueue_child('ERA', 'eraId');
CREATE TRIGGER "search_enqueue_EntityAlias" AFTER INSERT OR UPDATE OR DELETE ON "EntityAlias" FOR EACH ROW EXECUTE FUNCTION search_projection_enqueue_alias();
