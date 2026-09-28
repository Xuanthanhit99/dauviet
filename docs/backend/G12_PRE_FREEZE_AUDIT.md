# G12 — Pre-Freeze Audit

Audience: the external reviewer who will decide the Backend V2 freeze, and whoever runs G12's
certification. This is the state of the backend **as found at the start of G12**, before any
G12 change, plus the remediation and certification plan derived from it. Results are in
`G12_FINAL_REPORT.md`; per-requirement evidence is in `G12_ACCEPTANCE_GATE_MANIFEST.md`.

## 1. Baseline

| Item | Value |
|---|---|
| Branch / HEAD | `main` @ `9931a16` ("docs: close Country Detail V1 with verified Consumer QA") |
| Committed state | V1 + G01–G06.5. G07–G11 are **uncommitted** in the working tree (each phase brief forbade committing); G12 continues that rule (read-only git only). |
| Working tree at start | 87 porcelain entries: 24 modified tracked files (API modules, docs, `schema.prisma`, `openapi.json`), untracked G07–G11 code/tests/docs, 4 untracked migrations (G08–G11), `scripts/g11-perf/`, and `frontend-pass-10/`. |
| Concurrent ownership | `frontend-pass-10/` (own `.git`, concurrently owned) — not read for modification, never touched. No backend test depends on it. |
| Accepted verdicts | G00–G06, G07, G08, G09, G11 COMPLETE/LOCKED; G06.5 and G10 COMPLETE_WITH_ENVIRONMENT_BLOCKERS. |
| Accepted G11 numbers | 98/98 unit suites (1352 tests), 12/12 e2e suites (271 tests), OpenAPI 314 paths. |
| Re-measured at G12 start | Unit **98/98 suites, 1352/1352** (22 min on the loaded host). `tsc --noEmit` clean. ESLint over **all** of `src` and `test`: **12 errors** (G11 had linted only its own files). |

Infrastructure: Docker Desktop. The Dấu Việt containers (`dauviet-postgres-1` on 57000, `dauviet-redis-1`
on 6379, `dauviet-minio-1` on 9000) were stopped and were started for G12. Three containers of an
unrelated project (`beaconvie-postgres` 5433, `beaconvie-redis` 6380, `beaconvie-mailpit` 1025/8025)
share the host; G12 never addresses them. `dauviet-mailhog-1` was left stopped because its port
1025 is taken by the other project's mail catcher (email is fail-soft, see §9).

## 2. Migration inventory (G00–G11)

24 migrations, all applied on the dev DB, every `_prisma_migrations.checksum` equal to the sha256 of
its file (script: `scratchpad migration-inventory.js`; table below).

| # | Migration | Tables | Idx | FK (cascade/set null) | Notable |
|---|---|---|---|---|---|
| 1 | `20260903000000_init` | 59 | 91 | 87 (59/20) | `pg_trgm`, `postgis` (IF NOT EXISTS) |
| 2 | `…000001_search_and_spatial_indexes` | 0 | 15 | 0 | raw trigram/GIST indexes |
| 3 | `…000002_phase02_auth_hardening` | 0 | 0 | 0 | +2 columns |
| 4 | `20260904000000_phase03_historical_domain` | 4 | 10 | 4 | 25 `DROP COLUMN` (V1, accepted) |
| 5–11 | phase04 trust → phase09 contributions | 10 | 32 | 24 | phase06: 2 `DROP COLUMN`, 2 `DROP INDEX` (V1, accepted); phase07 `unaccent` |
| 12 | `20260906000000_g01_global_geography` | 8 | 24 | 11 | additive |
| 13 | `20260907000000_g02_provider_licensing` | 8 | 16 | 9 | additive |
| 14 | `20260908000000_g03_global_historical_knowledge` | 3 | 13 | 9 | 14 `CHECK`, one-time chronology backfill (6 UPDATE) |
| 15 | `20260909000000_g04_destination_discovery` | 8 | 19 | 15 | additive |
| 16–17 | `20260910…_g05_*` | 26 | 74 | 50 | additive + enum values |
| 18 | `20260911103710_g06_trip_planner_cost_engine` | 9 | 32 | 25 | additive |
| 19 | `20260922093507_g06_5_knowledge_ingestion` | 12 | 26 | 19 | additive |
| 20 | `20260922100000_g07_trip_collaboration` | 3 | 7 | 7 | partial unique (pending invitation) |
| 21 | `20260923000000_g08_trip_location_sharing` | 2 | 6 | 4 | unique (tripId,userId) ×2 |
| 22 | `20260924000000_g09_trip_expense_settlement` | 3 | 8 | 9 | no FK to TripMember |
| 23 | `20260925000000_g10_affiliate_attribution` | 4 | 14 | 14 (4/10) | unique (providerId, providerConversionId) |
| 24 | `20260926000000_g11_global_search_map` | 4 | 16 | 1 | 3 functions, 33 triggers |

