# G12 — Backend V2 Freeze Candidate Manifest

Audience: the external freeze reviewer. This is the exact inventory of what is being proposed for
the Backend V2 freeze. Nothing here is committed (branch `main`, HEAD `9931a16`; G07–G12 live in the
working tree — the reviewer decides what is committed and when). Checksums are sha256 of the file
(first 16 hex chars; migration checksums equal `_prisma_migrations.checksum`).

## 1. Code and contract artefacts

| Artefact | Identity | Notes |
|---|---|---|
| API application | `apps/api` (NestJS 10.4, Node 20+; built and verified on Node 22.17) | `nest build` → `dist/main.js` |
| Prisma schema | `prisma/schema.prisma` sha256 `09434bc6bfc17292` | **unchanged by G12** |
| Seed | `prisma/seed.ts` sha256 `8921cf1dc039569b` + `prisma/golden/*` (Golden Dataset `2026-09-v1`) | G12: chronology ordinals, production profile, first-run-only fact publish |
| OpenAPI | `docs/backend/openapi.json` sha256 `e9eb921fd963af5e` — **314 paths / 363 operations** | regenerated from the final app; one change vs G11 (see §6) |
| Route inventory | `docs/backend/g12-evidence/route-inventory.json` | 363 operations: PUBLIC 91, AUTHENTICATED 37, TRIP_CAPABILITY 35, ADMIN (role-gated) 199, PROVIDER_CALLBACK 1, INTERNAL 0 — enforced by the certification suite |
| Lockfile | `pnpm-lock.yaml` | unchanged by G12 (no dependency added or upgraded) |

## 2. Migrations (28, applied in order)

| # | Migration | sha256 | Phase |
|---|---|---|---|
| 1 | 20260903000000_init | c082dbde5fb31b04 | V1 |
| 2 | 20260903000001_search_and_spatial_indexes | 661f9611910a6342 | V1 |
| 3 | 20260903000002_phase02_auth_hardening | 94d1bd3ed6f5c67f | V1 |
| 4 | 20260904000000_phase03_historical_domain | f6a5e7991fe61738 | V1 |
| 5 | 20260904000001_phase04_trust_layer | e731b4e17bcf48e5 | V1 |
| 6 | 20260904000002_phase05_media | 881a84354aa7bfce | V1 |
| 7 | 20260904000003_phase05_1_media_derivatives | e9d70d61b247d75e | V1 |
| 8 | 20260904000004_phase06_editorial_content | 78835e8412f8b532 | V1 |
| 9 | 20260904000005_phase07_discovery | 7eabb295bc2c2908 | V1 |
| 10 | 20260904000006_phase08_community | a761d92b93e4992f | V1 |
| 11 | 20260904000007_phase09_contributions | d76805c9b41ab6d3 | V1 |
| 12 | 20260906000000_g01_global_geography | 8a80c277fafdae82 | G01 |
| 13 | 20260907000000_g02_provider_licensing | 23c25a0811fe7a9f | G02 |
| 14 | 20260908000000_g03_global_historical_knowledge | ead1a29e746cbec9 | G03 |
| 15 | 20260909000000_g04_destination_discovery | fea0df885825751e | G04 |
| 16 | 20260910164143_g05_stay_food_activities | 8b845742b41a4819 | G05 |
| 17 | 20260910164912_g05_entity_kind_values | 9e5d65f1ccabb1dc | G05 |
| 18 | 20260911103710_g06_trip_planner_cost_engine | 3e52958db4529183 | G06 |
| 19 | 20260922093507_g06_5_knowledge_ingestion | d7a086a3ff601389 | G06.5 |
| 20 | 20260922100000_g07_trip_collaboration | d452c1dfaa18852c | G07 |
| 21 | 20260923000000_g08_trip_location_sharing | f60726e99158968d | G08 |
| 22 | 20260924000000_g09_trip_expense_settlement | 2eb63f146d865d6d | G09 |
| 23 | 20260925000000_g10_affiliate_attribution | cf685031b2988735 | G10 |
| 24 | 20260926000000_g11_global_search_map | 13a5754828373400 | G11 |
| 25 | **20260927000000_g12_chronology_backfill** | b0c2b8e60d7a937c | G12 — data only |
| 26 | **20260927000001_g12_integrity_constraints** | ea89d0c8ebff393d | G12 — 8 CHECKs |
| 27 | **20260927000002_g12_entity_kind_fact** | 9ceb947c6e3626a5 | G12 — enum value |
| 28 | **20260927000003_g12_immutable_unaccent_search_path** | 42b626d65bd45cc1 | G12 — function body |

