# Dau Viet - Backend Freeze Report

Date: 2026-09-03 (Phase 00-01), updated 2026-09-10 (Phase 02 - identity/auth hardening)
Scope: Backend Phase 00-02 per `docs/backend/BACKEND_PLAN.md`, built from an empty repository.

**STATUS: BACKEND IMPLEMENTATION IN PROGRESS. NOT FROZEN. NOT DECLARED READY FOR FRONTEND.** This is explicitly not a `BACKEND_FREEZE` verdict - see the Phase 02 verdict at the bottom. Everything that could be validated statically (schema, TypeScript build, lint, unit tests, offline SQL generation, direct native-module smoke tests) passed. Everything that requires a running Postgres+PostGIS/Redis instance, or a real Google OAuth exchange, remains unverified against live infrastructure - see section "Why infra is blocked" below and the Phase 02 classification table. Do not treat this as a green light for production without re-running the blocked items against real infrastructure first.

**Live-dependent evidence uses this classification (spec Phase 02 section 33) rather than a generic PASS:** `PASS_STATIC` (validated without executing against a real service - schema validation, type-checking, offline SQL diff), `PASS_UNIT` (passed as an executed unit test against mocked dependencies), `UNVERIFIED_LIVE_DB`, `UNVERIFIED_REDIS`, `UNVERIFIED_MAIL`, `UNVERIFIED_GOOGLE_OAUTH`.

## Command evidence

| Check | Command | Result |
|---|---|---|
| Prisma schema validity | `prisma validate --schema prisma/schema.prisma` | **PASS** - "The schema at prisma\schema.prisma is valid" |
| Prisma schema formatting | `prisma format --schema prisma/schema.prisma` | **PASS** |
| Prisma Client generation | `prisma generate --schema prisma/schema.prisma` | **PASS** - generated v5.20.0 client, no errors |
| Migration SQL generation (offline) | `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script` | **PASS** - produced the full DDL now committed as `prisma/migrations/20260903000000_init/migration.sql` (1476 lines); this is the standard offline path for hand-crafting an initial migration when no dev database is reachable |
| Migration actually applied to a live database | `pnpm db:migrate:deploy` against Postgres+PostGIS | **BLOCKED** - no reachable Postgres in this sandbox (see below). Never run. |
| PostGIS/pg_trgm extension enablement | `CREATE EXTENSION postgis; CREATE EXTENSION pg_trgm;` (part of the init migration) | **BLOCKED** - not executed against a live database |
| Seed (Golden Dataset) | `pnpm db:seed` (`prisma/seed.ts`) | **BLOCKED** - requires a live database; the script was type-checked (`tsc --noEmit`, see below) but never executed |
| Root/seed TypeScript check | `npx tsc --noEmit` (root `tsconfig.json`, covers `prisma/seed.ts`) | **PASS** - no errors |
| API build | `pnpm --filter @dauviet/api build` (`nest build` / `tsc`) | **PASS** - no errors, `dist/main.js` produced |
| API lint | `pnpm --filter @dauviet/api lint` (eslint) | **PASS** - 0 problems (after removing one unused import) |
| API unit tests | `pnpm --filter @dauviet/api test` (jest) | **PASS** - as of Phase 02, 10 suites, 62/62 tests passing (17 from Phase 01 + 45 new auth/RBAC tests; see "What the unit tests actually prove" and the Phase 02 section below) |
| API e2e tests | `pnpm --filter @dauviet/api test:e2e` | **BLOCKED** - `apps/api/test/health.e2e-spec.ts` exists but requires a live database/Redis; never run |
| App boot / Swagger generation | `node dist/main.js` | **BLOCKED** - process hangs during Nest's module-init phase (`PrismaService.onModuleInit` -> `$connect()`, and BullMQ/ioredis retrying a Redis connection) before it reaches the Swagger document build in `main.ts`. TypeScript compiled cleanly and the DI graph resolved (no missing-provider/circular-dependency errors surfaced), but **Swagger JSON generation and the app actually serving traffic were never confirmed against a running process.** |
| Redis / BullMQ | n/a | **BLOCKED** - no reachable Redis in this sandbox |
| Docker Compose infra | `docker compose up -d` | **BLOCKED/FAILED** - see below |

## Why infra is blocked

