# G12 — Environment Matrix

Audience: whoever configures a Dấu Việt Backend V2 deployment (and the freeze reviewer).
Every variable **name** the backend code, seed, tests or tooling reads — derived from
`grep process.env` over `apps/api/src`, `apps/api/test`, `prisma/`, `scripts/` (62 names) plus
`apps/api/src/config/configuration.ts`. **No value is written here.**

Classes: `REQUIRED_CORE` (boot fails without it), `OPTIONAL` (safe default), `PROVIDER_SPECIFIC`
(one external integration; missing = that integration disabled / fail-closed), `DEV_ONLY`,
`TEST_ONLY`, `DEPRECATED` (none found).

Enforcement: `apps/api/src/config/env.validation.ts` runs at boot (Nest `ConfigModule` validate).
G12 added the production-only rules marked **G12** below; under `NODE_ENV=production` a violating
boot fails with `Invalid environment configuration: ...` that names the variable but never echoes a
value (unit-tested: `env.validation.spec.ts`).

Precedence: a real process environment variable always wins; `apps/api/.env` (read first by
`config/load-env.ts`) and the repo-root `.env` (Prisma CLI only) never override it.

## Core application

| Variable | Class | Secret | Production requirement | Behaviour when missing | Owner |
|---|---|---|---|---|---|
| `NODE_ENV` | REQUIRED_CORE (production) | no | must be `production` for every internet-facing deployment, including staging (it switches on `Secure` cookies, the production config rules below, and the production seed profile) | defaults to `development` | platform |
| `PORT` | OPTIONAL | no | set by the platform | `3000` | platform |
| `API_PREFIX` | OPTIONAL | no | keep `v1` (the OpenAPI contract assumes it) | `v1` | platform |
| `APP_URL` | REQUIRED_CORE (production, **G12**) | no | public web-app origin; the only origin of every emailed link (verify email, reset password, trip invitation) | development: `http://localhost:3000`; production: **boot fails** | platform |
| `WEB_URL` | DEPRECATED-candidate | no | not read by the API code (only listed in `.env.example`) | — | web |
| `CORS_ORIGINS` | REQUIRED_CORE (production, **G12**) | no | comma-separated explicit `scheme://host[:port]` browser origins; no `*`, no path | development: reflects any origin; production: **boot fails** (empty/wildcard would reflect every origin with `credentials: true`) | platform |
| `DATABASE_URL` | REQUIRED_CORE | **yes** | PostgreSQL 16 + PostGIS 3.4, `pg_trgm`, `unaccent` available | **boot fails** (also rejects an empty string since G12) | platform |
| `REDIS_URL` | REQUIRED_CORE | yes if Redis auth is on | Redis 7 for BullMQ | **boot fails** | platform |
| `REDIS_KEY_PREFIX` | OPTIONAL (**G12**) | no | leave unset (`bull`) unless several deployments share one Redis | `bull` (BullMQ default) | platform |
| `JWT_ACCESS_SECRET` | REQUIRED_CORE | **yes** | ≥ 32 chars, random, not the `.env.example` placeholder, different from the refresh secret (**G12**) | **boot fails** | security |
| `JWT_REFRESH_SECRET` | REQUIRED_CORE | **yes** | same rules | **boot fails** | security |
| `JWT_ACCESS_TTL` | OPTIONAL | no | e.g. `15m` | `15m` | security |
| `JWT_REFRESH_TTL` | OPTIONAL | no | e.g. `30d` | `30d` | security |
| `RATE_LIMIT_TTL` / `RATE_LIMIT_MAX` | OPTIONAL | no | global per-route per-IP window (seconds) / limit | `60` / `120` | platform |
| `SEARCH_RATE_LIMIT_MAX` | OPTIONAL | no | per-IP per-minute limit for `/search` and `/search/suggestions` | `60` | search |
| `SKIP_DB_CONNECT` | DEV_ONLY (tooling) | no | **must be unset**; production boot fails if `true` (**G12**) | — | tooling |

Proxy note: the app does not set Express `trust proxy`, so `req.ip` is the direct peer. Behind a
load balancer every client would share the balancer's address for throttling — see the runbook
(an explicit, reviewed `trust proxy` setting is a deployment decision, not a default).

## Object storage (media)

| Variable | Class | Secret | Production requirement | Missing | Owner |
|---|---|---|---|---|---|
| `S3_ENDPOINT` | REQUIRED for media | no | S3-compatible endpoint | media upload/derivative jobs fail; the rest of the API works | media |
| `S3_REGION` | OPTIONAL | no | | `us-east-1` | media |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | REQUIRED for media | **yes** | least-privilege key for one bucket | presign/upload fails | media |
| `S3_BUCKET` | OPTIONAL | no | | `dauviet-media` | media |
| `S3_FORCE_PATH_STYLE` | OPTIONAL | no | `false` for AWS, `true` for MinIO | `true` | media |
| `S3_PUBLIC_BASE_URL` | REQUIRED for media | no | public read base URL | public media URLs empty | media |
| `S3_UPLOAD_URL_TTL_SECONDS` / `S3_DOWNLOAD_URL_TTL_SECONDS` / `S3_RESTRICTED_DOWNLOAD_URL_TTL_SECONDS` | OPTIONAL | no | | 900 / 3600 / 300 | media |
| `MEDIA_PENDING_UPLOAD_EXPIRY_MINUTES` | OPTIONAL | no | | 60 | media |

