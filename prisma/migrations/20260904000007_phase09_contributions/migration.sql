-- Phase 09: Contributions, provenance review, source intake & knowledge
-- promotion pipeline. Hand-written offline, same approach as every prior
-- migration in this repo (no live shadow database available for
-- `prisma migrate diff --from-migrations`). Additive only: new enums, new
-- columns on the existing Contribution/ContributionReviewNote/MediaAsset/
-- Source/SourceDocument tables, two new tables, new indexes/FKs - no
-- existing column is dropped or retyped.

-- AlterEnum: EntityKind gains SOURCE_DOCUMENT so audit/catalogue-result rows
-- can point precisely at a SourceDocument instead of overloading SOURCE.
-- Postgres requires ALTER TYPE ... ADD VALUE to run outside a transaction
-- block in older versions; each statement here is safe to run standalone.
ALTER TYPE "EntityKind" ADD VALUE 'SOURCE_DOCUMENT';

-- CreateEnum
CREATE TYPE "ContributionType" AS ENUM ('DOCUMENT', 'PHOTO', 'ARCHIVAL_PHOTO', 'MAP', 'ORAL_HISTORY', 'PERSONAL_MEMORY', 'FAMILY_ARCHIVE', 'BOOK_REFERENCE', 'LOCAL_HISTORY', 'CORRECTION', 'OTHER');

-- CreateEnum
CREATE TYPE "ContributionSourceType" AS ENUM ('BOOK', 'ARCHIVE', 'WEBSITE', 'FAMILY_RECORD', 'ORIGINAL_DOCUMENT', 'ORAL_TESTIMONY', 'INSTITUTIONAL', 'OTHER');

-- CreateEnum
CREATE TYPE "ProvenanceConfidence" AS ENUM ('UNASSESSED', 'LOW', 'MEDIUM', 'HIGH', 'CONFIRMED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "ContributionRightsReviewState" AS ENUM ('UNREVIEWED', 'NEEDS_INFORMATION', 'APPROVED_FOR_CATALOGUE', 'RESTRICTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SubmitterRightsDeclaration" AS ENUM ('OWN_MATERIAL', 'HAVE_PERMISSION', 'PUBLICLY_AVAILABLE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ContributionAttribution" AS ENUM ('NAMED', 'ANONYMOUS', 'INSTITUTIONAL');

-- CreateEnum
CREATE TYPE "ContributionReviewDecision" AS ENUM ('APPROVE', 'REJECT', 'REQUEST_INFO', 'RETURN_TO_PREVIOUS_STAGE');

-- CreateEnum
CREATE TYPE "ContributionCatalogueResultType" AS ENUM ('SOURCE', 'SOURCE_DOCUMENT', 'MEDIA_ASSET', 'FACT_DRAFT');

-- AlterTable: Contribution gains a controlled type taxonomy, original-locale
-- preservation, contextual entity/correction-target links, submitter-vs-
-- reviewer rights/provenance separation, sensitivity, rejection/withdrawal
-- tracking, a denormalized latest-review pointer, and an optimistic-
-- concurrency version counter (spec sections 5-13, 40, 53-54, 57-58).
ALTER TABLE "Contribution"
  ADD COLUMN "type" "ContributionType" NOT NULL DEFAULT 'OTHER',
  ADD COLUMN "originalLocale" TEXT NOT NULL DEFAULT 'vi',
  ADD COLUMN "linkedEntityType" "EntityKind",
  ADD COLUMN "linkedEntityId" TEXT,
  ADD COLUMN "correctionTargetType" "EntityKind",
  ADD COLUMN "correctionTargetId" TEXT,
  ADD COLUMN "submitterDeclaration" "SubmitterRightsDeclaration",
  ADD COLUMN "attribution" "ContributionAttribution",
  ADD COLUMN "provenanceConfidence" "ProvenanceConfidence" NOT NULL DEFAULT 'UNASSESSED',
  ADD COLUMN "rightsReviewState" "ContributionRightsReviewState" NOT NULL DEFAULT 'UNREVIEWED',
  ADD COLUMN "sensitivity" "FactSensitivity" NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN "needsInfo" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "rejectionReason" TEXT,
  ADD COLUMN "rejectedById" TEXT,
  ADD COLUMN "rejectedAt" TIMESTAMP(3),
  ADD COLUMN "withdrawnAt" TIMESTAMP(3),
  ADD COLUMN "lastReviewedById" TEXT,
  ADD COLUMN "lastReviewedAt" TIMESTAMP(3),
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "Contribution_contributorId_idx" ON "Contribution"("contributorId");
CREATE INDEX "Contribution_type_idx" ON "Contribution"("type");

-- AlterTable: ContributionReviewNote gains an explicit decision, so review
-- history records not just a note but what was actually decided (spec
-- section 26/27). Nullable for migration-safety on the pre-existing table -
-- every row written by the current service always sets it.
ALTER TABLE "ContributionReviewNote" ADD COLUMN "decision" "ContributionReviewDecision";

-- CreateTable: structured provenance evidence a submitter points to (spec
-- sections 9/10). Never becomes a canonical Source automatically.
CREATE TABLE "ContributionSource" (
    "id" TEXT NOT NULL,
    "contributionId" TEXT NOT NULL,
    "referenceType" "ContributionSourceType" NOT NULL,
    "claimedCreator" TEXT,
    "claimedOwner" TEXT,
    "acquisitionMethod" TEXT,
    "approxDateLabel" TEXT,
    "sourceOrganization" TEXT,
    "archiveCatalogRef" TEXT,
    "publicationInfo" TEXT,
    "url" TEXT,
    "notes" TEXT,
    "evidenceMediaAssetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContributionSource_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContributionSource_contributionId_idx" ON "ContributionSource"("contributionId");

ALTER TABLE "ContributionSource" ADD CONSTRAINT "ContributionSource_contributionId_fkey" FOREIGN KEY ("contributionId") REFERENCES "Contribution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContributionSource" ADD CONSTRAINT "ContributionSource_evidenceMediaAssetId_fkey" FOREIGN KEY ("evidenceMediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: what a CATALOGUED contribution actually produced (spec
-- sections 28/29/52) - one row per canonical output, and the idempotency
-- anchor ContributionsService checks before creating a second canonical
-- record for the same contribution.
CREATE TABLE "ContributionCatalogueResult" (
    "id" TEXT NOT NULL,
    "contributionId" TEXT NOT NULL,
    "resultType" "ContributionCatalogueResultType" NOT NULL,
    "sourceId" TEXT,
    "sourceDocumentId" TEXT,
    "mediaAssetId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContributionCatalogueResult_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContributionCatalogueResult_contributionId_idx" ON "ContributionCatalogueResult"("contributionId");
CREATE INDEX "ContributionCatalogueResult_resultType_idx" ON "ContributionCatalogueResult"("resultType");

ALTER TABLE "ContributionCatalogueResult" ADD CONSTRAINT "ContributionCatalogueResult_contributionId_fkey" FOREIGN KEY ("contributionId") REFERENCES "Contribution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContributionCatalogueResult" ADD CONSTRAINT "ContributionCatalogueResult_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContributionCatalogueResult" ADD CONSTRAINT "ContributionCatalogueResult_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "SourceDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContributionCatalogueResult" ADD CONSTRAINT "ContributionCatalogueResult_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