Destructive statements exist only in accepted V1 migrations (phase03/phase06), each documented in
its own file. Every `CREATE EXTENSION` is `IF NOT EXISTS`. Extensions on the dev DB: `pg_trgm 1.6`,
`plpgsql 1.0`, `postgis 3.4.3`, `unaccent 1.1`.

**Recurring drift artifact, re-examined.** Since G04 every phase has stripped the same
`prisma migrate diff` output: `ALTER TYPE "EntityKind" ADD VALUE 'FACT'` plus 17 `DROP INDEX`
statements. The 17 index drops are a genuine artifact (raw-SQL trigram/GIST/importance indexes that
Prisma cannot model). **The `FACT` half is not.** See P1-2.

## 3. Schema inventory

165 public tables on the dev DB. Domains: auth/users/sessions; V1 knowledge (place/person/event/era/
dynasty/territory/fact/source/citation/media/story/journey/community/contribution/moderation/audit);
G01 geography; G02 provider/licensing (8); G03 chronology ordinals + country links; G04 discovery
composition (8); G05 stay/food/activity + provider references/offers/snapshots (26); G06 trip +
itinerary + cost engine (9); G06.5 ingestion (12); G07 collaboration (3); G08 location (2); G09
expense/settlement (3); G10 affiliate (4); G11 search projection (4).

DB-level invariants found: uniqueness for every idempotency key (`TripMember(tripId,userId)`,
pending `TripInvitation(tripId,email)`, `TripLocationSharing(tripId,userId)`,
`TripMemberLocation(tripId,userId)` = one mutable latest-location row, `TripExpenseShare(expenseId,
userId)`, `AffiliateConversion(providerId,providerConversionId)`, `AffiliateClick.redirectTokenHash`,
`AffiliateSession.campaignKey`, `ProviderBookingReference(providerId,externalBookingReference)`).
**No CHECK constraint** protects money sign, share range, settlement parties or coordinate range —
service-only (see P2-4).

## 4. Route inventory

Baseline OpenAPI: **314 path templates / 363 operations**, generated from the real `AppModule`.
Auth model: global `JwtAuthGuard` (skipped only by `@Public()`), global `RolesGuard` (`@Roles`),
`OptionalJwtAuthGuard` on the G10 click route, trip capability checks in-service
(`TripAuthorizationService`), global `ThrottlerGuard` (120/60 s, route overrides for auth and
search). G12 classifies every runtime route automatically (PUBLIC / AUTHENTICATED /
TRIP_CAPABILITY / ADMIN / INTERNAL / PROVIDER_CALLBACK) — see §12 plan item "route classification".

JWT: `JwtStrategy.validate` re-reads `Session` and `User` on **every** request (roles, status,
revocation) — no authorization cache exists anywhere; trip role/membership/location/archive are
read inside the request's own transaction.

## 5. Environment inventory

