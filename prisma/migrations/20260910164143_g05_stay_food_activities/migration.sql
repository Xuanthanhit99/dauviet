-- CreateEnum
CREATE TYPE "AccommodationType" AS ENUM ('HOTEL', 'HOSTEL', 'GUESTHOUSE', 'RESORT', 'APARTMENT', 'HOMESTAY', 'RYOKAN', 'VILLA', 'CAMPING', 'OTHER');

-- CreateEnum
CREATE TYPE "AvailabilityStatus" AS ENUM ('UNKNOWN', 'AVAILABLE', 'UNAVAILABLE', 'LIMITED');

-- CreateEnum
CREATE TYPE "ProviderReferenceStatus" AS ENUM ('ACTIVE', 'STALE', 'DISABLED', 'UNMAPPED');

-- NOTE (G05 live-QA finding, not a G05 change): `prisma migrate dev`'s
-- auto-diff against this schema also proposed `ALTER TYPE "EntityKind" ADD
-- VALUE 'FACT'` and DROP INDEX for 17 pre-existing trigram/PostGIS GIST
-- search indexes (CommunityStoryTranslation_title_trgm,
-- DynastyTranslation_name_trgm, EntityAlias_alias_trgm,
-- HistoricalEraTranslation_name_trgm, HistoricalEvent_importance_idx,
-- HistoricalEventTranslation_title_trgm, Journey_routeGeometry_gist,
-- JourneyTranslation_title_trgm, PersonTranslation_displayName_trgm,
-- Place_geometry_gist, Place_historicalImportance_idx, Place_location_gist,
-- PlaceTranslation_name_trgm, Source_title_trgm, StoryTranslation_title_trgm,
-- Territory_geometry_gist, TerritoryTranslation_name_trgm). Both are
-- pre-existing drift between `schema.prisma` and the actual migration
-- history that predates this phase entirely (verified live: the running
-- database already lacks EntityKind.FACT and already HAS all 17 indexes) -
-- NOT something this G05 schema change introduced or requires. Applying
-- either would have been a real, unrelated destructive/regressive change
-- (a live enum rewrite affecting nothing in this migration, and dropping
-- real, currently-functioning search-performance indexes) smuggled inside
-- what must stay a purely additive G05 migration (spec section 4/21/90/127
-- - "if you believe a migration is required [beyond additive], STOP"). Both
-- statement blocks were manually removed from this file before it was ever
-- applied. Flagged separately for a dedicated fix outside G05 scope - see
-- docs/backend/G05_STAY_FOOD_ACTIVITIES.md "Known deferred items".

