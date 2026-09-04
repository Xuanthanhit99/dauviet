-- Phase 05.1: derivative-processing idempotency support. Hand-written offline,
-- same approach as every prior migration in this repo (no live shadow
-- database available for `prisma migrate diff --from-migrations`).
--
-- The only schema change this remediation needed: a DB-level uniqueness
-- guarantee that the same (parentAssetId, variantType) pair can never exist
-- twice, so re-running the media-processing job for the same asset upserts
-- the existing derivative row instead of creating a duplicate (spec section
-- 10). Every other Phase 05.1 requirement (real image processing, streaming
-- SHA-256, checksum-mismatch rejection, access-policy inheritance/cascade)
-- is implemented entirely in application code against fields that already
-- existed after the Phase 05 migration - no further schema change was
-- needed or manufactured.

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_parentAssetId_variantType_key" ON "MediaAsset"("parentAssetId", "variantType");