62 variable names referenced by code/tests/scripts (full classification: `G12_ENVIRONMENT_MATRIX.md`).
`env.validation.ts` enforced only: `DATABASE_URL`/`REDIS_URL` are strings (an empty string passed),
JWT secrets ≥ 32 chars. `.env.example` lacked every G08/G10/G11 variable.

## 6. Queue / worker inventory

| Worker | Transport | Runs in | Retry | Dedup | Authority |
|---|---|---|---|---|---|
| `media-processing` | BullMQ (Redis) | API process | 3 attempts, exponential 5 s | `jobId = process-<mediaId>` | `MediaAsset` row in PostgreSQL; processor re-reads state and skips non-processable rows |
| `knowledge-ingestion` | BullMQ (Redis) | API process | job `attempts: 1` (queue default 3 overridden at enqueue) | run/checkpoint rows | `IngestionRun`/`IngestionCheckpoint` in PostgreSQL |
| search projection | PostgreSQL queue (`SearchProjectionQueue`) + in-process `setInterval` | API process | queue row kept on failure, claim timeout 60 s | per-entity advisory lock + claim token | canonical tables; projection is disposable |

There is no separate worker binary: "boot workers" = boot the API. Redis holds only BullMQ state (no
cache, no sessions, no throttler storage — the throttler is in-memory per process).

## 7. Known external blockers (carried in, unchanged)

GeoNames and Google Places live credentials (G06.5); Booking.com, Agoda, Viator partner approval and
credentials (G10). All fail closed today. Full matrix: `G12_EXTERNAL_INTEGRATION_MATRIX.md`.

## 8. Findings at audit time (before any G12 change)

Severity per the brief: P0 blocks everything, P1 blocks freeze, P2/P3 must be explicit.

| Id | Sev | Finding | Evidence |
|---|---|---|---|
| P1-1 | P1 | **Production seed is unsafe.** `prisma/seed.ts` (documented as the production Golden-Dataset seed) creates six loginable accounts, including `admin@dauviet.vn` with role ADMIN and the hardcoded password `DevPassword123!`, and activates `TEST_PROVIDER_G05_FIXTURE` (ACTIVE SANDBOX integration + APPROVED license). G05 offer display evaluates the SANDBOX integration unconditionally, so fixture prices would be served publicly. No production guard exists. | `seed.ts` `upsertDevUser`, G05 block; `accommodations.service.ts:357` `environment: 'SANDBOX'` |
| P1-2 | P1 | **`EntityKind.FACT` is missing from the database enum.** `schema.prisma` declares it and `CitationsService`/`FactsService` write it as `AuditLog.entityType` (citation created/verified/disputed/rejected, fact linked, fact editorial transitions); `init` created the enum without it and no migration ever added it. On any migration-built database those writes fail. Proven: `INSERT … 'FACT'` → `invalid input value for enum "EntityKind": "FACT"`; the dev DB holds **0** citation/fact audit rows. | §2; `citations.service.ts:39,57,70,83`, `facts.service.ts:147,285,309` |
| P1-3 | P1 | **Negative expense shares accepted.** EXACT and PERCENTAGE splits check only that shares sum to the amount; `@IsNumberString` admits a leading `-`, so `150 / -50` of a 100 expense is stored — a hidden transfer that G09-GATE-028 rules out. PERCENTAGE also accepted > 2 decimals, which the `Decimal(5,2)` column silently rounds. Proven with four new unit tests that fail on the unmodified service. | `trip-expenses.service.ts` `resolveSplit` |
| P1-4 | P1 | **Fail-open production CORS.** With `CORS_ORIGINS` empty, `main.ts` sets `origin: true` (reflect any origin) together with `credentials: true`, in every environment; nothing refuses it in production. | `main.ts` `enableCors` |
| P2-1 | P2 | Seeded Golden-Dataset chronology missing (G11 carry-over): 13 events, 9 eras, 3 dynasties, 10 people and 31 dated facts have NULL ordinals, so strict period filters and chronology ordering treat them as unknown. Six further eras (`zqmuey…`) are e2e leftovers with UNKNOWN dates. | §10 |
| P2-2 | P2 | E2E runs `FLUSHALL` on the shared dev Redis (G11 carry-over). | `search-map.e2e-spec.ts:119` |
| P2-3 | P2 | `.env.example` placeholder JWT secrets (`change-me-…`, ≥ 32 chars) pass validation; identical access/refresh secrets accepted; empty `DATABASE_URL` accepted; `APP_URL` silently defaults to localhost (all emailed links); `SKIP_DB_CONNECT=true` honoured in production. | `env.validation.ts`, `configuration.ts` |
| P2-4 | P2 | No DB-level CHECK for money sign, share range, settlement parties, coordinate range. | §3 |
| P2-5 | P2 | No graceful shutdown: `main.ts` never calls `enableShutdownHooks()`, so on SIGTERM no `OnModuleDestroy` runs (search worker drain wait, BullMQ close, Prisma disconnect). | `main.ts` |
| P2-6 | P2 | Google OAuth links a Google identity to an existing account **by email** without checking Google's `email_verified`. Google is not configured anywhere (external blocker), so not reachable today. | `google.strategy.ts`, `auth.service.ts:446` |
| P2-7 | P2 | Health is a single endpoint mixing liveness and readiness; the Redis probe `await queue.client` may block while Redis is unreachable. To be measured (Path D). | `health.controller.ts` |
| P2-8 | P2 | ESLint: 12 errors across `src`/`test` (unused imports/vars, a `require`). | lint baseline |
| P3-1 | P3 | `MailerService` logs the recipient email address on SMTP failure. | `mailer.service.ts:55` |
| P3-2 | P3 | SMTP transport has no authentication settings (host/port/secure only); a production relay must accept unauthenticated submission from the API host, or code is needed. | `mailer.service.ts` |
| P3-3 | P3 | Refresh/CSRF cookies are `Secure` only when `NODE_ENV=production` (a staging deployment must run with `NODE_ENV=production`). | `auth.controller.ts` |
| P3-4 | P3 | Swagger UI `/docs` is served in every environment (public contract only; no secret). | `main.ts` |
| P3-5 | P3 | `.env.example` missing G08/G10/G11 variables. | §5 |

