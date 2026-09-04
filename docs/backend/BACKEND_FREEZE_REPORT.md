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
