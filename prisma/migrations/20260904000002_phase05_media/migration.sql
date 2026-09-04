-- Phase 05: media foundation (upload lifecycle, rights, Then & Now, OCR foundation).
-- Hand-written offline, same approach as the Phase 02/03/04 migrations (no live
-- shadow database available in this sandbox for `prisma migrate diff
-- --from-migrations` - see docs/backend/BACKEND_FREEZE_REPORT.md). Additive only.

-- CreateEnum
CREATE TYPE "MediaAssetStatus" AS ENUM ('PENDING_UPLOAD', 'UPLOADED', 'PROCESSING', 'READY', 'QUARANTINED', 'FAILED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RightsStatus" AS ENUM ('PUBLIC_DOMAIN', 'LICENSED', 'PERMISSION_GRANTED', 'COPYRIGHTED', 'UNKNOWN', 'RESTRICTED', 'COMMUNITY_OWNED');

-- CreateEnum
CREATE TYPE "MediaVariantType" AS ENUM ('THUMBNAIL', 'MEDIUM', 'LARGE', 'OPTIMIZED_WEB');

-- CreateEnum
CREATE TYPE "DocumentOcrStatus" AS ENUM ('NOT_REQUESTED', 'REQUESTED', 'PROCESSING', 'COMPLETE', 'FAILED');

-- AlterTable: MediaAsset gains an explicit upload/processing lifecycle (spec
-- section 13), a declared rights position distinct from free-text license
-- notes (section 6), quarantine/archive metadata (sections 39/41), and an
-- accessible alt-text field (section 35). `status` defaults to
-- PENDING_UPLOAD - no MediaAsset row is ever implicitly "ready" on creation.
ALTER TABLE "MediaAsset" ADD COLUMN "status" "MediaAssetStatus" NOT NULL DEFAULT 'PENDING_UPLOAD';
ALTER TABLE "MediaAsset" ADD COLUMN "altText" TEXT;
ALTER TABLE "MediaAsset" ADD COLUMN "rightsStatus" "RightsStatus" NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "MediaAsset" ADD COLUMN "attributionText" TEXT;
ALTER TABLE "MediaAsset" ADD COLUMN "rightsReviewedById" TEXT;
ALTER TABLE "MediaAsset" ADD COLUMN "rightsReviewedAt" TIMESTAMP(3);
ALTER TABLE "MediaAsset" ADD COLUMN "variantType" "MediaVariantType";
ALTER TABLE "MediaAsset" ADD COLUMN "uploadConfirmedAt" TIMESTAMP(3);
ALTER TABLE "MediaAsset" ADD COLUMN "quarantinedAt" TIMESTAMP(3);
ALTER TABLE "MediaAsset" ADD COLUMN "quarantinedById" TEXT;
ALTER TABLE "MediaAsset" ADD COLUMN "quarantineReason" TEXT;
ALTER TABLE "MediaAsset" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "MediaAsset" ADD COLUMN "archivedById" TEXT;

-- CreateIndex
CREATE INDEX "MediaAsset_status_idx" ON "MediaAsset"("status");

-- CreateTable: optional locale-specific editorial caption/alt text (spec
-- section 34) - most uploads never get a row here and fall back to the flat
-- MediaAsset.caption/altText/title in the uploader's own locale.
CREATE TABLE "MediaAssetTranslation" (
    "id" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "caption" TEXT,
    "altText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAssetTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MediaAssetTranslation_mediaAssetId_locale_key" ON "MediaAssetTranslation"("mediaAssetId", "locale");

-- AddForeignKey
ALTER TABLE "MediaAssetTranslation" ADD CONSTRAINT "MediaAssetTranslation_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: SourceDocument gains an OCR foundation (spec section 23) - a
-- job-state placeholder, not a real OCR engine. `extractedText` (Phase
-- 01/04) is reused as the output store.
ALTER TABLE "SourceDocument" ADD COLUMN "ocrStatus" "DocumentOcrStatus" NOT NULL DEFAULT 'NOT_REQUESTED';
ALTER TABLE "SourceDocument" ADD COLUMN "ocrConfidence" DOUBLE PRECISION;
ALTER TABLE "SourceDocument" ADD COLUMN "ocrReviewedById" TEXT;
ALTER TABLE "SourceDocument" ADD COLUMN "ocrReviewedAt" TIMESTAMP(3);

-- CreateTable: "Xua & Nay" (Then & Now) before/after image pair (spec section 27).
CREATE TABLE "ThenNowComparison" (
    "id" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "beforeMediaId" TEXT NOT NULL,
    "afterMediaId" TEXT NOT NULL,
    "historicalPeriod" TEXT,
    "viewpointNote" TEXT,
    "publicationStatus" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'VISIBLE',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThenNowComparison_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ThenNowComparison_placeId_idx" ON "ThenNowComparison"("placeId");

-- AddForeignKey
ALTER TABLE "ThenNowComparison" ADD CONSTRAINT "ThenNowComparison_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThenNowComparison" ADD CONSTRAINT "ThenNowComparison_beforeMediaId_fkey" FOREIGN KEY ("beforeMediaId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThenNowComparison" ADD CONSTRAINT "ThenNowComparison_afterMediaId_fkey" FOREIGN KEY ("afterMediaId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThenNowComparison" ADD CONSTRAINT "ThenNowComparison_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "ThenNowComparisonTranslation" (
    "id" TEXT NOT NULL,
    "comparisonId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "description" TEXT,
    "status" "TranslationStatus" NOT NULL DEFAULT 'DRAFT',
    "method" "TranslationMethod" NOT NULL DEFAULT 'ORIGINAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThenNowComparisonTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ThenNowComparisonTranslation_comparisonId_locale_key" ON "ThenNowComparisonTranslation"("comparisonId", "locale");

-- AddForeignKey
ALTER TABLE "ThenNowComparisonTranslation" ADD CONSTRAINT "ThenNowComparisonTranslation_comparisonId_fkey" FOREIGN KEY ("comparisonId") REFERENCES "ThenNowComparison"("id") ON DELETE CASCADE ON UPDATE CASCADE;
