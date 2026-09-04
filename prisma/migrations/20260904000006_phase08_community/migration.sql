-- Phase 08: Community ("Chuyen nguoi Viet") - UGC stories, comments, votes,
-- badges, moderation. Hand-written offline, same approach as every prior
-- migration in this repo (no live shadow database available for
-- `prisma migrate diff --from-migrations`). Additive only: new columns, two
-- new tables, one new enum, new indexes - no existing column is dropped or
-- retyped.

-- AlterEnum: not needed - CommunityStoryType, CommunityVerificationState,
-- ModerationStatus, ReportCategory, ReportStatus were already complete and
-- correct for this phase's requirements (see docs/backend/
-- COMMUNITY_ARCHITECTURE.md "What already existed"); nothing added here.

-- CreateEnum
CREATE TYPE "BadgeType" AS ENUM ('MEMORY_KEEPER', 'EXPLORER', 'ARCHIVIST', 'STORYTELLER', 'RESEARCHER');

-- AlterTable: CommunityStory gains original-language tracking, edit
-- tracking, a denormalized helpful tally, and an optional Then & Now link.
ALTER TABLE "CommunityStory"
  ADD COLUMN "originalLocale" TEXT NOT NULL DEFAULT 'vi',
  ADD COLUMN "helpfulCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "thenNowComparisonId" TEXT,
  ADD COLUMN "editedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "CommunityStory_thenNowComparisonId_key" ON "CommunityStory"("thenNowComparisonId");

ALTER TABLE "CommunityStory"
  ADD CONSTRAINT "CommunityStory_thenNowComparisonId_fkey"
  FOREIGN KEY ("thenNowComparisonId") REFERENCES "ThenNowComparison"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: Comment gains a stored nesting depth (spec section 31 - bounds
-- reply depth with one read instead of walking parentId ancestry) and an
-- editedAt stamp (spec section 33).
ALTER TABLE "Comment"
  ADD COLUMN "depth" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "editedAt" TIMESTAMP(3);

-- AlterTable: User gains the visited-places privacy toggle (spec section 27).
-- Bookmark has no public-read path at all, so it needs no equivalent column.
ALTER TABLE "User" ADD COLUMN "visitedPlacesPublic" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: StoryVote - single positive "helpful" signal on a
-- CommunityStory (spec section 22). Existence of a row IS the vote.
CREATE TABLE "StoryVote" (
  "id" TEXT NOT NULL,
  "storyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoryVote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StoryVote_storyId_userId_key" ON "StoryVote"("storyId", "userId");

ALTER TABLE "StoryVote"
  ADD CONSTRAINT "StoryVote_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "CommunityStory"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "StoryVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: UserBadge - tasteful, editorial/rule-based recognition (spec
-- section 28). No code path lets a user grant their own badge - only an
-- ADMIN-gated endpoint writes this table.
CREATE TABLE "UserBadge" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "BadgeType" NOT NULL,
  "grantedById" TEXT,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserBadge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserBadge_userId_type_key" ON "UserBadge"("userId", "type");

ALTER TABLE "UserBadge"
  ADD CONSTRAINT "UserBadge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "UserBadge_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
