-- Phase 06: editorial Story/Journey completion. Hand-written offline, same
-- approach as every prior migration in this repo (no live shadow database
-- available for `prisma migrate diff --from-migrations`). This repo's
-- migrations have never been applied to a live database in this sandbox, so
-- the destructive-looking DROP COLUMN / ADD COLUMN pairs below (used where a
-- column's type actually changes) carry no real data-loss risk here -
-- flagged explicitly anyway for anyone applying this against a database
-- that already has real rows.

-- CreateEnum
CREATE TYPE "StoryEditorialStatus" AS ENUM ('DRAFT', 'SOURCE_CHECK', 'EDITORIAL_REVIEW', 'READY', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "StoryType" AS ENUM ('FEATURE', 'HISTORICAL_EXPLAINER', 'PLACE_STORY', 'PERSON_STORY', 'EVENT_STORY', 'ARCHIVE_STORY', 'THEN_AND_NOW', 'CULTURAL_STORY', 'EDITORIAL', 'OTHER');

-- CreateEnum
CREATE TYPE "StoryLinkRole" AS ENUM ('PRIMARY_SUBJECT', 'RELATED', 'MENTIONED', 'LOCATION', 'CONTEXT');

-- AlterTable: Story gains a richer editorial workflow (spec section 17),
-- editorial classification, featured/priority curation, byline, and
-- optimistic-concurrency version. `editorialStatus` changes type from the
-- generic PublicationStatus to the new StoryEditorialStatus - dropped and
-- re-added (no live rows have ever existed against this schema in this
-- sandbox; on a real database with existing rows, map DRAFT/PUBLISHED/
-- ARCHIVED directly and treat IN_REVIEW as EDITORIAL_REVIEW before running
-- this).
DROP INDEX "Story_editorialStatus_idx";
ALTER TABLE "Story" DROP COLUMN "editorialStatus";
ALTER TABLE "Story" ADD COLUMN "editorialStatus" "StoryEditorialStatus" NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "Story" ADD COLUMN "type" "StoryType" NOT NULL DEFAULT 'EDITORIAL';
ALTER TABLE "Story" ADD COLUMN "byline" TEXT;
ALTER TABLE "Story" ADD COLUMN "featured" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Story" ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Story" ADD COLUMN "scheduledAt" TIMESTAMP(3);
ALTER TABLE "Story" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "Story" ADD COLUMN "lastReviewedById" TEXT;
ALTER TABLE "Story" ADD COLUMN "lastReviewedAt" TIMESTAMP(3);
ALTER TABLE "Story" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Story_editorialStatus_idx" ON "Story"("editorialStatus");

-- CreateIndex
CREATE INDEX "Story_featured_priority_idx" ON "Story"("featured", "priority");

-- AlterTable: StoryTranslation gains a subtitle/deck line and its `content`
-- becomes a structured JSON block array (spec section 6/7) rather than raw
-- text/HTML - see apps/api/src/modules/stories/story-body.util.ts.
ALTER TABLE "StoryTranslation" ADD COLUMN "subtitle" TEXT;
ALTER TABLE "StoryTranslation" DROP COLUMN "content";
ALTER TABLE "StoryTranslation" ADD COLUMN "content" JSONB;

-- AlterTable: entity links gain a role so a client never has to guess the
-- primary subject from insertion order (spec section 8/9).
ALTER TABLE "StoryPlace" ADD COLUMN "role" "StoryLinkRole" NOT NULL DEFAULT 'RELATED';
ALTER TABLE "StoryPerson" ADD COLUMN "role" "StoryLinkRole" NOT NULL DEFAULT 'RELATED';
ALTER TABLE "StoryEvent" ADD COLUMN "role" "StoryLinkRole" NOT NULL DEFAULT 'RELATED';

-- CreateTable: explicit editorial-provenance layer (spec section 10).
CREATE TABLE "StoryFact" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "factId" TEXT NOT NULL,

    CONSTRAINT "StoryFact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoryFact_storyId_factId_key" ON "StoryFact"("storyId", "factId");

-- AddForeignKey
ALTER TABLE "StoryFact" ADD CONSTRAINT "StoryFact_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryFact" ADD CONSTRAINT "StoryFact_factId_fkey" FOREIGN KEY ("factId") REFERENCES "HistoricalFact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: StoryCitation gains locator/quote context (spec section 11/12).
ALTER TABLE "StoryCitation" ADD COLUMN "locator" TEXT;
ALTER TABLE "StoryCitation" ADD COLUMN "quoteNote" TEXT;

-- AlterTable: Journey gains route-geometry provenance (spec section 30),
-- scheduling metadata (spec section 23), archive timestamp, and version.
ALTER TABLE "Journey" ADD COLUMN "routeGeometrySource" TEXT;
ALTER TABLE "Journey" ADD COLUMN "scheduledAt" TIMESTAMP(3);
ALTER TABLE "Journey" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "Journey" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: JourneyTranslation gains SEO fields, matching every other
-- translated entity's shape.
ALTER TABLE "JourneyTranslation" ADD COLUMN "seoTitle" TEXT;
ALTER TABLE "JourneyTranslation" ADD COLUMN "seoDescription" TEXT;

-- AlterTable: JourneyStop gains a display-title override and optional
-- Story/Event context links (spec section 26/31), and its ordering index
-- becomes a uniqueness constraint (spec section 26/27 - deterministic,
-- collision-free ordering) rather than a plain lookup index.
DROP INDEX "JourneyStop_journeyId_order_idx";
ALTER TABLE "JourneyStop" ADD COLUMN "stopTitle" TEXT;
ALTER TABLE "JourneyStop" ADD COLUMN "storyId" TEXT;
ALTER TABLE "JourneyStop" ADD COLUMN "eventId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "JourneyStop_journeyId_order_key" ON "JourneyStop"("journeyId", "order");

-- AddForeignKey
ALTER TABLE "JourneyStop" ADD CONSTRAINT "JourneyStop_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyStop" ADD CONSTRAINT "JourneyStop_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "HistoricalEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: Revision gains a Journey-scoped pointer, matching the
-- existing fact/story-scoped pointers (spec section 21/34).
ALTER TABLE "Revision" ADD COLUMN "journeyId" TEXT;

-- AddForeignKey
ALTER TABLE "Revision" ADD CONSTRAINT "Revision_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: lightweight home/editorial curation (spec section 35-37) -
-- deliberately not a CMS layout builder.
CREATE TABLE "EditorialSlot" (
    "id" TEXT NOT NULL,
    "slotKey" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "entityKind" "EntityKind" NOT NULL,
    "entityId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EditorialSlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EditorialSlot_slotKey_order_key" ON "EditorialSlot"("slotKey", "order");

-- CreateIndex
CREATE INDEX "EditorialSlot_slotKey_idx" ON "EditorialSlot"("slotKey");
