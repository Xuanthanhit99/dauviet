-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.

-- NOTE (G05): the pre-existing "EntityKind.FACT" drift and the 17
-- trigram/GIST index DROPs that `prisma migrate dev`'s auto-diff proposes
-- here again (identical to the ones manually stripped from
-- 20260910164143_g05_stay_food_activities/migration.sql - see that file's
-- own note) were removed from this file too. Neither is part of G05; both
-- are flagged separately in docs/backend/G05_STAY_FOOD_ACTIVITIES.md "Known
-- deferred items" for a dedicated fix outside this phase's scope.

ALTER TYPE "EntityKind" ADD VALUE 'ACCOMMODATION';
ALTER TYPE "EntityKind" ADD VALUE 'RESTAURANT';
ALTER TYPE "EntityKind" ADD VALUE 'CUISINE';
ALTER TYPE "EntityKind" ADD VALUE 'DISH';
ALTER TYPE "EntityKind" ADD VALUE 'ATTRACTION';
ALTER TYPE "EntityKind" ADD VALUE 'ACTIVITY';