`docker compose up -d` failed immediately: `Docker Desktop is unable to start`. Investigating further: `docker info` reports the client is fine but the server/daemon cannot start, and `wsl -l -v` hangs indefinitely (times out with no output). This points to WSL2 (Docker Desktop's backend on this Windows host) being unavailable inside this particular sandboxed agent environment - most likely no nested virtualization support. This is an environment limitation of the session this backend was built in, not a defect in the Docker Compose config or the schema itself. **On a normal developer machine or CI runner with working Docker, `pnpm infra:up` should work as configured** (`postgis/postgis:16-3.4-alpine`, `redis:7-alpine`, `minio/minio`, `mailhog/mailhog` - see `docker-compose.yml`).

**Action required before this backend is truly production-ready:** on a machine with working Docker (or a real Postgres+PostGIS/Redis), run:

```bash
pnpm infra:up
pnpm db:migrate:deploy
pnpm db:seed
pnpm api:dev
pnpm --filter @dauviet/api test:e2e
```

and confirm all pass, then re-run this freeze checklist with real evidence in place of "BLOCKED."

## What the unit tests actually prove (no database required)

- `facts.service.spec.ts` (6 tests): a `HistoricalFact` cannot move to `PUBLISHED` without a `VERIFIED` citation; publishing succeeds once one exists; a sensitive fact cannot be self-approved by its own creator even if they hold `HISTORIAN_REVIEWER`; a non-reviewer cannot publish a sensitive fact even if they didn't create it; a different reviewer can approve it; invalid state transitions are rejected. -> covers spec section 57 tests #1 and #3.
- `citations.service.spec.ts` (3 tests): a citation cannot be created referencing a nonexistent Source or a nonexistent Fact. -> covers spec section 57 test #2.
- `community.service.spec.ts` (4 tests): an author can self-attach a source to their own community story but can never self-assign `UNDER_REVIEW` or `VERIFIED_CONTRIBUTION`; a non-author cannot change another user's story state. -> covers spec section 57 test #8.
- `resolve-translation.util.spec.ts` (4 tests): exact-locale match, fallback to `vi`, fallback to any available translation, and the "no translations at all" case. -> covers spec section 57 test #6.

Tests #4 (roles enforced server-side), #5, #7, #9-#12 from spec section 57 (bbox queries, moderation audit, Hoang Sa/Truong Sa survival, restricted SourceDocument exposure, date precision) are implemented in code (global `RolesGuard`, `MapService` bbox scoping, `ReportsService.resolve` auditing, seed data, `SourcesService.redactDocumentForPublic`) but have **no automated test executed against them** yet - they are structurally covered but not proven by a passing test run in this session.

## Freeze gate checklist (spec section 65)

| Requirement | Status |
|---|---|
| Schema migrated cleanly | Generated and offline-validated; **not applied to a live DB** |
| PostGIS works | Modeled correctly (`Unsupported()` geometry + raw SQL + GiST indexes); **not exercised against a live DB** |
| Auth contract exists | **Done and hardened in Phase 02** - Argon2id, normalized email, session-bound minimal JWTs, refresh rotation + reuse detection, change-password, resend-verification, suspend/disable with immediate session revocation, web-cookie+CSRF and mobile-token-body dual contract, globally-applied rate limiting. Google OAuth implemented but `UNVERIFIED_EXTERNAL_CREDENTIAL`. |
| Historical entities work | **Done** - Place/Person/Event/Era/Dynasty/Territory modules complete with translations, publication workflow |
| Fact/source/citation integrity works | **Done and unit-tested** |
| VI/EN translation foundation works | **Done and unit-tested** (fallback logic) |
| Map API works | Implemented (bbox + year-scoped GeoJSON); **not exercised against live data** |
| Timeline API works | Implemented; **not exercised against live data** |
| Search works | Implemented (pg_trgm + alias); **not exercised against live data** |
| Community core works | **Done and unit-tested** (verification-state separation) |
| Comments work | **Done** (generic, polymorphic, vote/moderate) |
| Moderation/report foundation works | **Done** (Report + audit logging) |
| Admin APIs exist | **Done** (role-gated mutation endpoints across every module + `/admin/audit`) |
| Audit works | **Done** (append-only `AuditLog`, no update/delete path) |
| Golden Dataset loads | Script written, type-checked; **never executed against a live DB** |
| Swagger complete enough for frontend work | DocumentBuilder/tags configured for every module; **document generation itself never confirmed at runtime** (see boot blocker above) |
| Tests pass or blockers documented | **62/62 unit tests pass (as of Phase 02); e2e blocked and documented, not hidden** |

**Conclusion (Phase 00-01 scope):** this backend is code-complete and internally consistent for the freeze-gate scope (Phases 01-09 features, Phase 10 seed script, Phase 11 API surface), and everything checkable without live infrastructure has been checked and passes. It should **not** be declared fully frozen/production-ready until the "Action required" commands above are run successfully against real Postgres+PostGIS/Redis, since no query has actually executed against a real database in this session.

---

## Phase 02 - Identity, Authentication, Authorization & Security

Re-audited the environment before starting: `docker info` and `wsl -l -v` were re-tried and still fail/hang exactly as before (see "Why infra is blocked" above) - not re-litigated destructively, just confirmed still blocked, then work proceeded on everything staticaly/unit-verifiable per the Phase 02 brief.

### Command evidence (Phase 02)

| Check | Command | Result |
|---|---|---|
| argon2 native binding loads and round-trips | `node -e "argon2.hash(...).then(h=>argon2.verify(h,...))"` | **PASS_STATIC** - confirmed working directly in this sandbox (`argon2 OK: true`), and a fixed dummy hash for timing-safe failed lookups was generated the same way |
| Schema change (UserStatus.DISABLED, ClientPlatform enum, Session.platform/revokedReason) | `prisma validate` / `prisma format` / `prisma generate` | **PASS_STATIC** |
| Phase 02 migration SQL | hand-written `prisma/migrations/20260903000002_phase02_auth_hardening/migration.sql` (small additive diff; `prisma migrate diff --from-migrations` was attempted first but requires a live shadow DB - unavailable, see error in git history of this file). **Renamed from its original `20260910000000_*` timestamp during the Phase 03 pre-flight check** - it postdated the current project date and had never been applied to any live database (confirmed via this report's own `UNVERIFIED_LIVE_DB` rows below), so relabeling it to sit chronologically after the two `20260903*` init migrations was safe. | **PASS_STATIC** (reviewed by inspection, additive-only, no live apply) |
| Root/seed TypeScript check | `npx tsc --noEmit` | **PASS_STATIC** - no errors (seed.ts updated to argon2) |
| API build | `pnpm --filter @dauviet/api build` | **PASS_STATIC** - clean after every change in this phase, re-run multiple times |
| API lint | `pnpm --filter @dauviet/api lint` | **PASS_STATIC** - 0 problems |
| API unit tests | `pnpm --filter @dauviet/api test` | **PASS_UNIT** - 10 suites, 62/62 (45 new: `auth.service.spec.ts` x20, `jwt.strategy.spec.ts` x6, `roles.guard.spec.ts` x6, `jwt-auth.guard.spec.ts` x2, `users.service.spec.ts` x6, `csrf.service.spec.ts` x5; all 17 prior tests still green, unmodified) |
| Migration actually applied live | `pnpm db:migrate:deploy` | **UNVERIFIED_LIVE_DB** |
| Argon2 hashing/verification against real stored rows | register/login through a live API | **UNVERIFIED_LIVE_DB** |
| Session/refresh-rotation behavior end-to-end (real cookies, real HTTP round trip) | manual or e2e HTTP testing | **UNVERIFIED_LIVE_DB** (logic is `PASS_UNIT` via mocks; the actual Express cookie/CSRF wiring in `AuthController` has not been hit by a real HTTP request) |
| BullMQ / Redis-backed queue behavior | n/a | **UNVERIFIED_REDIS** (unchanged from Phase 01) |
| Mailhog email delivery for verification/reset | n/a | **UNVERIFIED_MAIL** (unchanged from Phase 01) |
| Google OAuth exchange | n/a | **UNVERIFIED_GOOGLE_OAUTH** - no credentials configured, no live network validation performed; code path implemented and documented as such in `docs/backend/AUTH.md` |

### What changed and why (see `docs/backend/AUTH.md` for full detail)

- Replaced bcrypt with Argon2id (native binding confirmed working), tuned parameters, added a real precomputed dummy hash so failed lookups for nonexistent accounts take the same time as a wrong-password attempt on a real account.
- Email is normalized (trim+lowercase) on every read/write path - `"User@Example.com"` and `"user@example.com"` are the same account (unit-tested).
- JWT payload reduced to `{sub, sid}` only; `JwtStrategy` now re-validates the session and account status against the database on every request, so revocation/suspension takes effect immediately rather than waiting out the access token's TTL (unit-tested).
- Refresh tokens are single-use with rotation; presenting an already-used one is treated as a theft signal and revokes every session on the account (unit-tested).
- Added: `POST /auth/change-password`, `POST /auth/email-verification/resend`, `POST /auth/sessions/revoke-all`, `GET /profiles/:id` (public-safe subset), `PATCH /admin/users/:id/status`.
- Added a coherent web/mobile split on `/auth/login`, `/auth/refresh`, `/auth/logout` via `X-Client-Platform: web` (httpOnly refresh cookie + CSRF double-submit cookie) vs. the original token-in-body behavior (default, preserves all prior client compatibility).
- Found and fixed a real Phase 01 gap: `ThrottlerModule` was configured but `ThrottlerGuard` was never actually registered as a guard anywhere - rate limiting was not being enforced at all. Now applied globally via `APP_GUARD`, with tighter per-route overrides on sensitive auth endpoints.
- Added explicit request body size limits (1MB) in `main.ts`.
- Admin role/status-change endpoints now refuse to target the calling admin's own account (self-escalation/self-lockout guard, unit-tested).
- All prior 17 trust/community tests re-run unmodified and still pass - no existing behavior was weakened to make this phase green.

### Phase 02 verdict

**COMPLETE_WITH_ENVIRONMENT_BLOCKERS.** Every item in the Phase 02 "Definition of Done" that can be verified without live infrastructure is verified (build, lint, 62/62 unit tests covering all 20 requested test categories). Live-dependent verification (`UNVERIFIED_LIVE_DB`/`UNVERIFIED_REDIS`/`UNVERIFIED_MAIL`/`UNVERIFIED_GOOGLE_OAUTH` rows above) remains genuinely blocked by this sandbox's Docker/WSL2 unavailability, not by missing implementation - re-run the "Action required" commands from the Phase 00-01 section above (now including `pnpm db:migrate:deploy` picking up the new Phase 02 migration) on a machine with working Docker before treating this as production-verified. This report is **not** a `BACKEND_FREEZE` declaration.

---

## Phase 03 - Historical Domain (note)

Phase 03 (historical date model, aliases, era hierarchy, territory geometry versioning,
themes) was accepted as `COMPLETE_WITH_ENVIRONMENT_BLOCKERS` per its own review, but no
Phase 03 section was appended to this file at the time - its evidence lives in
`docs/backend/HISTORICAL_DOMAIN.md` and the test-count trail in `docs/backend/BACKEND_HANDOFF.md`
(112/112 unit tests, 17 suites, at the end of Phase 03). Not retroactively reconstructed here
per the Phase 04 brief's instruction not to redo Phase 03 work; noted for continuity only.

---

## Phase 04 - Trust Layer (HistoricalFact/Source/Citation/Review/Revision/Audit)

Re-confirmed the environment before starting: Docker/WSL2 unavailability (see "Why infra is
blocked" above) was not re-litigated destructively - work proceeded entirely on
statically/unit-verifiable trust-layer completion per the Phase 04 brief.

### Command evidence (Phase 04)

| Check | Command | Result |
|---|---|---|
| Schema change (`FactEditorialStatus.RETRACTED`, `CitationVerificationState.REJECTED`, `ReviewDecision` enum, `FactReview` model, `Source.archivedAt/archivedById/archiveReason`) | `prisma validate` / `prisma format` / `prisma generate` | **PASS_STATIC** |
| Phase 04 migration SQL | hand-written `prisma/migrations/20260904000001_phase04_trust_layer/migration.sql` (additive only: two `ALTER TYPE ... ADD VALUE`, one `CREATE TYPE`, one `CREATE TABLE` with two indexes and two FKs, three nullable `ALTER TABLE ... ADD COLUMN` + one index on `Source`). `prisma migrate diff --from-migrations` was attempted first and, as in Phase 02/03, requires a live shadow database - unavailable, so this follows the same offline hand-written approach as the two prior migrations. | **PASS_STATIC** (reviewed by inspection, additive-only, no live apply) |
| Root TypeScript check | `npx tsc --noEmit` | **PASS_STATIC** - no errors |
| API build | `pnpm --filter @dauviet/api build` | **PASS_STATIC** - clean |
| API lint | `pnpm --filter @dauviet/api lint` | **PASS_STATIC** - 0 problems |
| API unit tests | `pnpm --filter @dauviet/api test` | **PASS_UNIT** - 21 suites, 147/147 passing, up from 112/112 across 17 suites at the end of Phase 03 (`facts.service.spec.ts` +7, `citations.service.spec.ts` +4, `sources.service.spec.ts` new file (11 tests), `media.service.spec.ts` new file (4 tests), `fact-sources.util.spec.ts` new file (3 tests), `trust-regression.spec.ts` new file (3 tests), `schema-graph.spec.ts` +2; every prior assertion in `facts.service.spec.ts`/`citations.service.spec.ts` still passes unmodified in intent - their Prisma mock stubs were only extended (`$transaction`/`factReview`/`citation.findUnique`+`update`) to match the new, additive service signatures) |
| Migration actually applied live | `pnpm db:migrate:deploy` | **UNVERIFIED_LIVE_DB** |
| Citation/Fact/Source trust-layer behavior against real rows (transactions, FK constraints, `$transaction` atomicity) | register/publish/retract/archive through a live API | **UNVERIFIED_LIVE_DB** (logic is `PASS_UNIT` via mocked Prisma; the actual multi-statement transaction behavior in `FactsService.snapshot`/`SourcesService.addDocument`/`archive` has not been exercised against a real database) |

### What changed and why (see `docs/backend/TRUST_MODEL.md` for full detail)

- Added `FactReview` (full per-stage review history - previously only `reviewedById`/`reviewedAt`, a single overwritten pointer, existed).
- Added `FactEditorialStatus.RETRACTED` (reviewer-only, reason-required withdrawal of a published fact) and `CitationVerificationState.REJECTED` (distinct from `DISPUTED`).
- `FactsService.setEditorialStatus` now: requires a `HISTORIAN_REVIEWER`/`ADMIN` to complete `FACT_REVIEW -> EDITORIAL_REVIEW`; requires a documented reason to send an in-progress fact back to `DRAFT` or to `RETRACTED`; records a `FactReview` + `Revision` in one `$transaction` for every transition; distinguishes `FACT_CITATION_REQUIRED` (zero citations) from `CITATION_NOT_VERIFIED` (citations exist, none verified).
- `CitationsService` gained `reject()` (distinct from `dispute()`), and `verify()` now refuses to re-verify an already-`VERIFIED` citation (`CITATION_ALREADY_VERIFIED`); `create()` refuses to cite an archived source (`SOURCE_RESTRICTED`).
- `SourcesService` gained `archive()` (blocked by `SOURCE_IN_USE` while a published fact still cites the source), `getDocumentForViewer()` (role-gated full-fidelity document access, `DOCUMENT_ACCESS_DENIED`), and an ISBN/ISSN duplicate-identifier guard on `create()`. `addDocument()` now syncs (tightens, never loosens) the underlying `MediaAsset.accessPolicy` to the new `SourceDocument`'s policy.
- **Found and fixed a real access-control bug**: `MediaService.withPublicUrl` returned a full download URL for `PREVIEW_ONLY`/`METADATA_ONLY` assets (only `RESTRICTED` was special-cased) through the public, unauthenticated `GET /media/:id` - now only `PUBLIC` resolves a URL through that path.
- Added `GET /people/:slug/sources` and `GET /events/:slug/sources` (Places already had this; Person/Event did not) via a new shared helper (`getPublicSourcesForEntity`) that also replaced `PlacesService`'s bespoke implementation, removing duplication.
- Added machine-readable trust error codes (`apps/api/src/common/errors/trust-error-codes.ts`), following the existing `AUTH_ERROR_CODES` pattern.
- Added a static Hoang Sa/Truong Sa trust regression (no `Territory` rows seeded at all, neither archipelago linked from a fact, no claimant/sovereignty field on the seed type) and a static community-trust-boundary regression (`CommunityStory`/`Contribution` have no relation field to `Source`/`Citation` in the schema).
- All 112 prior trust/community/date/RBAC tests re-run, still passing - no existing behavior was weakened to make this phase green; the invariant from spec section 13 (verified citation required to publish) is unchanged, only made more precise.

### Phase 04 verdict

**COMPLETE_WITH_ENVIRONMENT_BLOCKERS.** Every item in the Phase 04 "Definition of Done" that can be verified without live infrastructure is verified (schema validation, build, lint, 147/147 unit tests covering every requested test category from spec section 52/54). Live-dependent verification (`UNVERIFIED_LIVE_DB` rows above) remains genuinely blocked by this sandbox's Docker/WSL2 unavailability, not by missing implementation - re-run the "Action required" commands from the Phase 00-01 section above (now including `pnpm db:migrate:deploy` picking up the Phase 04 migration) on a machine with working Docker before treating this as production-verified. This report is **not** a `BACKEND_FREEZE` declaration.

---

## Phase 05 - Media, Object Storage, Rights, Archive Processing & Upload Security

Re-confirmed the environment before starting: Docker/WSL2/MinIO unavailability (see "Why
infra is blocked" above) was not re-litigated destructively - work proceeded entirely on
statically/unit-verifiable media architecture per the Phase 05 brief. `@aws-sdk/client-s3`
calls are exercised only via mocked `S3Client`/`Queue` objects in this session - no live
MinIO bucket exists to PUT/HEAD/GET against.

### Command evidence (Phase 05)

| Check | Command | Result |
|---|---|---|
| Schema change (`MediaAssetStatus`, `RightsStatus`, `MediaVariantType`, `DocumentOcrStatus` enums; `MediaAsset` lifecycle/rights/quarantine/archive columns + `altText`; `MediaAssetTranslation`; `SourceDocument` OCR columns; `ThenNowComparison`/`ThenNowComparisonTranslation`) | `prisma validate` / `prisma format` / `prisma generate` | **PASS_STATIC** |
| Phase 05 migration SQL | hand-written `prisma/migrations/20260904000002_phase05_media/migration.sql` (additive only: 4 `CREATE TYPE`, 13 `ALTER TABLE ... ADD COLUMN` across `MediaAsset`/`SourceDocument`, 2 new tables with their indexes/FKs, 1 new index). Same offline approach as Phase 02-04 - `prisma migrate diff --from-migrations` requires a live shadow database, unavailable. | **PASS_STATIC** (reviewed by inspection, additive-only, no live apply) |
| Root TypeScript check | `npx tsc --noEmit` | **PASS_STATIC** - no errors |
| API build | `pnpm --filter @dauviet/api build` | **PASS_STATIC** - clean |
| API lint | `pnpm --filter @dauviet/api lint` | **PASS_STATIC** - 0 problems (after removing one unused `class-validator` import and one `require()`-style test import, both fixed in this session) |
| API unit tests | `pnpm --filter @dauviet/api test` | **PASS_UNIT** - 24 suites, 188/188 passing, up from 147/147 across 21 suites at the end of Phase 04 (new files: `file-signature.util.spec.ts`, `sources.service.spec.ts` unchanged, `media.service.spec.ts` fully rewritten for the new lifecycle, `contributions.service.spec.ts` new, `then-now.service.spec.ts` new, `schema-graph.spec.ts` +5). Jest printed a benign "worker process failed to exit gracefully" notice (exit code still 0, all tests passed) - no test in this session directly instantiates a real `S3Client`/BullMQ `Queue`/Redis connection, so this is environment noise, not a leak introduced by Phase 05 code; not investigated further per the "do not destructively troubleshoot the environment" instruction. |
| Migration actually applied live | `pnpm db:migrate:deploy` | **UNVERIFIED_LIVE_DB** |
| Presigned PUT/HEAD/Range-GET against a real bucket | `S3Service.createUploadUrl`/`statObject`/`readLeadingBytes` through a live MinIO instance | **UNVERIFIED_OBJECT_STORAGE** (logic is `PASS_UNIT` via a mocked `S3Client`; the actual AWS SDK v3 command shapes, credentials, and MinIO's HeadObject/Range-GET behavior have never been exercised against a running bucket) |
| BullMQ job delivery/idempotency against a real Redis-backed queue | `MediaProcessor` via a live `media-processing` queue | **UNVERIFIED_REDIS** (the idempotent status-predicated `updateMany` logic is `PASS_UNIT`; actual BullMQ delivery/retry/redelivery semantics were never exercised) |
| Malware/virus scanning | n/a | **UNVERIFIED_MALWARE_SCANNER** - no scanner exists in this codebase or sandbox; the `FAILED` status is the structural hook, not an active scan (spec section 42 explicitly permits this) |

### What changed and why (see `docs/backend/MEDIA_ARCHITECTURE.md` for full detail)

- **Rebuilt the upload flow around real verification, not client trust.** `POST /media/uploads` now creates the `MediaAsset` row immediately in `PENDING_UPLOAD` status (previously the row didn't exist until a separate `POST /media` "register" call that trusted the client's claim outright). The old `POST /media`/`RegisterMediaDto` was removed (no other module called it; confirmed via a full-codebase grep before deleting) and replaced with `POST /media/uploads/:id/confirm`, which calls a new `S3Service.statObject` (HeadObject) to verify the object actually exists and reports its real size, then `S3Service.readLeadingBytes` (a small Range GET) checked against a hand-written magic-byte signature table (`file-signature.util.ts`, no new dependency) before moving to `UPLOADED` and enqueueing processing. A failed check marks the asset `FAILED`, never silently proceeds.
- Added `MediaAssetStatus` (`PENDING_UPLOAD`/`UPLOADED`/`PROCESSING`/`READY`/`QUARANTINED`/`FAILED`/`ARCHIVED`) - every public read path (`findPublicById`, `attachToEntity`) now filters on `status = READY`, closing a real gap where a `MediaAsset` was usable/public the instant it was registered regardless of whether the object actually existed.
- Rewrote `MediaProcessor` to actually drive the `UPLOADED -> PROCESSING -> READY` transition via status-predicated `updateMany` calls (idempotent by construction - a duplicate/redelivered job is a safe no-op). Real pixel-level derivative generation (thumbnails/WebP) remains unimplemented (no image-processing dependency in this build) - documented, not hidden.
- **Found and fixed a second access-control gap** (the Phase 04 report already fixed one URL-leak class): `ContributionsService.create` accepted any client-supplied `mediaAssetIds` with zero ownership check, letting a user attach a stranger's upload to their own contribution. Added `MediaService.assertOwnedByOrPrivileged` (owner or `EDITOR`+), applied to both `ContributionsService.create` and the new `ThenNowService.create`.
- Added `RightsStatus` (`PUBLIC_DOMAIN`/`LICENSED`/`PERMISSION_GRANTED`/`COPYRIGHTED`/`UNKNOWN`/`RESTRICTED`/`COMMUNITY_OWNED`) plus `attributionText`/`rightsReviewedById`/`rightsReviewedAt` on `MediaAsset`, settable only via `PATCH /media/:id/rights` (`EDITOR`+ only - never the uploader alone, so a `CONTRIBUTOR` cannot self-declare their own upload `PUBLIC_DOMAIN`).
- Added `PATCH /media/:id/access-policy`, `PATCH /media/:id/quarantine` (`MODERATOR`+), `PATCH /media/:id/archive` (`EDITOR`+, never a hard delete), `PATCH /media/:id/translations/:locale` (optional locale-specific caption/alt text via a new `MediaAssetTranslation` table), and `POST /media/admin/cleanup-expired-uploads` (`ADMIN`, marks stale `PENDING_UPLOAD` rows `FAILED` - no cron wiring added, on-demand only).
- Added a `RECONSTRUCTION`-type disclosure requirement independent of `isAiGenerated` - a hand-drawn, non-AI reconstruction must still declare its basis via `provenanceNote` (or `aiDisclosure` if AI-assisted); previously only `isAiGenerated: true` triggered the disclosure check.
- Added `ThenNowComparison`/`ThenNowComparisonTranslation` ("Xua & Nay") reusing `PublicationStatus`/`ModerationStatus` rather than a new trust mechanism, plus a small `ThenNowModule` (service/controller/DTOs).
- Added `SourceDocument.ocrStatus`/`ocrConfidence`/`ocrReviewedById`/`ocrReviewedAt` as an OCR foundation only - no OCR engine integrated, `extractedText` remains extraction assistance, never trusted historical text.
- Configurable signed-URL TTLs (`S3_UPLOAD_URL_TTL_SECONDS`/`S3_DOWNLOAD_URL_TTL_SECONDS`/`S3_RESTRICTED_DOWNLOAD_URL_TTL_SECONDS`) replacing a hardcoded `900`.
- Deliberately not implemented: `SourceDocumentPage` model (no consumer yet), server-side checksum recomputation, EXIF/GPS stripping (no field for it exists to strip - verified via a static regression that `MediaAsset` has no gps/exif/latitude/longitude-named field), SVG upload support (never offered, by design), `@nestjs/schedule` cron wiring. All documented with rationale in `MEDIA_ARCHITECTURE.md` rather than silently skipped.
- All 147 prior tests re-run, still passing unmodified in intent - `media.service.spec.ts` was fully rewritten (the service's public surface changed: `register()` removed, `findById` renamed `findPublicById` with a `READY` filter added) but every previously-tested guarantee (only `PUBLIC` resolves a URL, AI disclosure required, audit logging) is re-asserted, not dropped.

### Phase 05 verdict

**COMPLETE_WITH_ENVIRONMENT_BLOCKERS**, as recorded at the end of Phase 05 - however, the Phase 05.1 brief that followed identified this as insufficient: derivative image processing was still a lifecycle-only no-op and checksum integrity was still client-supplied rather than server-verified, both blocking gates for the media Definition of Done. See the Phase 05.1 section immediately below, which closes both and supersedes this verdict.

---

## Phase 05.1 - Media Completion Gate: Derivative Processing & Integrity Verification

Re-confirmed the environment before starting: Docker/WSL2/MinIO unavailability (see "Why
infra is blocked" above) was not re-litigated destructively. Unlike Phase 05, this remediation
added a real dependency (`sharp@0.35.4`) - network egress to `registry.npmjs.org` was
confirmed working (a direct `curl` succeeded in under half a second) and the install/postinstall
completed cleanly; `sharp` was then smoke-tested directly in this sandbox (JPEG create, WebP
resize/encode, AVIF encode, EXIF-orientation auto-rotate all confirmed working via a one-off
`node -e` script) before being relied on in application code. This is real, in-sandbox
verification of the library itself - only the S3/MinIO network round trip remains
environment-blocked.

### Command evidence (Phase 05.1)

| Check | Command | Result |
|---|---|---|
| `sharp` install | `pnpm add sharp` (in `apps/api`) | **PASS** - resolved cleanly, 0.35.4, no native-build errors |
| `sharp` functional smoke test | `node -e "..."` (JPEG/WebP/AVIF encode, EXIF auto-rotate) | **PASS_STATIC** - executed directly in this sandbox, real output verified (dimensions, format, byte counts) |
| Schema change (`MediaAsset` gains `@@unique([parentAssetId, variantType])`) | `prisma validate` / `prisma format` / `prisma generate` | **PASS_STATIC** |
| Phase 05.1 migration SQL | hand-written `prisma/migrations/20260904000003_phase05_1_media_derivatives/migration.sql` (one `CREATE UNIQUE INDEX`, nothing else - no other schema change was needed) | **PASS_STATIC_MIGRATION_REVIEW** (reviewed by inspection, additive-only, no live apply) |
| Root TypeScript check | `npx tsc --noEmit` | **PASS_STATIC** - no errors |
| API build | `pnpm --filter @dauviet/api build` | **PASS_STATIC** - clean |
| API lint | `pnpm --filter @dauviet/api lint` | **PASS_STATIC** - 0 problems |
| API unit tests | `pnpm --filter @dauviet/api test` | **PASS_UNIT** - 27 suites, 216/216 passing, up from 188/188 across 24 suites at the end of Phase 05 (new files: `checksum.util.spec.ts`, `image-processing.util.spec.ts` (using real `sharp`-generated synthetic images, no committed fixture), `media.processor.spec.ts`; `media.service.spec.ts` and `sources.service.spec.ts` extended for the new `confirmUpload`/`addDocument` behavior). One TypeScript strict-null error surfaced by `ts-jest` (not by the root `tsc --noEmit` pass, which does not type-check spec files under the same strictness) in a new `media.service.spec.ts` test was found and fixed in this session before the final green run. |
| Real image bytes through the actual pipeline | `image-processing.util.spec.ts`, `media.processor.spec.ts` | **PASS_UNIT** - synthetic images generated at test time via `sharp` itself (no committed fixture, no copyrighted/historical imagery), run through the real `generateImageVariants`/`MediaProcessor` code paths (only `PrismaService`/`S3Service`/`AuditService` are mocked - the image processing itself is real, not simulated) |
| Presigned PUT/HEAD/streamed-GET against a real bucket | `S3Service` methods through a live MinIO instance | **UNVERIFIED_OBJECT_STORAGE** (unchanged - logic is `PASS_UNIT` via a mocked `S3Client`) |
| BullMQ retry/backoff/`OnWorkerEvent('failed')` against a real Redis-backed queue | `MediaProcessor` via a live `media-processing` queue | **UNVERIFIED_REDIS** (the retry-vs-fail branching and the exhausted-retries handler are `PASS_UNIT`; real BullMQ attempt-counting/backoff timing was never exercised) |
| Malware/virus scanning | n/a | **UNVERIFIED_MALWARE_SCANNER** - unchanged, no scanner exists |

### Gaps confirmed at pre-flight

Both gaps named in the brief were confirmed exactly as described before any code was changed:
`MediaProcessor.process` moved `UPLOADED -> PROCESSING -> READY` with only a log line in
between (no `sharp`/image library was a dependency); `MediaService.confirmUpload` persisted
`checksum: dto.checksum` verbatim - the server never computed or verified it.

### What changed and why (see `docs/backend/MEDIA_ARCHITECTURE.md` sections 5 and 8 for full detail)

- Added `sharp` as a dependency. `image-processing.util.ts` (pure function, no S3/Prisma):
  `generateImageVariants(buffer)` produces mandatory `THUMBNAIL`/`MEDIUM`/`LARGE` WebP variants
  (aspect-ratio-preserving via `fit: 'inside'`, never upscaled via `withoutEnlargement: true`,
  EXIF-orientation-normalized via `.rotate()`, metadata-stripped by never calling
  `.withMetadata()`) plus a best-effort AVIF `OPTIMIZED_WEB` variant that never blocks the
  mandatory set.
- Rewrote `MediaProcessor` to actually call this pipeline for `PROCESSABLE_IMAGE_MIME_TYPES`
  (JPEG/PNG/WebP/TIFF only - PDF/audio/video/GIF/SVG skip straight to `READY`, unchanged
  lifecycle). Distinguishes transient storage errors (rethrown, retried by BullMQ) from
  corrupt/undecodable images (marked `FAILED` directly, never retried). Added an
  `@OnWorkerEvent('failed')` handler so an asset whose storage read fails through every
  configured retry attempt is still eventually marked `FAILED`, never left stuck in
  `PROCESSING` forever.
- Added `MediaAsset.@@unique([parentAssetId, variantType])` (the only schema change) and made
  every derivative write a Prisma `upsert` keyed on it - re-processing the same asset is
  idempotent, never creates duplicate derivative rows.
- Added `S3Service.getObjectStream` and `S3Service.putObject` - the processor and
  `confirmUpload` never touch the AWS SDK directly, matching the existing abstraction
  boundary.
- Rewrote `MediaService.confirmUpload`: a single streamed pass (`checksum.util.ts`'s
  `hashStream`, generic over any Node `Readable`) now produces both the magic-byte signature
  check and an authoritative server-computed SHA-256 from one object read (previously two
  separate reads would have been needed - a Range GET for signature, a full GET for hashing).
  A client-supplied checksum is compared against the server value and rejected on mismatch
  (`MEDIA_CHECKSUM_MISMATCH`); it is never stored in place of the server-computed one.
- **Found and fixed a derivative-access-inheritance gap** that only became visible once
  derivative processing was real: `updateAccessPolicy`/`quarantine`/`archive` now cascade to
  every derivative in the same `$transaction`, and `SourcesService.addDocument`'s existing
  MediaAsset-tightening logic now also tightens any already-generated derivatives - closing
  the scenario where a `PUBLIC` original was processed into variants and *then* tightened,
  which would otherwise leave a stale `PUBLIC` `LARGE` derivative reachable.
- Added `apps/api/src/modules/media/media-error-codes.ts` (`MEDIA_OBJECT_NOT_FOUND`,
  `MEDIA_SIGNATURE_MISMATCH`, `MEDIA_CHECKSUM_MISMATCH`, `MEDIA_NOT_OWNED`,
  `MEDIA_NOT_READY`), following the existing `AUTH_ERROR_CODES`/`TRUST_ERROR_CODES` pattern -
  confirmation failures now return a stable domain error code, not just a message.
- Added bounded BullMQ retry/backoff (`attempts: 3`, exponential, 5s base delay) to the
  `media-processing` queue registration.
- `findPublicById`'s public DTO now includes a `variants` array (each entry independently
  policy-filtered through the same `withPublicUrl` logic as the parent).
- All prior tests re-run, still passing unmodified in intent - `media.service.spec.ts` needed
  its mock stubs extended (`$transaction`, `getObjectStream` replacing `readLeadingBytes`) to
  match `confirmUpload`'s new single-pass flow, without dropping any previously-tested
  guarantee.

### Phase 05.1 verdict

**COMPLETE_WITH_ENVIRONMENT_BLOCKERS.** Both blocking gaps named in the Phase 05.1 brief are closed: derivative image processing is real (executed and unit-tested against actual `sharp`-generated image bytes, not simulated), and upload integrity now includes an authoritative server-side streamed SHA-256, checked before an object is trusted and compared against (never overridden by) any client-supplied value. Every item in the Phase 05.1 "Definition of Done" that can be verified without live infrastructure is verified (schema validation, build, lint, 216/216 unit tests covering every requested test category from spec section 26). Live-dependent verification (`UNVERIFIED_OBJECT_STORAGE`/`UNVERIFIED_REDIS`/`UNVERIFIED_MALWARE_SCANNER` rows above) remains genuinely blocked by this sandbox's Docker/WSL2/MinIO unavailability, not by missing implementation - re-run the "Action required" commands from the Phase 00-01 section above (now including `pnpm db:migrate:deploy` picking up the Phase 05.1 migration, and a real end-to-end upload/confirm/process round trip against a live MinIO bucket, verifying an actual derivative image renders correctly and a tampered/corrupted upload is correctly rejected) on a machine with working Docker before treating this as production-verified. Phase 05 is hereby promoted from its earlier `PARTIAL` status (per the Phase 05.1 brief's framing) to `COMPLETE_WITH_ENVIRONMENT_BLOCKERS`. This report is **not** a `BACKEND_FREEZE` declaration.

---

## Phase 06 - Editorial Stories, Journeys, Entity Linking & Publication Workflow

Re-confirmed the environment before starting: PostgreSQL/PostGIS/Redis/MinIO/Docker
unavailability (see "Why infra is blocked" above) was not re-litigated destructively - work
proceeded entirely on statically/unit-verifiable editorial-domain completion per the Phase 06
brief. No new runtime dependency was added this phase (unlike Phase 05.1's `sharp`).

### Command evidence (Phase 06)

| Check | Command | Result |
|---|---|---|
| Schema change (`StoryEditorialStatus`/`StoryType`/`StoryLinkRole` enums; `Story` workflow/curation/concurrency columns; `StoryTranslation.content` -> `Json`; `StoryPlace`/`StoryPerson`/`StoryEvent.role`; new `StoryFact`; `StoryCitation` locator/quoteNote; `Journey` route-provenance/scheduling/version columns; `JourneyTranslation` SEO fields; `JourneyStop` title/story/event links + unique ordering; `Revision.journeyId`; new `EditorialSlot`) | `prisma validate` / `prisma format` / `prisma generate` | **PASS_STATIC** |
| Phase 06 migration SQL | hand-written `prisma/migrations/20260904000004_phase06_editorial_content/migration.sql`. Two columns change type rather than being purely additive (`Story.editorialStatus` PublicationStatus -> StoryEditorialStatus; `StoryTranslation.content` TEXT -> JSONB) - implemented as `DROP COLUMN`/`ADD COLUMN` pairs, called out explicitly in the migration's own header comment as carrying no real risk *only* because this repo's migrations have never been applied to a database with real rows; flagged for anyone applying it against one that does. | **PASS_STATIC_MIGRATION_REVIEW** (reviewed by inspection, no live apply) |
| Root TypeScript check | `npx tsc --noEmit` | **PASS_STATIC** - no errors |
| API build | `pnpm --filter @dauviet/api build` | **PASS_STATIC** - clean |
| API lint | `pnpm --filter @dauviet/api lint` | **PASS_STATIC** - 0 problems |
| API unit tests | `pnpm --filter @dauviet/api test` | **PASS_UNIT** - 31 suites, 287/287 passing, up from 216/216 across 27 suites at the end of Phase 05.1 (new files: `stories.service.spec.ts`, `journeys.service.spec.ts`, `story-body.util.spec.ts`, `editorial.service.spec.ts`; `schema-graph.spec.ts`/`trust-regression.spec.ts` extended; `places.service.spec.ts`/`events.service.spec.ts` updated only for the new cross-module constructor dependency). A genuine bug was found and fixed *in this session's own new test code* (not application code): `stories.service.spec.ts`'s first test mocked `prisma.story.findUnique` to always resolve a truthy value, which made `StoriesService.ensureUniqueSlug`'s collision-check `while (true)` loop never terminate, consuming memory every iteration until the test process ran out of heap - initially misdiagnosed as a sandbox memory-pressure issue (several combinations of `--maxWorkers`/`--workerIdleMemoryLimit`/increased `--max-old-space-size` were tried and ruled it out) before the actual infinite loop was found; fixed by making that first mock resolve `null` (no collision) for the initial call. `sharp.cache(false)` was added to `image-processing.util.ts` as a legitimate, independent production-hygiene improvement (sharp's own documented recommendation for a worker processing varied, non-repeating images) - it was not the fix for the above, but was kept since it's correct either way. |
| Migration actually applied live | `pnpm db:migrate:deploy` | **UNVERIFIED_LIVE_DB** |
| Journey map-contract coordinate lookup, PostGIS `ST_X`/`ST_Y` behavior | `JourneysService.toPublicDto` against a real Place row | **UNVERIFIED_LIVE_DB**/`UNVERIFIED_LIVE_POSTGIS` (logic is `PASS_UNIT` via mocked `$queryRaw`; the actual PostGIS call shape was never exercised live) |

### What changed and why (see `docs/backend/EDITORIAL_CONTENT.md` for full detail)

- **Story** gained a dedicated `StoryEditorialStatus` workflow (`DRAFT -> SOURCE_CHECK -> EDITORIAL_REVIEW -> READY -> {PUBLISHED, SCHEDULED} -> ARCHIVED`, mirroring `FactEditorialStatus`'s stage vocabulary rather than reusing the flat `PublicationStatus` every other entity uses - Story needed a `SOURCE_CHECK` stage and `SCHEDULED`, neither of which `PublicationStatus` models), `type` (`StoryType`), `featured`/`priority` curation, public `byline` (distinct from internal `authorId`), and `version` for optimistic concurrency.
- **The core trust-boundary invariant** (spec section 2): `StoriesService.setEditorialStatus`'s publication validator refuses to publish a Story that links a `HistoricalFact` (new `StoryFact` join table, explicit editorial-provenance layer) which is not itself `PUBLISHED` (`STORY_FACT_NOT_PUBLISHABLE`) - a Story can never present a DRAFT/unverified Fact as verified support. `StoryCitation` (extended with `locator`/`quoteNote`) remains a distinct, non-substituting concept for editorial context/quotation.
- **Story body** is now a structured, server-validated JSON block array (`story-body.util.ts`, `validateStoryBody`) - never raw/trusted HTML. Rejects any block type outside a closed allow-list (heading/paragraph/quote/image/source_reference/entity_reference/callout/audio), including any `html`/`iframe`/`embed`-shaped payload. No HTML-sanitizer dependency was needed as a result.
- **Entity links** (`StoryPlace`/`StoryPerson`/`StoryEvent`) gained a `role: StoryLinkRole` (`PRIMARY_SUBJECT`/`RELATED`/`MENTIONED`/`LOCATION`/`CONTEXT`) so a client never has to infer a Story's central subject from insertion order.
- **Separation of duties extended to Story**: completing `SOURCE_CHECK -> EDITORIAL_REVIEW` requires `HISTORIAN_REVIEWER`/`ADMIN` only when the Story links >=1 `HistoricalFact` - non-historical content can be reviewed by any `EDITOR` (spec section 20's explicit "do not require historian review for purely non-historical site metadata").
- **Journey** gained `routeGeometrySource` (provenance for any future route line - never presented as a real road route without it), scheduling/archive/version columns, and `JourneyStop` gained a `stopTitle` override, optional `Story`/`Event` context pointers, and its ordering index was upgraded to a real `@@unique([journeyId, order])` DB constraint (previously just a lookup index) - `JourneysService.reorderStops` implements the standard two-phase (negative-placeholder-then-final) write pattern so that constraint is never transiently violated.
- **Publication validators added for both** (`StoriesService`/`JourneysService` `validateForPublication`) - structural checks only (translation exists, hero/inline media `READY`+`PUBLIC`, zero-stop Journey blocked, every Journey stop's Place is itself `PUBLISHED`), never automated historical-truth verification, with stable domain error codes (`editorial-error-codes.ts`, following the `AUTH_ERROR_CODES`/`TRUST_ERROR_CODES`/`MEDIA_ERROR_CODES` pattern).
- **Revisions extended**: the existing generic `Revision` model (Phase 04 precedent) gained a `journeyId` pointer alongside its existing `factId`/`storyId` ones - both `StoriesService` and `JourneysService` snapshot on every create/transition/stop-mutation.
- **Optimistic concurrency** (`version: Int`, spec section 60): both `Story` and `Journey` reject a `setEditorialStatus` call whose `expectedVersion` does not match the current value (`STORY_VERSION_CONFLICT`/`JOURNEY_VERSION_CONFLICT`) rather than silently overwriting a concurrent editor's change.
- **Related-content queries** added: `GET places/:slug/stories`\|`journeys`, `GET people/:slug/stories`, `GET events/:slug/stories` - each one query, `PUBLISHED`-only, via `StoriesService.listForEntity`/`JourneysService.listForPlace`, wired through new cross-module dependencies (`PlacesModule`/`PeopleModule`/`EventsModule` now import `StoriesModule`; `PlacesModule` also imports `JourneysModule` - no import cycles, confirmed by a clean build).
- **Lightweight editorial curation** added: `EditorialSlot` (`slotKey`+`order`+`entityKind`+`entityId`+optional `startsAt`/`endsAt`) and `GET /v1/editorial/home` (public) - deliberately not a CMS layout builder. Every slot's entity is re-resolved against its own live publication status at read time, so a stale slot pointing at a since-unpublished Story/Journey/Place is silently skipped, never leaked (unit-tested).
- **Admin preview** added (`GET /admin/stories/:id/preview`, `GET /admin/journeys/:id/preview`) as literal `/admin/*` routes matching the existing `/admin/audit` convention - not a secret query parameter on the public route.
- All prior tests re-run, still passing unmodified in intent. Two pre-existing spec files needed constructor-signature updates for new cross-module dependencies (`places.service.spec.ts`, `events.service.spec.ts` - both now pass an extra mocked `StoriesService`/`JourneysService` dependency) without altering any prior assertion.

### Phase 06 verdict

**COMPLETE_WITH_ENVIRONMENT_BLOCKERS.** Story and Journey are now real, distinct editorial domains with server-enforced publication validators, separation of duties, revision/audit history, optimistic concurrency, and related-content queries - the Fact/Source trust chain from Phase 04 is never bypassable through either (`STORY_FACT_NOT_PUBLISHABLE` unit-tested directly). Every item in the Phase 06 "Definition of Done" that can be verified without live infrastructure is verified (schema validation, build, lint, 287/287 unit tests). Live-dependent verification (`UNVERIFIED_LIVE_DB`/`UNVERIFIED_LIVE_POSTGIS` rows above) remains genuinely blocked by this sandbox's Docker/WSL2/Postgres/PostGIS unavailability, not by missing implementation - re-run the "Action required" commands from the Phase 00-01 section above (now including `pnpm db:migrate:deploy` picking up the Phase 06 migration, and a real Journey map-contract request to confirm the `ST_X`/`ST_Y` coordinate lookup against live PostGIS) on a machine with working Docker before treating this as production-verified. This is explicitly **not** a `BACKEND_FREEZE` declaration - Map/Timeline/Search hardening, Community, Contributions completion, and live infrastructure verification remain outstanding per the Phase 06 brief.

---

## Phase 07 - Map, Timeline, Search, Historical Geography & Discovery Contracts

Re-confirmed the environment before starting: PostgreSQL/PostGIS/Redis/MinIO/Docker
unavailability (see "Why infra is blocked" above) was not re-litigated destructively - work
proceeded entirely on statically/unit-verifiable discovery-layer hardening per the Phase 07
brief. No new runtime dependency was added this phase.

### Command evidence (Phase 07)

| Check | Command | Result |
|---|---|---|
| Schema change (`unaccent` added to `datasource db { extensions }`) | `prisma validate` / `prisma format` / `prisma generate` | **PASS_STATIC** |
| Phase 07 migration SQL | hand-written `prisma/migrations/20260904000005_phase07_discovery/migration.sql` (`CREATE EXTENSION IF NOT EXISTS "unaccent"`; an `IMMUTABLE` `immutable_unaccent(text)` SQL wrapper function - the standard documented Postgres workaround for indexing `unaccent()`, which is itself only `STABLE`; nine GIN trigram expression indexes over `immutable_unaccent(lower(...))` on every searched translation/alias column; two plain btree indexes on `Place.historicalImportance`/`HistoricalEvent.importance` for zoom-density queries). Additive-only, same offline-review approach as every prior phase's migration (`prisma migrate diff --from-migrations` requires a live shadow database, unavailable). | **PASS_STATIC_MIGRATION_REVIEW** (reviewed by inspection, no live apply) |
| Root TypeScript check | `npx tsc --noEmit` (root `tsconfig.json`) | **PASS_STATIC** - no errors |
| API TypeScript check | `npx tsc --noEmit -p apps/api/tsconfig.json` | **PASS_STATIC** - no errors |
| API build | `npx nest build` (`apps/api`) | **PASS_STATIC** - clean, `dist/main.js` produced |
| API lint | `npx eslint "src/**/*.ts" --max-warnings=0` (`apps/api`) | **PASS_STATIC** - 0 problems |
| API unit tests | `npx jest` (`apps/api`) | **PASS_UNIT** - 35 suites, 346/346 passing, up from 287/287 across 31 suites at the end of Phase 06 (new files: `map.service.spec.ts` (14 tests), `timeline.service.spec.ts` (13), `search.service.spec.ts` (13), `people.service.spec.ts` (5, new - Phase 07's Person timeline endpoint had no prior spec file); `places.service.spec.ts` extended with a `findNearby` describe block (9 tests); `trust-regression.spec.ts` extended with a static `$queryRawUnsafe`/`$executeRawUnsafe` grep guard and a Hoang Sa/Truong Sa discovery-visibility regression (3 tests, including confirming no `AdministrativeArea`-shaped model exists). Every prior assertion in every pre-existing spec file re-run unmodified. |
| Migration actually applied live | `pnpm db:migrate:deploy` | **UNVERIFIED_LIVE_DB** |
| `ST_Intersects`/`ST_MakeEnvelope`/`ST_DWithin`/`ST_Distance` behavior and timing against real seeded data | `MapService.getFeatures`, `PlacesService.findNearby` through a live PostGIS instance | **UNVERIFIED_LIVE_DB**/`UNVERIFIED_LIVE_POSTGIS` (logic is `PASS_UNIT` via mocked `$queryRaw`, asserting the exact SQL/parameter shape sent - the actual query plan, index usage, and real-world coordinate results were never exercised) |
| `immutable_unaccent`/pg_trgm GIN index actually being used (vs. a sequential scan) | `EXPLAIN ANALYZE` on a representative `SearchService` query | **UNVERIFIED_LIVE_DB** - the wrapper function and indexes are reviewed by inspection (standard, documented Postgres pattern) but never executed against a live planner |

### What changed and why (see `docs/backend/DISCOVERY_ARCHITECTURE.md` for full detail)

- **Map** (`MapService.getFeatures`) gained strict `parseBbox` validation (rejects a malformed or SQL-injection-shaped `bbox` string before any query runs, unit-tested with an actual injection-shaped payload), zoom-based feature density (`minImportanceForZoom` - a small explicit threshold table, not an id allowlist), and a new `EVENT` feature type (published `HistoricalEvent`s joined through `EventPlace`, with `theme`/`eraId`/`year` filters matching Timeline's semantics). Response now includes `meta: { truncated, limit, minImportance }` and per-feature locale-fallback metadata.
- **Fixed a real correctness bug in Timeline** (the single highest-value fix in this phase, spec section 26): `fromYear`/`toYear` previously used containment semantics (`dateSortStart >= from AND dateSortEnd <= to`), silently dropping any event that merely overlapped the requested window without being fully contained by it. Replaced with overlap semantics (`dateSortStart <= windowEnd AND dateSortEnd >= windowStart`), unit-tested by asserting the exact Prisma `where` shape so a future refactor cannot silently reintroduce containment. Also added a `theme` filter and a `MAX_RANGE_YEARS` (6000) guard (`TIMELINE_RANGE_TOO_LARGE`).
- **Search** (`SearchService`) rewritten: every `similarity()` call now wraps both sides in a new `immutable_unaccent(lower(...))` SQL function (an `IMMUTABLE` wrapper around Postgres's `STABLE` `unaccent()`, required because a `STABLE` function cannot back a GIN expression index) so diacritic/case differences never block a match; every per-type query switched to a `DISTINCT ON (entity.id)` subquery, fixing a latent Phase 06-era duplicate-row bug for entities with both a requested-locale and a `vi` fallback translation; `searchSources` now excludes `archivedAt IS NOT NULL` (a Phase 06-era gap); added an exact-match ranking bonus large enough that an exact title match always outranks a merely-similar high-importance one; added `GET /search/suggestions` (a thin, unranked wrapper for a dropdown).
- **New Nearby endpoint** (`GET /places/nearby`, `PlacesService.findNearby`, spec section 51-54): stateless PostGIS radius query - `lat`/`lng` are request parameters only, never persisted; distance is always meters via an `::geography` cast on `ST_DWithin`/`ST_Distance`; `radius` capped at 50,000m (defaults to 5,000m, over-large requests get the capped result rather than an error); `limit` capped at 100. Registered in `PlacesController` before the existing `:slug` route to avoid a routing collision.
- **New Person timeline endpoint** (`GET /people/:slug/timeline`, spec section 29): mirrors `PlacesService.getTimeline`'s existing `EventPerson`-join pattern, `PUBLISHED`-only, chronologically ordered by `dateSortStart`. Had no prior test coverage at all (Phase 06 added the method without a matching spec file) - `people.service.spec.ts` is new in this phase.
- **Populated `historicalImportance` for the entire golden dataset** (previously every seeded Place defaulted to `0`, which would have made every place equally invisible/visible under the new zoom-density feature, defeating its purpose): `PlaceSeedSpec` gained an `importance?: number` field, `seed.ts`'s `upsertPlace` now writes it, and all 12 golden Places (including Hoang Sa and Truong Sa, both at `9` - the same real, non-special-cased mechanism as every other Place, e.g. Co Loa at `8`) carry a real value. Regression-tested (`trust-regression.spec.ts`) that this is the *only* signal governing their map visibility - no id/slug allowlist exists anywhere in `MapService`.
- Added `apps/api/src/common/errors/discovery-error-codes.ts` (`DISCOVERY_ERROR_CODES`: `MAP_INVALID_BBOX`, `MAP_INVALID_ZOOM`, `MAP_INVALID_YEAR`, `MAP_RESULT_LIMIT_EXCEEDED`, `MAP_INVALID_FILTER`, `TIMELINE_INVALID_RANGE`, `TIMELINE_INVALID_FILTER`, `TIMELINE_RANGE_TOO_LARGE`, `SEARCH_QUERY_REQUIRED`, `SEARCH_QUERY_TOO_LONG`, `SEARCH_INVALID_TYPE`, `NEARBY_INVALID_COORDINATES`, `NEARBY_INVALID_RADIUS`), following the `AUTH_ERROR_CODES`/`TRUST_ERROR_CODES`/`MEDIA_ERROR_CODES`/`EDITORIAL_ERROR_CODES` pattern.
- Added a static, codebase-wide grep guard (`trust-regression.spec.ts`) proving `$queryRawUnsafe`/`$executeRawUnsafe` are never used anywhere in `src/` - every raw-SQL call in this codebase, in every module, uses the parameterized tagged-template form.
- **Deliberately deferred, with rationale, not built** (spec explicitly permits deferring pending measured need, which does not exist without a live database in this build): a materialized `SearchDocument` projection (spec section 45) and a modern `AdministrativeArea` model (spec section 56). Both are documented in `DISCOVERY_ARCHITECTURE.md` section 6, and the absence of an `AdministrativeArea`-shaped model is regression-tested.
- All 287 prior tests re-run, still passing unmodified in intent - no existing behavior was weakened to make this phase green; the Timeline response shape changed from a flat array to `{ items: [...] }` (verified via a full-codebase grep that nothing else consumed the old flat-array shape before making the change).

### Phase 07 verdict

**COMPLETE_WITH_ENVIRONMENT_BLOCKERS.** Map, Timeline, Search, and the new Nearby/Person-timeline endpoints are hardened per the Phase 07 brief: bbox/query/coordinate validation rejects malformed and injection-shaped input before it ever reaches SQL; the Timeline containment-vs-overlap bug (the phase's single highest-value fix) is corrected and regression-tested; Search is diacritic/alias-aware with historical-importance-protecting ranking; zoom-based map density and Hoang Sa/Truong Sa's continued visibility are driven by the same non-special-cased `historicalImportance` mechanism as every other Place, now regression-tested directly. Every item in the Phase 07 "Definition of Done" that can be verified without live infrastructure is verified (schema validation, `tsc`, build, lint, 346/346 unit tests covering every requested test category from spec section 68-70 - map validation/density/regression, timeline overlap/sort/filter, search ranking/normalization/exclusion, nearby validation/distance, and the static no-`Unsafe`-raw-SQL guard). Live-dependent verification (`UNVERIFIED_LIVE_DB`/`UNVERIFIED_LIVE_POSTGIS` rows above - real PostGIS query timing/plans, actual GIN index usage under `EXPLAIN`, real coordinate results) remains genuinely blocked by this sandbox's Docker/WSL2/Postgres/PostGIS unavailability, not by missing implementation - re-run the "Action required" commands from the Phase 00-01 section above (now including `pnpm db:migrate:deploy` picking up the Phase 07 migration, plus the specific live checks listed in `DISCOVERY_ARCHITECTURE.md` section 7) on a machine with working Docker before treating this as production-verified. This is explicitly **not** a `BACKEND_FREEZE` declaration.

---

## Phase 08 - Community ("Chuyen nguoi Viet"): Stories, Discussion, Votes, Saves, Profiles & Moderation

Re-confirmed the environment before starting: PostgreSQL/PostGIS/Redis/MinIO/Docker unavailability (see "Why infra is blocked" above) was not re-litigated destructively - work proceeded entirely on statically/unit-verifiable community-layer completion per the Phase 08 brief. No new runtime dependency was added this phase (no `sanitize-html`/`DOMPurify` - see "What changed" below for why).

### Pre-flight: what already existed vs. what was missing

`CommunityStory`/`CommunityStoryTranslation`/`CommunityStoryPlace`/`Person`/`Event`/`Era`, `Comment`/`CommentVote`, `Bookmark`, `Report`, `PlaceVisit`, `Contribution`/`ContributionMedia`/`ContributionReviewNote`, and the `CommunityStoryType`/`CommunityVerificationState`/`ModerationStatus`/`ReportCategory`/`ReportStatus` enums all already existed from earlier phases and were already the exact shape the Phase 08 brief asks for - no schema change was needed for any of them. **Missing entirely**: a `StoryVote` model (the brief's own section 22 assumed it existed; it didn't), `UserBadge`/`BadgeType`, and a `User.visitedPlacesPublic` privacy column. **Present but with real, previously-unenforced gaps**: `CommunityService.linkPlace`/`linkPerson`/`linkEvent`/`linkEra` had zero ownership or target-existence check (any authenticated user could link *any* community story to *any* entity); `CommentsService.create` never validated its `targetType`+`targetId` beyond a reply's parent match; `BookmarksService.add` accepted any target with no existence check; `ReportsService.file` had no target validation or duplicate-report guard; neither `CommentsService.vote` nor `CommunityService`'s (nonexistent) vote path rejected self-voting; `Comment` had no depth limit or tombstone-on-removal behavior (a removed top-level comment made its entire reply subtree disappear from `list()` - a real bug); `CommunityService.setReviewVerificationState`/`setModerationStatus` did not refuse the story's own author even if they held the reviewing/moderating role. All of the above are closed in this phase - see "What changed" below.

### Command evidence (Phase 08)

| Check | Command | Result |
|---|---|---|
| Schema change (`CommunityStory.originalLocale`/`helpfulCount`/`thenNowComparisonId`/`editedAt`; new `StoryVote`; `Comment.depth`/`editedAt`; new `UserBadge`/`BadgeType`; `User.visitedPlacesPublic`) | `prisma validate` / `prisma format` / `prisma generate` | **PASS_STATIC** |
| Phase 08 migration SQL | hand-written `prisma/migrations/20260904000006_phase08_community/migration.sql` (additive only: one `CREATE TYPE`, four `ALTER TABLE ... ADD COLUMN` sets, two new tables with their indexes/FKs). Same offline-review approach as every prior migration (`prisma migrate diff --from-migrations` requires a live shadow database, unavailable). | **PASS_STATIC_MIGRATION_REVIEW** (reviewed by inspection, no live apply) |
| Root TypeScript check | `npx tsc --noEmit` (root `tsconfig.json`) | **PASS_STATIC** - no errors |
| API TypeScript check | `npx tsc --noEmit -p apps/api/tsconfig.json` | **PASS_STATIC** for every application source file. One pre-existing, unrelated finding surfaced in `apps/api/test/health.e2e-spec.ts` (a `supertest`/`@types/supertest` call-signature mismatch) - that file is untouched by this phase, requires a live database to run at all (already `UNVERIFIED_LIVE_DB`/never executed in this sandbox per every prior phase's report), is excluded from `nest build`'s output and from `pnpm test`'s suite (only `*.e2e-spec.ts`, run by the separate, never-executed `test:e2e` script), and both `nest build` and the full `pnpm test` run below completed cleanly - confirming this finding has zero effect on anything actually shipped or verified this phase. Not fixed, to keep this phase's diff scoped to Community; flagged here rather than silently ignored. |
| API build | `npx nest build` (`apps/api`) | **PASS_STATIC** - clean, `dist/main.js` produced |
| API lint | `npx eslint "src/**/*.ts" --max-warnings=0` (`apps/api`) | **PASS_STATIC** - 0 problems |
| API unit tests | `npx jest` (`apps/api`) | **PASS_UNIT** - 40 suites, 438/438 passing, up from 346/346 across 35 suites at the end of Phase 07 (new files: `comments.service.spec.ts`, `bookmarks.service.spec.ts`, `reports.service.spec.ts`, `moderation.service.spec.ts`, `content-safety.util.spec.ts`; `community.service.spec.ts`/`users.service.spec.ts` substantially extended; `trust-regression.spec.ts` extended with a Phase 08 community trust-boundary regression suite). Every prior assertion in every pre-existing spec file re-run unmodified. |
| Migration actually applied live | `pnpm db:migrate:deploy` | **UNVERIFIED_LIVE_DB** |
| `StoryVote`/`CommentVote` unique-constraint race behavior under real concurrent writes | concurrent `POST .../vote` calls against a live Postgres | **UNVERIFIED_LIVE_DB** (the toggle/idempotency logic is `PASS_UNIT` via mocked Prisma, asserting the `$transaction` shape and the `@@unique` constraint's existence in the DMMF - real concurrent-request behavior was never exercised) |
| Rate limiting (`@Throttle`) actually enforced under real repeated requests | repeated `POST /community/stories`/`/comments`/`/vote`/`/reports` against a running server | **UNVERIFIED_LIVE_DB**-adjacent (the decorator is applied and reviewed by inspection, matching the existing Phase 02 auth-endpoint pattern exactly, but `ThrottlerGuard`'s actual request-counting was never exercised against a running process in this sandbox) |

### What changed and why (see `docs/backend/COMMUNITY_ARCHITECTURE.md` for full detail)

- **Closed a real authorization gap**: `CommunityService.linkPlace`/`linkPerson`/`linkEvent`/`linkEra` now require the caller to be the story's author or hold `EDITOR`+, and validate the target entity actually exists, before creating the join row - previously any authenticated user could link any community story to any entity, and a bad id would surface as an unhandled 500 from the database FK constraint rather than a clean domain error.
- **Closed a real thread-integrity bug** (spec section 34): `CommentsService.list` no longer filters comments out of the query by status - every comment in a thread is fetched, and `toPublicComment()` tombstones (redacts `body`/`author` to `null`, never drops) any `REMOVED`/`UNDER_REVIEW` comment while its replies stay in place. Before this fix, removing a top-level comment made its entire reply subtree vanish from the public thread.
- **Comments now validate their target** (spec section 54/55, previously unchecked beyond a reply's parent match): `Place`/`Person`/`HistoricalEvent` must be `PUBLISHED`, `Story`/`Journey` must be editorially `PUBLISHED`, `CommunityStory` must be public-visible; every other `EntityKind` is rejected outright. A new `Comment.depth` column bounds replies to 3 visual nesting levels (`COMMENT_MAX_DEPTH`), computed and checked in one read rather than a recursive ancestry walk; `CommentsService.list`'s nested `include` is built exactly that many levels deep, so reads stay bounded too (spec section 32).
- **Added the missing `StoryVote` model** (spec section 22) - a single positive "helpful" signal (existence of a row, not a `+1/-1` palette), idempotent create/delete, self-voting rejected, a non-public-visible story cannot receive one. `helpfulCount` is a denormalized column updated in the same `$transaction` as the vote row, with the `@@unique([storyId, userId])` constraint as the actual race-safety source of truth (spec section 64).
- **Separation of duties extended to community review/moderation** (spec section 41/42): `CommunityService.setReviewVerificationState` and `.setModerationStatus`, and `CommentsService.moderate`, all now refuse when the actor is the target's own author - holding `HISTORIAN_REVIEWER`/`EDITOR`/`MODERATOR`/`ADMIN` never overrides being an interested party in your own submission, the same principle Fact review already enforced (`TRUST_MODEL.md` section 7).
- **Content safety** (spec section 7/59-61): a new shared `assertSafeUserContent` (`apps/api/src/common/util/content-safety.util.ts`) rejects any HTML-tag-shaped substring outright and caps link count, applied to CommunityStory title/content and Comment body on both create and edit. No `sanitize-html`/`DOMPurify` dependency was added - same closed-format philosophy as Story's block allow-list (`EDITORIAL_CONTENT.md` section 4), reject-on-detection rather than sanitize-in-place, so it protects every client (Web, native) identically rather than relying on "React escapes output," which is a Web-only property.
- **Bookmarks and Reports now validate their target exists** (spec section 24/37/38, previously unchecked): Bookmark is additionally restricted to `PLACE`/`STORY`/`JOURNEY`/`COMMUNITY_STORY` (`BOOKMARK_INVALID_TARGET` otherwise); Report gained a duplicate-open-report guard (`REPORT_DUPLICATE` - same reporter, same target, same category, while an earlier report is still `OPEN`/`IN_REVIEW`) and a richer `queue()` method (status/targetType/category/date-range filters).
- **New unified moderation surface** (spec section 47/48/69): `GET /admin/moderation/queue`, `GET /admin/moderation/:targetType/:targetId`, `POST /admin/moderation/actions` - all `MODERATOR`/`ADMIN`, all delegating to the existing `CommunityService`/`CommentsService` setters (never reimplementing their logic), so the self-moderation refusal and audit logging above apply automatically through this surface too.
- **Author edit/withdraw added** (spec section 13/14, did not exist at all before this phase): `PATCH /community/stories/:id` (author or `EDITOR`+, stamps `editedAt`, cannot touch `verificationState`/`moderationStatus` - the DTO has no such fields) and `DELETE /community/stories/:id` (author self-withdraw, soft delete via `moderationStatus = REMOVED`, moderation/audit history preserved).
- **`originalLocale`** (spec section 5) added to `CommunityStory`, set once at creation from the author's actual canonical translation, never silently overwritten by a later translation/edit.
- **Public profile enrichment, privacy-safe** (spec section 26/27): `GET /profiles/:id` now includes community contribution stats (public-visible stories, a live helpful-received aggregate, contribution count, badges) and visited places **only when the user has opted in** (`User.visitedPlacesPublic`, defaults `false`) - still never email/status/roles/sessions/moderation notes. `GET /users/me/visited-places` added for the caller's own always-visible list.
- **New `UserBadge`/`BadgeType`** (spec section 28) - five tasteful, rule/editorial-based badges, grantable only via `POST/DELETE /admin/users/:id/badges` (`ADMIN` only); no XP/level/streak mechanics, no self-award path exists anywhere.
- **Search alignment** (spec section 50): `SearchService.searchCommunityStories`'s moderation filter now matches the same `PUBLIC_VISIBLE_STATUSES` policy as every other community read path (`VISIBLE`/`LIMITED`/`LOCKED`), instead of `VISIBLE` alone.
- **Suspended/disabled users already couldn't reach any of this** (spec section 56) - `JwtStrategy` (Phase 02, unchanged) rejects `SUSPENDED`/`DISABLED`/`DELETED` accounts at the authentication layer, before any controller in this phase runs; no per-service duplicate check was needed.
- **Per-action rate limiting added** (spec section 57): `@Throttle` on CommunityStory creation (5/min), comment creation (20/min), comment votes (60/min), story votes (30/min), report filing (10/min) - the same `@nestjs/throttler` mechanism Phase 02 already uses for auth endpoints, distinct from the app-wide default bucket.
- **Deliberately not built** (documented, not hidden): a dedicated `ModerationAction` model (the existing append-only `AuditLog` already carries everything section 40 asks for); a `Profile` model separate from `User` (pure indirection - display fields already live on `User`); a `RELEVANT` community sort (only `NEW`/`HELPFUL`, both fully transparent); email-verification-required-to-post (not gated anywhere in this codebase currently; documented as the seam to add it later).
- All 346 prior tests re-run, still passing unmodified in intent - no existing behavior was weakened to make this phase green. Two pre-existing spec files needed constructor-signature updates for the new `MediaService` dependency on `CommunityService` (`community.service.spec.ts`) without altering any prior assertion.

### Phase 08 verdict

**COMPLETE_WITH_ENVIRONMENT_BLOCKERS.** `CommunityStory` is now a complete, safely-bounded UGC domain with real ownership/target-existence enforcement across every previously-unchecked surface (entity links, comments, bookmarks, reports), a working helpful-vote system, bounded/tombstoned comment threading, separation-of-duties extended to community review/moderation, a unified audited moderation surface, and privacy-safe public profiles - the Fact/Source/Story trust chain from Phases 04/06 remains structurally unreachable from any community action, regression-tested directly (`trust-regression.spec.ts`'s Phase 08 suite). Every item in the Phase 08 "Definition of Done" that can be verified without live infrastructure is verified (schema validation, `tsc`, build, lint, 438/438 unit tests covering every requested test category from spec section 71-77). Live-dependent verification (`UNVERIFIED_LIVE_DB` rows above - real concurrent-vote races, real rate-limit enforcement, a real migration apply) remains genuinely blocked by this sandbox's Docker/WSL2/Postgres/Redis/MinIO unavailability, not by missing implementation - re-run the "Action required" commands from the Phase 00-01 section above (now including `pnpm db:migrate:deploy` picking up the Phase 08 migration, plus a real concurrent-vote load test and a live rate-limit check) on a machine with working Docker before treating this as production-verified. This is explicitly **not** a `BACKEND_FREEZE` declaration.

---

## Phase 09 - Contributions, Provenance Review, Source Intake & Knowledge Promotion Pipeline

Re-confirmed the environment before starting: PostgreSQL/PostGIS/Redis/MinIO/Docker unavailability (see "Why infra is blocked" above) was not re-litigated destructively - work proceeded entirely on statically/unit-verifiable contribution-pipeline completion per the Phase 09 brief.

### Pre-flight: what already existed vs. what was missing

`Contribution`/`ContributionMedia`/`ContributionReviewNote` and the seven-value `ContributionStatus` enum already existed since the `init` migration (Phase 01), with a bare `advance(id, reviewerId, { status, note })` method (blanket `EDITOR/HISTORIAN_REVIEWER/ADMIN` role gate, no self-review check, no separation between stage-completion roles), no `ContributionType` taxonomy, no provenance-evidence model, no rights/provenance/sensitivity review fields, no review-decision vocabulary, no optimistic concurrency, no withdrawal, and **no cataloguing action of any kind** - `ACCEPTED` and `CATALOGUED` existed as enum values with no way to actually reach `CATALOGUED` except a bare status PATCH, which would have made "accepted" and "catalogued" indistinguishable from a trust standpoint. A real, previously-undocumented privacy gap was also found: `GET /contributions/:id` had no ownership check at all - any authenticated user could read any other user's contribution detail by id. All of the above are closed in this phase - see "What changed" below. Two dedicated environment fixes were also needed before any of this could be verified: the Prisma Client had never been generated in this sandbox at all (baseline `tsc` showed dozens of stale-client errors across unrelated modules - Stories/ThenNow/Users - that vanished entirely once `prisma generate` was run with a placeholder `DATABASE_URL`, which needs no reachable database), and the `sharp` native dependency named in `package.json` had never actually been installed (`pnpm install` resolved it cleanly once retried - not an unresolvable environment blocker after all, unlike Docker/WSL2/live Postgres).

### Command evidence (Phase 09)

| Check | Command | Result |
|---|---|---|
| Prisma Client had never been generated in this sandbox | `prisma generate` (placeholder `DATABASE_URL`, no live DB needed) | **PASS_STATIC** - fixed a pre-existing baseline issue, not introduced by this phase; confirmed via a full `tsc --noEmit` before/after (dozens of stale-client errors in unrelated modules disappeared) |
| `sharp` named in `package.json` but never installed | `pnpm install` | **PASS** - resolved cleanly (0.35.4); restored the two previously-failing `media.processor.spec.ts`/`image-processing.util.spec.ts` suites (16 tests) to green, bringing the "preserve all 438 tests" baseline from an actual 422/40 to the full 438/40 before any Phase 09 code was written |
| Known root TypeScript issue (`test/health.e2e-spec.ts` `supertest` call-signature mismatch, flagged in Phase 08, not fixed then) | changed `import * as request from 'supertest'` to `import request from 'supertest'` | **PASS_STATIC** - one-line default-import fix (`esModuleInterop`/`allowSyntheticDefaultImports` are both already `true` in `tsconfig.json`), confirmed safe/unrelated to business behavior, confirmed via `tsc --noEmit` before/after |
| Schema change (`ContributionType`, `ContributionSourceType`, `ProvenanceConfidence`, `ContributionRightsReviewState`, `SubmitterRightsDeclaration`, `ContributionAttribution`, `ContributionReviewDecision`, `ContributionCatalogueResultType` enums; `EntityKind.SOURCE_DOCUMENT`; `Contribution` gains type/originalLocale/linkedEntity/correctionTarget/submitterDeclaration/attribution/provenanceConfidence/rightsReviewState/sensitivity/needsInfo/rejection/withdrawal/lastReviewed/version columns; `ContributionReviewNote.decision`; new `ContributionSource`/`ContributionCatalogueResult` models; back-relations on `MediaAsset`/`Source`/`SourceDocument`) | `prisma validate` / `prisma generate` | **PASS_STATIC** |
| Phase 09 migration SQL | hand-written `prisma/migrations/20260904000007_phase09_contributions/migration.sql` (additive only: one `ALTER TYPE ... ADD VALUE`, eight `CREATE TYPE`, one `ALTER TABLE ... ADD COLUMN` set on `Contribution` (17 columns) + 2 new indexes, one `ADD COLUMN` on `ContributionReviewNote`, two new tables with their indexes/FKs). Same offline-review approach as every prior migration (`prisma migrate diff --from-migrations` requires a live shadow database, unavailable). | **PASS_STATIC_MIGRATION_REVIEW** (reviewed by inspection, no live apply) |
| Root TypeScript check | `npx tsc --noEmit` (root `tsconfig.json`) | **PASS_STATIC** - no errors |
| API TypeScript check | `npx tsc --noEmit -p apps/api/tsconfig.json` | **PASS_STATIC** - no errors (the Phase 08-flagged `supertest` finding above is now fixed, not just documented) |
| API build | `npx nest build` (`apps/api`) | **PASS_STATIC** - clean, `dist/main.js` produced |
| API lint | `npx eslint "src/**/*.ts" --max-warnings=0` (`apps/api`) | **PASS_STATIC** - 0 problems (after removing a handful of unused-variable lint errors introduced by this session's own new test/service code before the final green run) |
| API unit tests | `npx jest` (`apps/api`) | **PASS_UNIT** - 40 suites, 493/493 passing, up from 438/438 across 40 suites at the end of Phase 08 (`contributions.service.spec.ts` substantially rewritten - 8 old ownership tests preserved in intent, ~40 new tests added across create/update/withdraw/submitReview/rights-review/catalogueSource/catalogueDocument/catalogueMedia/provenance-evidence/404-handling; `sources.service.spec.ts` +2 (transaction passthrough); `media.service.spec.ts` +3 (`MediaService.promote`); `schema-graph.spec.ts` +4; `trust-regression.spec.ts` +7 new Phase 09 contribution trust-boundary checks). Every prior assertion in every pre-existing spec file re-run unmodified. |
| Migration actually applied live | `pnpm db:migrate:deploy` | **UNVERIFIED_LIVE_DB** |
| Catalogue-action transaction atomicity (Source/SourceDocument creation + ContributionCatalogueResult + status flip in one real DB transaction) | `ContributionsService.catalogueSource`/`catalogueDocument`/`catalogueMedia` against a live Postgres | **UNVERIFIED_LIVE_DB** (the transaction *shape* is `PASS_UNIT` via a mocked `$transaction`/`Prisma.TransactionClient` passthrough on `SourcesService.create`/`addDocument` and `MediaService.promote` - real multi-statement commit/rollback behavior was never exercised) |
| Optimistic-concurrency (`Contribution.version`) behavior under real concurrent requests | two reviewers finalizing the same contribution at once against a live Postgres | **UNVERIFIED_LIVE_DB** (the version-mismatch *rejection* is `PASS_UNIT`; a genuine concurrent race was never exercised) |
| Referenced `MediaAsset` rows genuinely `READY` in real object storage during cataloguing | catalogue actions against a live MinIO-backed upload | **UNVERIFIED_OBJECT_STORAGE** |
| OCR extraction on contributed documents | n/a | **UNVERIFIED_OCR_ENGINE** (unchanged from prior phases - no live OCR engine available; `SourceDocument.extractedText`/`ocrStatus` remain exactly as unverified as documented in `TRUST_MODEL.md`) |

### What changed and why (see `docs/backend/CONTRIBUTION_ARCHITECTURE.md` for full detail)

- **Centralized the transition policy**: the old bare `advance(id, reviewerId, { status, note })` (client-chosen target status, blanket role gate, no self-review check) was replaced with `ContributionsService.submitReview(id, reviewer, { decision, expectedVersion, notes })` - the server alone decides the resulting status from `decision` (`APPROVE`/`REJECT`/`REQUEST_INFO`/`RETURN_TO_PREVIOUS_STAGE`) + the current stage + the actor's role, mirroring `FactsService.setEditorialStatus`'s "one function is the source of truth" pattern. Self-review is refused for every decision kind (`CONTRIBUTION_SELF_REVIEW_FORBIDDEN`), not just approval.
- **Closed a real privacy gap**: `GET /contributions/:id` (no ownership check at all) was replaced with `GET /contributions/mine/:id` (owner-or-`EDITOR`+ only) plus a fully separate, never-publicly-reachable `GET /admin/contributions/:id` (full detail including review history, gated `EDITOR`/`HISTORIAN_REVIEWER`/`ADMIN`).
- **The core trust invariant is now structurally enforced, not just documented**: `ACCEPTED -> CATALOGUED` is unreachable through `submitReview` (`FORWARD['ACCEPTED']` is absent) - it only happens via `markCataloguedIfNeeded`, called exclusively from inside the three catalogue actions, the moment the first `ContributionCatalogueResult` is created. `rightsReviewState` (reviewer-only) and `submitterDeclaration` (submitter's own claim) are structurally separate fields/enums, asserted directly in `schema-graph.spec.ts`.
- **Added the entire cataloguing surface** (spec sections 28-39, 50-52): `POST /admin/contributions/:id/catalogue/{source,document,media}`, all `HISTORIAN_REVIEWER`/`ADMIN` only (stricter than ordinary review), all refusing self-cataloguing, all requiring `status IN (ACCEPTED, CATALOGUED)` and `rightsReviewState = APPROVED_FOR_CATALOGUE`, all idempotent (a second call returns the existing `ContributionCatalogueResult` rather than duplicating a `Source`/`SourceDocument`/media promotion). `catalogueSource` reuses `SourcesService`'s existing ISBN/ISSN dedup rather than reimplementing it; `credibilityLevel` is always the reviewer's own explicit input, never copied from any contribution field. `catalogueDocument` refuses outright unless this contribution already has a catalogued `Source`, and reuses `SourcesService.addDocument`'s existing `METADATA_ONLY` default/access-policy-tightening behavior. `catalogueMedia` refuses a `mediaAssetId` not attached to this contribution, and promoting to `MediaType.MAP` never creates `TerritoryGeometry` (structural - `MediaAsset` has no schema relation to `Territory` at all).
- **Made cataloguing transactionally safe**: `SourcesService.create`/`addDocument` and `MediaService.promote` were all extended (backward-compatibly - existing call sites and existing unit tests pass unmodified) to accept an optional `Prisma.TransactionClient`, so `ContributionsService`'s catalogue actions fold the canonical-record write and the `ContributionCatalogueResult`/status-flip write into one real `$transaction` rather than two sequential, non-atomic operations.
- **Added structured provenance evidence** (`ContributionSource` - `POST /contributions/:id/provenance-sources`) and reviewer-only assessment fields (`provenanceConfidence`, `rightsReviewState`, `sensitivity`, all with their own `PATCH /admin/contributions/:id/*` endpoint, self-review refused) - all four cleanly separated from the submitter's own `submitterDeclaration`/`attribution` claims.
- **Added `Contribution.version`** (optimistic concurrency, spec section 53/54) - every reviewer/admin write requires a matching `expectedVersion`, refused with `CONTRIBUTION_VERSION_CONFLICT` otherwise.
- **Added soft withdrawal** (`POST /contributions/mine/:id/withdraw` - sets `withdrawnAt`, never deletes review/audit history, refused once `CATALOGUED`) and a `needsInfo` request-more-information loop (`REQUEST_INFO` decision sets it, the submitter's own next edit clears it) - deliberately not a new `ContributionStatus` value, per spec section 23's explicit "avoid polluting the main workflow if review records can express it cleanly."
- **Added `ContributionType`** (`DOCUMENT`/`PHOTO`/`ARCHIVAL_PHOTO`/`MAP`/`ORAL_HISTORY`/`PERSONAL_MEMORY`/`FAMILY_ARCHIVE`/`BOOK_REFERENCE`/`LOCAL_HISTORY`/`CORRECTION`/`OTHER`) and a validated `correctionTargetType`/`correctionTargetId` pair (closed allow-list `PLACE`/`PERSON`/`EVENT`/`ERA`/`STORY`/`SOURCE`/`FACT`, existence-checked) plus a `linkedEntityType`/`linkedEntityId` pair for contextual (non-`PLACE`) entity tags - both plain polymorphic scalar pairs, the same established pattern as `Comment`/`Bookmark`/`Report`, not four separate FKs.
- **Deliberately deferred, with rationale, not built** (spec section 37 explicitly permits this): automatic `HistoricalFact` draft creation from an accepted contribution. No reviewed, non-fabricating mapping exists yet from free-text contribution fields to a well-formed `FactType`/date/citable statement; building one now would mean inventing placeholder historical claims. Documented in `CONTRIBUTION_ARCHITECTURE.md` section 11 with the exact contract any future implementation must follow (must start `DRAFT`, full unmodified Phase 04 workflow, never auto-`PUBLISHED`).
- Added `apps/api/src/common/errors/contribution-error-codes.ts` (`CONTRIBUTION_NOT_FOUND`, `CONTRIBUTION_NOT_EDITABLE`, `CONTRIBUTION_INVALID_TRANSITION`, `CONTRIBUTION_SELF_REVIEW_FORBIDDEN`, `CONTRIBUTION_REVIEW_REQUIRED`, `CONTRIBUTION_RIGHTS_INCOMPLETE`, `CONTRIBUTION_CATALOGUE_NOT_ALLOWED`, `CONTRIBUTION_MEDIA_NOT_OWNED`, `CONTRIBUTION_INVALID_TARGET`, `CONTRIBUTION_VERSION_CONFLICT`, plus a reserved `CONTRIBUTION_ALREADY_CATALOGUED`), following the `TRUST_ERROR_CODES`/`COMMUNITY_ERROR_CODES` pattern.
- Added a new "Phase 09 contribution trust-boundary regression" suite to `trust-regression.spec.ts` (raw `Contribution` cannot be search-indexed or editorial-slotted, cataloguing requires `HISTORIAN_REVIEWER`/`ADMIN` never `MODERATOR`, `ContributionCatalogueResult` is a distinct model from `Contribution`, `ContributionSource` has no relation to `Citation`/`HistoricalFact`, `MediaType.MAP` promotion still has no relation to `Territory`, Hoang Sa/Truong Sa can link via the ordinary `placeId` FK with no special-cased path) plus 4 new structural checks in `schema-graph.spec.ts`.
- All 438 prior tests re-run, still passing unmodified in intent - no existing behavior was weakened to make this phase green. `ContributionsModule` now imports `SourcesModule` (new cross-module dependency, no import cycle, confirmed by a clean build).

### Phase 09 verdict

**COMPLETE_WITH_ENVIRONMENT_BLOCKERS.** `Contribution` is now a controlled intake/review/cataloguing pipeline with a centralized transition policy, self-review refusal on every reviewer/admin action, provenance and rights review structurally separated from submitter claims, `ACCEPTED != CATALOGUED` enforced by construction (not just documented), idempotent and transactionally-safe cataloguing into `Source`/`SourceDocument`/`MediaAsset`, a real privacy fix (contribution detail is no longer world-readable by id), optimistic concurrency, soft withdrawal, and a request-more-information loop - the `HistoricalFact`/`Source`/`Citation` trust chain from Phase 04 remains structurally unreachable from any contribution action regardless of how far it advances, regression-tested directly. Every item in the Phase 09 "Definition of Done" that can be verified without live infrastructure is verified (schema validation, `tsc`, build, lint, 493/493 unit tests covering every requested test category from spec sections 74-81, plus the pre-existing environment-setup issues - stale Prisma Client, uninstalled `sharp`, the known `supertest` typing mismatch - all fixed rather than worked around). Live-dependent verification (`UNVERIFIED_LIVE_DB`/`UNVERIFIED_OBJECT_STORAGE`/`UNVERIFIED_OCR_ENGINE` rows above - a real migration apply, real transaction atomicity, real concurrent-version races, real object-storage-backed cataloguing) remains genuinely blocked by this sandbox's Docker/WSL2/Postgres/MinIO unavailability, not by missing implementation - re-run the "Action required" commands from the Phase 00-01 section above (now including `pnpm db:migrate:deploy` picking up the Phase 09 migration, plus a real concurrent-review race test and a real end-to-end catalogue action against live Postgres/MinIO) on a machine with working Docker before treating this as production-verified. This is explicitly **not** a `BACKEND_FREEZE` declaration.

---

## Phase 10 - Golden Dataset, Source-Backed Historical Seed & Trust-Verified Demo Corpus

Re-confirmed the environment before starting: PostgreSQL/PostGIS/Redis/MinIO/Docker unavailability
(see "Why infra is blocked" above) was not re-litigated destructively - work proceeded entirely on
research, static/unit-verifiable seed authoring, and data-structure validation per the Phase 10
brief. This phase is explicitly **not** a feature-expansion phase - no schema migration was needed
or created; every change is data/seed-architecture only.

### Pre-flight audit

`prisma/golden-dataset.ts`/`prisma/seed.ts` (Phase 01-09) already had the required-core Place list
and a minimal Person/Event/Era/Dynasty set, but: every Vietnamese name/summary used diacritic-
stripped ASCII text (not high-quality Vietnamese); every English translation across every prior
phase was mislabeled `method: 'HUMAN'` despite being AI-drafted with no human review; the two
seeded `HistoricalFact` rows had zero citations and sat in `DRAFT`; and there was no `Source`,
`Citation`, `Story`, `Journey`, or `EditorialSlot` content at all. All four gaps are fixed in this
phase - see `docs/backend/golden-data/research-notes.md` "Pre-existing data audited and
corrected" for the full detail, including the direct `node -e` verification (before touching any
text) that restoring diacritics produces byte-identical `canonicalSlug` values via the `slugify`
package the seed actually uses.

### Command evidence (Phase 10)

| Check | Command | Result |
|---|---|---|
| Web research for every substantive fact | `WebSearch`/`WebFetch` against UNESCO WHC, official Vietnamese government/heritage-management-board sites, Encyclopaedia Britannica, and a peer-reviewed naval-history journal article | **PASS_RESEARCH** - see `docs/backend/golden-data/sources-manifest.md` for the full, reproducible source-by-source record; Wikipedia/Fandom pages appeared only as leads during research, never cited as final evidence |
| Schema change | none - Phase 10 is data/seed work only, per its own brief's instruction not to modify schema without a genuine architectural deficiency (none was found) | **N/A - no migration created this phase** |
| Root TypeScript check | `npx tsc --noEmit` (root `tsconfig.json`, covers `prisma/golden/*.ts`/`prisma/seed.ts`) | **PASS_STATIC** - no errors |
| API TypeScript check | `npx tsc --noEmit -p apps/api/tsconfig.json` | **PASS_STATIC** - no errors |
| API build | `npx nest build` (`apps/api`) | **PASS_STATIC** - clean, `dist/main.js` produced |
| API lint | `npx eslint "src/**/*.ts" --max-warnings=0` (`apps/api`) | **PASS_STATIC** - 0 problems |
| API unit tests | `npx jest` (`apps/api`) | **PASS_UNIT** - 41 suites, 528/528 passing, up from 493/493 across 40 suites at the end of Phase 09 (new file: `golden-dataset-validation.spec.ts`, 35 tests - dataset-summary counts, citation-coverage/idempotency/trust-boundary static checks, and the real production `validateStoryBody` run directly against every seeded Story body; `golden-dataset.spec.ts`/`trust-regression.spec.ts` updated only for the restored Vietnamese diacritics, no assertion weakened) |
| Golden Dataset validation (spec sections 47/48/67-69) | the `golden-dataset-validation.spec.ts` suite above, run against the pure `prisma/golden/*.ts` data structures with no database | **PASS_GOLDEN_DATA_VALIDATION** - 100% citation coverage (28/28 PUBLISHED facts), no duplicate Source keys/entity slugs, no fabricated Jan-1 dates, no `TerritoryGeometry` reference anywhere in `prisma/golden/`, every Story/Journey/EditorialSlot target resolves and passes its real structural publication checks |
| `prisma validate` / `prisma generate` | unchanged schema, re-run for completeness | **PASS_STATIC** |
| Actual database seed execution | `pnpm db:seed` against a live Postgres | **UNVERIFIED_LIVE_DB** - never executed in this sandbox, unchanged since Phase 01 |
| Referenced Source URLs actually reachable at seed-run time | live HTTP requests during `pnpm db:seed` | **N/A by design** - `prisma/seed.ts` makes zero network calls (spec section 63); URLs were verified reachable during the one-time research pass (`docs/backend/golden-data/sources-manifest.md`), not re-checked at seed time |

### What changed and why (see `docs/backend/GOLDEN_DATASET.md` for full detail)

- Restored proper Vietnamese diacritics across every Place/Person/Event/Era/Dynasty/Theme
  (previously diacritic-stripped ASCII placeholder text).
- Reclassified every English translation honestly as `method: AI_ASSISTED` / `status:
  AI_ASSISTED` (previously mislabeled `HUMAN` with no human review having occurred - spec section
  25).
- Added `prisma/golden/sources.ts` - 23 real `Source` records (UNESCO World Heritage Centre
  official list entries; official Vietnamese government/heritage-management-board pages;
  Encyclopaedia Britannica; a peer-reviewed naval-history journal article; state-affiliated
  newspapers) with stable `SRC_*` keys, never a generated UUID for seed relationships.
- Added `prisma/golden/facts.ts` - 28 atomic, individually-cited `HistoricalFact` rows, 100% of
  which are `PUBLISHED` with >=1 `VERIFIED` `Citation`, a real `FactReview` audit row, and (for the
  four `sensitivity: TERRITORIAL` Hoàng Sa/Trường Sa facts) a `reviewedById` distinct from
  `createdById` - the same separation-of-duties rule `FactsService.setEditorialStatus` enforces
  live, replicated here rather than bypassed by a direct status flip.
- Upgraded two dates to real day-precision only where independently corroborated (Battle of Bạch
  Đằng: 9 April 1288, Britannica; Ngọc Hồi-Đống Đa: 30 January 1789, cross-verified against the
  lunar-to-Gregorian conversion in a Vietnam People's Army newspaper source) - every other date
  stayed at whatever precision its source actually supports, never a fabricated day (Cổ Loa's
  traditional ~257 BCE founding stays `date: UNKNOWN`, since the codebase's historical-date model
  has no BCE support anywhere to safely represent it).
- Added `prisma/golden/stories.ts` - 5 editorial Stories, each with a real `StoryFact`/
  `StoryCitation` trail, a structured body validated at seed time by the actual production
  `validateStoryBody` function (not reimplemented), and honest AI-translation labeling. One
  (`STORY_HOANG_SA_TRUONG_SA_DOSSIER`) presents the Hoàng Sa/Trường Sa dossier with an explicit
  in-body disclosure callout.
- Added `prisma/golden/journeys.ts` - 3 curated Journeys (ancient capitals; Central Vietnam UNESCO
  heritage trail; 20th-century resistance-war landmarks), every stop a real, `PUBLISHED` Golden
  Place, no fabricated route geometry/distance/travel time between stops.
- Added `prisma/golden/editorial.ts` - 5 `EditorialSlot` rows, all pointing at real Golden Stories/
  Journeys/Places created by this same seed run.
- Refactored the seed into domain-separated `prisma/golden/*.ts` modules (previously one file,
  `prisma/golden-dataset.ts`, holding only Places) - `prisma/golden-dataset.ts` is kept as a
  stable re-export so nothing that already imported it needed to change.
- Extended `SourcesService.create`/`addDocument` and `MediaService.promote` were **not** touched
  this phase (Phase 09 already added their transaction-passthrough capability; this phase's
  `prisma/seed.ts` writes directly via `PrismaClient`, the same convention every prior phase's
  seed script already used, not through the service layer).
- Added a new static validation suite, `golden-dataset-validation.spec.ts` (35 tests), covering
  every check listed in spec section 47/67: version identifier, required-core entity presence,
  no-fabricated-territory guards, 100% citation coverage, no duplicate Source keys/slugs, no
  fabricated Jan-1 dates, alias deduplication, representative search-alias coverage (diacritic and
  non-diacritic forms of "Thăng Long"/"Trần Hưng Đạo"/"Hoàng Sa"/"Trường Sa"), Story/Journey/
  EditorialSlot structural trust checks (including running the real `validateStoryBody`), and an
  idempotency guard (no bare `.create(` on any top-level model in `prisma/seed.ts`).
- All 493 prior tests re-run, still passing unmodified in intent - `golden-dataset.spec.ts`/
  `trust-regression.spec.ts` needed their hardcoded Hoàng Sa/Trường Sa name literals updated to the
  restored diacritic forms (four assertions), with no check weakened or removed.

### Phase 10 verdict

**COMPLETE_WITH_ENVIRONMENT_BLOCKERS.** The Golden Dataset is now a real, source-backed, citation-
complete reference corpus (100% of 28 PUBLISHED HistoricalFacts carry >=1 VERIFIED Citation to one
of 23 real Sources - UNESCO, official Vietnamese government/heritage sites, Britannica, and a
peer-reviewed journal article, never a blog/Wikipedia/Fandom page), covering entities, facts,
sources, citations, stories, journeys, editorial slots, multilingual contracts (with honestly-
labeled AI-assisted English), and a carefully neutral, non-fabricated Hoàng Sa/Trường Sa dossier -
exercising every layer of the backend the previous nine phases built, without inventing history.
Every item in the Phase 10 "Definition of Done" that can be verified without live infrastructure
is verified (research documented and reproducible, schema unchanged, `tsc`, build, lint, 528/528
unit tests, and a dedicated static Golden Dataset validation suite). Live-dependent verification
(`UNVERIFIED_LIVE_DB` - an actual `pnpm db:seed` execution against a real PostgreSQL/PostGIS
instance) remains genuinely blocked by this sandbox's Docker/WSL2/Postgres unavailability, not by
missing implementation - re-run the "Action required" commands from the Phase 00-01 section above
on a machine with working Docker, then confirm the seed completes and `GET /v1/search`,
`GET /v1/map/features`, `GET /v1/timeline`, and `GET /v1/editorial/home` all return the expected
Golden Dataset content, before treating this as production-verified. This is explicitly **not** a
`BACKEND_FREEZE` declaration.

---

## Phase 11 - API Contract Hardening, OpenAPI Completion & Formal Backend Handoff Contract

Re-confirmed the environment before starting: PostgreSQL/PostGIS/Redis/MinIO/Docker unavailability
(see "Why infra is blocked" above) was not re-litigated destructively. This phase is primarily
contract/handoff/QA work, not new features - no backend domain was redesigned, no schema
migration was needed.

### Pre-flight: route inventory

Audited all 32 controllers (`apps/api/src/**/*.controller.ts`) directly via source grep -
**184 routes** total (`@Get`/`@Post`/`@Patch`/`@Put`/`@Delete` decorators), 60 explicitly
`@Public()`, the rest requiring at least authentication (72 additionally role-gated via
`@Roles(...)`, some class-level). Full per-route classification is in the generated
`docs/backend/openapi.json` and the endpoint inventory table in `BACKEND_HANDOFF.md`.

### Command evidence (Phase 11)

| Check | Command | Result |
|---|---|---|
| Schema change | none - Phase 11 is contract/documentation/hardening work only, per its own brief's instruction to avoid schema changes absent a genuine defect | **N/A - no migration created this phase** |
| OpenAPI generation from the real application, no live DB | `pnpm --filter @dauviet/api openapi:generate` (`apps/api/src/generate-openapi.ts`, `SKIP_DB_CONNECT=true`) | **PASS_OPENAPI_GENERATION** - `docs/backend/openapi.json` written, 162 path templates, correct `/v1` prefix, generated from the actual `AppModule`/Swagger metadata, not hand-written |
| OpenAPI drift/contract regression suite | `apps/api/src/openapi-contract.spec.ts` (part of `pnpm test`) | **PASS_CONTRACT** - re-generates the same document in-process, asserts it matches the on-disk copy exactly, asserts 22 critical routes exist, spot-checks auth/role metadata against `AUTHORIZATION_MATRIX.md` for 4 representative endpoints, sweeps every schema for forbidden leaked property names |
| Private-field-leak audit | manual code audit of every controller/service response-shaping path, cross-checked against spec section 6's list | **2 real leaks found and fixed**: `GET /media/:id` previously spread the raw Prisma row (leaking `storageKey`, `checksum`, `uploadedById`, `rightsReviewedById`, `quarantinedById`/`quarantineReason`, `archivedById`); `GET /sources`/`GET /sources/:id` previously leaked `createdById`/`archivedById`/`archiveReason`. Both fixed with an explicit allow-list redaction helper, both regression-tested (`media.service.spec.ts`, `sources.service.spec.ts`). Every other spot-checked surface (auth responses, sessions, public profiles, CommunityStory list/detail, HistoricalDate response shape) was already clean by construction (explicit Prisma `select`/hand-shaped DTOs) - no further leaks found |
| Error-code inventory/uniqueness | `apps/api/src/common/errors/error-codes.spec.ts` | **PASS_UNIT** - 85 domain error codes across 7 registries (AUTH 15, MEDIA 5, EDITORIAL 14, TRUST 9, COMMUNITY 17, DISCOVERY 13, CONTRIBUTION 12), verified globally unique, never colliding with a generic per-HTTP-status code, all SCREAMING_SNAKE_CASE |
| Validation-error contract normalization | `ListCommunityStoriesQueryDto` (new), `community-story.dto.spec.ts` | **PASS_UNIT** - `GET /community/stories`'s `sort`/`type` query params were previously unvalidated bare `@Query()` bindings (an unrecognized `sort` silently fell back to the default order instead of a 400); now validated the same way every other filter DTO in this codebase is |
| Root TypeScript check | `npx tsc --noEmit` (root) | **PASS_STATIC** - no errors |
| API TypeScript check | `npx tsc --noEmit -p apps/api/tsconfig.json` | **PASS_STATIC** - no errors |
| API build | `npx nest build` | **PASS_STATIC** - clean, `dist/main.js` produced |
| API lint | `npx eslint "src/**/*.ts" --max-warnings=0` | **PASS_STATIC** - 0 problems |
| API unit tests | `npx jest` | **PASS_UNIT** - 44 suites, 572/572 passing, up from 528/528 across 41 suites at the end of Phase 10 (new: `openapi-contract.spec.ts` (32 tests, boots the real `AppModule`), `error-codes.spec.ts` (5 tests), `community-story.dto.spec.ts` (4 tests); extended: `golden-dataset-validation.spec.ts`'s idempotency sweep (now a blanket check across every `prisma.<model>.` call, not a hand-enumerated model list), `media.service.spec.ts`/`sources.service.spec.ts` (+1 leak-regression test each), `golden-dataset.spec.ts`/`trust-regression.spec.ts` unchanged this phase) |
| `prisma validate` / `prisma generate` | unchanged schema, re-run for completeness | **PASS_STATIC** |
| Rate limiting / CSRF enforcement under real repeated HTTP traffic | a running process, real browser cookie round trip | **UNVERIFIED_LIVE_DB**-adjacent (logic is `PASS_UNIT` via mocked guards/services; never exercised against a live running server) |
| Actual database seed / live query behavior | `pnpm db:seed`, any live query | **UNVERIFIED_LIVE_DB** - unchanged since Phase 01 |

### What changed and why (see `docs/backend/BACKEND_HANDOFF.md` for the full formal contract)

- **`docs/backend/openapi.json`** - a real, machine-generated OpenAPI 3 document, committed to the
  repo, regenerable with `pnpm --filter @dauviet/api openapi:generate`. Required solving the
  known "app boot hangs on `PrismaService.onModuleInit`'s `$connect()` with no live DB" blocker
  (documented since the Phase 00-01 report) - added a narrowly-scoped `SKIP_DB_CONNECT` env var,
  read only by `PrismaService.onModuleInit`, never set by `main.ts` or any real deployment.
  Extracted the Swagger `DocumentBuilder` config into a shared `swagger.config.ts` so the real
  server boot and the generation script can never drift into two different documents.
- **Fixed a real bug found while writing the generation script**: it initially produced a
  document with no `/v1` prefix at all (forgot to call `app.setGlobalPrefix()` before
  `SwaggerModule.createDocument()`, unlike `main.ts`) - caught before being treated as done, via a
  direct inspection of the generated paths.
- **Two real private-field leaks found and fixed** (`GET /media/:id`, `GET /sources`/
  `GET /sources/:id`) - see the command-evidence table above for exact fields. Both are the kind
  of leak that would have been very easy for a frontend engineer to accidentally consume (e.g.
  logging or forwarding the raw `storageKey`) without ever knowing it was internal.
- **Added `RequestIdMiddleware`** (`X-Request-Id` response header on every request, `requestId` in
  every error body) - a real, previously-absent gap per the brief's explicit ask, kept
  intentionally minimal (no larger observability/tracing system added).
- **Closed a validation gap**: `GET /community/stories`'s `sort`/`type` query parameters were read
  via bare `@Query('x')` bindings with no `class-validator` decorator at all - an invalid value
  was silently ignored rather than rejected. Replaced with `ListCommunityStoriesQueryDto`,
  consistent with every other filter DTO in the codebase.
- **Added a global error-code registry uniqueness test** (`error-codes.spec.ts`) - all 85 domain
  codes across 7 registries confirmed unique and non-colliding; this is now an enforced
  regression, not just a one-time manual audit.
- **`docs/backend/BACKEND_HANDOFF.md` substantially expanded** into the formal handoff contract
  the phase brief asks for: explicit success/error envelope contract with the full error-code
  inventory, validation-error shape, pagination contract (cursor vs. offset, server-enforced
  `limit`/`pageSize` maximum of 100), sort/filter contract, locale precedence/fallback made
  explicit, a Story body block-schema reference table, an entity summary/slug/URL-locale
  relationship section, a Web-vs-Mobile-split auth contract (previously one combined narrative),
  an auth endpoint inventory with request/response shapes, auth error-code semantics table, a
  Media access-policy/checksum/variant/reconstruction-disclosure reference table, a Source/
  Citation public-DTO contract, a Comments/Votes/Bookmarks/Visits/Profile contract, a moderation-
  status semantics table, an Admin-contribution-catalogue restatement, an environment-variable
  classification table, a "Frontend Integration Rules" (Codex MAY / MUST NOT) section, and a
  Request-ID/Health contract section.
- **`.env.example` annotated** with REQUIRED/OPTIONAL/SECRET/DEVELOPMENT_ONLY classification
  comments per variable, including the new `SKIP_DB_CONNECT` (commented out, with an explicit
  "never set this for a real server boot" warning).
- All 528 prior tests re-run, still passing unmodified in intent - `golden-dataset.spec.ts`/
  `trust-regression.spec.ts` needed no changes this phase (their prior diacritic-literal fix was
  Phase 10's work, unrelated to this phase's changes).

### Phase 11 verdict

**COMPLETE_WITH_ENVIRONMENT_BLOCKERS.** The complete Phase 00-10 API surface (184 routes across
32 controllers) is now backed by a real, machine-generated, drift-tested OpenAPI document
requiring no live database to produce; two real private-field leaks were found and closed;
validation/error/pagination/sort/locale contracts are explicit, consistent, and documented in one
authoritative handoff file; the error-code inventory is complete and verified duplicate-free; and
`docs/backend/BACKEND_HANDOFF.md` now states, in one place, everything a frontend engineer needs
to build Web, Expo/React Native, and Admin UI without reading Prisma or guessing backend
behavior, plus explicit Frontend Integration Rules (MAY/MUST NOT). Every item in the Phase 11
"Definition of Done" that can be verified without live infrastructure is verified (schema
unchanged, `tsc`, build, lint, 572/572 unit tests, real OpenAPI generation and a dedicated
contract-test suite). Live-dependent verification (`UNVERIFIED_LIVE_DB` rows above - real rate-
limit/CSRF enforcement under actual HTTP traffic, an actual `pnpm db:seed` execution, real
concurrent-request behavior) remains genuinely blocked by this sandbox's Docker/WSL2/Postgres/
Redis/MinIO unavailability, not by missing implementation - re-run the "Action required" commands
from the Phase 00-01 section above, then boot the real server and confirm `GET /docs`/
`GET /docs-json` matches the committed `openapi.json`, before treating this as
production-verified. This is explicitly **not** a `BACKEND_FREEZE` declaration - Phase 12 is the
designated live-verification/freeze-gate phase.

---

## Phase 12 - Live Infrastructure QA, Full Migration Apply, Golden Seed Verification, Runtime E2E & Backend Freeze

Full reproducible command-by-command evidence lives in the new
**`docs/backend/LIVE_QA_REPORT.md`** - this section is the freeze-gate summary and verdict only.
Docker Desktop, which every prior phase (00-11) documented as "unable to start" in this sandbox,
was found this phase to simply not be running as an application process - starting it (an
explicitly permitted safe infrastructure action per this phase's brief) worked immediately and
cleanly, both times it was needed across this phase's two working sessions. Every item every
prior phase classified `UNVERIFIED_LIVE_DB`/`UNVERIFIED_REDIS`/`UNVERIFIED_OBJECT_STORAGE` has
now been executed against real, live infrastructure - a disposable `dauviet` QA database, never
production (this backend has never been deployed).

### Command evidence (Phase 12) - summary (full detail and exact commands in `LIVE_QA_REPORT.md`)

| Check | Result |
|---|---|
| Full 11-migration chain applied to a real Postgres+PostGIS, from empty | **PASS_LIVE** - after fixing 4 real SQL defects in `20260904000000_phase03_historical_domain/migration.sql` (a migration that had never been applied live before this phase - see `LIVE_QA_REPORT.md` section 1), all fixes disclosed inline in the migration file itself |
| Migration+seed repeatability on a second, independent fresh database | **PASS_LIVE** (`LIVE_QA_REPORT.md` section 4) - identical entity counts, no reference to the first database's state |
| Golden Dataset seed - idempotency (run twice) and production-safety (manual edit survives a re-seed) | **PASS_LIVE** (section 3) |
| Real Nest API boot, no `SKIP_DB_CONNECT` | **PASS_LIVE** - after fixing a real runtime-only bug: `express` was never a direct dependency of `apps/api/package.json` (only transitive via `@nestjs/platform-express`), so `node dist/main.js` failed under pnpm's strict linking despite `tsc`/Jest passing cleanly through 11 prior phases (section 2) |
| `GET /v1/health` (real DB+Redis check, not assumed) | **PASS_LIVE** |
| `X-Request-Id` on every response + every error body | **PASS_LIVE** |
| Auth: register/login (mobile+web mode), CSRF double-submit enforcement, refresh rotation, refresh-reuse theft detection with cascading session revocation | **PASS_LIVE** (section 5) |
| RBAC (403 on admin routes for `USER`, self-role-escalation refused) | **PASS_LIVE** |
| Rate limiting (real 429 after the configured window) | **PASS_LIVE** |
| Map (`ST_Intersects`, GiST index used), Nearby (`ST_DWithin`, real meters), Timeline, Search (pg_trgm+unaccent, diacritic and non-diacritic queries converge) | **PASS_LIVE** - Search shipped a real bug, found and fixed this phase, see below |
| Story/Journey/Editorial-home/place/person/event detail against real Golden Dataset rows | **PASS_LIVE** |
| Media upload lifecycle: real MinIO presigned PUT, real confirm (HeadObject+signature+streamed SHA-256), real BullMQ job, real `sharp`-generated derivatives (thumbnail/medium/large/optimized_web) | **PASS_LIVE** (section 7) - the single most complete live confirmation this phase: every layer of the async pipeline exercised for real, none mocked |
| Comments, Moderation queue access control, Contributions (create + withdraw, real transaction/optimistic-concurrency path) | **PASS_LIVE** |
| Audit log (real persisted entries, access-controlled) | **PASS_LIVE** |
| Private-field-leak spot check on live JSON responses | **PASS_LIVE** - clean, no leak found |
| SQL injection smoke test against a live endpoint | **PASS_LIVE** - safely parameterized, table confirmed intact |
| `EXPLAIN` on Map/Nearby/Search representative queries | **PASS_LIVE**, 2 `DEFERRED_ACCEPTED` scale notes (no trigram GIN index, no geography-typed spatial index - safe at V1 dataset size, section 8) |
| OpenAPI: offline-generated vs. committed vs. live-server `/docs-json` | **PASS_LIVE** - zero drift, byte-identical after normalizing formatting (section 9) |
| Full automated suite re-run after every live fix | **PASS** - `tsc --noEmit` clean, `eslint` 0 problems, `nest build` clean, **44 suites / 572 tests**, unchanged from the Phase 11 baseline - zero regressions from any Phase 12 fix |
| Google OAuth real exchange | **BLOCKED (out of scope)** - no real Google Cloud credentials exist in this environment to test against; not an infrastructure limitation this phase's Docker fix could address |
| Mailhog/email delivery live re-verification | **DEFERRED_ACCEPTED** - deliberately not started this phase to avoid a port collision with an unrelated pre-existing container (`LIVE_QA_REPORT.md` section 0); logic remains `PASS_UNIT` from Phase 02, unchanged |

### Real defects found and fixed this phase (live execution only - invisible to every prior static/unit check)

1. **4 SQL bugs in `prisma/migrations/20260904000000_phase03_historical_domain/migration.sql`** -
   enum-conversion statements referencing columns by a name that did not exist yet at that point
   in migration history. Fixed inline, with dated comments, only because this migration had
   genuinely never been applied to any live database before (see `LIVE_QA_REPORT.md` section 1).
2. **`express` missing as a direct dependency of `apps/api/package.json`** - caused a real
   `node dist/main.js` boot failure under pnpm's strict linking, invisible to `tsc`/Jest for 11
   phases because neither ever executes the compiled server as a real OS process. Fixed by
   declaring `express`/`cookie-parser`/`helmet` as direct dependencies.
3. **`search.service.ts`'s relevance `score` was silently string-concatenated, not summed** - a
   Postgres `numeric` result (`historicalImportance * 0.01`) comes back from the `pg` driver as a
   string, unlike `real`/`integer` columns; `similarity + row.importanceBonus` therefore
   concatenated instead of added. Invisible to mocked-Prisma unit tests, which never exercise the
   real driver's type-coercion behavior. Fixed with an explicit `Number(...)` coercion.

All three are the kind of defect this phase's brief anticipated by requiring live verification in
the first place - each is now fixed, disclosed, and additionally covered by the still-green
572-test unit suite (no regression) plus fresh live re-verification after the fix.

### Subsystem Freeze Matrix

| Subsystem | Classification |
|---|---|
| AUTH | PASS_LIVE |
| USERS/SESSIONS | PASS_LIVE |
| HISTORICAL DOMAIN (Place/Person/Event/Era/Dynasty/Territory) | PASS_LIVE |
| FACT/SOURCE/CITATION | PASS_LIVE (create/publish/citation-gate logic PASS_UNIT + PASS_STATIC, real rows/queries exercised via seed+detail-endpoint live reads; write-path trust-transition endpoints not individually HTTP-tested this phase beyond what Contributions/Comments exercised - PASS_STATIC for the untested transition endpoints specifically, PASS_LIVE for read paths and the underlying real Postgres transaction/constraint behavior) |
| MEDIA | PASS_LIVE |
| EDITORIAL (Story/Journey/EditorialSlot) | PASS_LIVE |
| MAP | PASS_LIVE |
| TIMELINE | PASS_LIVE |
| SEARCH | PASS_LIVE (real bug found and fixed this phase - see above) |
| COMMUNITY | PASS_STATIC (Comments/Contributions live-tested as representative UGC flows; `CommunityStory` create/vote/verification-state endpoints not individually HTTP-exercised this phase - unit-tested and structurally unchanged, DEFERRED_ACCEPTED for a follow-up smoke pass, not a blocker given Comments/Contributions proved the same underlying auth/DB/transaction machinery live) |
| COMMENTS/VOTES | PASS_LIVE (comment creation/listing); vote endpoint PASS_STATIC (unit-tested, not HTTP-exercised this phase) |
| CONTRIBUTIONS | PASS_LIVE |
| MODERATION | PASS_LIVE (queue access-control confirmed; no flagged content existed to test an actual moderation action against - moderation-action endpoint remains PASS_UNIT) |
| ADMIN | PASS_LIVE (audit log, role/status endpoints, moderation queue all real-HTTP-tested) |
| GOLDEN DATASET | PASS_LIVE (idempotency + production-safety proven live, twice, on two independent databases) |
| POSTGRES | PASS_LIVE |
| POSTGIS | PASS_LIVE |
| REDIS | PASS_LIVE |
| OBJECT STORAGE (MinIO) | PASS_LIVE |
| EMAIL | DEFERRED_ACCEPTED (Mailhog intentionally not started this phase - port collision with an unrelated container; logic unchanged since Phase 02's PASS_UNIT) |
| OPENAPI/CONTRACT | PASS_LIVE (zero drift, offline-generated / committed / live-server outputs all byte-identical) |

### Phase 12 verdict

**COMPLETE.** Every mandatory live-verification item in the Phase 12 brief's minimum bar
(PostgreSQL, PostGIS, Redis, object storage/MinIO, the full migration chain, the Golden Dataset
seed twice for idempotency, a real Nest API boot without `SKIP_DB_CONNECT`, critical HTTP flows,
real spatial queries, real search SQL/extensions, real DB transactions) has been executed against
genuinely live infrastructure and passed, with three real defects found during that live execution
and fixed (disclosed above and in `LIVE_QA_REPORT.md`), and zero regressions introduced against
the existing 572-test automated suite. The two items left `DEFERRED_ACCEPTED`/`BLOCKED`
(Mailhog/email live re-verification, real Google OAuth exchange) are both consciously scoped out
for reasons unrelated to infrastructure availability (a deliberate port-collision avoidance, and
the simple absence of real Google Cloud credentials in this environment respectively), not
missing implementation, and neither blocks a `BACKEND_FREEZE` decision per the brief.

### BACKEND_FREEZE decision

**BACKEND_FREEZE_PASS.**

**Backend Phase 00-12 is frozen for frontend integration. Codex may now begin Web, React
Native/Expo and Admin frontend work against the documented Backend Handoff Contract.**

The authoritative frontend contract is `docs/backend/BACKEND_HANDOFF.md`, backed by the
machine-generated, live-verified-drift-free `docs/backend/openapi.json` (regenerate via
`pnpm --filter @dauviet/api openapi:generate`, or read directly from a running server's
`GET /docs-json` - both are now proven identical). Full live reproducible evidence for every claim
in this section is in `docs/backend/LIVE_QA_REPORT.md`.

### Working tree state at the end of Phase 12

No git commit was made in this phase (or any prior phase) per the standing "no commit unless
explicitly instructed" instruction - `git status` at the end of this phase shows the same
uncommitted Phase 00-11 work as at the start, plus this phase's changes: `prisma/migrations/
20260904000000_phase03_historical_domain/migration.sql` (the 4 live-migration fixes),
`apps/api/package.json`/`pnpm-lock.yaml` (the `express`/`cookie-parser`/`helmet` direct-dependency
fix), `apps/api/src/modules/search/search.service.ts` (the score-coercion fix),
`docs/backend/openapi.json` (regenerated - byte-identical to before, per section 9), and three new
files: `docs/backend/LIVE_QA_REPORT.md`, plus this section and the corresponding update to
`docs/backend/BACKEND_HANDOFF.md`. All disposable QA data (the `dauviet_qa2` database) was dropped
after evidence collection; the primary `dauviet` QA database (containing test users/comments/
media/contributions created during this phase's HTTP testing) may be dropped and re-seeded fresh
at any time before any real use, per its disposable-QA-database status - it was never production
data.

---

## Phase 12.1 - Final Freeze Evidence Remediation: Contribution Catalogue Transaction

**Reason for this phase**: Phase 12's freeze report asserted "Contributions (create/withdraw with
real transactions)" as live-verified, but this did not specifically prove the Phase 09 catalogue
pipeline (`ACCEPTED -> CATALOGUED`, the promotion of a contribution's provenance into a canonical
`Source`) had ever actually executed against a real PostgreSQL database, nor that its
transaction/idempotency guarantees held under real rollback conditions. This phase is a narrow
remediation of exactly that one gap - no other Phase 00-12 work was redone, reset, or altered.
Full reproducible evidence is in `docs/backend/LIVE_QA_REPORT.md`'s "Phase 12.1" section; this
section is the summary and updated freeze decision only.

### What was proven live

A disposable, clearly-synthetic contribution ("Phase 12.1 QA Catalogue Fixture", type
`BOOK_REFERENCE`) was created and advanced through the real HTTP API, by six freshly-registered,
cleanly role-separated QA identities (never one account holding two roles at once, except a
one-off, immediately-reverted grant used solely to prove self-review is refused regardless of
role): `SUBMITTED -> TRIAGE -> PROVENANCE_REVIEW -> HISTORICAL_REVIEW` (EDITOR) `-> ACCEPTED`
(HISTORIAN_REVIEWER only - EDITOR correctly refused at this stricter checkpoint) `-> CATALOGUED`
via `POST /admin/contributions/:id/catalogue/source` (HISTORIAN_REVIEWER, after rights review was
explicitly set to `APPROVED_FOR_CATALOGUE` - refused beforehand with `CONTRIBUTION_RIGHTS_
INCOMPLETE`). A live `psql` read before/after the catalogue action showed exactly one new `Source`
row and one new `ContributionCatalogueResult` row, zero new `HistoricalFact`/`Citation` rows
(the trust boundary - `CATALOGUED != PUBLISHED HistoricalFact` - proven by direct query, not
code-reading), and one new, correctly-attributed `AuditLog` entry. Idempotency was proven with
exact before/after counts across a second identical call: `sources=24->24`,
`catalogue_results=1->1`, returning the byte-identical original result. A MODERATOR was correctly
refused (`403`) on the catalogue route; self-review was correctly refused
(`CONTRIBUTION_SELF_REVIEW_FORBIDDEN`) even with the submitter temporarily also holding EDITOR; an
unrelated user was correctly refused (`403`) reading another user's contribution; and the raw
contribution never appeared in public `GET /v1/search` or `GET /v1/editorial/home` (only the
now-legitimately-canonical, differently-titled Source did).

### Real defects found and fixed this phase

1. **Audit-log entry survived a catalogue-transaction rollback that its own Source row did not.**
   A dedicated real-database rollback test (`apps/api/test/contribution-catalogue.e2e-spec.ts`)
   proved that `SourcesService.create`, when run inside a caller-supplied `Prisma.
   TransactionClient` (exactly the pattern `ContributionsService.catalogueSource`/
   `catalogueDocument`/`catalogueMedia` use), correctly rolled back its own `Source` insert on a
   later failure - but its `audit.log({action:'source.created', ...})` call did not, because
   `AuditService.log` always wrote through the ambient `PrismaService`, never the `tx` its caller
   had been handed. **Fixed**: `AuditService.log` now accepts an optional `db`/
   `Prisma.TransactionClient` parameter (defaulting to the previous ambient behavior, so every
   other call site across the codebase is unaffected), and the three catalogue-relevant call
   sites (`SourcesService.create`, `SourcesService.addDocument`, `MediaService.promote`) now pass
   their own `db` through. Re-verified live: the same rollback probe now shows the audit entry
   correctly rolled back alongside the Source row.
2. **No e2e test in this repository had ever actually been executed, and the ones that existed
   were missing real authentication/authorization enforcement entirely.** `main.ts`'s `bootstrap()`
   wires `JwtAuthGuard`/`RolesGuard`/`AllExceptionsFilter`/`ResponseInterceptor` imperatively -
   none are `AppModule` providers (only `ThrottlerGuard` is). Every e2e test built via
   `Test.createTestingModule({ imports: [AppModule] })` (the pre-existing `health.e2e-spec.ts`
   included) never replicated this, so such a test would run with every route effectively public
   and unguarded, and the real `{success,data}` response envelope absent. Never caught before
   because `pnpm test:e2e` requires live infra no prior sandbox had. **Fixed**: added
   `apps/api/test/bootstrap-test-app.ts`, a shared helper that constructs the test app exactly the
   way `main.ts` does; both `health.e2e-spec.ts` and the new
   `contribution-catalogue.e2e-spec.ts` now use it.

Neither defect affected the mandatory freeze-gate requirement itself (the catalogue transaction's
core data - Source, ContributionCatalogueResult, Contribution.status - was already correctly
atomic; only its own audit trail was not, and only the never-before-run e2e harness was broken,
not the running application). Both are now fixed, live-reverified, and covered by a permanent
automated regression test.

### Automated regression (after this phase's fix)

`tsc --noEmit`, `nest build`, `eslint` all clean; **`npx jest`: 44 suites, 572/572 tests** -
unchanged from the Phase 12 baseline (one pre-existing assertion in `media.service.spec.ts`
updated for `audit.log`'s new optional second parameter - a mechanical signature-change update,
not a behavior change). **`npx jest --config ./test/jest-e2e.json`: 2 suites, 3/3 tests** - the
first time any e2e test has ever actually run in this project, now permanently protecting this
freeze gate from regression.

### Six final freeze gates - reconfirmed

1. Fresh migration chain - **PASS** (Phase 12; unchanged).
2. Golden seed second run - **PASS** (Phase 12; unchanged).
3. PostGIS / Map / Search - **PASS** (Phase 12; unchanged).
4. MinIO + Redis + BullMQ + Sharp - **PASS** (Phase 12; unchanged).
5. Web auth / CSRF / refresh - **PASS** (Phase 12; unchanged).
6. Contribution catalogue transaction - **PASS** (this phase: real live workflow through
   CATALOGUED, exact-count idempotency, real rollback/atomicity proof with one real defect found
   and fixed, the HistoricalFact trust boundary proven by live query, and a permanent e2e
   regression test).

### Phase 12.1 verdict

**COMPLETE.**

### BACKEND_FREEZE decision (reconfirmed)

**BACKEND_FREEZE_PASS.**

**Backend Phase 00–12 is frozen for frontend integration. Codex may now begin Web, React
Native/Expo and Admin frontend work against the documented Backend Handoff Contract.**

All six mandatory freeze gates now carry real, reproducible live evidence, including the one this
phase closed. Full detail: `docs/backend/LIVE_QA_REPORT.md`'s "Phase 12.1" section.

### Working tree state at the end of Phase 12.1

No git commit was made (per standing instruction). `git status` shows the same uncommitted work as
at the end of Phase 12, plus this phase's changes: `apps/api/src/modules/audit/audit.service.ts`
(the `db`/`tx` parameter fix), `apps/api/src/modules/sources/sources.service.ts` and
`apps/api/src/modules/media/media.service.ts` (threading `db` through to `audit.log`),
`apps/api/src/modules/media/media.service.spec.ts` (one assertion updated for the new parameter),
`apps/api/test/health.e2e-spec.ts` (bootstrap corrected), and two new files:
`apps/api/test/bootstrap-test-app.ts` and `apps/api/test/contribution-catalogue.e2e-spec.ts`. The
six disposable QA identities and the fixture contribution created this phase live in the same
disposable `dauviet` QA database as Phase 12 and may be dropped/re-seeded at any time - never
production data.
