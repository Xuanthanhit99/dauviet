-- G08 - Trip Location Sharing (additive-only). See
-- docs/backend/G08_PRE_IMPLEMENTATION_REPORT.md and
-- docs/backend/G08_TRIP_LOCATION_SHARING.md for design rationale. Generated
-- via the safe file-to-file diff tool (`pnpm db:migrate:diff:safe --from
-- HEAD --script`, no shadow database used) and reviewed before being placed
-- here by hand.

-- CreateEnum
CREATE TYPE "TripLocationSharingStatus" AS ENUM ('ACTIVE', 'STOPPED', 'EXPIRED');

-- AlterEnum
ALTER TYPE "EntityKind" ADD VALUE 'TRIP_LOCATION_SHARING';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TripCollaborationEventType" ADD VALUE 'LOCATION_SHARING_STARTED';
ALTER TYPE "TripCollaborationEventType" ADD VALUE 'LOCATION_SHARING_STOPPED';

-- CreateTable
CREATE TABLE "TripLocationSharing" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "TripLocationSharingStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "stoppedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripLocationSharing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripMemberLocation" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracyMeters" DOUBLE PRECISION NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripMemberLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TripLocationSharing_tripId_status_idx" ON "TripLocationSharing"("tripId", "status");

-- CreateIndex
CREATE INDEX "TripLocationSharing_expiresAt_idx" ON "TripLocationSharing"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TripLocationSharing_tripId_userId_key" ON "TripLocationSharing"("tripId", "userId");

-- CreateIndex
CREATE INDEX "TripMemberLocation_tripId_idx" ON "TripMemberLocation"("tripId");

-- CreateIndex
CREATE INDEX "TripMemberLocation_expiresAt_idx" ON "TripMemberLocation"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TripMemberLocation_tripId_userId_key" ON "TripMemberLocation"("tripId", "userId");

-- AddForeignKey
ALTER TABLE "TripLocationSharing" ADD CONSTRAINT "TripLocationSharing_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripLocationSharing" ADD CONSTRAINT "TripLocationSharing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripMemberLocation" ADD CONSTRAINT "TripMemberLocation_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripMemberLocation" ADD CONSTRAINT "TripMemberLocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
