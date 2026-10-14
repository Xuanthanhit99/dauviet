-- CreateTable
CREATE TABLE "DestinationWatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DestinationWatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventUpdates" BOOLEAN NOT NULL DEFAULT true,
    "editorialUpdates" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WatchPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "WatchNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DestinationWatch_destinationId_idx" ON "DestinationWatch"("destinationId");

-- CreateIndex
CREATE UNIQUE INDEX "DestinationWatch_userId_destinationId_key" ON "DestinationWatch"("userId", "destinationId");

-- CreateIndex
CREATE UNIQUE INDEX "WatchPreference_userId_key" ON "WatchPreference"("userId");

-- CreateIndex
CREATE INDEX "WatchNotification_userId_createdAt_id_idx" ON "WatchNotification"("userId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "WatchNotification_destinationId_idx" ON "WatchNotification"("destinationId");

-- CreateIndex
CREATE UNIQUE INDEX "WatchNotification_userId_dedupeKey_key" ON "WatchNotification"("userId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "DestinationWatch" ADD CONSTRAINT "DestinationWatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DestinationWatch" ADD CONSTRAINT "DestinationWatch_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchPreference" ADD CONSTRAINT "WatchPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchNotification" ADD CONSTRAINT "WatchNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchNotification" ADD CONSTRAINT "WatchNotification_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
