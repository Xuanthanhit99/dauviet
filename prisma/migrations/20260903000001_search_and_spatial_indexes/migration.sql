-- Spatial indexes (PostGIS GiST) - Prisma's Unsupported() geometry columns get no
-- automatic index, so these are hand-written. Required for bbox/nearby map queries
-- (spec section 6/24) to be usable at scale.
CREATE INDEX IF NOT EXISTS "Place_location_gist" ON "Place" USING GIST ("location");
CREATE INDEX IF NOT EXISTS "Place_geometry_gist" ON "Place" USING GIST ("geometry");
CREATE INDEX IF NOT EXISTS "Territory_geometry_gist" ON "Territory" USING GIST ("geometry");
CREATE INDEX IF NOT EXISTS "Journey_routeGeometry_gist" ON "Journey" USING GIST ("routeGeometry");

-- Trigram (pg_trgm) indexes for fuzzy/cross-language search (spec section 23) across
-- every localized display-name column plus the alias table.
CREATE INDEX IF NOT EXISTS "PlaceTranslation_name_trgm" ON "PlaceTranslation" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "PersonTranslation_displayName_trgm" ON "PersonTranslation" USING GIN ("displayName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "HistoricalEventTranslation_title_trgm" ON "HistoricalEventTranslation" USING GIN ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "HistoricalEraTranslation_name_trgm" ON "HistoricalEraTranslation" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "DynastyTranslation_name_trgm" ON "DynastyTranslation" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "TerritoryTranslation_name_trgm" ON "TerritoryTranslation" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "StoryTranslation_title_trgm" ON "StoryTranslation" USING GIN ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "JourneyTranslation_title_trgm" ON "JourneyTranslation" USING GIN ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "CommunityStoryTranslation_title_trgm" ON "CommunityStoryTranslation" USING GIN ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Source_title_trgm" ON "Source" USING GIN ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "EntityAlias_alias_trgm" ON "EntityAlias" USING GIN ("alias" gin_trgm_ops);
