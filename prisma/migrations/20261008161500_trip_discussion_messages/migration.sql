-- Additive private trip discussion messages. Existing trip and member data is untouched.
CREATE TABLE "TripDiscussionMessage" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" VARCHAR(4000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "TripDiscussionMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TripDiscussionMessage_tripId_createdAt_id_idx" ON "TripDiscussionMessage"("tripId","createdAt","id");
CREATE INDEX "TripDiscussionMessage_authorId_idx" ON "TripDiscussionMessage"("authorId");
ALTER TABLE "TripDiscussionMessage" ADD CONSTRAINT "TripDiscussionMessage_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TripDiscussionMessage" ADD CONSTRAINT "TripDiscussionMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
