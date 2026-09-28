-- G10 - Affiliate & Commercial Attribution (additive-only). See
-- docs/backend/G10_PRE_IMPLEMENTATION_REPORT.md and
-- docs/backend/G10_AFFILIATE_ATTRIBUTION.md for design rationale. Generated
-- by diffing the live dev database (already at the accepted G09 baseline)
-- against the working schema (`prisma migrate diff --from-url <DATABASE_URL>
-- --to-schema-datamodel prisma/schema.prisma --script`) - a read-only
-- introspection of the FROM side, no shadow database involved at all - then
-- reviewed before being placed here by hand.
--
-- Stripped before applying: one spurious `ALTER TYPE "EntityKind" ADD VALUE
-- 'FACT'` plus 17 `DROP INDEX` statements (trigram/GIST indexes) - the same
-- pre-existing schema-vs-migration-history drift artifact G04/G05/G06/
-- G06.5/G07/G08/G09 have each independently found and stripped the same
-- way (see docs/backend/BACKEND_HANDOFF.md's "Known deferred" notes) - not
-- a G10 change, and not applied here either.

-- CreateEnum
CREATE TYPE "AffiliateSourceSurface" AS ENUM ('DESTINATION_STAY', 'TRIP_STAY', 'DESTINATION_RESTAURANT', 'TRIP_RESTAURANT', 'DESTINATION_ACTIVITY', 'TRIP_ACTIVITY', 'EDITORIAL_ACTIVITY');

-- CreateEnum
CREATE TYPE "AffiliatePlacement" AS ENUM ('PRIMARY_CTA', 'OFFER_CARD', 'COMPARE_LIST', 'ITINERARY');

-- CreateEnum
CREATE TYPE "AffiliateConversionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'REVERSED');

-- CreateEnum
CREATE TYPE "AffiliateEvidenceType" AS ENUM ('PROVIDER_API', 'PROVIDER_REPORT', 'PROVIDER_WEBHOOK', 'APPROVED_IMPORT', 'FIXTURE');

-- AlterEnum
ALTER TYPE "EntityKind" ADD VALUE 'AFFILIATE_CONVERSION';

-- CreateTable
CREATE TABLE "AffiliateSession" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT,
    "tripId" TEXT,
    "destinationId" TEXT,
    "sourceSurface" "AffiliateSourceSurface" NOT NULL,
    "campaignKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateClick" (
    "id" TEXT NOT NULL,
    "affiliateSessionId" TEXT,
    "providerId" TEXT NOT NULL,
    "environment" "ProviderEnvironment" NOT NULL,
    "entityKind" "EntityKind",
    "providerEntityReferenceId" TEXT,
    "providerOfferId" TEXT,
    "surface" "AffiliateSourceSurface" NOT NULL,
    "placement" "AffiliatePlacement",
    "tripId" TEXT,
    "destinationId" TEXT,
    "userId" TEXT,
    "campaignKey" TEXT NOT NULL,
    "redirectUrl" TEXT NOT NULL,
    "redirectTokenHash" TEXT NOT NULL,
    "redirectTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "clickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateClick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderBookingReference" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "externalBookingReference" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "rawStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderBookingReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateConversion" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "providerConversionId" TEXT NOT NULL,
    "affiliateClickId" TEXT,
    "affiliateSessionId" TEXT,
    "providerBookingReferenceId" TEXT,
    "status" "AffiliateConversionStatus" NOT NULL,
    "rawProviderStatus" TEXT,
    "bookingAmount" DECIMAL(12,2),
    "bookingCurrency" TEXT,
    "commissionAmount" DECIMAL(12,2),
    "commissionCurrency" TEXT,
    "providerOccurredAt" TIMESTAMP(3) NOT NULL,
    "reportedAt" TIMESTAMP(3) NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "evidenceType" "AffiliateEvidenceType" NOT NULL,
    "evidenceReference" TEXT NOT NULL,
    "evidenceHash" TEXT,
    "policyVersionRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateConversion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateSession_campaignKey_key" ON "AffiliateSession"("campaignKey");

-- CreateIndex
CREATE INDEX "AffiliateSession_providerId_idx" ON "AffiliateSession"("providerId");

-- CreateIndex
CREATE INDEX "AffiliateSession_userId_idx" ON "AffiliateSession"("userId");

-- CreateIndex
CREATE INDEX "AffiliateSession_expiresAt_idx" ON "AffiliateSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateClick_redirectTokenHash_key" ON "AffiliateClick"("redirectTokenHash");

-- CreateIndex
CREATE INDEX "AffiliateClick_affiliateSessionId_idx" ON "AffiliateClick"("affiliateSessionId");

-- CreateIndex
CREATE INDEX "AffiliateClick_providerId_clickedAt_idx" ON "AffiliateClick"("providerId", "clickedAt");

-- CreateIndex
CREATE INDEX "AffiliateClick_redirectTokenExpiresAt_idx" ON "AffiliateClick"("redirectTokenExpiresAt");

-- CreateIndex
CREATE INDEX "ProviderBookingReference_providerId_idx" ON "ProviderBookingReference"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderBookingReference_providerId_externalBookingReferenc_key" ON "ProviderBookingReference"("providerId", "externalBookingReference");

-- CreateIndex
CREATE INDEX "AffiliateConversion_affiliateClickId_idx" ON "AffiliateConversion"("affiliateClickId");

-- CreateIndex
CREATE INDEX "AffiliateConversion_status_idx" ON "AffiliateConversion"("status");

-- CreateIndex
CREATE INDEX "AffiliateConversion_providerId_providerOccurredAt_idx" ON "AffiliateConversion"("providerId", "providerOccurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateConversion_providerId_providerConversionId_key" ON "AffiliateConversion"("providerId", "providerConversionId");

-- AddForeignKey
ALTER TABLE "AffiliateSession" ADD CONSTRAINT "AffiliateSession_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ExternalProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateSession" ADD CONSTRAINT "AffiliateSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateSession" ADD CONSTRAINT "AffiliateSession_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateSession" ADD CONSTRAINT "AffiliateSession_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateClick" ADD CONSTRAINT "AffiliateClick_affiliateSessionId_fkey" FOREIGN KEY ("affiliateSessionId") REFERENCES "AffiliateSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateClick" ADD CONSTRAINT "AffiliateClick_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ExternalProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateClick" ADD CONSTRAINT "AffiliateClick_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateClick" ADD CONSTRAINT "AffiliateClick_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateClick" ADD CONSTRAINT "AffiliateClick_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderBookingReference" ADD CONSTRAINT "ProviderBookingReference_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ExternalProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateConversion" ADD CONSTRAINT "AffiliateConversion_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ExternalProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateConversion" ADD CONSTRAINT "AffiliateConversion_affiliateClickId_fkey" FOREIGN KEY ("affiliateClickId") REFERENCES "AffiliateClick"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateConversion" ADD CONSTRAINT "AffiliateConversion_affiliateSessionId_fkey" FOREIGN KEY ("affiliateSessionId") REFERENCES "AffiliateSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateConversion" ADD CONSTRAINT "AffiliateConversion_providerBookingReferenceId_fkey" FOREIGN KEY ("providerBookingReferenceId") REFERENCES "ProviderBookingReference"("id") ON DELETE SET NULL ON UPDATE CASCADE;
