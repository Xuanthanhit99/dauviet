-- G09 - Trip Expense & Settlement (additive-only). See
-- docs/backend/G09_PRE_IMPLEMENTATION_REPORT.md and
-- docs/backend/G09_TRIP_EXPENSE_SETTLEMENT.md for design rationale. Generated
-- by diffing the live dev database (already at the accepted G08 baseline)
-- against the working schema (`prisma migrate diff --from-url <DATABASE_URL>
-- --to-schema-datamodel prisma/schema.prisma --script`) - a read-only
-- introspection of the FROM side, no shadow database involved at all - then
-- reviewed before being placed here by hand.
--
-- Stripped before applying: one spurious `ALTER TYPE "EntityKind" ADD VALUE
-- 'FACT'` plus 17 `DROP INDEX` statements (trigram/GIST indexes) - this is
-- the exact same pre-existing schema-vs-migration-history drift artifact
-- G04/G05/G06/G06.5/G07/G08 have each independently found and stripped the
-- same way (see docs/backend/BACKEND_HANDOFF.md's "Known deferred" notes) -
-- not a G09 change, and not applied here either.

-- CreateEnum
CREATE TYPE "TripExpenseSplitMode" AS ENUM ('EQUAL', 'EXACT', 'PERCENTAGE');

-- AlterEnum
ALTER TYPE "EntityKind" ADD VALUE 'TRIP_EXPENSE';
ALTER TYPE "EntityKind" ADD VALUE 'TRIP_SETTLEMENT';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TripCollaborationEventType" ADD VALUE 'EXPENSE_ADDED';
ALTER TYPE "TripCollaborationEventType" ADD VALUE 'EXPENSE_UPDATED';
ALTER TYPE "TripCollaborationEventType" ADD VALUE 'EXPENSE_DELETED';
ALTER TYPE "TripCollaborationEventType" ADD VALUE 'SETTLEMENT_RECORDED';

-- CreateTable
CREATE TABLE "TripExpense" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "CostCategory" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "payerUserId" TEXT NOT NULL,
    "splitMode" "TripExpenseSplitMode" NOT NULL,
    "occurredOn" DATE NOT NULL,
    "note" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripExpenseShare" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "percentage" DECIMAL(5,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripExpenseShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripSettlement" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "settledAt" DATE NOT NULL,
    "note" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TripExpense_tripId_deletedAt_occurredOn_idx" ON "TripExpense"("tripId", "deletedAt", "occurredOn");

-- CreateIndex
CREATE INDEX "TripExpense_tripId_payerUserId_idx" ON "TripExpense"("tripId", "payerUserId");

-- CreateIndex
CREATE INDEX "TripExpense_tripId_currency_idx" ON "TripExpense"("tripId", "currency");

-- CreateIndex
CREATE INDEX "TripExpenseShare_expenseId_idx" ON "TripExpenseShare"("expenseId");

-- CreateIndex
CREATE INDEX "TripExpenseShare_userId_idx" ON "TripExpenseShare"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TripExpenseShare_expenseId_userId_key" ON "TripExpenseShare"("expenseId", "userId");

-- CreateIndex
CREATE INDEX "TripSettlement_tripId_currency_idx" ON "TripSettlement"("tripId", "currency");

-- CreateIndex
CREATE INDEX "TripSettlement_tripId_settledAt_idx" ON "TripSettlement"("tripId", "settledAt");

-- AddForeignKey
ALTER TABLE "TripExpense" ADD CONSTRAINT "TripExpense_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripExpense" ADD CONSTRAINT "TripExpense_payerUserId_fkey" FOREIGN KEY ("payerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripExpense" ADD CONSTRAINT "TripExpense_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripExpenseShare" ADD CONSTRAINT "TripExpenseShare_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "TripExpense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripExpenseShare" ADD CONSTRAINT "TripExpenseShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripSettlement" ADD CONSTRAINT "TripSettlement_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripSettlement" ADD CONSTRAINT "TripSettlement_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripSettlement" ADD CONSTRAINT "TripSettlement_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripSettlement" ADD CONSTRAINT "TripSettlement_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
