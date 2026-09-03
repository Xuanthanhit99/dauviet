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
