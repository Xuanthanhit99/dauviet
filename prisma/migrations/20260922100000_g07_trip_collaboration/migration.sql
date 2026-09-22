-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- CreateEnum
CREATE TYPE "TripMemberRole" AS ENUM ('EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "TripInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TripCollaborationEventType" AS ENUM ('MEMBER_JOINED', 'MEMBER_LEFT', 'MEMBER_REMOVED', 'ROLE_CHANGED', 'OWNERSHIP_TRANSFERRED', 'INVITATION_ACCEPTED', 'TRIP_UPDATED', 'DESTINATION_CHANGED', 'DAY_CHANGED', 'ITEM_CHANGED', 'TRANSPORT_CHANGED');

-- NOTE: `prisma migrate diff` also proposed re-adding 'FACT' to EntityKind
-- (already applied by an earlier migration) and dropping 17 trigram/PostGIS
-- GIST search indexes not representable in the Prisma schema DSL. Both are
-- the same known, pre-existing, unrelated drift artifact documented in
-- every prior Global V2 phase's final report (see docs/backend/
-- G05_FINAL_REPORT.md section "Defects found"). Manually stripped here,
-- exactly as every prior phase has done - not introduced or fixed by G07.
ALTER TYPE "EntityKind" ADD VALUE 'TRIP_MEMBER';
ALTER TYPE "EntityKind" ADD VALUE 'TRIP_INVITATION';
ALTER TYPE "EntityKind" ADD VALUE 'TRIP_COLLABORATION_EVENT';

-- CreateTable
CREATE TABLE "TripMember" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "TripMemberRole" NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripInvitation" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "inviterId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "TripMemberRole" NOT NULL,
    "status" "TripInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedByUserId" TEXT,
    "declinedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripCollaborationEvent" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "type" "TripCollaborationEventType" NOT NULL,
    "actorUserId" TEXT,
    "actorSnapshotName" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripCollaborationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TripMember_userId_idx" ON "TripMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TripMember_tripId_userId_key" ON "TripMember"("tripId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TripInvitation_tokenHash_key" ON "TripInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "TripInvitation_tripId_status_idx" ON "TripInvitation"("tripId", "status");

-- CreateIndex
CREATE INDEX "TripInvitation_email_status_idx" ON "TripInvitation"("email", "status");

-- Partial unique index (spec section 18/57): at most one PENDING invitation
-- per (tripId, email) - a real database invariant, not just an
-- application-level pre-check (spec section 56). Prisma's schema DSL has no
-- native primitive for a partial unique index, so this is hand-added here -
-- see docs/backend/G07_PRE_IMPLEMENTATION_REPORT.md section 12.
CREATE UNIQUE INDEX "TripInvitation_tripId_email_pending_key" ON "TripInvitation"("tripId", "email") WHERE "status" = 'PENDING';

-- CreateIndex
CREATE INDEX "TripCollaborationEvent_tripId_createdAt_idx" ON "TripCollaborationEvent"("tripId", "createdAt");

-- AddForeignKey
ALTER TABLE "TripMember" ADD CONSTRAINT "TripMember_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripMember" ADD CONSTRAINT "TripMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripInvitation" ADD CONSTRAINT "TripInvitation_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripInvitation" ADD CONSTRAINT "TripInvitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripInvitation" ADD CONSTRAINT "TripInvitation_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripCollaborationEvent" ADD CONSTRAINT "TripCollaborationEvent_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripCollaborationEvent" ADD CONSTRAINT "TripCollaborationEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
