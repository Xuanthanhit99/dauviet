-- Phase 04: trust-layer completion (HistoricalFact/Source/Citation/review/audit).
-- Hand-written (not generated via `prisma migrate diff --from-migrations`) because
-- that mode requires a live shadow database, unavailable in this sandbox (see
-- docs/backend/BACKEND_FREEZE_REPORT.md and the Phase 02/03 migrations, which
-- used the same offline approach). Reviewed by inspection against the
-- schema.prisma diff for this phase - additive only (new enum values, one new
-- table, three new nullable columns on an existing table) - safe on an
-- already-applied database, and this repo's migrations have never actually
-- been applied to a live database in this sandbox regardless.

-- AlterEnum: a fact can now be retracted after publication without deleting
-- its history (spec section 37). Distinct from DRAFT - see schema.prisma.
ALTER TYPE "FactEditorialStatus" ADD VALUE 'RETRACTED';

-- AlterEnum: a citation can now be explicitly REJECTED (source reviewed and
-- found not to support the claim), distinct from DISPUTED (spec section 12).
ALTER TYPE "CitationVerificationState" ADD VALUE 'REJECTED';

-- CreateEnum: outcome of one FactReview row (spec section 22).
CREATE TYPE "ReviewDecision" AS ENUM ('APPROVED', 'CHANGES_REQUESTED', 'REJECTED');

-- AlterTable: Source gains archive/deactivate metadata (spec section 35) -
-- prefer archive over hard delete once a Source can be cited.
ALTER TABLE "Source" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "Source" ADD COLUMN "archivedById" TEXT;
ALTER TABLE "Source" ADD COLUMN "archiveReason" TEXT;

-- CreateIndex
CREATE INDEX "Source_archivedAt_idx" ON "Source"("archivedAt");

-- CreateTable: per-stage fact review history (spec section 21) - replaces the
-- "only the latest reviewer" anti-pattern the spec explicitly warns against;
-- HistoricalFact.reviewedById/reviewedAt are kept as a denormalized
-- "latest publish approval" pointer, this table is the full history.
CREATE TABLE "FactReview" (
    "id" TEXT NOT NULL,
    "factId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "stage" "FactEditorialStatus" NOT NULL,
    "decision" "ReviewDecision" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FactReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FactReview_factId_idx" ON "FactReview"("factId");

-- CreateIndex
CREATE INDEX "FactReview_reviewerId_idx" ON "FactReview"("reviewerId");

-- AddForeignKey
ALTER TABLE "FactReview" ADD CONSTRAINT "FactReview_factId_fkey" FOREIGN KEY ("factId") REFERENCES "HistoricalFact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactReview" ADD CONSTRAINT "FactReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
