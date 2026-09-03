-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'CONTRIBUTOR', 'EDITOR', 'HISTORIAN_REVIEWER', 'MODERATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('PASSWORD', 'GOOGLE');

-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "FactEditorialStatus" AS ENUM ('DRAFT', 'SOURCE_CHECK', 'FACT_REVIEW', 'EDITORIAL_REVIEW', 'READY', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "PlaceType" AS ENUM ('HISTORICAL_SITE', 'ARCHAEOLOGICAL_SITE', 'MONUMENT', 'TEMPLE', 'PAGODA', 'PALACE', 'CITADEL', 'BATTLEFIELD', 'MUSEUM', 'PRISON', 'TOMB', 'PORT', 'VILLAGE', 'ISLAND', 'ARCHIPELAGO', 'RIVER', 'MOUNTAIN', 'URBAN_AREA', 'OTHER');

-- CreateEnum
CREATE TYPE "DatePrecision" AS ENUM ('EXACT', 'MONTH', 'YEAR', 'APPROXIMATE_YEAR', 'RANGE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "FactType" AS ENUM ('BIOGRAPHICAL', 'EVENT_DETAIL', 'TERRITORIAL', 'ARCHITECTURAL', 'CULTURAL', 'ADMINISTRATIVE', 'MILITARY', 'ECONOMIC', 'OTHER');

-- CreateEnum
CREATE TYPE "FactCertainty" AS ENUM ('CONFIRMED', 'HIGH_CONFIDENCE', 'DISPUTED', 'UNCERTAIN', 'TRADITIONAL_ACCOUNT', 'ORAL_HISTORY');

-- CreateEnum
CREATE TYPE "FactSensitivity" AS ENUM ('NORMAL', 'HIGH', 'TERRITORIAL', 'LEGAL', 'CONTESTED');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('BOOK', 'PRIMARY_DOCUMENT', 'ARCHIVAL_DOCUMENT', 'MAP', 'MANUSCRIPT', 'ACADEMIC_PAPER', 'MUSEUM_RECORD', 'GOVERNMENT_DOCUMENT', 'UNESCO_RECORD', 'NEWSPAPER', 'PHOTO_ARCHIVE', 'ORAL_HISTORY', 'WEBSITE', 'OTHER');

-- CreateEnum
CREATE TYPE "SourceCredibility" AS ENUM ('PRIMARY', 'SECONDARY', 'TERTIARY', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "CitationVerificationState" AS ENUM ('UNVERIFIED', 'VERIFIED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "AccessPolicy" AS ENUM ('PUBLIC', 'PREVIEW_ONLY', 'METADATA_ONLY', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('PHOTO', 'ARCHIVAL_PHOTO', 'DOCUMENT_SCAN', 'MAP', 'ILLUSTRATION', 'RECONSTRUCTION', 'AUDIO', 'VIDEO', 'MODEL_3D');

-- CreateEnum
CREATE TYPE "TranslationStatus" AS ENUM ('DRAFT', 'AI_ASSISTED', 'HUMAN_REVIEWED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "TranslationMethod" AS ENUM ('ORIGINAL', 'HUMAN', 'AI_ASSISTED');

-- CreateEnum
CREATE TYPE "AliasType" AS ENUM ('ALTERNATE_NAME', 'HISTORICAL_NAME', 'ROMANIZATION', 'ABBREVIATION', 'OTHER');

-- CreateEnum
CREATE TYPE "TerritoryType" AS ENUM ('KINGDOM', 'PROTECTORATE', 'HISTORICAL_PROVINCE', 'DISPUTED_ZONE', 'ADMINISTRATIVE_BOUNDARY', 'OTHER');

-- CreateEnum
CREATE TYPE "EntityKind" AS ENUM ('PLACE', 'PERSON', 'EVENT', 'ERA', 'DYNASTY', 'TERRITORY', 'STORY', 'JOURNEY', 'COMMUNITY_STORY', 'SOURCE', 'CONTRIBUTION', 'MEDIA_ASSET', 'COMMENT');

-- CreateEnum
CREATE TYPE "CommunityStoryType" AS ENUM ('MEMORY', 'LOCAL_STORY', 'TRAVEL_EXPERIENCE', 'THEN_AND_NOW', 'DOCUMENT_CONTRIBUTION', 'FAMILY_HISTORY', 'PHOTO_STORY');

-- CreateEnum
CREATE TYPE "CommunityVerificationState" AS ENUM ('PERSONAL_MEMORY', 'COMMUNITY_SUBMISSION', 'SOURCE_ATTACHED', 'UNDER_REVIEW', 'VERIFIED_CONTRIBUTION');

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('VISIBLE', 'LIMITED', 'UNDER_REVIEW', 'REMOVED', 'LOCKED');

-- CreateEnum
CREATE TYPE "ReportCategory" AS ENUM ('MISINFORMATION', 'HATEFUL_CONTENT', 'HARASSMENT', 'SPAM', 'COPYRIGHT', 'PERSONAL_INFORMATION', 'GRAPHIC_CONTENT', 'OFF_TOPIC', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ContributionStatus" AS ENUM ('SUBMITTED', 'TRIAGE', 'PROVENANCE_REVIEW', 'HISTORICAL_REVIEW', 'ACCEPTED', 'CATALOGUED', 'REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerifiedAt" TIMESTAMP(3),
    "displayName" TEXT NOT NULL,
    "avatarMediaId" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "roles" "Role"[] DEFAULT ARRAY['USER']::"Role"[],
    "locale" TEXT NOT NULL DEFAULT 'vi',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "AuthProvider" NOT NULL,
    "providerUserId" TEXT,
    "passwordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailVerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "deviceLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "type" "MediaType" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "checksum" TEXT,
    "title" TEXT,
    "caption" TEXT,
    "creatorName" TEXT,
    "sourceId" TEXT,
    "captureDate" TIMESTAMP(3),
    "captureDatePrecision" "DatePrecision" NOT NULL DEFAULT 'UNKNOWN',
    "license" TEXT,
    "rightsHolder" TEXT,
    "provenanceNote" TEXT,
    "isHistorical" BOOLEAN NOT NULL DEFAULT false,
    "isAiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "aiDisclosure" TEXT,
    "parentAssetId" TEXT,
    "accessPolicy" "AccessPolicy" NOT NULL DEFAULT 'PUBLIC',
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityMedia" (
    "id" TEXT NOT NULL,
    "entityType" "EntityKind" NOT NULL,
    "entityId" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'gallery',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntityMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityAlias" (
    "id" TEXT NOT NULL,
    "entityType" "EntityKind" NOT NULL,
    "entityId" TEXT NOT NULL,
    "locale" TEXT,
    "alias" TEXT NOT NULL,
    "aliasType" "AliasType" NOT NULL DEFAULT 'ALTERNATE_NAME',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntityAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Place" (
    "id" TEXT NOT NULL,
    "canonicalSlug" TEXT NOT NULL,
    "type" "PlaceType" NOT NULL,
    "parentPlaceId" TEXT,
    "location" geometry(Point, 4326),
    "geometry" geometry(Geometry, 4326),
    "currentAdminRegion" TEXT,
    "historicalImportance" INTEGER NOT NULL DEFAULT 0,
    "heroMediaId" TEXT,
    "unescoStatus" TEXT,
    "unescoInscribedYear" INTEGER,
    "publicationStatus" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Place_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaceTranslation" (
    "id" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT,
    "description" TEXT,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "status" "TranslationStatus" NOT NULL DEFAULT 'DRAFT',
    "method" "TranslationMethod" NOT NULL DEFAULT 'ORIGINAL',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaceTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "canonicalSlug" TEXT NOT NULL,
    "birthDateStart" TIMESTAMP(3),
    "birthDateEnd" TIMESTAMP(3),
    "birthDatePrecision" "DatePrecision" NOT NULL DEFAULT 'UNKNOWN',
    "birthDateLabel" TEXT,
    "deathDateStart" TIMESTAMP(3),
    "deathDateEnd" TIMESTAMP(3),
    "deathDatePrecision" "DatePrecision" NOT NULL DEFAULT 'UNKNOWN',
    "deathDateLabel" TEXT,
    "heroMediaId" TEXT,
    "historicalImportance" INTEGER NOT NULL DEFAULT 0,
    "publicationStatus" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonTranslation" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "alternateNames" TEXT,
    "summary" TEXT,
    "description" TEXT,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "status" "TranslationStatus" NOT NULL DEFAULT 'DRAFT',
    "method" "TranslationMethod" NOT NULL DEFAULT 'ORIGINAL',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricalEvent" (
    "id" TEXT NOT NULL,
    "canonicalSlug" TEXT NOT NULL,
    "eraId" TEXT,
    "territoryId" TEXT,
    "dateStart" TIMESTAMP(3),
    "dateEnd" TIMESTAMP(3),
    "datePrecision" "DatePrecision" NOT NULL DEFAULT 'UNKNOWN',
    "dateLabel" TEXT,
    "importance" INTEGER NOT NULL DEFAULT 0,
    "heroMediaId" TEXT,
    "publicationStatus" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HistoricalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricalEventTranslation" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT,
    "description" TEXT,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "status" "TranslationStatus" NOT NULL DEFAULT 'DRAFT',
    "method" "TranslationMethod" NOT NULL DEFAULT 'ORIGINAL',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HistoricalEventTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricalEra" (
    "id" TEXT NOT NULL,
    "canonicalSlug" TEXT NOT NULL,
    "parentEraId" TEXT,
    "dateStart" TIMESTAMP(3),
    "dateEnd" TIMESTAMP(3),
    "datePrecision" "DatePrecision" NOT NULL DEFAULT 'UNKNOWN',
    "dateLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HistoricalEra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricalEraTranslation" (
    "id" TEXT NOT NULL,
    "eraId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT,
    "description" TEXT,
    "status" "TranslationStatus" NOT NULL DEFAULT 'DRAFT',
    "method" "TranslationMethod" NOT NULL DEFAULT 'ORIGINAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HistoricalEraTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dynasty" (
    "id" TEXT NOT NULL,
    "canonicalSlug" TEXT NOT NULL,
    "capitalPlaceId" TEXT,
    "dateStart" TIMESTAMP(3),
    "dateEnd" TIMESTAMP(3),
    "datePrecision" "DatePrecision" NOT NULL DEFAULT 'UNKNOWN',
    "dateLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dynasty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DynastyTranslation" (
    "id" TEXT NOT NULL,
    "dynastyId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT,
    "description" TEXT,
    "status" "TranslationStatus" NOT NULL DEFAULT 'DRAFT',
    "method" "TranslationMethod" NOT NULL DEFAULT 'ORIGINAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DynastyTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Territory" (
    "id" TEXT NOT NULL,
    "canonicalSlug" TEXT NOT NULL,
    "type" "TerritoryType" NOT NULL,
    "geometry" geometry(Geometry, 4326),
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "datePrecision" "DatePrecision" NOT NULL DEFAULT 'UNKNOWN',
    "dateLabel" TEXT,
    "provenanceNote" TEXT,
    "geometryVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Territory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TerritoryTranslation" (
    "id" TEXT NOT NULL,
    "territoryId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT,
    "description" TEXT,
    "status" "TranslationStatus" NOT NULL DEFAULT 'DRAFT',
    "method" "TranslationMethod" NOT NULL DEFAULT 'ORIGINAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TerritoryTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventPlace" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "role" TEXT,

    CONSTRAINT "EventPlace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventPerson" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "role" TEXT,

    CONSTRAINT "EventPerson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonDynasty" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "dynastyId" TEXT NOT NULL,
    "role" TEXT,

    CONSTRAINT "PersonDynasty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricalFact" (
    "id" TEXT NOT NULL,
    "factType" "FactType" NOT NULL,
    "dateStart" TIMESTAMP(3),
    "dateEnd" TIMESTAMP(3),
    "datePrecision" "DatePrecision" NOT NULL DEFAULT 'UNKNOWN',
    "dateLabel" TEXT,
    "certainty" "FactCertainty" NOT NULL DEFAULT 'UNCERTAIN',
    "sensitivity" "FactSensitivity" NOT NULL DEFAULT 'NORMAL',
    "editorialStatus" "FactEditorialStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HistoricalFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricalFactTranslation" (
    "id" TEXT NOT NULL,
    "factId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "status" "TranslationStatus" NOT NULL DEFAULT 'DRAFT',
    "method" "TranslationMethod" NOT NULL DEFAULT 'ORIGINAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HistoricalFactTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FactPlace" (
    "id" TEXT NOT NULL,
    "factId" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,

    CONSTRAINT "FactPlace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FactPerson" (
    "id" TEXT NOT NULL,
    "factId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,

    CONSTRAINT "FactPerson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FactEvent" (
    "id" TEXT NOT NULL,
    "factId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,

    CONSTRAINT "FactEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FactEra" (
    "id" TEXT NOT NULL,
    "factId" TEXT NOT NULL,
    "eraId" TEXT NOT NULL,

    CONSTRAINT "FactEra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FactTerritory" (
    "id" TEXT NOT NULL,
    "factId" TEXT NOT NULL,
    "territoryId" TEXT NOT NULL,

    CONSTRAINT "FactTerritory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "sourceType" "SourceType" NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "organization" TEXT,
    "publisher" TEXT,
    "publicationYear" INTEGER,
    "isbn" TEXT,
    "issn" TEXT,
    "edition" TEXT,
    "volume" TEXT,
    "archiveName" TEXT,
    "archiveCode" TEXT,
    "originalLanguage" TEXT,
    "url" TEXT,
    "accessedAt" TIMESTAMP(3),
    "credibilityLevel" "SourceCredibility" NOT NULL DEFAULT 'UNKNOWN',
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceTranslation" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "displayTitle" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Citation" (
    "id" TEXT NOT NULL,
    "factId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "pageFrom" TEXT,
    "pageTo" TEXT,
    "volume" TEXT,
    "chapter" TEXT,
    "excerpt" TEXT,
    "editorNote" TEXT,
    "verificationState" "CitationVerificationState" NOT NULL DEFAULT 'UNVERIFIED',
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Citation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceDocument" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "pageCount" INTEGER,
    "extractedText" TEXT,
    "usageRights" TEXT,
    "rightsHolder" TEXT,
    "accessPolicy" "AccessPolicy" NOT NULL DEFAULT 'METADATA_ONLY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Revision" (
    "id" TEXT NOT NULL,
    "entityType" "EntityKind" NOT NULL,
    "entityId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changeNote" TEXT,
    "changedById" TEXT,
    "factId" TEXT,
    "storyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Revision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" "EntityKind",
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Story" (
    "id" TEXT NOT NULL,
    "canonicalSlug" TEXT NOT NULL,
    "heroMediaId" TEXT,
    "authorId" TEXT,
    "editorialStatus" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Story_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryTranslation" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT,
    "content" TEXT,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "status" "TranslationStatus" NOT NULL DEFAULT 'DRAFT',
    "method" "TranslationMethod" NOT NULL DEFAULT 'ORIGINAL',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoryTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryPlace" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,

    CONSTRAINT "StoryPlace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryPerson" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,

    CONSTRAINT "StoryPerson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryEvent" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,

    CONSTRAINT "StoryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryCitation" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "citationId" TEXT NOT NULL,

    CONSTRAINT "StoryCitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Journey" (
    "id" TEXT NOT NULL,
    "canonicalSlug" TEXT NOT NULL,
    "heroMediaId" TEXT,
    "durationMinutes" INTEGER,
    "distanceMeters" INTEGER,
    "difficulty" TEXT,
    "region" TEXT,
    "routeGeometry" geometry(LineString, 4326),
    "editorialStatus" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Journey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JourneyTranslation" (
    "id" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT,
    "description" TEXT,
    "status" "TranslationStatus" NOT NULL DEFAULT 'DRAFT',
    "method" "TranslationMethod" NOT NULL DEFAULT 'ORIGINAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JourneyTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JourneyStop" (
    "id" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "recommendedDurationMinutes" INTEGER,
    "notes" TEXT,

    CONSTRAINT "JourneyStop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityStory" (
    "id" TEXT NOT NULL,
    "canonicalSlug" TEXT NOT NULL,
    "type" "CommunityStoryType" NOT NULL,
    "authorId" TEXT NOT NULL,
    "heroMediaId" TEXT,
    "verificationState" "CommunityVerificationState" NOT NULL DEFAULT 'PERSONAL_MEMORY',
    "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'VISIBLE',
    "eventDateStart" TIMESTAMP(3),
    "eventDateEnd" TIMESTAMP(3),
    "eventDatePrecision" "DatePrecision" NOT NULL DEFAULT 'UNKNOWN',
    "eventDateLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityStory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityStoryTranslation" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "content" TEXT,
    "status" "TranslationStatus" NOT NULL DEFAULT 'DRAFT',
    "method" "TranslationMethod" NOT NULL DEFAULT 'ORIGINAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityStoryTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityStoryPlace" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,

    CONSTRAINT "CommunityStoryPlace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityStoryPerson" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,

    CONSTRAINT "CommunityStoryPerson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityStoryEvent" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,

    CONSTRAINT "CommunityStoryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityStoryEra" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "eraId" TEXT NOT NULL,

    CONSTRAINT "CommunityStoryEra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "targetType" "EntityKind" NOT NULL,
    "targetId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "parentId" TEXT,
    "body" TEXT NOT NULL,
    "status" "ModerationStatus" NOT NULL DEFAULT 'VISIBLE',
    "score" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommentVote" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bookmark" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetType" "EntityKind" NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bookmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "targetType" "EntityKind" NOT NULL,
    "targetId" TEXT NOT NULL,
    "category" "ReportCategory" NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaceVisit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "visitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "PlaceVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contribution" (
    "id" TEXT NOT NULL,
    "contributorId" TEXT NOT NULL,
    "status" "ContributionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "originSource" TEXT,
    "currentOwner" TEXT,
    "sharingRights" TEXT,
    "approxDateLabel" TEXT,
    "approxDateStart" TIMESTAMP(3),
    "approxDateEnd" TIMESTAMP(3),
    "peopleShown" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "placeId" TEXT,
    "contextNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContributionMedia" (
    "id" TEXT NOT NULL,
    "contributionId" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,

    CONSTRAINT "ContributionMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContributionReviewNote" (
    "id" TEXT NOT NULL,
    "contributionId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "stage" "ContributionStatus" NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContributionReviewNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AuthIdentity_provider_providerUserId_key" ON "AuthIdentity"("provider", "providerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthIdentity_userId_provider_key" ON "AuthIdentity"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_userId_idx" ON "EmailVerificationToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_refreshTokenHash_key" ON "Session"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "MediaAsset_type_idx" ON "MediaAsset"("type");

-- CreateIndex
CREATE INDEX "MediaAsset_sourceId_idx" ON "MediaAsset"("sourceId");

-- CreateIndex
CREATE INDEX "EntityMedia_entityType_entityId_idx" ON "EntityMedia"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "EntityMedia_mediaAssetId_idx" ON "EntityMedia"("mediaAssetId");

-- CreateIndex
CREATE INDEX "EntityAlias_entityType_entityId_idx" ON "EntityAlias"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "EntityAlias_alias_idx" ON "EntityAlias"("alias");

-- CreateIndex
CREATE UNIQUE INDEX "Place_canonicalSlug_key" ON "Place"("canonicalSlug");

-- CreateIndex
CREATE INDEX "Place_type_idx" ON "Place"("type");

-- CreateIndex
CREATE INDEX "Place_parentPlaceId_idx" ON "Place"("parentPlaceId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaceTranslation_placeId_locale_key" ON "PlaceTranslation"("placeId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "PlaceTranslation_locale_slug_key" ON "PlaceTranslation"("locale", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Person_canonicalSlug_key" ON "Person"("canonicalSlug");

-- CreateIndex
CREATE UNIQUE INDEX "PersonTranslation_personId_locale_key" ON "PersonTranslation"("personId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "PersonTranslation_locale_slug_key" ON "PersonTranslation"("locale", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "HistoricalEvent_canonicalSlug_key" ON "HistoricalEvent"("canonicalSlug");

-- CreateIndex
CREATE INDEX "HistoricalEvent_eraId_idx" ON "HistoricalEvent"("eraId");

-- CreateIndex
CREATE INDEX "HistoricalEvent_territoryId_idx" ON "HistoricalEvent"("territoryId");

-- CreateIndex
CREATE UNIQUE INDEX "HistoricalEventTranslation_eventId_locale_key" ON "HistoricalEventTranslation"("eventId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "HistoricalEventTranslation_locale_slug_key" ON "HistoricalEventTranslation"("locale", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "HistoricalEra_canonicalSlug_key" ON "HistoricalEra"("canonicalSlug");

-- CreateIndex
CREATE UNIQUE INDEX "HistoricalEraTranslation_eraId_locale_key" ON "HistoricalEraTranslation"("eraId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "HistoricalEraTranslation_locale_slug_key" ON "HistoricalEraTranslation"("locale", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Dynasty_canonicalSlug_key" ON "Dynasty"("canonicalSlug");

-- CreateIndex
CREATE UNIQUE INDEX "DynastyTranslation_dynastyId_locale_key" ON "DynastyTranslation"("dynastyId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "DynastyTranslation_locale_slug_key" ON "DynastyTranslation"("locale", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Territory_canonicalSlug_key" ON "Territory"("canonicalSlug");

-- CreateIndex
CREATE UNIQUE INDEX "TerritoryTranslation_territoryId_locale_key" ON "TerritoryTranslation"("territoryId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "TerritoryTranslation_locale_slug_key" ON "TerritoryTranslation"("locale", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "EventPlace_eventId_placeId_key" ON "EventPlace"("eventId", "placeId");

-- CreateIndex
CREATE UNIQUE INDEX "EventPerson_eventId_personId_key" ON "EventPerson"("eventId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonDynasty_personId_dynastyId_key" ON "PersonDynasty"("personId", "dynastyId");

-- CreateIndex
CREATE INDEX "HistoricalFact_editorialStatus_idx" ON "HistoricalFact"("editorialStatus");

-- CreateIndex
CREATE INDEX "HistoricalFact_sensitivity_idx" ON "HistoricalFact"("sensitivity");

-- CreateIndex
CREATE UNIQUE INDEX "HistoricalFactTranslation_factId_locale_key" ON "HistoricalFactTranslation"("factId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "FactPlace_factId_placeId_key" ON "FactPlace"("factId", "placeId");

-- CreateIndex
CREATE UNIQUE INDEX "FactPerson_factId_personId_key" ON "FactPerson"("factId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "FactEvent_factId_eventId_key" ON "FactEvent"("factId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "FactEra_factId_eraId_key" ON "FactEra"("factId", "eraId");

-- CreateIndex
CREATE UNIQUE INDEX "FactTerritory_factId_territoryId_key" ON "FactTerritory"("factId", "territoryId");

-- CreateIndex
CREATE INDEX "Source_sourceType_idx" ON "Source"("sourceType");

-- CreateIndex
CREATE UNIQUE INDEX "SourceTranslation_sourceId_locale_key" ON "SourceTranslation"("sourceId", "locale");

-- CreateIndex
CREATE INDEX "Citation_factId_idx" ON "Citation"("factId");

-- CreateIndex
CREATE INDEX "Citation_sourceId_idx" ON "Citation"("sourceId");

-- CreateIndex
CREATE INDEX "SourceDocument_sourceId_idx" ON "SourceDocument"("sourceId");

-- CreateIndex
CREATE INDEX "Revision_entityType_entityId_idx" ON "Revision"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE UNIQUE INDEX "Story_canonicalSlug_key" ON "Story"("canonicalSlug");

-- CreateIndex
CREATE INDEX "Story_editorialStatus_idx" ON "Story"("editorialStatus");

-- CreateIndex
CREATE UNIQUE INDEX "StoryTranslation_storyId_locale_key" ON "StoryTranslation"("storyId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "StoryTranslation_locale_slug_key" ON "StoryTranslation"("locale", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "StoryPlace_storyId_placeId_key" ON "StoryPlace"("storyId", "placeId");

-- CreateIndex
CREATE UNIQUE INDEX "StoryPerson_storyId_personId_key" ON "StoryPerson"("storyId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "StoryEvent_storyId_eventId_key" ON "StoryEvent"("storyId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "StoryCitation_storyId_citationId_key" ON "StoryCitation"("storyId", "citationId");

-- CreateIndex
CREATE UNIQUE INDEX "Journey_canonicalSlug_key" ON "Journey"("canonicalSlug");

-- CreateIndex
CREATE INDEX "Journey_editorialStatus_idx" ON "Journey"("editorialStatus");

-- CreateIndex
CREATE UNIQUE INDEX "JourneyTranslation_journeyId_locale_key" ON "JourneyTranslation"("journeyId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "JourneyTranslation_locale_slug_key" ON "JourneyTranslation"("locale", "slug");

-- CreateIndex
CREATE INDEX "JourneyStop_journeyId_order_idx" ON "JourneyStop"("journeyId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "JourneyStop_journeyId_placeId_key" ON "JourneyStop"("journeyId", "placeId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityStory_canonicalSlug_key" ON "CommunityStory"("canonicalSlug");

-- CreateIndex
CREATE INDEX "CommunityStory_authorId_idx" ON "CommunityStory"("authorId");

-- CreateIndex
CREATE INDEX "CommunityStory_moderationStatus_idx" ON "CommunityStory"("moderationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityStoryTranslation_storyId_locale_key" ON "CommunityStoryTranslation"("storyId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityStoryTranslation_locale_slug_key" ON "CommunityStoryTranslation"("locale", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityStoryPlace_storyId_placeId_key" ON "CommunityStoryPlace"("storyId", "placeId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityStoryPerson_storyId_personId_key" ON "CommunityStoryPerson"("storyId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityStoryEvent_storyId_eventId_key" ON "CommunityStoryEvent"("storyId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityStoryEra_storyId_eraId_key" ON "CommunityStoryEra"("storyId", "eraId");

-- CreateIndex
CREATE INDEX "Comment_targetType_targetId_idx" ON "Comment"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "Comment_parentId_idx" ON "Comment"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "CommentVote_commentId_userId_key" ON "CommentVote"("commentId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Bookmark_userId_targetType_targetId_key" ON "Bookmark"("userId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "Report_targetType_targetId_idx" ON "Report"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "Report_status_idx" ON "Report"("status");

-- CreateIndex
CREATE INDEX "PlaceVisit_userId_idx" ON "PlaceVisit"("userId");

-- CreateIndex
CREATE INDEX "PlaceVisit_placeId_idx" ON "PlaceVisit"("placeId");

-- CreateIndex
CREATE INDEX "Contribution_status_idx" ON "Contribution"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ContributionMedia_contributionId_mediaAssetId_key" ON "ContributionMedia"("contributionId", "mediaAssetId");

-- CreateIndex
CREATE INDEX "ContributionReviewNote_contributionId_idx" ON "ContributionReviewNote"("contributionId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_avatarMediaId_fkey" FOREIGN KEY ("avatarMediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthIdentity" ADD CONSTRAINT "AuthIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_parentAssetId_fkey" FOREIGN KEY ("parentAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityMedia" ADD CONSTRAINT "EntityMedia_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Place" ADD CONSTRAINT "Place_parentPlaceId_fkey" FOREIGN KEY ("parentPlaceId") REFERENCES "Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Place" ADD CONSTRAINT "Place_heroMediaId_fkey" FOREIGN KEY ("heroMediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceTranslation" ADD CONSTRAINT "PlaceTranslation_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_heroMediaId_fkey" FOREIGN KEY ("heroMediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonTranslation" ADD CONSTRAINT "PersonTranslation_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricalEvent" ADD CONSTRAINT "HistoricalEvent_eraId_fkey" FOREIGN KEY ("eraId") REFERENCES "HistoricalEra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricalEvent" ADD CONSTRAINT "HistoricalEvent_territoryId_fkey" FOREIGN KEY ("territoryId") REFERENCES "Territory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricalEvent" ADD CONSTRAINT "HistoricalEvent_heroMediaId_fkey" FOREIGN KEY ("heroMediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricalEventTranslation" ADD CONSTRAINT "HistoricalEventTranslation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "HistoricalEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricalEra" ADD CONSTRAINT "HistoricalEra_parentEraId_fkey" FOREIGN KEY ("parentEraId") REFERENCES "HistoricalEra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricalEraTranslation" ADD CONSTRAINT "HistoricalEraTranslation_eraId_fkey" FOREIGN KEY ("eraId") REFERENCES "HistoricalEra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DynastyTranslation" ADD CONSTRAINT "DynastyTranslation_dynastyId_fkey" FOREIGN KEY ("dynastyId") REFERENCES "Dynasty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TerritoryTranslation" ADD CONSTRAINT "TerritoryTranslation_territoryId_fkey" FOREIGN KEY ("territoryId") REFERENCES "Territory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventPlace" ADD CONSTRAINT "EventPlace_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "HistoricalEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventPlace" ADD CONSTRAINT "EventPlace_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventPerson" ADD CONSTRAINT "EventPerson_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "HistoricalEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventPerson" ADD CONSTRAINT "EventPerson_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonDynasty" ADD CONSTRAINT "PersonDynasty_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonDynasty" ADD CONSTRAINT "PersonDynasty_dynastyId_fkey" FOREIGN KEY ("dynastyId") REFERENCES "Dynasty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricalFactTranslation" ADD CONSTRAINT "HistoricalFactTranslation_factId_fkey" FOREIGN KEY ("factId") REFERENCES "HistoricalFact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactPlace" ADD CONSTRAINT "FactPlace_factId_fkey" FOREIGN KEY ("factId") REFERENCES "HistoricalFact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactPlace" ADD CONSTRAINT "FactPlace_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactPerson" ADD CONSTRAINT "FactPerson_factId_fkey" FOREIGN KEY ("factId") REFERENCES "HistoricalFact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactPerson" ADD CONSTRAINT "FactPerson_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactEvent" ADD CONSTRAINT "FactEvent_factId_fkey" FOREIGN KEY ("factId") REFERENCES "HistoricalFact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactEvent" ADD CONSTRAINT "FactEvent_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "HistoricalEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactEra" ADD CONSTRAINT "FactEra_factId_fkey" FOREIGN KEY ("factId") REFERENCES "HistoricalFact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactEra" ADD CONSTRAINT "FactEra_eraId_fkey" FOREIGN KEY ("eraId") REFERENCES "HistoricalEra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactTerritory" ADD CONSTRAINT "FactTerritory_factId_fkey" FOREIGN KEY ("factId") REFERENCES "HistoricalFact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactTerritory" ADD CONSTRAINT "FactTerritory_territoryId_fkey" FOREIGN KEY ("territoryId") REFERENCES "Territory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceTranslation" ADD CONSTRAINT "SourceTranslation_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Citation" ADD CONSTRAINT "Citation_factId_fkey" FOREIGN KEY ("factId") REFERENCES "HistoricalFact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Citation" ADD CONSTRAINT "Citation_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceDocument" ADD CONSTRAINT "SourceDocument_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceDocument" ADD CONSTRAINT "SourceDocument_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Revision" ADD CONSTRAINT "Revision_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Revision" ADD CONSTRAINT "Revision_factId_fkey" FOREIGN KEY ("factId") REFERENCES "HistoricalFact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Revision" ADD CONSTRAINT "Revision_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_heroMediaId_fkey" FOREIGN KEY ("heroMediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryTranslation" ADD CONSTRAINT "StoryTranslation_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryPlace" ADD CONSTRAINT "StoryPlace_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryPlace" ADD CONSTRAINT "StoryPlace_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryPerson" ADD CONSTRAINT "StoryPerson_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryPerson" ADD CONSTRAINT "StoryPerson_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryEvent" ADD CONSTRAINT "StoryEvent_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryEvent" ADD CONSTRAINT "StoryEvent_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "HistoricalEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryCitation" ADD CONSTRAINT "StoryCitation_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryCitation" ADD CONSTRAINT "StoryCitation_citationId_fkey" FOREIGN KEY ("citationId") REFERENCES "Citation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Journey" ADD CONSTRAINT "Journey_heroMediaId_fkey" FOREIGN KEY ("heroMediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyTranslation" ADD CONSTRAINT "JourneyTranslation_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyStop" ADD CONSTRAINT "JourneyStop_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyStop" ADD CONSTRAINT "JourneyStop_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityStory" ADD CONSTRAINT "CommunityStory_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityStory" ADD CONSTRAINT "CommunityStory_heroMediaId_fkey" FOREIGN KEY ("heroMediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityStoryTranslation" ADD CONSTRAINT "CommunityStoryTranslation_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "CommunityStory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityStoryPlace" ADD CONSTRAINT "CommunityStoryPlace_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "CommunityStory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityStoryPlace" ADD CONSTRAINT "CommunityStoryPlace_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityStoryPerson" ADD CONSTRAINT "CommunityStoryPerson_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "CommunityStory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityStoryPerson" ADD CONSTRAINT "CommunityStoryPerson_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityStoryEvent" ADD CONSTRAINT "CommunityStoryEvent_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "CommunityStory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityStoryEvent" ADD CONSTRAINT "CommunityStoryEvent_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "HistoricalEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityStoryEra" ADD CONSTRAINT "CommunityStoryEra_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "CommunityStory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityStoryEra" ADD CONSTRAINT "CommunityStoryEra_eraId_fkey" FOREIGN KEY ("eraId") REFERENCES "HistoricalEra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentVote" ADD CONSTRAINT "CommentVote_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentVote" ADD CONSTRAINT "CommentVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceVisit" ADD CONSTRAINT "PlaceVisit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceVisit" ADD CONSTRAINT "PlaceVisit_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contribution" ADD CONSTRAINT "Contribution_contributorId_fkey" FOREIGN KEY ("contributorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contribution" ADD CONSTRAINT "Contribution_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionMedia" ADD CONSTRAINT "ContributionMedia_contributionId_fkey" FOREIGN KEY ("contributionId") REFERENCES "Contribution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionMedia" ADD CONSTRAINT "ContributionMedia_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionReviewNote" ADD CONSTRAINT "ContributionReviewNote_contributionId_fkey" FOREIGN KEY ("contributionId") REFERENCES "Contribution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionReviewNote" ADD CONSTRAINT "ContributionReviewNote_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

