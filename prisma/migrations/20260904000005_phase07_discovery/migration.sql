-- Phase 07: discovery hardening (Map/Timeline/Search/Nearby). Hand-written
-- offline, same approach as every prior migration in this repo (no live
-- shadow database available for `prisma migrate diff --from-migrations`).
-- Purely additive: one new extension, one new function, new indexes.

-- CreateExtension: diacritic-insensitive search (spec section 33/34/73) -
-- "Tran Hung Dao" must be able to find "Trần Hưng Đạo".
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- unaccent() ships STABLE, not IMMUTABLE (it depends on a configurable text
-- search dictionary), so Postgres refuses to use it directly inside an
-- index expression. This is the standard, widely-documented Postgres
-- workaround: a thin SQL wrapper pinned to the default 'unaccent'
-- dictionary, explicitly marked IMMUTABLE - safe because the dictionary is
-- pinned by name and never swapped at runtime in this codebase.
CREATE OR REPLACE FUNCTION immutable_unaccent(text)
RETURNS text AS
$$
  SELECT unaccent('unaccent', $1)
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT;

-- Expression trigram indexes on immutable_unaccent(...) - SearchService's
-- queries wrap both the column and the query parameter in
-- immutable_unaccent(...) (see search.service.ts), so these are usable by
-- the planner. Covers the columns actually queried by search.service.ts.
CREATE INDEX IF NOT EXISTS "PlaceTranslation_name_unaccent_trgm" ON "PlaceTranslation" USING GIN (immutable_unaccent("name") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "PersonTranslation_displayName_unaccent_trgm" ON "PersonTranslation" USING GIN (immutable_unaccent("displayName") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "HistoricalEventTranslation_title_unaccent_trgm" ON "HistoricalEventTranslation" USING GIN (immutable_unaccent("title") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "HistoricalEraTranslation_name_unaccent_trgm" ON "HistoricalEraTranslation" USING GIN (immutable_unaccent("name") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "StoryTranslation_title_unaccent_trgm" ON "StoryTranslation" USING GIN (immutable_unaccent("title") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "JourneyTranslation_title_unaccent_trgm" ON "JourneyTranslation" USING GIN (immutable_unaccent("title") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Source_title_unaccent_trgm" ON "Source" USING GIN (immutable_unaccent("title") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "CommunityStoryTranslation_title_unaccent_trgm" ON "CommunityStoryTranslation" USING GIN (immutable_unaccent("title") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "EntityAlias_alias_unaccent_trgm" ON "EntityAlias" USING GIN (immutable_unaccent("alias") gin_trgm_ops);

-- Nearby discovery (spec section 51) - ST_DWithin on a geography cast scans
-- efficiently off the same GiST index already created on Place.location in
-- the Phase 03 migration (20260903000001_search_and_spatial_indexes) - no
-- new spatial index needed here.

-- Map zoom-density (spec section 9/10) benefits from an index on the
-- importance column itself, since queries now filter
-- `historicalImportance >= :minImportance` in addition to the existing
-- spatial predicate.
CREATE INDEX IF NOT EXISTS "Place_historicalImportance_idx" ON "Place"("historicalImportance");
CREATE INDEX IF NOT EXISTS "HistoricalEvent_importance_idx" ON "HistoricalEvent"("importance");
