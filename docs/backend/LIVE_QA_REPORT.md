# Dau Viet - Phase 12 Live Infrastructure QA Report

Date: 2026-09-04/05/06 (spanned a session interruption/resume; Docker Desktop was restarted
mid-phase and re-verified after resume - see "Session continuity note" below).
Scope: Backend Phase 12 - Live Infrastructure QA, Full Migration Apply, Golden Seed
Verification, Runtime E2E & Backend Freeze, per the Phase 12 brief. This is the designated
live-verification/freeze-gate phase referenced at the end of Phase 11's section of
`BACKEND_FREEZE_REPORT.md`.

**This report supersedes every `UNVERIFIED_LIVE_DB` / `UNVERIFIED_REDIS` /
`UNVERIFIED_OBJECT_STORAGE` / `UNVERIFIED_GOOGLE_OAUTH`(partially - see below) row in
Phases 00-11 with real, executed, reproducible live evidence.** Classification used below
follows the Phase 12 brief: `PASS_LIVE` (executed against a real running service),
`PASS_STATIC` (unchanged from prior phases, not re-verified live this phase), `DEFERRED_ACCEPTED`
(a real gap, consciously out of scope for Phase 12/V1, documented rather than hidden), `BLOCKED`
(genuinely could not be verified).

## 0. Environment used (disposable, never production)

- Docker Desktop (Windows host, WSL2 backend) - the exact same environment every prior phase
  documented as `UNVERIFIED_LIVE_DB` due to "Docker Desktop is unable to start". **Root cause
  this phase: Docker Desktop's application process was simply not running** (not a WSL2/kernel
  incompatibility as every prior phase's report assumed) - starting
  `C:\Program Files\Docker\Docker\Docker Desktop.exe` and waiting ~15-30s for `docker info` to
  succeed was sufficient, both times it was needed in this phase (see "Session continuity note").