## Email

| Variable | Class | Secret | Production requirement | Missing | Owner |
|---|---|---|---|---|---|
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` | OPTIONAL (fail-soft) | no | a relay that accepts **unauthenticated** submission from the API host — the transport has no user/password setting (P3, see final report) | defaults `localhost:1025`, plain; a send failure is logged and swallowed (registration/invitation still succeed, no email) | platform |
| `SMTP_FROM` | OPTIONAL | no | a sender the relay may use | `Dau Viet <no-reply@dauviet.vn>` | platform |

## Provider-specific (external integrations)

| Variable | Class | Secret | Missing | Integration |
|---|---|---|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALLBACK_URL` | PROVIDER_SPECIFIC | secret: yes | Google sign-in cannot complete (strategy registers with `not-configured`; Google rejects it) — password auth unaffected | Google OAuth |
| `KNOWLEDGE_INGESTION_ENABLED` | PROVIDER_SPECIFIC | no | `false`: ingestion module no-ops | G06.5 |
| `WIKIMEDIA_USER_AGENT` / `WIKIMEDIA_CONTACT` | PROVIDER_SPECIFIC | no | Wikidata/Commons adapters refuse to run | G06.5 |
| `GEONAMES_USERNAME` | PROVIDER_SPECIFIC | treat as secret | adapter disabled (fail-closed) — **external blocker** | G06.5 |
| `GOOGLE_PLACES_API_KEY` | PROVIDER_SPECIFIC | **yes** | adapter disabled (fail-closed) — **external blocker** | G06.5 |
| `INGESTION_WORKER_CONCURRENCY` / `INGESTION_MAX_RETRIES` / `INGESTION_RAW_RETENTION_DAYS` | OPTIONAL | no | 1 / 3 / 90 | G06.5 |
| `AFFILIATE_SESSION_TTL_MINUTES` / `AFFILIATE_REDIRECT_TOKEN_TTL_SECONDS` | OPTIONAL | no | 30 / 300 | G10 |
| `AFFILIATE_DEFAULT_ENVIRONMENT` | OPTIONAL | no | `PRODUCTION` under `NODE_ENV=production`, else `SANDBOX` | G10 |

No Booking.com / Agoda / Viator credential variable exists: provider credentials are referenced
through `ProviderIntegration.credentialReference` (a pointer, never the secret), and no real adapter
is registered (external blocker, `G12_EXTERNAL_INTEGRATION_MATRIX.md`).

## Domain tuning (G08 / G11)

| Variable | Class | Default | Domain |
|---|---|---|---|
| `TRIP_LOCATION_SHARING_MIN_DURATION_MINUTES` / `..._MAX_DURATION_MINUTES` | OPTIONAL | 5 / 720 | G08 |
| `TRIP_LOCATION_TTL_SECONDS` / `TRIP_LOCATION_FRESHNESS_SECONDS` / `TRIP_LOCATION_MAX_FUTURE_CLOCK_SKEW_SECONDS` | OPTIONAL | 300 / 90 / 120 | G08 |
| `SEARCH_PROJECTION_WORKER_ENABLED` | OPTIONAL | `true` (exactly one of several replicas may run with `false`; running several workers is safe — advisory locks + claim tokens) | G11 |
| `SEARCH_PROJECTION_INTERVAL_MS` / `..._CLAIM_TIMEOUT_SECONDS` / `..._DRAIN_BATCH_SIZE` | OPTIONAL | 2000 / 60 / 200 | G11 |

## Seed, tooling and tests

| Variable | Class | Secret | Notes |
|---|---|---|---|
| `SEED_PROFILE` | OPTIONAL (**G12**) | no | `development` \| `production`; default `production` under `NODE_ENV=production`. The development profile creates loginable accounts with a shared known password and an ACTIVE fixture provider — never run it against a real deployment. |
| `SHADOW_DATABASE_URL` | DEV_ONLY | yes | `scripts/db/safe-migrate-diff.ts` guard; must differ from `DATABASE_URL` |
| `PERF_DATABASE_URL`, `ONLY`, `ROUNDS`, `SAMPLES_PER_ROUND`, `SKIP_REBUILD` | DEV_ONLY | `PERF_DATABASE_URL` yes | `scripts/g11-perf` benchmark harness |
| `G12_WRITE_ROUTE_INVENTORY` | TEST_ONLY | no | regenerates `docs/backend/g12-evidence/route-inventory.json` from the certification suite |
| `TZ` | TEST_ONLY (and platform) | no | the certification suite is run under `UTC`, `Asia/Bangkok`, `America/New_York`; the code is timezone-independent |

## Secret inventory (names only)

Secrets: `DATABASE_URL` (password), `REDIS_URL` (if auth), `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`,
`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_PLACES_API_KEY`,
`GEONAMES_USERNAME` (account identifier, handled as secret), `SHADOW_DATABASE_URL`, `PERF_DATABASE_URL`.
Committed files carry only placeholders (`.env.example`, `apps/api/.env.example`); `.env` files are
git-ignored and none was ever committed (G12 secret scan, `G12_PERFORMANCE_SECURITY_REPORT.md`).