The 24 accepted migrations are byte-identical to G11 (checksums re-verified against the dev
database, the Path B database and a fresh Path A database). No G12 migration drops, renames or
rewrites anything; none needs a shadow database.

## 3. Database requirements

PostgreSQL 16 (verified 16.4) with extensions `postgis` (3.4.3), `pg_trgm` (1.6), `unaccent` (1.1),
`plpgsql`. 165 tables. Objects Prisma does not model and that live only in migrations: 33 G11
triggers + 3 trigger functions, `immutable_unaccent`, raw trigram/GIST/importance indexes
(+9 `*_unaccent_trgm`), 14 G03 CHECKs + 8 G12 CHECKs, partial unique index on pending invitations.

## 4. Runtime processes, workers and queues

One process (`node dist/main.js`), replicable. In-process workers: BullMQ `media-processing`
(3 attempts, exponential 5 s, `jobId` dedup), BullMQ `knowledge-ingestion` (1 attempt per enqueue,
run/checkpoint rows in PostgreSQL), search projection (PostgreSQL queue + 2 s interval worker,
advisory locks, claim timeout 60 s). Redis 7 holds only BullMQ state (`REDIS_KEY_PREFIX`, default
`bull`).

## 5. Configuration

Required core: `NODE_ENV=production`, `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`,
`JWT_REFRESH_SECRET` (distinct, ≥ 32, non-placeholder), `APP_URL`, `CORS_ORIGINS` — enforced at boot.
Everything else is optional or provider-specific: `G12_ENVIRONMENT_MATRIX.md`.

## 6. Contract delta vs accepted G11

| Surface | Change | Class |
|---|---|---|
| OpenAPI `GET /v1/media/{id}` | `security: [{bearer}]` removed — the route was always `@Public()`; the document was wrong | INTENTIONAL_REMEDIATION (non-breaking) |
| Error envelope `error.message` | always a string; validation arrays joined with `; ` (per-field array unchanged in `details`) | INTENTIONAL_REMEDIATION (the shared client already coerced arrays to a string) |
| Oversized / malformed body | 413 `PAYLOAD_TOO_LARGE` / 400 with a fixed message (was 500 / parser text) | INTENTIONAL_REMEDIATION |
| Transient DB failure | 503 `SERVICE_UNAVAILABLE` (was 400 `DATABASE_ERROR` or 500) | INTENTIONAL_REMEDIATION |
| NUL byte in path/query/body | 400 (was 500) | INTENTIONAL_REMEDIATION |
| Impossible calendar dates (`2026-02-30`, `2026-13-01`) on date fields | 400 (was silently rolled over, or 500) | INTENTIONAL_REMEDIATION |
| Negative / >100 / >2-decimal expense shares | 400 `TRIP_EXPENSE_SPLIT_INVALID` (was stored) | INTENTIONAL_REMEDIATION |
| Affiliate redirect after provider disable / license revocation | 403 with the G02 gate code (was still 302 for the token TTL) | INTENTIONAL_REMEDIATION |
| `/v1/health` | database down → 503; Redis down → 200 `degraded` with `redis: error` (was 200 `ok`/`degraded` regardless) | INTENTIONAL_REMEDIATION |
| Google OAuth | unverified Google email refused (`AUTH_GOOGLE_EMAIL_UNVERIFIED`) | INTENTIONAL_REMEDIATION (Google not configured anywhere) |
| Paths, operations, request schemas, success payloads | none | — |

No BREAKING change for a client that sends valid requests.

## 7. Acceptance evidence

`G12_ACCEPTANCE_GATE_MANIFEST.md` (gate-by-gate), `G12_FINAL_REPORT.md`, `G12_PERFORMANCE_SECURITY_REPORT.md`,
`G12_CROSS_DOMAIN_INVARIANTS.md`, and raw evidence in `docs/backend/g12-evidence/`
(Path B snapshots and deltas, chronology rows and search proof, route inventory).
Suites: unit 105/105 suites, 1516/1516 tests; e2e 13/13 suites, 320/320 tests (sequential, real
PostgreSQL/PostGIS + Redis, run-scoped Redis namespace, external sentinel intact).

## 8. Known external integrations (not required for core)

GeoNames, Google Places (G06.5); Booking.com, Agoda, Viator (G10); Google OAuth; SMTP relay; S3.
All fail closed without credentials — `G12_EXTERNAL_INTEGRATION_MATRIX.md`.
