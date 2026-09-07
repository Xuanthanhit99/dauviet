-- GLOBAL PHASE G02: Provider + Licensing Foundation (Global Backend V2
-- Extension). Hand-written offline, same approach as every prior migration
-- in this repo (no live shadow database available for
-- `prisma migrate diff --from-migrations`). Purely additive: one
-- `AlterEnum ... ADD VALUE` x3 on EntityKind, ten new enums, and seven new
-- tables with their indexes/FKs. No existing Phase 00-12.1 or G01 column,
-- table, or migration is modified, dropped, or retyped. Entirely
-- geography-independent (no FK to Country/Region/City/Destination) and
-- entirely separate from the V1 Source/Citation trust chain (no FK to
-- Source/Citation/HistoricalFact).

-- AlterEnum: EntityKind gains PROVIDER/PROVIDER_LICENSE/PROVIDER_INTEGRATION
-- so the existing generic AuditLog/Revision architecture can reference
-- these new rows without a parallel revision table (spec section 17).
ALTER TYPE "EntityKind" ADD VALUE 'PROVIDER';
ALTER TYPE "EntityKind" ADD VALUE 'PROVIDER_LICENSE';
ALTER TYPE "EntityKind" ADD VALUE 'PROVIDER_INTEGRATION';

-- CreateEnum
CREATE TYPE "ProviderStatus" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'ACTIVE', 'SUSPENDED', 'DISABLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ProviderEnvironment" AS ENUM ('SANDBOX', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "ProviderCredentialMode" AS ENUM ('NONE', 'API_KEY', 'OAUTH2', 'PARTNER_CONTRACT', 'OTHER');

-- CreateEnum
CREATE TYPE "ProviderCapabilityType" AS ENUM ('PLACE_SEARCH', 'PLACE_DETAIL', 'NEARBY_SEARCH', 'TEXT_SEARCH', 'ACCOMMODATION_SEARCH', 'ACCOMMODATION_DETAIL', 'LIVE_PRICE', 'AVAILABILITY', 'RESTAURANT_SEARCH', 'RESTAURANT_DETAIL', 'ACTIVITY_SEARCH', 'ACTIVITY_DETAIL', 'FLIGHT_SEARCH', 'CAR_RENTAL_SEARCH', 'REVIEWS', 'PHOTOS', 'BOOKING_REDIRECT', 'BOOKING_API', 'AFFILIATE_LINK', 'WEBHOOK', 'CONVERSION_REPORTING');