## 9. Remediation plans

**A — Chronology (P2-1).** Evidence is the row's *own* stored, cited date columns (sources:
`docs/backend/golden-data/sources-manifest.md`); the ordinal is the accepted G03 pure function of
them — no new historical claim, no model knowledge. Two halves: (1) the seed writes the ordinals for
new rows via CE-only helpers in `prisma/golden/helpers.ts` (the seed's established "mirror, don't
import" convention), proven equal to `historical-date.util` for every Golden-Dataset spec by a new
parity spec; (2) new additive data migration `20260927000000_g12_chronology_backfill` recomputes the
G03 formula for existing rows **only** where both ordinals are NULL, the start is known and CE.
Undated rows stay unknown. Period-filter semantics unchanged. Then refresh the G11 projection
(triggers enqueue automatically) and prove before/overlap/after/unknown over HTTP. No seeded row is
BCE, so BCE proof uses API-created entities (as G11 did).

**B — Redis isolation (P2-2).** BullMQ is the only Redis user. Add `REDIS_KEY_PREFIX` (default `bull`
= BullMQ's own default, so deployments are unchanged) wired into `BullModule.forRootAsync`. Jest e2e
`globalSetup` sets a unique `dv-e2e:<run>` prefix; `globalTeardown` SCAN+UNLINKs only that namespace
and asserts it is empty; the search-map "Redis is not the authority" test wipes the run namespace
instead of `FLUSHALL`. A guard refuses cleanup of any prefix not matching `^dv-e2e:[A-Za-z0-9-]+$`.
Sentinel proof: keys planted outside the namespace (db 0 plain key + a key inside the real `bull:`
namespace) before the full e2e run, compared after.

**P1 fixes.** P1-1: seed `SEED_PROFILE` (default `production` under `NODE_ENV=production`): no
loginable account, only credential-less editor/historian authorship accounts, no G05 fixture
provider/offers. P1-2: additive migration `ALTER TYPE "EntityKind" ADD VALUE IF NOT EXISTS 'FACT'`
(own migration). P1-3: service rejects negative shares and out-of-range / > 2-decimal percentages;
DB CHECKs back it. P1-4: production boot refuses empty/wildcard/malformed `CORS_ORIGINS`.

**P2 fixes.** P2-3 production config validation; P2-4 additive CHECK migration
`20260927000001_g12_integrity_constraints` (NOT VALID + VALIDATE); P2-5 `enableShutdownHooks()`;
P2-6 require Google-verified email; P2-7 measure first, change only if Redis outage blocks health;
P2-8 fix each lint error at its source (no disables). P3 items are documented, not changed, unless a
change is trivial and risk-free.

## 10. Chronology audit detail (before)

| Kind | Rows | With stored year | With ordinals |
|---|---|---|---|
| HistoricalEvent | 13 | 13 | 0 |
| HistoricalEra | 15 | 9 (+6 e2e leftovers, UNKNOWN) | 0 |
| Dynasty | 3 | 3 | 0 |
| Person (birth/death) | 10 | 10 / 10 | 0 |
| HistoricalFact | 36 | 31 | 0 |
| Territory | 0 | — | — |

All golden rows are CE. The seed calls `sortBounds` (legacy) but never computes ordinals; the G03
backfill ran once, at migration time, so every database seeded afterwards — including a fresh
production install — has none.

## 11. Cross-domain invariant matrix, security, privacy, performance, deployment plans

- Cross-domain matrix: `G12_CROSS_DOMAIN_INVARIANTS.md` (interactions proven by a new real-HTTP /
  real-PostgreSQL suite `apps/api/test/g12-certification.e2e-spec.ts`, not by re-running phase suites).
- Security: automated route classification + runtime-vs-OpenAPI drift test; actor × route IDOR
  sweep with known foreign ids; same-JWT revocation (role downgrade, removal, archive, location
  stop, provider disable); redirect bypass matrix; CORS/cookie/CSRF/header checks on the compiled
  app in production mode; input-abuse fuzz; error-envelope privacy; secret scan; `pnpm audit`.
- Privacy: G08 coordinate never in search/map/affiliate/expense/audit/error/OpenAPI/logs (log
  capture during the e2e run).
- Performance: re-run the G11 suite (`scripts/g11-perf`) on a disposable `dauviet_perf`, plus a small
  representative API sample and a bounded concurrency run; host is a shared 4-core laptop (~80 %
  busy), so a health-endpoint control class and interleaved rounds are mandatory.
- Deployment: `G12_DEPLOYMENT_RUNBOOK.md` (backup → `migrate deploy` → seed `production` profile →
  boot → readiness → smoke; roll-forward, restore-from-backup rollback).

## 12. Paths and gates

- Path A: disposable `dauviet_g12_path_a` DB + a separate Redis logical DB/namespace; all 27
  migrations; seed ×2 (both profiles); rebuild ×2; build; boot; full-domain HTTP smoke; drop.
- Path B: dev DB = exact accepted G11 state; BEFORE/AFTER snapshot (`scripts/g12/db-snapshot.sql`:
  every table's count + order-independent content md5, the same excluding the columns G12 may
  change, schema facets, migration checksums); apply G12 only; classify every delta.
- Path C: restart API/worker/Redis; persistence of provider policy, location, ledger, conversions;
  search worker recovery.
- Path D: DB transaction failure, worker failure, queue interruption, Redis down, provider failure,
  duplicate and out-of-order events, API kill mid-workflow.
- Proposed gate count: ~200, derived one-per-requirement from brief §§6–101 (final number is
  whatever the manifest derives, not forced).
