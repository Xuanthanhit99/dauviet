-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('DRAFT', 'PLANNING', 'READY');

-- CreateEnum
CREATE TYPE "TripItemType" AS ENUM ('ACCOMMODATION', 'RESTAURANT', 'ACTIVITY', 'ATTRACTION', 'PLACE', 'TRANSPORT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "TripTransportMode" AS ENUM ('WALK', 'LOCAL_TRANSIT', 'TRAIN', 'BUS', 'FLIGHT', 'FERRY', 'CAR', 'TAXI_RIDESHARE', 'BIKE', 'OTHER');

-- CreateEnum
CREATE TYPE "TripCostProvenance" AS ENUM ('USER_INPUT', 'RULE_BASED_ESTIMATE', 'PROVIDER_EVIDENCE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "CostCategory" AS ENUM ('STAY', 'FOOD', 'ACTIVITY', 'TRANSPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "CostUnit" AS ENUM ('PER_PERSON', 'PER_PERSON_PER_DAY', 'PER_ROOM_PER_NIGHT', 'PER_TRIP', 'PER_ITEM', 'PER_LEG');

-- CreateEnum
CREATE TYPE "CostAssumptionScope" AS ENUM ('GLOBAL', 'COUNTRY', 'REGION', 'CITY', 'DESTINATION');

-- CreateEnum
CREATE TYPE "CostAssumptionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "CostScenario" AS ENUM ('LOW', 'TYPICAL', 'HIGH');

-- CreateEnum
CREATE TYPE "EstimateCompleteness" AS ENUM ('COMPLETE', 'PARTIAL');

-- CreateEnum
CREATE TYPE "EstimateConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- NOTE (G06 live-QA finding, not a G06 change): `prisma migrate diff`'s
-- auto-diff against this schema also proposed `ALTER TYPE "EntityKind" ADD
-- VALUE 'FACT'` and DROP INDEX for 17 pre-existing trigram/PostGIS GIST
-- search indexes (CommunityStoryTranslation_title_trgm,
-- DynastyTranslation_name_trgm, EntityAlias_alias_trgm,
-- HistoricalEraTranslation_name_trgm, HistoricalEvent_importance_idx,
-- HistoricalEventTranslation_title_trgm, Journey_routeGeometry_gist,
-- JourneyTranslation_title_trgm, PersonTranslation_displayName_trgm,
-- Place_geometry_gist, Place_historicalImportance_idx, Place_location_gist,
-- PlaceTranslation_name_trgm, Source_title_trgm, StoryTranslation_title_trgm,
-- Territory_geometry_gist, TerritoryTranslation_name_trgm). This is the
-- exact same pre-existing drift already documented and manually stripped by
-- G04 and G05 before their own migrations were applied (see
-- 20260910164143_g05_stay_food_activities/migration.sql's own note) - it
-- predates G06 entirely and is not something this schema change introduced
-- or requires. Applying either here would smuggle an unrelated, unreviewed
-- destructive/regressive change (a live enum rewrite affecting nothing in
-- this migration, and dropping real, currently-functioning search-
-- performance indexes) inside what must stay a purely additive G06
-- migration. Both statement blocks were manually removed from this file
-- before it was ever applied - the two genuine G06 `EntityKind` additions
-- (`TRIP`, `TRIP_COST_ASSUMPTION`) below are unaffected and applied
-- normally. Still flagged separately for a dedicated fix outside G06 scope,
-- same as G04/G05 left it.
ALTER TYPE "EntityKind" ADD VALUE 'TRIP';
ALTER TYPE "EntityKind" ADD VALUE 'TRIP_COST_ASSUMPTION';

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "TripStatus" NOT NULL DEFAULT 'DRAFT',
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "primaryCurrency" TEXT NOT NULL,
    "travelerCount" INTEGER NOT NULL DEFAULT 1,
    "roomCount" INTEGER,
    "originCountryId" TEXT,
    "originRegionId" TEXT,
    "originCityId" TEXT,
    "originLabel" TEXT,
    "targetBudgetAmount" DECIMAL(12,2),
    "targetBudgetCurrency" TEXT,
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripDestination" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "arrivalDate" DATE,
    "departureDate" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripDestination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripDay" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "title" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripItem" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "tripDayId" TEXT NOT NULL,
    "type" "TripItemType" NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "accommodationId" TEXT,
    "restaurantId" TEXT,
    "activityId" TEXT,
    "attractionId" TEXT,
    "placeId" TEXT,
    "transportLegId" TEXT,
    "title" TEXT,
    "notes" TEXT,
    "startLocalTime" TEXT,
    "endLocalTime" TEXT,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "plannedAmount" DECIMAL(12,2),
    "plannedCurrency" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripTransportLeg" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "mode" "TripTransportMode" NOT NULL,
    "fromLabel" TEXT NOT NULL,
    "toLabel" TEXT NOT NULL,
    "fromDestinationId" TEXT,
    "toDestinationId" TEXT,
    "plannedDate" DATE,
    "plannedAmount" DECIMAL(12,2),
    "plannedCurrency" TEXT,
    "provenance" "TripCostProvenance" NOT NULL DEFAULT 'UNKNOWN',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripTransportLeg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostAssumption" (
    "id" TEXT NOT NULL,
    "scope" "CostAssumptionScope" NOT NULL,
    "scopeId" TEXT,
    "category" "CostCategory" NOT NULL,
    "unit" "CostUnit" NOT NULL,
    "currency" TEXT NOT NULL,
    "lowAmount" DECIMAL(12,2) NOT NULL,
    "typicalAmount" DECIMAL(12,2) NOT NULL,
    "highAmount" DECIMAL(12,2) NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "status" "CostAssumptionStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostAssumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripCostEstimateGeneration" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "tripVersion" INTEGER NOT NULL,
    "inputHash" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripCostEstimateGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripCostEstimate" (
    "id" TEXT NOT NULL,
    "generationId" TEXT NOT NULL,
    "scenario" "CostScenario" NOT NULL,
    "currency" TEXT NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "completeness" "EstimateCompleteness" NOT NULL,
    "confidence" "EstimateConfidence" NOT NULL,
    "unknownCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TripCostEstimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripCostEstimateItem" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "category" "CostCategory" NOT NULL,
    "tripDayId" TEXT,
    "tripItemId" TEXT,
    "transportLegId" TEXT,
    "currency" TEXT,
    "amount" DECIMAL(12,2),
    "provenance" "TripCostProvenance" NOT NULL,
    "assumptionId" TEXT,
    "offerId" TEXT,
    "description" TEXT,

    CONSTRAINT "TripCostEstimateItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Trip_ownerId_archivedAt_idx" ON "Trip"("ownerId", "archivedAt");

-- CreateIndex
CREATE INDEX "Trip_ownerId_status_idx" ON "Trip"("ownerId", "status");

-- CreateIndex
CREATE INDEX "Trip_originCountryId_idx" ON "Trip"("originCountryId");

-- CreateIndex
CREATE INDEX "Trip_originRegionId_idx" ON "Trip"("originRegionId");

-- CreateIndex
CREATE INDEX "Trip_originCityId_idx" ON "Trip"("originCityId");

-- CreateIndex
CREATE INDEX "TripDestination_tripId_idx" ON "TripDestination"("tripId");

-- CreateIndex
CREATE INDEX "TripDestination_destinationId_idx" ON "TripDestination"("destinationId");

-- CreateIndex
CREATE UNIQUE INDEX "TripDestination_tripId_sortOrder_key" ON "TripDestination"("tripId", "sortOrder");

-- CreateIndex
CREATE INDEX "TripDay_tripId_idx" ON "TripDay"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "TripDay_tripId_date_key" ON "TripDay"("tripId", "date");

-- CreateIndex
CREATE INDEX "TripItem_tripId_idx" ON "TripItem"("tripId");

-- CreateIndex
CREATE INDEX "TripItem_accommodationId_idx" ON "TripItem"("accommodationId");

-- CreateIndex
CREATE INDEX "TripItem_restaurantId_idx" ON "TripItem"("restaurantId");

-- CreateIndex
CREATE INDEX "TripItem_activityId_idx" ON "TripItem"("activityId");

-- CreateIndex
CREATE INDEX "TripItem_attractionId_idx" ON "TripItem"("attractionId");

-- CreateIndex
CREATE INDEX "TripItem_placeId_idx" ON "TripItem"("placeId");

-- CreateIndex
CREATE INDEX "TripItem_transportLegId_idx" ON "TripItem"("transportLegId");

-- CreateIndex
CREATE UNIQUE INDEX "TripItem_tripDayId_sortOrder_key" ON "TripItem"("tripDayId", "sortOrder");

-- CreateIndex
CREATE INDEX "TripTransportLeg_tripId_idx" ON "TripTransportLeg"("tripId");

-- CreateIndex
CREATE INDEX "TripTransportLeg_fromDestinationId_idx" ON "TripTransportLeg"("fromDestinationId");

-- CreateIndex
CREATE INDEX "TripTransportLeg_toDestinationId_idx" ON "TripTransportLeg"("toDestinationId");

-- CreateIndex
CREATE UNIQUE INDEX "TripTransportLeg_tripId_sortOrder_key" ON "TripTransportLeg"("tripId", "sortOrder");

-- CreateIndex
CREATE INDEX "CostAssumption_scope_scopeId_category_status_idx" ON "CostAssumption"("scope", "scopeId", "category", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CostAssumption_scope_scopeId_category_unit_effectiveFrom_key" ON "CostAssumption"("scope", "scopeId", "category", "unit", "effectiveFrom");

-- CreateIndex
CREATE INDEX "TripCostEstimateGeneration_tripId_calculatedAt_idx" ON "TripCostEstimateGeneration"("tripId", "calculatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TripCostEstimateGeneration_tripId_inputHash_engineVersion_key" ON "TripCostEstimateGeneration"("tripId", "inputHash", "engineVersion");

-- CreateIndex
CREATE UNIQUE INDEX "TripCostEstimate_generationId_scenario_key" ON "TripCostEstimate"("generationId", "scenario");

-- CreateIndex
CREATE INDEX "TripCostEstimateItem_estimateId_idx" ON "TripCostEstimateItem"("estimateId");

-- CreateIndex
CREATE INDEX "TripCostEstimateItem_tripDayId_idx" ON "TripCostEstimateItem"("tripDayId");

-- CreateIndex
CREATE INDEX "TripCostEstimateItem_tripItemId_idx" ON "TripCostEstimateItem"("tripItemId");

-- CreateIndex
CREATE INDEX "TripCostEstimateItem_transportLegId_idx" ON "TripCostEstimateItem"("transportLegId");

-- CreateIndex
CREATE INDEX "TripCostEstimateItem_assumptionId_idx" ON "TripCostEstimateItem"("assumptionId");

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_originCountryId_fkey" FOREIGN KEY ("originCountryId") REFERENCES "Country"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_originRegionId_fkey" FOREIGN KEY ("originRegionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_originCityId_fkey" FOREIGN KEY ("originCityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripDestination" ADD CONSTRAINT "TripDestination_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripDestination" ADD CONSTRAINT "TripDestination_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripDay" ADD CONSTRAINT "TripDay_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripItem" ADD CONSTRAINT "TripItem_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripItem" ADD CONSTRAINT "TripItem_tripDayId_fkey" FOREIGN KEY ("tripDayId") REFERENCES "TripDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripItem" ADD CONSTRAINT "TripItem_accommodationId_fkey" FOREIGN KEY ("accommodationId") REFERENCES "Accommodation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripItem" ADD CONSTRAINT "TripItem_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripItem" ADD CONSTRAINT "TripItem_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripItem" ADD CONSTRAINT "TripItem_attractionId_fkey" FOREIGN KEY ("attractionId") REFERENCES "Attraction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripItem" ADD CONSTRAINT "TripItem_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripItem" ADD CONSTRAINT "TripItem_transportLegId_fkey" FOREIGN KEY ("transportLegId") REFERENCES "TripTransportLeg"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripTransportLeg" ADD CONSTRAINT "TripTransportLeg_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripTransportLeg" ADD CONSTRAINT "TripTransportLeg_fromDestinationId_fkey" FOREIGN KEY ("fromDestinationId") REFERENCES "Destination"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripTransportLeg" ADD CONSTRAINT "TripTransportLeg_toDestinationId_fkey" FOREIGN KEY ("toDestinationId") REFERENCES "Destination"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripCostEstimateGeneration" ADD CONSTRAINT "TripCostEstimateGeneration_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripCostEstimate" ADD CONSTRAINT "TripCostEstimate_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "TripCostEstimateGeneration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripCostEstimateItem" ADD CONSTRAINT "TripCostEstimateItem_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "TripCostEstimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripCostEstimateItem" ADD CONSTRAINT "TripCostEstimateItem_tripDayId_fkey" FOREIGN KEY ("tripDayId") REFERENCES "TripDay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripCostEstimateItem" ADD CONSTRAINT "TripCostEstimateItem_tripItemId_fkey" FOREIGN KEY ("tripItemId") REFERENCES "TripItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripCostEstimateItem" ADD CONSTRAINT "TripCostEstimateItem_transportLegId_fkey" FOREIGN KEY ("transportLegId") REFERENCES "TripTransportLeg"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripCostEstimateItem" ADD CONSTRAINT "TripCostEstimateItem_assumptionId_fkey" FOREIGN KEY ("assumptionId") REFERENCES "CostAssumption"("id") ON DELETE SET NULL ON UPDATE CASCADE;