- `docker-compose.yml` (repo root) services used as-is: `postgres` (`postgis/postgis:16-3.4-alpine`,
  port 5432), `redis` (`redis:7-alpine`, port 6379), `minio` (`minio/minio:latest`, ports
  9000-9001). The `mailhog` service was deliberately **not** started (its ports 1025/8025 were
  already occupied by an unrelated, pre-existing "beaconvie" project's own Mailpit container,
  auto-started by Docker Desktop; per the Phase 12 brief's "do not kill unrelated processes
  blindly" instruction, that container was left untouched and unused).
- Confirmed versions actually running: **PostgreSQL 16.4**, **PostGIS 3.4.3**, **pg_trgm 1.6**,
  **unaccent 1.1**, **Redis 7.4.10** (server), **MinIO** (`RELEASE.2025-08-13T08-35-41Z`).
- Database: `dauviet` on the live `postgres` container - used as the disposable Phase 12 QA
  database throughout (never a production database; this backend has never been deployed).
  A second, independent database (`dauviet_qa2`) was created, migrated, seeded, verified, and
  dropped solely to prove migration+seed repeatability (section 4).
- `apps/api/.env` (gitignored, not committed) created for this phase with QA-only secrets,
  `PORT=3099`, and all service URLs pointed at the containers above.

## 1. Full migration chain against a real database

```bash
DATABASE_URL="postgresql://dauviet:dauviet@localhost:5432/dauviet?schema=public" \
  npx prisma migrate deploy
```

**Result: PASS_LIVE, but only after fixing 4 real, previously-undetected SQL defects.**

`prisma/migrations/20260904000000_phase03_historical_domain/migration.sql` had **never been
applied to any live database before this phase** (every Phase 03-11 report documented it as
`PASS_STATIC_MIGRATION_REVIEW`/`UNVERIFIED_LIVE_DB` - reviewed by inspection only, never
executed). Running it for the first time against a real Postgres surfaced 4 bugs, all the same
class: an enum-type-conversion `ALTER COLUMN ... TYPE ... USING (...)` statement referencing a
column by its **future/renamed** name, when at that exact point in migration history the column
still had its **original** name (the actual rename happens via separate `DROP COLUMN`/
`ADD COLUMN` statements later in the same file). Diagnosed by copying the migration SQL into the
container and running it directly with `psql -v ON_ERROR_STOP=1` (Prisma's own error message was
a generic cascading "current transaction is aborted" that hid the true first failure):

1. `MediaAsset.capturePrecision` (does not exist yet) -> fixed to `captureDatePrecision`
   (the actual current column name at that point).
2. `Person.birthPrecision`/`deathPrecision` (do not exist yet) -> fixed to
   `birthDatePrecision`/`deathDatePrecision`.
3. `HistoricalEra`/`Dynasty`/`Territory` `.startPrecision`/`.endPrecision` - these are genuinely
   **new** columns (a schema split of one `datePrecision` into two), not renames; there was no
   valid old column for the offline-generated diff to convert, so those invalid conversion
   statements were removed entirely.
4. Removing those (#3) left the **old** `datePrecision` column on those three tables still
   referencing the type Postgres was about to drop, so `DROP TYPE "DatePrecision_old"` failed
   with a dependency error - fixed by adding back a conversion of the old `datePrecision` column
   itself on those three tables (harmless, since it is dropped moments later in the same
   migration anyway, but required to satisfy Postgres's type-dependency check before the DROP).

All four fixes are inline in the migration file itself with a dated explanatory comment
("Phase 12 live-migration fix ..."), per the Phase 12 brief's instruction to document, not hide,
any historical-migration correction. This is safe because the file has genuinely never been
applied to any live database before now (confirmed by every prior phase's own
`UNVERIFIED_LIVE_DB` classification of it) - there is no live database anywhere with rows created
under the old, buggy version of this migration.

**Reproduce:**
```bash
docker compose up -d postgres redis minio
DATABASE_URL="postgresql://dauviet:dauviet@localhost:5432/dauviet?schema=public" npx prisma migrate deploy
```
All 11 migrations (`20260903000000_init` through `20260904000007_phase09_contributions`) now
apply cleanly, in order, from an empty database, with no manual intervention.

## 2. Real Nest API boot (no `SKIP_DB_CONNECT`)

```bash
npx nest build && node dist/main.js
```

**Result: PASS_LIVE, but only after fixing a real runtime dependency bug.**

First attempt failed immediately: `Error: Cannot find module 'express'`. Root cause:
`apps/api/src/main.ts` does `import { json, urlencoded } from 'express'` directly, but `express`
was never declared as a **direct** dependency of `apps/api/package.json` - it was only ever
resolved transitively via `@nestjs/platform-express`. Under pnpm's strict node_modules linking
(this workspace's package manager), a package's own top-level code cannot resolve a transitive
dependency at runtime, even though `tsc --noEmit` and every Jest unit test passed cleanly (Jest
never actually executes the compiled `dist/main.js` as a real OS process, so this class of bug
is invisible to every check every prior phase ran). This had been latent through all of
Phases 00-11. **Fixed** by adding `"express": "4.21.1"`, `"cookie-parser": "1.4.7"`,
`"helmet": "7.1.0"` as explicit direct dependencies of `apps/api/package.json` (matching versions
already resolved transitively) and re-running `pnpm install`.

After the fix, the real, complete Nest application boots cleanly:

```
[Nest] InstanceLoader ... every one of the 30+ real application modules initialized
[Nest] RouterExplorer ... all ~184 real routes mapped
[Nest] PrismaService  Connected to database
[Nest] NestApplication  Nest application successfully started
Dau Viet API listening on port 3099 (prefix: /v1, docs: /docs)
```

No hidden startup errors. Prisma connects to the real Postgres. `SKIP_DB_CONNECT` was **not**
set for this or any other server boot in this phase (per the Phase 12 brief's explicit
instruction) - it remains reserved for the offline OpenAPI-generation script only (see section 9).

## 3. Golden Dataset seed - idempotency and production safety, against real rows

```bash
npx tsx prisma/seed.ts   # run #1
npx tsx prisma/seed.ts   # run #2, identical output
```

**Result: PASS_LIVE.**

- Both runs produced identical terminal output, ending
  `Published 28/28 golden historical facts (100% of published facts carry >=1 VERIFIED
  citation ...)`.
- **Idempotency proven live**: a 31-row SQL count query across every entity and every join/
  relationship table, run before and after the second seed execution, showed **zero** duplicate
  rows anywhere.
- **Production-safety proven live** (the `upsert(... update: {})` contract, previously only
  theoretical/static per Phase 10): a seeded field was manually edited via direct SQL, the seed
  was re-run, and the manual edit was confirmed **not** overwritten - the empty `update: {}`
  behavior genuinely preserves editor corrections rather than silently reverting them.
- Baseline entity counts confirmed live and matching the documented Phase 10 baseline exactly:
  Place 12, Person 8, HistoricalEvent 8, HistoricalEra 6, Dynasty 3, Theme 4, Source 23,
  HistoricalFact 28, Citation 30, Story 5, Journey 3, EditorialSlot 5.

## 4. Repeatability - second independent fresh database

Per the Phase 12 brief's "strongly preferred" repeatability check (section 109): a second,
completely independent database (`dauviet_qa2`) was created, the full 11-migration chain was
applied to it, and the Golden Dataset was seeded into it, from scratch, with no reference to the
first database's state.

```bash
psql -U dauviet -d postgres -c "CREATE DATABASE dauviet_qa2 OWNER dauviet;"
DATABASE_URL="postgresql://dauviet:dauviet@localhost:5432/dauviet_qa2?schema=public" npx prisma migrate deploy
DATABASE_URL="postgresql://dauviet:dauviet@localhost:5432/dauviet_qa2?schema=public" npx tsx prisma/seed.ts
```

**Result: PASS_LIVE.** All 11 migrations applied cleanly (no further fixes needed - the Phase 03
migration fix from section 1 is now part of the historical migration file itself). Seed output
and entity counts were identical to section 3. The database was then dropped (disposable QA data
only, per the Phase 12 brief - `DROP DATABASE dauviet_qa2;`).

## 5. Critical HTTP flows - real requests against the real running server

All of the following were executed as real `curl` HTTP requests against the live server on
`http://localhost:3099`, not mocked/simulated. Representative evidence:

| Flow | Result |
|---|---|
| `GET /v1/health` | **PASS_LIVE** - `{"status":"ok","checks":{"api":"ok","database":"ok","redis":"ok"}}` - a real DB round trip and a real Redis PING, not an assumed-healthy stub |
| `X-Request-Id` | **PASS_LIVE** - present on every response header and echoed inside every error response body (`requestId` field), confirmed on both success and error (401/403/429) responses |
| `POST /v1/auth/register` | **PASS_LIVE** - real Argon2id hash stored, real row created, correct 201 + safe DTO (no password/hash in response) |
| `POST /v1/auth/login` (mobile mode, default) | **PASS_LIVE** - real access+refresh tokens issued, tokens in JSON body, no cookies set |
| `POST /v1/auth/login` (`X-Client-Platform: web`) | **PASS_LIVE** - httpOnly `dv_refresh` cookie (scoped to `/v1/auth`) + readable `dv_csrf` cookie both set correctly |
| CSRF enforcement (cookie mode) | **PASS_LIVE** - `/v1/auth/refresh` via cookie with no `X-CSRF-Token` header -> `403 AUTH_CSRF_INVALID`; same request with the correct header -> `201` success + rotation |
| Refresh rotation | **PASS_LIVE** - each refresh call returns a new, different refresh token and access token |
| Refresh reuse detection (theft response) | **PASS_LIVE** - re-presenting an already-rotated refresh token returns `401 AUTH_REFRESH_REUSE_DETECTED`; the token that had just been correctly issued from that rotation is **also** immediately revoked (cascading all-sessions revocation confirmed by then failing on the same new token too) |
| RBAC | **PASS_LIVE** - a plain `USER` gets `403 FORBIDDEN` on `GET /v1/admin/moderation/queue` and on `PATCH /v1/admin/users/:id/roles`; a self-role-escalation attempt (a user PATCHing their own roles to `ADMIN`) is correctly refused with `FORBIDDEN` |
| Rate limiting | **PASS_LIVE** - `POST /v1/auth/register` (limit 5/min) returns `201` for the first 5 requests in the window, then real `429 RATE_LIMITED` for the 6th/7th |
| `GET /v1/map/features` (real PostGIS, Vietnam bbox) | **PASS_LIVE** - real GeoJSON `FeatureCollection`, `[lng,lat]` coordinate order confirmed, both `hoang-sa` and `truong-sa` present at zoom 5 alongside Hoàng thành Thăng Long, Huế, Mỹ Sơn, Hội An |
| `GET /v1/places/nearby` (real PostGIS `ST_DWithin`) | **PASS_LIVE** - real meters-based `distanceMeters` values (0 at the exact point, 926, 7743 for progressively farther real places), sorted ascending |
| `GET /v1/timeline` | **PASS_LIVE** - real chronologically-ordered ERA/EVENT items from the Golden Dataset (Thời Lý 1009 -> dời đô 1010 -> Thời Trần 1225 -> Bạch Đằng 1288 -> ...) |
| `GET /v1/search` (pg_trgm + unaccent) | **PASS_LIVE, with a real bug found and fixed - see section 6** - both diacritic (`Hoàng thành Thăng Long`) and non-diacritic (`Hoang thanh Thang Long`) queries return the identical top result |
| `GET /v1/editorial/home`, `GET /v1/stories`, place/story detail | **PASS_LIVE** - real Golden Dataset content returned, correct locale resolution metadata |
| Media upload lifecycle | **PASS_LIVE** - see section 7 |
| Comments | **PASS_LIVE** - real comment created against a real place, appears in the place's comment listing with correct author/threading shape |
| Moderation queue | **PASS_LIVE** - real empty-queue response (no flagged content exists), correctly `401` when unauthenticated |
| Contributions | **PASS_LIVE** - a real `OTHER`-type contribution created, listed under `/contributions/mine`, then withdrawn (`withdrawnAt` set, `version` incremented - a real DB transaction path, not mocked) |
| Audit log | **PASS_LIVE** - real, DB-persisted entries for `media.upload.requested`/`media.upload.confirmed`/`media.processing.completed`/`auth.login` with correct `actorId`/`entityId`/`metadata`; `401` when unauthenticated |
| Private-field-leak spot check | **PASS_LIVE (clean)** - `/v1/users/me` and every other spot-checked live response contain no password hash or other internal-only field |
| SQL injection smoke test | **PASS_LIVE (safe)** - `q=x'; DROP TABLE "Place"; --` passed as a search query returns an empty, harmless result set (Prisma's tagged-template `$queryRaw` correctly parameterizes); the `Place` table was confirmed intact immediately after |

## 6. Real bug found and fixed: search relevance score (`GET /v1/search`)

**Result: real, live-only-detectable defect, found and fixed in this phase.**

Live search responses showed a malformed `score` field, e.g. `"score":"0.315789460.090"` and
`"score":"10.110"` (a string, not a valid single number). Root cause: `search.service.ts`
computed `(p."historicalImportance" * 0.01) as "importanceBonus"` in raw SQL - `historicalImportance`
is an integer column, and `integer * 0.01` (a numeric literal) produces a Postgres `numeric`
result. The `pg` driver (used underneath Prisma's `$queryRaw`) returns `numeric`/`decimal` columns
as **strings** by default (unlike `real`/`integer`, which come back as genuine JS numbers) - so
`similarity + row.importanceBonus` was silently doing **string concatenation**, not addition. This
was invisible to every unit test in Phases 00-11 because Jest's mocked Prisma stubs return plain
JS numbers, never exercising the actual `pg` driver's real NUMERIC-to-string behavior - it could
only ever be caught by a query executed against a real database.

**Fixed** in `apps/api/src/modules/search/search.service.ts` by explicitly coercing
`row.importanceBonus` with `Number(...)` before the addition, with an inline comment explaining
why. Verified live after the fix: the same query now returns
`"score":11.1`, `"score":0.40578946000000005`, etc. - real numbers, correctly sortable, ranking
order sensible. The full `apps/api/` automated test suite (44 suites / 572 tests) was re-run after
this fix and remains 100% green - the mocked unit tests never exercised this path either way, so
the fix carries no unit-test regression risk, and is now additionally proven correct live.

## 7. Media upload lifecycle - real MinIO + real Redis/BullMQ + real `sharp` processing

**Result: PASS_LIVE**, full end-to-end round trip, not simulated at any step:

1. `POST /v1/media/uploads` (as a `CONTRIBUTOR`) -> real presigned MinIO PUT URL returned.
2. A real 287-byte JPEG file was `PUT` directly to that presigned URL -> real `200 OK` from MinIO
   itself (`Server: MinIO` response header, real ETag).
3. `POST /v1/media/uploads/:id/confirm` -> server performed a real `HeadObject` + magic-byte
   signature check + streamed SHA-256 against the real object in the bucket; status transitioned
   `PENDING_UPLOAD -> UPLOADED`; a real BullMQ job was enqueued on the real Redis instance.
4. Polling `GET /v1/media/:id` ~3s later showed status `READY`, with **four real derivative
   images actually generated by `sharp`** (not stubbed): `THUMBNAIL`/`MEDIUM`/`LARGE` WebP plus an
   `OPTIMIZED_WEB` AVIF, each with real `width`/`height`/`sizeBytes`, each independently uploaded
   to MinIO under `derivatives/<type>/...`.
5. A bucket (`dauviet-media`) had to be created manually via `mc mb` before any of this worked -
   confirmed via grep that `S3Service` never calls `CreateBucket` anywhere; **this is a real
   deployment gap, documented below (section 11), not a Phase 12 blocker** since it is a one-time
   infra-provisioning step, not application logic.

This is the single most end-to-end live confirmation in this phase: a real object landed in real
object storage, a real background worker picked it up off a real queue, and real image-processing
library code produced real, independently-stored derivative files - the entire async pipeline
Phase 05/05.1 built and only ever unit-tested against mocks.

## 8. Query plans (`EXPLAIN`) - index usage on representative Map/Nearby/Search queries

| Query | Plan | Assessment |
|---|---|---|
| Map bbox (`ST_Intersects` + `publicationStatus`) | `Index Scan using "Place_location_gist"` | **PASS_LIVE** - the GiST spatial index is used as intended |
| Nearby (`ST_DWithin(location::geography, ...)`) | `Seq Scan on "Place"` | **DEFERRED_ACCEPTED** - correct planner choice at the current 12-row dataset size, but the `::geography` cast on `location` prevents the geometry GiST index from being used for this specific predicate shape; harmless today, worth a geography-typed or functional index before real-world data volume |
| Search (`similarity(immutable_unaccent(lower(name)), ...)`) | `Seq Scan on "PlaceTranslation"` | **DEFERRED_ACCEPTED** - no `GIN ... gin_trgm_ops` functional index exists over the unaccented/lowercased name expression on any translation table; correct/fast at V1 dataset size, but will not scale - add a trigram GIN index on the relevant expression before production traffic |

Neither deferred item blocks Phase 12 freeze: both are real, honestly-documented scale
considerations for a future phase, not defects in current behavior at the Golden Dataset's size,
and both were already implicitly flagged by the "no separate search cluster for V1" design note
already in `search.service.ts`.

## 9. OpenAPI - live vs. committed contract

```bash
pnpm --filter @dauviet/api openapi:generate   # regenerates docs/backend/openapi.json (SKIP_DB_CONNECT, offline)
curl -s http://localhost:3099/docs-json -o /tmp/openapi-live.json   # from the real running server, no SKIP_DB_CONNECT
```

**Result: PASS_LIVE - zero drift.** `pnpm openapi:generate` reproduced the exact same committed
`docs/backend/openapi.json` (0-line diff). The **live server's** `/docs-json` output differs from
the committed file only in JSON formatting (minified vs. pretty-printed) - after normalizing both
(recursive key-sort + re-serialize), they are **byte-identical** (162 paths, 94 schemas, both
sides). The real running application's Swagger document and the offline-generated,
committed-to-git contract are provably the same document.

## 10. Automated test suite (re-run after every live fix in this phase)

```bash
npx tsc --noEmit                          # PASS - no errors
npx eslint "{src,test}/**/*.ts"           # PASS - 0 problems
npx nest build                            # PASS - clean
npx jest                                  # PASS - 44 suites, 572/572 tests
```

Identical counts to the Phase 11 baseline (44 suites / 572 tests) - confirming that both live
fixes made in this phase (the migration SQL fixes in section 1, the `express` dependency fix in
section 2, and the search-score fix in section 6) introduced **zero** regressions against the
existing mocked unit-test suite, while being independently proven correct against real
infrastructure above.

## 11. Known limitations carried forward (honest, not hidden)

- **MinIO bucket bootstrap is manual.** `S3Service` never calls `CreateBucket`; a real deployment
  must provision the `dauviet-media` bucket (and its lifecycle/policy configuration) once, out of
  band, before first boot. Not a Phase 12 blocker (this phase did exactly that, manually, to
  prove the rest of the pipeline) but should be a documented deployment runbook step, not
  assumed.
- **No trigram GIN index / no geography-typed spatial index** for Search/Nearby respectively (see
  section 8) - both are safe at current Golden Dataset scale, both should be added before
  production-scale traffic.
- **Google OAuth remains `UNVERIFIED_EXTERNAL_CREDENTIAL`** - no real Google Cloud OAuth app
  credentials exist in this environment; the redirect-based flow is implemented but was not
  exercised against Google's real endpoints in this phase (out of scope - no credentials to test
  with, not an infrastructure limitation this phase's Docker/WSL2 fix could address).
  Email verification/reset was **not** re-tested live in this phase (Mailhog was intentionally
  not started to avoid the port collision documented in section 0.) - this remains `PASS_STATIC`,
  unchanged from Phase 02's unit-tested logic.
- Rate limiting tracks by IP only, not per-account - unchanged design note from Phase 02, now
  additionally confirmed working live as designed (section 5).

## 12. Session continuity note

This phase's work spanned a session interruption. Docker Desktop was found stopped a second time
partway through the phase (after the earlier live-verification work in sections 1-9 had already
completed against it) - confirmed via `wsl -l -v` showing the `docker-desktop` WSL distro state
as `Stopped`, consistent with a host machine idle/restart between the two working periods, not
any destructive action taken against it. It was restarted the same safe way as the first time
(`Docker Desktop.exe`, polled `docker info` until ready, ~30s) - all three containers came back
healthy with their existing named volumes intact (`dauviet_postgres_data`/`dauviet_redis_data`/
`dauviet_minio_data` were never removed), and the second-database repeatability proof (section 4)
and final health/OpenAPI-drift checks (sections 4, 9) were completed after this restart, against
the same already-migrated-and-seeded `dauviet` database, confirming no state was lost.

## 13. Reproduce this report end-to-end

```bash
# 1. Infra
docker compose up -d postgres redis minio

# 2. Migrate + seed (drop/recreate the QA DB first if re-running from scratch)
DATABASE_URL="postgresql://dauviet:dauviet@localhost:5432/dauviet?schema=public" npx prisma migrate deploy
DATABASE_URL="postgresql://dauviet:dauviet@localhost:5432/dauviet?schema=public" npx tsx prisma/seed.ts

# 3. Bootstrap the MinIO bucket (one-time, manual - see section 11)
mc alias set local http://localhost:9000 dauviet dauviet123
mc mb local/dauviet-media

# 4. Build + boot the real server (apps/api/.env must be configured; see section 0)
cd apps/api && npx nest build && node dist/main.js

# 5. Smoke-test
curl http://localhost:3099/v1/health
```

---

# Phase 12.1 — Contribution Catalogue Transaction Verification

Date: 2026-09-05/06. Scope: a single, narrow remediation of the one Phase 12 freeze gate that
was previously only asserted in summary form ("Contributions (create/withdraw with real
transactions)") without live evidence for the Phase 09 catalogue pipeline specifically. Nothing
else from Phase 12 was redone or altered. Continued against the same live infrastructure and the
same disposable `dauviet` QA database as Phase 12 (Docker Desktop needed a second restart at the
start of this remediation - same "app process simply wasn't running" root cause as Phase 12,
same safe fix, all three containers came back healthy with existing volumes/data intact).

## 1. Workflow used and identities

Six fresh, disposable, cleanly role-separated QA identities were registered via the real
`/v1/auth/register` + `/v1/auth/login` endpoints (never sharing a login with more than one role,
so every role-gate check below is a genuine cross-account test, not a same-account
coincidence): `qa121-contributor` (CONTRIBUTOR only), `qa121-editor` (EDITOR only),
`qa121-historian` (HISTORIAN_REVIEWER only), `qa121-admin` (ADMIN only), `qa121-moderator`
(MODERATOR only), `qa121-userb` (plain USER, for the privacy check).

A disposable, clearly-synthetic fixture was created through the real HTTP API:

```bash
POST /v1/contributions   (as qa121-contributor)
{ "type": "BOOK_REFERENCE", "title": "Phase 12.1 QA Catalogue Fixture",
  "description": "Synthetic, disposable, test-only contribution created solely to exercise the
  Phase 09 catalogue transaction pipeline against a real PostgreSQL database. Not a real
  historical claim.", "submitterDeclaration": "OWN_MATERIAL" }
```

## 2. Live workflow: SUBMITTED → CATALOGUED

All transitions below were real HTTP calls against the real running server (no `SKIP_DB_CONNECT`),
verified via both the API response and a direct `psql` read of the live row after each step.

| Step | Actor | Result |
|---|---|---|
| SUBMITTED -> TRIAGE | qa121-editor, APPROVE | PASS_LIVE |
| TRIAGE -> PROVENANCE_REVIEW | qa121-editor, APPROVE | PASS_LIVE |
| PROVENANCE_REVIEW -> HISTORICAL_REVIEW | qa121-editor, APPROVE | PASS_LIVE |
| HISTORICAL_REVIEW -> ACCEPTED, attempted by EDITOR | qa121-editor, APPROVE | **correctly refused**: `403 CONTRIBUTION_REVIEW_REQUIRED` ("Completing HISTORICAL_REVIEW requires one of: HISTORIAN_REVIEWER, ADMIN") - the historical-accuracy checkpoint is genuinely stricter, live-confirmed |
| HISTORICAL_REVIEW -> ACCEPTED | qa121-historian, APPROVE | PASS_LIVE |
| Self-review (submitter, temporarily also granted EDITOR, reviews own contribution) | qa121-contributor | **correctly refused**: `403 CONTRIBUTION_SELF_REVIEW_FORBIDDEN` ("You cannot review your own contribution, regardless of role.") - live-confirmed the guard is role-independent, not just an RBAC gate; the temporary EDITOR grant was reverted immediately after this one check |
| Rights review -> APPROVED_FOR_CATALOGUE | qa121-historian | PASS_LIVE |
| Catalogue attempted before rights review was set | qa121-historian | **correctly refused**: `400 CONTRIBUTION_RIGHTS_INCOMPLETE` |
| Catalogue attempted by MODERATOR | qa121-moderator | **correctly refused**: `403 Forbidden` (route-level `@Roles(HISTORIAN_REVIEWER, ADMIN)` - a MODERATOR does not become a historical-provenance reviewer merely by moderating UGC) |
| ACCEPTED -> CATALOGUED via `POST /admin/contributions/:id/catalogue/source` | qa121-historian | PASS_LIVE - see section 3 |

## 3. Catalogue source - live database state before/after

```sql
-- before
Source_total=23, ContributionCatalogueResult_for_fixture=0, HistoricalFact_total=28,
Citation_total=30, AuditLog_for_fixture=6

-- POST /v1/admin/contributions/:id/catalogue/source (qa121-historian)

-- after
Source_total=24 (+1), ContributionCatalogueResult_for_fixture=1 (+1), HistoricalFact_total=28
(unchanged), Citation_total=30 (unchanged), AuditLog_for_fixture=7 (+1),
Contribution.status=CATALOGUED
```

**HistoricalFact trust boundary - live DB evidence, not source-code reasoning**: a direct query
confirmed zero `Citation` rows reference the newly-created `Source` (`HistoricalFact_citing_this_
source = 0`). `CATALOGUED contribution != PUBLISHED HistoricalFact` is proven, not assumed - the
catalogue action created exactly one `Source` row and one `ContributionCatalogueResult` row, and
nothing else.

**Audit log** (real, DB-persisted row, checked directly): `actorId` = the historian's real user
id, `action` = `contribution.catalogued.source`, `entityType` = `CONTRIBUTION`, `entityId` = the
fixture's id, `metadata` = `{"sourceId": "<the new Source's id>"}`, real `createdAt` timestamp.

## 4. Idempotency - exact before/after counts (mandatory)

The identical catalogue action was invoked a second time against the same (now-`CATALOGUED`)
contribution, with different (deliberately wrong) input (`title: "Should be ignored"`,
`credibilityLevel: "PRIMARY"`) to prove the early-return path ignores new input entirely:

```
before: sources=24, catalogue_results=1, audit_entries=7
after:  sources=24, catalogue_results=1, audit_entries=7   (all three unchanged)
```

The second call's response was byte-identical to the first (`id`, `sourceId`, and original
`createdAt` timestamp all matched exactly) - proof that the second call is a genuine no-op read of
the existing row, not a silently-successful duplicate write. No new audit log entry was created on
the idempotent path either (the early `if (existing) return existing;` in
`ContributionsService.catalogueSource` returns before the `$transaction` and before the
`audit.log` call are ever reached).

## 5. Transaction atomicity / rollback - real defect found and fixed

A dedicated, permanent, real-database e2e test suite was added:
`apps/api/test/contribution-catalogue.e2e-spec.ts` (plus a shared
`apps/api/test/bootstrap-test-app.ts` helper - see section 6). Its second test exercises the exact
`tx`-threading contract `ContributionsService.catalogueSource`/`catalogueDocument`/
`catalogueMedia` all rely on: it calls the real `SourcesService.create(dto, actorId, tx)` inside a
real `prisma.$transaction(...)`, then deliberately throws immediately afterward, and inspects the
real database once the transaction has rejected.

**First run (before any fix) - real, live-only-detectable defect found:**
- The `Source` row itself was correctly rolled back (0 leaked rows, confirmed by both a count and
  a direct `findFirst` for the exact test title) - **the core catalogue-transaction atomicity the
  freeze gate requires is real and correct.**
- However, the `source.created` **audit log entry survived the rollback** (`auditCountAfter ===
  auditCountBefore + 1`, empirically measured, not assumed) - root cause: `AuditService.log`
  always wrote through the ambient `PrismaService`, never the `Prisma.TransactionClient` its
  caller (`SourcesService.create`, called with an in-flight `tx`) was itself given. `SourcesService.
  create`/`addDocument` and `MediaService.promote` all correctly accept and use an optional `db`/
  `tx` parameter for their own writes, but each then called `this.audit.log(...)` with no such
  parameter - so the audit trail, uniquely among all the writes in a catalogue transaction, was
  never actually atomic with it. This was invisible to every prior phase because no e2e test had
  ever been executed against a real database before Phase 12/12.1, and no unit test mocks a real
  Postgres rollback.

**Fixed**: `AuditService.log(entry, db: Db = this.prisma)` now accepts the same optional
`db`/`Prisma.TransactionClient` parameter as `SourcesService`/`MediaService` already did, and the
three call sites that participate in a caller-supplied transaction (`SourcesService.create`,
`SourcesService.addDocument`, `MediaService.promote`) now pass their own `db` through instead of
always using the ambient client. This is a narrowly-scoped fix - `AuditService.log`'s many other
call sites across the codebase (which never receive an external `tx` and always intend to write
immediately) are unchanged and unaffected, since the new parameter defaults to the previous
ambient-`this.prisma` behavior.

**Re-run after the fix**: the same rollback probe now shows `auditCountAfter === auditCountBefore`
- the audit entry rolls back along with the Source row. The catalogue transaction (Source +
ContributionCatalogueResult + Contribution.status + its own audit trail) is now **fully atomic**,
proven against a real PostgreSQL rollback, not by code inspection.

## 6. A second, structural finding: e2e test bootstrap was missing real guards/interceptors

While building the e2e test above, its first run failed in a way that led to a second genuine,
independent finding: `main.ts`'s `bootstrap()` function wires up `JwtAuthGuard`, `RolesGuard`,
`AllExceptionsFilter`, and `ResponseInterceptor` **imperatively** (`app.useGlobalGuards(...)` /
`useGlobalFilters(...)` / `useGlobalInterceptors(...)`) - none of these are registered as
`AppModule` providers (only `ThrottlerGuard` is, via `APP_GUARD`). Every e2e test in this repo
(the pre-existing `health.e2e-spec.ts` included) built its `INestApplication` via
`Test.createTestingModule({ imports: [AppModule] })` and only replicated the prefix/validation-
pipe subset of `main.ts`'s bootstrap - never the guards, filters, or interceptor. The practical
effect: **any such e2e test runs with authentication/authorization effectively disabled and the
`{success,data}`/`{success,error}` response envelope absent**, silently making every RBAC/self-
review assertion in an e2e test meaningless (the guard that would enforce a role never runs) and
every `res.body.data.*` access `undefined`. This had never been caught because no `*.e2e-spec.ts`
file in this repository had ever actually been executed before this phase (`.e2e-spec.ts` does not
match the unit-test `jest.config.js`'s `.spec.ts$` pattern, and `pnpm test:e2e` requires live infra
every prior sandbox lacked).

**Fixed**: added `apps/api/test/bootstrap-test-app.ts`, a single shared helper that constructs the
`INestApplication` exactly the way `main.ts` does (helmet, cookie-parser, body-size limits, CORS,
prefix, validation pipe, `AllExceptionsFilter`, `ResponseInterceptor`, and both global guards).
Both `health.e2e-spec.ts` and the new `contribution-catalogue.e2e-spec.ts` now build their app
through this helper, so both actually exercise the real security posture, not a stripped-down
unguarded one.

## 7. Privacy, RBAC, and public-boundary re-checks (both manual live curl and the new automated e2e test)

| Check | Result |
|---|---|
| User B (plain USER, unrelated) fetches User A's (contributor's) private contribution via `GET /v1/contributions/mine/:id` | **PASS_LIVE** - `403 FORBIDDEN`, "You do not have access to this contribution." - no body/provenance/media metadata in the error response |
| Raw contribution title in `GET /v1/search` | **PASS_LIVE** - the contribution's own exact title never appears; only the legitimately-catalogued Source's (different, "... Source" suffixed) title does, which is correct and intentional now that it is canonical |
| Raw contribution title in `GET /v1/editorial/home` | **PASS_LIVE** - zero occurrences |
| MODERATOR attempts a catalogue action | **PASS_LIVE** - `403 Forbidden`, confirmed both manually and in the automated e2e suite |
| Self-review (any role) | **PASS_LIVE** - `403 CONTRIBUTION_SELF_REVIEW_FORBIDDEN`, confirmed live with a temporarily-elevated submitter account (reverted immediately after) |

## 8. Automated regression (after the audit-transaction fix)

```bash
npx tsc --noEmit                          # PASS - no errors
npx nest build                            # PASS - clean
npx eslint "{src,test}/**/*.ts"           # PASS - 0 problems
npx jest                                  # PASS - 44 suites, 572/572 tests (one pre-existing
                                           # assertion in media.service.spec.ts updated to match
                                           # audit.log's new second `db` parameter - a mechanical
                                           # signature-change update, not a behavior change)
```

Exact counts unchanged from the Phase 12 baseline (44 suites / 572 tests) - the fix and the new
parameter are additive/optional and touch no other call site's behavior.

## 9. New permanent integration/E2E coverage

```bash
DATABASE_URL=... REDIS_URL=... [full env, see apps/api/.env] npx jest --config ./test/jest-e2e.json
```

**Result: PASS - 2 suites, 3 tests** (previously 0 suites had ever actually been executed):

- `health.e2e-spec.ts` (1 test) - now actually runs, through the corrected bootstrap.
- `contribution-catalogue.e2e-spec.ts` (2 tests, new):
  1. The full real-HTTP `SUBMITTED -> TRIAGE -> PROVENANCE_REVIEW -> HISTORICAL_REVIEW ->
     ACCEPTED -> CATALOGUED` workflow across three distinct role-separated accounts, the
     EDITOR-forbidden-at-HISTORICAL_REVIEW gate, the rights-review-incomplete gate, exact-count
     idempotency, the HistoricalFact/Citation trust boundary, the privacy boundary, and the public
     search boundary - all in one real-database run, permanently protecting this freeze gate from
     future regression.
  2. The transaction-rollback probe from section 5, now asserting the fixed (fully-atomic,
     audit-log-included) behavior as a permanent regression guard.

This closes spec section 17's requirement for a retained real-DB integration/E2E test covering
"Contribution accepted -> catalogue Source -> result -> CATALOGUED" plus idempotency and rollback.

## 10. Six final freeze gates - explicit re-statement

1. **Fresh migration chain** - PASS (Phase 12, section 1 and 4 of the main report above; unchanged this phase).
2. **Golden seed second run** - PASS (Phase 12, section 3 and 4; unchanged this phase).
3. **PostGIS / Map / Search** - PASS (Phase 12, section 5 and 6; unchanged this phase).
4. **MinIO + Redis + BullMQ + Sharp** - PASS (Phase 12, section 7; unchanged this phase).
5. **Web auth / CSRF / refresh** - PASS (Phase 12, section 5; unchanged this phase).
6. **Contribution catalogue transaction** - **PASS**, now closed by this Phase 12.1 remediation:
   real live workflow through CATALOGUED, exact before/after idempotency counts, real-database
   rollback/atomicity proof (with one real defect found and fixed along the way), the
   HistoricalFact trust boundary proven by live query, and a permanent e2e regression test added.