-- CreateTable
CREATE TABLE "Accommodation" (
    "id" TEXT NOT NULL,
    "canonicalSlug" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "regionId" TEXT,
    "cityId" TEXT,
    "type" "AccommodationType" NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "importance" INTEGER NOT NULL DEFAULT 0,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "heroMediaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Accommodation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccommodationTranslation" (
    "id" TEXT NOT NULL,
    "accommodationId" TEXT NOT NULL,
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

    CONSTRAINT "AccommodationTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DestinationAccommodation" (
    "id" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "accommodationId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DestinationAccommodation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderAccommodationReference" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "accommodationId" TEXT,
    "externalEntityId" TEXT NOT NULL,
    "externalUrl" TEXT,
    "status" "ProviderReferenceStatus" NOT NULL DEFAULT 'UNMAPPED',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderAccommodationReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccommodationOffer" (
    "id" TEXT NOT NULL,
    "providerReferenceId" TEXT NOT NULL,
    "checkInDate" DATE NOT NULL,
    "checkOutDate" DATE NOT NULL,
    "guests" INTEGER NOT NULL,
    "rooms" INTEGER NOT NULL DEFAULT 1,
    "currency" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "taxAmount" DECIMAL(12,2),
    "feeAmount" DECIMAL(12,2),
    "totalAmount" DECIMAL(12,2),
    "taxesIncluded" BOOLEAN,
    "feesIncluded" BOOLEAN,
    "availability" "AvailabilityStatus" NOT NULL DEFAULT 'UNKNOWN',
    "bookingUrl" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "refreshAfter" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccommodationOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cuisine" (
    "id" TEXT NOT NULL,
    "canonicalSlug" TEXT NOT NULL,
    "countryId" TEXT,
    "regionId" TEXT,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cuisine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CuisineTranslation" (
    "id" TEXT NOT NULL,
    "cuisineId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT,
    "description" TEXT,
    "status" "TranslationStatus" NOT NULL DEFAULT 'DRAFT',
    "method" "TranslationMethod" NOT NULL DEFAULT 'ORIGINAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CuisineTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dish" (
    "id" TEXT NOT NULL,
    "canonicalSlug" TEXT NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dish_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DishTranslation" (
    "id" TEXT NOT NULL,
    "dishId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT,
    "description" TEXT,
    "status" "TranslationStatus" NOT NULL DEFAULT 'DRAFT',
    "method" "TranslationMethod" NOT NULL DEFAULT 'ORIGINAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DishTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DishCuisine" (
    "id" TEXT NOT NULL,
    "dishId" TEXT NOT NULL,
    "cuisineId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DishCuisine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DestinationDish" (
    "id" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "dishId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DestinationDish_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Restaurant" (
    "id" TEXT NOT NULL,
    "canonicalSlug" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "regionId" TEXT,
    "cityId" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "heroMediaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Restaurant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantTranslation" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
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

    CONSTRAINT "RestaurantTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DestinationRestaurant" (
    "id" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DestinationRestaurant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantCuisine" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "cuisineId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RestaurantCuisine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantDish" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "dishId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RestaurantDish_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderRestaurantReference" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "restaurantId" TEXT,
    "externalEntityId" TEXT NOT NULL,
    "externalUrl" TEXT,
    "status" "ProviderReferenceStatus" NOT NULL DEFAULT 'UNMAPPED',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderRestaurantReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantOperationalSnapshot" (
    "id" TEXT NOT NULL,
    "providerReferenceId" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "priceLevel" INTEGER,
    "reservationUrl" TEXT,
    "openingHours" JSONB,
    "timezone" TEXT,
    "temporaryClosure" BOOLEAN NOT NULL DEFAULT false,
    "permanentlyClosed" BOOLEAN NOT NULL DEFAULT false,
    "providerRating" DOUBLE PRECISION,
    "providerRatingCount" INTEGER,
    "providerPhotoRef" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "refreshAfter" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RestaurantOperationalSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attraction" (
    "id" TEXT NOT NULL,
    "canonicalSlug" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "regionId" TEXT,
    "cityId" TEXT,
    "placeId" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "heroMediaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttractionTranslation" (
    "id" TEXT NOT NULL,
    "attractionId" TEXT NOT NULL,
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

    CONSTRAINT "AttractionTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DestinationAttraction" (
    "id" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "attractionId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DestinationAttraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "canonicalSlug" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "regionId" TEXT,
    "cityId" TEXT,
    "attractionId" TEXT,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "heroMediaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityTranslation" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT,
    "description" TEXT,
    "status" "TranslationStatus" NOT NULL DEFAULT 'DRAFT',
    "method" "TranslationMethod" NOT NULL DEFAULT 'ORIGINAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivityTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DestinationActivity" (
    "id" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DestinationActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderActivityReference" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "activityId" TEXT,
    "destinationId" TEXT,
    "externalEntityId" TEXT NOT NULL,
    "externalUrl" TEXT,
    "status" "ProviderReferenceStatus" NOT NULL DEFAULT 'UNMAPPED',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderActivityReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityOffer" (
    "id" TEXT NOT NULL,
    "providerReferenceId" TEXT NOT NULL,
    "activityDate" DATE NOT NULL,
    "activityTime" TEXT,
    "participants" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "durationMinutes" INTEGER,
    "ticketType" TEXT,
    "cancellationSummary" TEXT,
    "bookingUrl" TEXT,
    "availability" "AvailabilityStatus" NOT NULL DEFAULT 'UNKNOWN',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "refreshAfter" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Accommodation_canonicalSlug_key" ON "Accommodation"("canonicalSlug");

-- CreateIndex
CREATE INDEX "Accommodation_countryId_idx" ON "Accommodation"("countryId");

-- CreateIndex
CREATE INDEX "Accommodation_regionId_idx" ON "Accommodation"("regionId");

-- CreateIndex
CREATE INDEX "Accommodation_cityId_idx" ON "Accommodation"("cityId");

-- CreateIndex
CREATE INDEX "Accommodation_type_idx" ON "Accommodation"("type");

-- CreateIndex
CREATE INDEX "Accommodation_status_idx" ON "Accommodation"("status");

-- CreateIndex
CREATE INDEX "Accommodation_heroMediaId_idx" ON "Accommodation"("heroMediaId");

-- CreateIndex
CREATE UNIQUE INDEX "AccommodationTranslation_accommodationId_locale_key" ON "AccommodationTranslation"("accommodationId", "locale");

-- CreateIndex
CREATE INDEX "DestinationAccommodation_accommodationId_idx" ON "DestinationAccommodation"("accommodationId");

-- CreateIndex
CREATE INDEX "DestinationAccommodation_destinationId_sortOrder_idx" ON "DestinationAccommodation"("destinationId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "DestinationAccommodation_destinationId_accommodationId_key" ON "DestinationAccommodation"("destinationId", "accommodationId");

-- CreateIndex
CREATE INDEX "ProviderAccommodationReference_accommodationId_idx" ON "ProviderAccommodationReference"("accommodationId");

-- CreateIndex
CREATE INDEX "ProviderAccommodationReference_status_idx" ON "ProviderAccommodationReference"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderAccommodationReference_providerId_externalEntityId_key" ON "ProviderAccommodationReference"("providerId", "externalEntityId");

-- CreateIndex
CREATE INDEX "AccommodationOffer_providerReferenceId_checkInDate_checkOut_idx" ON "AccommodationOffer"("providerReferenceId", "checkInDate", "checkOutDate");

-- CreateIndex
CREATE INDEX "AccommodationOffer_expiresAt_idx" ON "AccommodationOffer"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Cuisine_canonicalSlug_key" ON "Cuisine"("canonicalSlug");

-- CreateIndex
CREATE INDEX "Cuisine_countryId_idx" ON "Cuisine"("countryId");

-- CreateIndex
CREATE INDEX "Cuisine_status_idx" ON "Cuisine"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CuisineTranslation_cuisineId_locale_key" ON "CuisineTranslation"("cuisineId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "Dish_canonicalSlug_key" ON "Dish"("canonicalSlug");

-- CreateIndex
CREATE INDEX "Dish_status_idx" ON "Dish"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DishTranslation_dishId_locale_key" ON "DishTranslation"("dishId", "locale");

-- CreateIndex
CREATE INDEX "DishCuisine_cuisineId_idx" ON "DishCuisine"("cuisineId");

-- CreateIndex
CREATE UNIQUE INDEX "DishCuisine_dishId_cuisineId_key" ON "DishCuisine"("dishId", "cuisineId");

-- CreateIndex
CREATE INDEX "DestinationDish_dishId_idx" ON "DestinationDish"("dishId");

-- CreateIndex
CREATE INDEX "DestinationDish_destinationId_sortOrder_idx" ON "DestinationDish"("destinationId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "DestinationDish_destinationId_dishId_key" ON "DestinationDish"("destinationId", "dishId");

-- CreateIndex
CREATE UNIQUE INDEX "Restaurant_canonicalSlug_key" ON "Restaurant"("canonicalSlug");

-- CreateIndex
CREATE INDEX "Restaurant_countryId_idx" ON "Restaurant"("countryId");

-- CreateIndex
CREATE INDEX "Restaurant_regionId_idx" ON "Restaurant"("regionId");

-- CreateIndex
CREATE INDEX "Restaurant_cityId_idx" ON "Restaurant"("cityId");

-- CreateIndex
CREATE INDEX "Restaurant_status_idx" ON "Restaurant"("status");

-- CreateIndex
CREATE INDEX "Restaurant_heroMediaId_idx" ON "Restaurant"("heroMediaId");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantTranslation_restaurantId_locale_key" ON "RestaurantTranslation"("restaurantId", "locale");

-- CreateIndex
CREATE INDEX "DestinationRestaurant_restaurantId_idx" ON "DestinationRestaurant"("restaurantId");

-- CreateIndex
CREATE INDEX "DestinationRestaurant_destinationId_sortOrder_idx" ON "DestinationRestaurant"("destinationId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "DestinationRestaurant_destinationId_restaurantId_key" ON "DestinationRestaurant"("destinationId", "restaurantId");

-- CreateIndex
CREATE INDEX "RestaurantCuisine_cuisineId_idx" ON "RestaurantCuisine"("cuisineId");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantCuisine_restaurantId_cuisineId_key" ON "RestaurantCuisine"("restaurantId", "cuisineId");

-- CreateIndex
CREATE INDEX "RestaurantDish_dishId_idx" ON "RestaurantDish"("dishId");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantDish_restaurantId_dishId_key" ON "RestaurantDish"("restaurantId", "dishId");

-- CreateIndex
CREATE INDEX "ProviderRestaurantReference_restaurantId_idx" ON "ProviderRestaurantReference"("restaurantId");

-- CreateIndex
CREATE INDEX "ProviderRestaurantReference_status_idx" ON "ProviderRestaurantReference"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderRestaurantReference_providerId_externalEntityId_key" ON "ProviderRestaurantReference"("providerId", "externalEntityId");

-- CreateIndex
CREATE INDEX "RestaurantOperationalSnapshot_providerReferenceId_idx" ON "RestaurantOperationalSnapshot"("providerReferenceId");

-- CreateIndex
CREATE INDEX "RestaurantOperationalSnapshot_expiresAt_idx" ON "RestaurantOperationalSnapshot"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Attraction_canonicalSlug_key" ON "Attraction"("canonicalSlug");

-- CreateIndex
CREATE INDEX "Attraction_countryId_idx" ON "Attraction"("countryId");

-- CreateIndex
CREATE INDEX "Attraction_regionId_idx" ON "Attraction"("regionId");

-- CreateIndex
CREATE INDEX "Attraction_cityId_idx" ON "Attraction"("cityId");

-- CreateIndex
CREATE INDEX "Attraction_placeId_idx" ON "Attraction"("placeId");

-- CreateIndex
CREATE INDEX "Attraction_status_idx" ON "Attraction"("status");

-- CreateIndex
CREATE INDEX "Attraction_heroMediaId_idx" ON "Attraction"("heroMediaId");

-- CreateIndex
CREATE UNIQUE INDEX "AttractionTranslation_attractionId_locale_key" ON "AttractionTranslation"("attractionId", "locale");

-- CreateIndex
CREATE INDEX "DestinationAttraction_attractionId_idx" ON "DestinationAttraction"("attractionId");

-- CreateIndex
CREATE INDEX "DestinationAttraction_destinationId_sortOrder_idx" ON "DestinationAttraction"("destinationId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "DestinationAttraction_destinationId_attractionId_key" ON "DestinationAttraction"("destinationId", "attractionId");

-- CreateIndex
CREATE UNIQUE INDEX "Activity_canonicalSlug_key" ON "Activity"("canonicalSlug");

-- CreateIndex
CREATE INDEX "Activity_countryId_idx" ON "Activity"("countryId");

-- CreateIndex
CREATE INDEX "Activity_regionId_idx" ON "Activity"("regionId");

-- CreateIndex
CREATE INDEX "Activity_cityId_idx" ON "Activity"("cityId");

-- CreateIndex
CREATE INDEX "Activity_attractionId_idx" ON "Activity"("attractionId");

-- CreateIndex
CREATE INDEX "Activity_status_idx" ON "Activity"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityTranslation_activityId_locale_key" ON "ActivityTranslation"("activityId", "locale");

-- CreateIndex
CREATE INDEX "DestinationActivity_activityId_idx" ON "DestinationActivity"("activityId");

-- CreateIndex
CREATE INDEX "DestinationActivity_destinationId_sortOrder_idx" ON "DestinationActivity"("destinationId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "DestinationActivity_destinationId_activityId_key" ON "DestinationActivity"("destinationId", "activityId");

-- CreateIndex
CREATE INDEX "ProviderActivityReference_activityId_idx" ON "ProviderActivityReference"("activityId");

-- CreateIndex
CREATE INDEX "ProviderActivityReference_destinationId_idx" ON "ProviderActivityReference"("destinationId");

-- CreateIndex
CREATE INDEX "ProviderActivityReference_status_idx" ON "ProviderActivityReference"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderActivityReference_providerId_externalEntityId_key" ON "ProviderActivityReference"("providerId", "externalEntityId");

-- CreateIndex
CREATE INDEX "ActivityOffer_providerReferenceId_activityDate_idx" ON "ActivityOffer"("providerReferenceId", "activityDate");

-- CreateIndex
CREATE INDEX "ActivityOffer_expiresAt_idx" ON "ActivityOffer"("expiresAt");

-- AddForeignKey
ALTER TABLE "Accommodation" ADD CONSTRAINT "Accommodation_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Accommodation" ADD CONSTRAINT "Accommodation_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Accommodation" ADD CONSTRAINT "Accommodation_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Accommodation" ADD CONSTRAINT "Accommodation_heroMediaId_fkey" FOREIGN KEY ("heroMediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccommodationTranslation" ADD CONSTRAINT "AccommodationTranslation_accommodationId_fkey" FOREIGN KEY ("accommodationId") REFERENCES "Accommodation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DestinationAccommodation" ADD CONSTRAINT "DestinationAccommodation_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DestinationAccommodation" ADD CONSTRAINT "DestinationAccommodation_accommodationId_fkey" FOREIGN KEY ("accommodationId") REFERENCES "Accommodation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderAccommodationReference" ADD CONSTRAINT "ProviderAccommodationReference_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ExternalProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderAccommodationReference" ADD CONSTRAINT "ProviderAccommodationReference_accommodationId_fkey" FOREIGN KEY ("accommodationId") REFERENCES "Accommodation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccommodationOffer" ADD CONSTRAINT "AccommodationOffer_providerReferenceId_fkey" FOREIGN KEY ("providerReferenceId") REFERENCES "ProviderAccommodationReference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cuisine" ADD CONSTRAINT "Cuisine_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cuisine" ADD CONSTRAINT "Cuisine_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuisineTranslation" ADD CONSTRAINT "CuisineTranslation_cuisineId_fkey" FOREIGN KEY ("cuisineId") REFERENCES "Cuisine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishTranslation" ADD CONSTRAINT "DishTranslation_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishCuisine" ADD CONSTRAINT "DishCuisine_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishCuisine" ADD CONSTRAINT "DishCuisine_cuisineId_fkey" FOREIGN KEY ("cuisineId") REFERENCES "Cuisine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DestinationDish" ADD CONSTRAINT "DestinationDish_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DestinationDish" ADD CONSTRAINT "DestinationDish_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Restaurant" ADD CONSTRAINT "Restaurant_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Restaurant" ADD CONSTRAINT "Restaurant_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Restaurant" ADD CONSTRAINT "Restaurant_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Restaurant" ADD CONSTRAINT "Restaurant_heroMediaId_fkey" FOREIGN KEY ("heroMediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantTranslation" ADD CONSTRAINT "RestaurantTranslation_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DestinationRestaurant" ADD CONSTRAINT "DestinationRestaurant_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DestinationRestaurant" ADD CONSTRAINT "DestinationRestaurant_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantCuisine" ADD CONSTRAINT "RestaurantCuisine_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantCuisine" ADD CONSTRAINT "RestaurantCuisine_cuisineId_fkey" FOREIGN KEY ("cuisineId") REFERENCES "Cuisine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantDish" ADD CONSTRAINT "RestaurantDish_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantDish" ADD CONSTRAINT "RestaurantDish_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderRestaurantReference" ADD CONSTRAINT "ProviderRestaurantReference_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ExternalProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderRestaurantReference" ADD CONSTRAINT "ProviderRestaurantReference_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantOperationalSnapshot" ADD CONSTRAINT "RestaurantOperationalSnapshot_providerReferenceId_fkey" FOREIGN KEY ("providerReferenceId") REFERENCES "ProviderRestaurantReference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attraction" ADD CONSTRAINT "Attraction_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attraction" ADD CONSTRAINT "Attraction_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attraction" ADD CONSTRAINT "Attraction_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attraction" ADD CONSTRAINT "Attraction_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attraction" ADD CONSTRAINT "Attraction_heroMediaId_fkey" FOREIGN KEY ("heroMediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttractionTranslation" ADD CONSTRAINT "AttractionTranslation_attractionId_fkey" FOREIGN KEY ("attractionId") REFERENCES "Attraction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DestinationAttraction" ADD CONSTRAINT "DestinationAttraction_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DestinationAttraction" ADD CONSTRAINT "DestinationAttraction_attractionId_fkey" FOREIGN KEY ("attractionId") REFERENCES "Attraction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_attractionId_fkey" FOREIGN KEY ("attractionId") REFERENCES "Attraction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityTranslation" ADD CONSTRAINT "ActivityTranslation_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DestinationActivity" ADD CONSTRAINT "DestinationActivity_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DestinationActivity" ADD CONSTRAINT "DestinationActivity_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderActivityReference" ADD CONSTRAINT "ProviderActivityReference_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ExternalProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderActivityReference" ADD CONSTRAINT "ProviderActivityReference_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityOffer" ADD CONSTRAINT "ActivityOffer_providerReferenceId_fkey" FOREIGN KEY ("providerReferenceId") REFERENCES "ProviderActivityReference"("id") ON DELETE CASCADE ON UPDATE CASCADE;