-- CreateEnum
CREATE TYPE "ProviderIntegrationStatus" AS ENUM ('NOT_CONFIGURED', 'PENDING_APPROVAL', 'CONFIGURED', 'ACTIVE', 'SUSPENDED', 'FAILED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ProviderRightState" AS ENUM ('UNKNOWN', 'ALLOWED', 'PROHIBITED', 'CONDITIONAL');

-- CreateEnum
CREATE TYPE "ProviderLicenseStatus" AS ENUM ('DRAFT', 'TERMS_REVIEW', 'LEGAL_REVIEW', 'APPROVED', 'EXPIRED', 'REVOKED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ProviderAttributionRequirement" AS ENUM ('UNKNOWN', 'REQUIRED', 'NOT_REQUIRED', 'CONDITIONAL');

-- CreateEnum
CREATE TYPE "ProviderPolicyEvidenceSourceType" AS ENUM ('OFFICIAL_TERMS', 'OFFICIAL_DEVELOPER_DOC', 'OFFICIAL_PARTNER_DOC', 'OFFICIAL_PRICING_DOC', 'CONTRACT', 'LEGAL_REVIEW', 'OTHER');

-- CreateTable: ExternalProvider - provider-neutral core identity (spec
-- section 5). Not "TravelProvider" - future providers may include maps/
-- currency/weather, not just travel.
CREATE TABLE "ExternalProvider" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "ProviderStatus" NOT NULL DEFAULT 'DRAFT',
  "websiteUrl" TEXT,
  "developerUrl" TEXT,
  "partnerPortalUrl" TEXT,
  "credentialMode" "ProviderCredentialMode" NOT NULL DEFAULT 'NONE',
  "supportedEnvironments" "ProviderEnvironment"[] DEFAULT ARRAY[]::"ProviderEnvironment"[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExternalProvider_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExternalProvider_code_key" ON "ExternalProvider"("code");
CREATE INDEX "ExternalProvider_status_idx" ON "ExternalProvider"("status");

-- CreateTable: ProviderCapability - SUPPORTED_BY_PROVIDER (spec section 7).
CREATE TABLE "ProviderCapability" (
  "id" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "capability" "ProviderCapabilityType" NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProviderCapability_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProviderCapability_providerId_capability_key" ON "ProviderCapability"("providerId", "capability");
CREATE INDEX "ProviderCapability_providerId_idx" ON "ProviderCapability"("providerId");

ALTER TABLE "ProviderCapability"
  ADD CONSTRAINT "ProviderCapability_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ExternalProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: ProviderIntegration - our own account/environment state
-- (spec section 8). credentialReference is an env-var KEY NAME only, never
-- a secret value (spec section 9).
CREATE TABLE "ProviderIntegration" (
  "id" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "environment" "ProviderEnvironment" NOT NULL,
  "status" "ProviderIntegrationStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
  "credentialReference" TEXT,
  "configuredAt" TIMESTAMP(3),
  "lastVerifiedAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProviderIntegration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProviderIntegration_providerId_environment_key" ON "ProviderIntegration"("providerId", "environment");
CREATE INDEX "ProviderIntegration_providerId_idx" ON "ProviderIntegration"("providerId");
CREATE INDEX "ProviderIntegration_status_idx" ON "ProviderIntegration"("status");

ALTER TABLE "ProviderIntegration"
  ADD CONSTRAINT "ProviderIntegration_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ExternalProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: ProviderIntegrationCapability - ENABLED_FOR_OUR_ACCOUNT
-- (spec section 7), distinct from mere provider support above.
CREATE TABLE "ProviderIntegrationCapability" (
  "id" TEXT NOT NULL,
  "integrationId" TEXT NOT NULL,
  "capability" "ProviderCapabilityType" NOT NULL,
  "approvedAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProviderIntegrationCapability_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProviderIntegrationCapability_integrationId_capability_key" ON "ProviderIntegrationCapability"("integrationId", "capability");
CREATE INDEX "ProviderIntegrationCapability_integrationId_idx" ON "ProviderIntegrationCapability"("integrationId");

ALTER TABLE "ProviderIntegrationCapability"
  ADD CONSTRAINT "ProviderIntegrationCapability_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "ProviderIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: ProviderLicense - legal/contractual rights grant (spec
-- sections 10-13). Rights are tri/four-state, never boolean (spec section
-- 11). Scoped to a dataset/product and, optionally, a specific capability.
CREATE TABLE "ProviderLicense" (
  "id" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "datasetOrProduct" TEXT NOT NULL,
  "capability" "ProviderCapabilityType",
  "licenseType" TEXT,
  "status" "ProviderLicenseStatus" NOT NULL DEFAULT 'DRAFT',
  "rightsDisplay" "ProviderRightState" NOT NULL DEFAULT 'UNKNOWN',
  "rightsCache" "ProviderRightState" NOT NULL DEFAULT 'UNKNOWN',
  "rightsStore" "ProviderRightState" NOT NULL DEFAULT 'UNKNOWN',
  "rightsModify" "ProviderRightState" NOT NULL DEFAULT 'UNKNOWN',
  "rightsRedistribute" "ProviderRightState" NOT NULL DEFAULT 'UNKNOWN',
  "rightsCommercialUse" "ProviderRightState" NOT NULL DEFAULT 'UNKNOWN',
  "conditionalNotes" TEXT,
  "attributionRequirement" "ProviderAttributionRequirement" NOT NULL DEFAULT 'UNKNOWN',
  "termsUrl" TEXT NOT NULL,
  "privacyUrl" TEXT,
  "developerTermsUrl" TEXT,
  "effectiveFrom" TIMESTAMP(3),
  "effectiveUntil" TIMESTAMP(3),
  "reviewedAt" TIMESTAMP(3),
  "reviewedById" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProviderLicense_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProviderLicense_providerId_idx" ON "ProviderLicense"("providerId");
CREATE INDEX "ProviderLicense_status_idx" ON "ProviderLicense"("status");
CREATE INDEX "ProviderLicense_providerId_capability_idx" ON "ProviderLicense"("providerId", "capability");

ALTER TABLE "ProviderLicense"
  ADD CONSTRAINT "ProviderLicense_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ExternalProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: ProviderDataPolicy - operational retention/cache
-- configuration (spec section 16), always traces back to the License that
-- authorizes it. Deliberately separate from ProviderLicense (see the
-- schema.prisma domain design note for the full rationale).
CREATE TABLE "ProviderDataPolicy" (
  "id" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "licenseId" TEXT NOT NULL,
  "capability" "ProviderCapabilityType" NOT NULL,
  "cacheAllowed" "ProviderRightState" NOT NULL DEFAULT 'UNKNOWN',
  "maxCacheSeconds" INTEGER,
  "storeIdentityAllowed" "ProviderRightState" NOT NULL DEFAULT 'UNKNOWN',
  "storeContentAllowed" "ProviderRightState" NOT NULL DEFAULT 'UNKNOWN',
  "refreshRequiredAfterSeconds" INTEGER,
  "deleteAfterSeconds" INTEGER,
  "persistentIdentifierAllowed" "ProviderRightState" NOT NULL DEFAULT 'UNKNOWN',
  "policySourceUrl" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProviderDataPolicy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProviderDataPolicy_licenseId_capability_key" ON "ProviderDataPolicy"("licenseId", "capability");
CREATE INDEX "ProviderDataPolicy_providerId_idx" ON "ProviderDataPolicy"("providerId");

ALTER TABLE "ProviderDataPolicy"
  ADD CONSTRAINT "ProviderDataPolicy_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ExternalProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ProviderDataPolicy_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "ProviderLicense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: ProviderAttributionRule - first-class attribution (spec
-- section 14), never left to frontend conditionals.
CREATE TABLE "ProviderAttributionRule" (
  "id" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "licenseId" TEXT,
  "capability" "ProviderCapabilityType",
  "requirement" "ProviderAttributionRequirement" NOT NULL DEFAULT 'UNKNOWN',
  "displayText" TEXT,
  "logoRequired" BOOLEAN NOT NULL DEFAULT false,
  "linkUrl" TEXT,
  "placementNotes" TEXT,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProviderAttributionRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProviderAttributionRule_providerId_idx" ON "ProviderAttributionRule"("providerId");

ALTER TABLE "ProviderAttributionRule"
  ADD CONSTRAINT "ProviderAttributionRule_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ExternalProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ProviderAttributionRule_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "ProviderLicense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: ProviderPolicyEvidence - provenance for a License's rights
-- determination (spec section 18). Metadata/URL/short summary only, never
-- full copyrighted terms text.
CREATE TABLE "ProviderPolicyEvidence" (
  "id" TEXT NOT NULL,
  "licenseId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "accessedAt" TIMESTAMP(3) NOT NULL,
  "sourceType" "ProviderPolicyEvidenceSourceType" NOT NULL,
  "notes" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProviderPolicyEvidence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProviderPolicyEvidence_licenseId_idx" ON "ProviderPolicyEvidence"("licenseId");

ALTER TABLE "ProviderPolicyEvidence"
  ADD CONSTRAINT "ProviderPolicyEvidence_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "ProviderLicense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
