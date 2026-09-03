-- Phase 02: identity/auth hardening.
-- Hand-written (not generated via `prisma migrate diff --from-migrations`) because
-- that mode requires a live shadow database, unavailable in this sandbox (see
-- docs/backend/BACKEND_FREEZE_REPORT.md). Reviewed by inspection against the
-- schema.prisma diff for this phase - only additive changes, safe on an
-- already-applied database (this repo's migrations have never been applied
-- live yet, so there is no real data-loss risk regardless).

-- AlterEnum: account status gains DISABLED (distinct from SUSPENDED - see docs/backend/AUTH.md)
ALTER TYPE "UserStatus" ADD VALUE 'DISABLED';

-- CreateEnum: lets a session record which kind of client created it (web vs native)
CREATE TYPE "ClientPlatform" AS ENUM ('WEB', 'IOS', 'ANDROID', 'OTHER');

-- AlterTable: Session gains platform + a human-readable revocation reason (never a secret)
ALTER TABLE "Session" ADD COLUMN "platform" "ClientPlatform" NOT NULL DEFAULT 'OTHER';
ALTER TABLE "Session" ADD COLUMN "revokedReason" TEXT;
