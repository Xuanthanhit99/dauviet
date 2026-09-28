# G12 — Backend V2 Deployment Runbook

Audience: the engineer deploying the Dấu Việt Backend V2 API to a real (staging or production)
environment. Every step below was exercised in G12 against disposable infrastructure (Path A: fresh
install; Path B: upgrade of an accepted-G11 database; backup/restore probe). Cloud-specific steps
(managed database snapshots, secret manager, load balancer) were **not** exercised and are marked.

## 0. What is deployed

- One Node.js 20+ process: `apps/api` compiled with `nest build` → `node dist/main.js`. The API, the
  BullMQ workers (media derivatives, knowledge ingestion) and the search-projection worker all run
  **in this process**; there is no separate worker binary. Several replicas are safe (projection
  claims use advisory locks + claim tokens; BullMQ distributes jobs).
- PostgreSQL 16 with PostGIS 3.4, `pg_trgm`, `unaccent`. PostgreSQL is the only authority.
- Redis 7 (BullMQ state only — no sessions, cache or throttle storage).
- Optional: S3-compatible bucket (media), SMTP relay (email), Google OAuth, ingestion sources.
- Migrations: 28 folders under `prisma/migrations` (24 accepted through G11 + 4 G12).

## 1. Prechecks (block the deploy if any fails)

1. Build artefact from the approved commit: `pnpm install --frozen-lockfile`, `pnpm db:generate`,
   `pnpm --filter @dauviet/api build`. Unit suite green on that commit.
2. Configuration (see `G12_ENVIRONMENT_MATRIX.md`): `NODE_ENV=production`; `DATABASE_URL`,
   `REDIS_URL`; two different random ≥ 32-char JWT secrets; `APP_URL`; explicit `CORS_ORIGINS`. The
   app refuses to boot otherwise — treat a boot failure message as the checklist.
3. Database role can `CREATE EXTENSION postgis, pg_trgm, unaccent` **or** they already exist.
4. `prisma migrate status` against the target lists only the migrations you expect as pending and
   **no** failed/rolled-back rows. Never run `migrate dev`/`migrate reset` against a real database.
5. Staging and production run with `NODE_ENV=production` (cookie `Secure`, config rules, seed profile).
6. Decide `trust proxy`: the app uses the direct peer address for rate limiting. Behind a load
   balancer that is the balancer's address, so all clients share a bucket. Configure a reviewed
   Express `trust proxy` value for your topology (code change) or rate-limit at the edge. *(Not
   exercised in G12.)*

## 2. Backup / checkpoint (mandatory before any migration)

```
pg_dump -Fc -d <db> -f pre-<release>.dump      # or a managed-database snapshot
```

Proven locally in G12 on an accepted-G11 database and on the G12 candidate:
- **Accepted G11 database:** `pg_restore` reports 9 errors and silently drops the 9
  `*_unaccent_trgm` expression indexes (their function resolved `unaccent` through `search_path`,
  which `pg_restore` empties). Migration `20260927000003` fixes this going forward. A restore of a
  pre-upgrade (G11) backup will therefore show those 9 errors; all data restores. The indexes are
  unused by current code; to recreate them after such a restore, apply that migration's
  `CREATE OR REPLACE FUNCTION` and re-run the 9 `CREATE INDEX` statements from
  `20260904000005_phase07_discovery`.
- **G12 candidate:** `pg_restore --exit-on-error` exits 0; every table hash, index, constraint,
  trigger, function, enum and migration row matches the source (only a cosmetic re-parenthesising
  of one CHECK expression).

## 3. Migrate

```
DATABASE_URL=<target> pnpm db:migrate:deploy        # prisma migrate deploy
```

G12 migrations are additive/data-only: chronology backfill (rows with both ordinals NULL only),
8 CHECK constraints (`NOT VALID` then `VALIDATE` — the migration fails loudly if any existing row
violates one; no data is rewritten), `EntityKind.FACT` enum value (own migration), schema-qualified
`immutable_unaccent`. Expected duration: seconds on the Golden Dataset scale.

If a G12 migration fails: stop, do not start the new app version. For a CHECK failure, list the
violating rows (the constraint name says which), decide the correction with the data owner, and
re-run. `prisma migrate resolve` must never be used to paper over a failed migration.

## 4. Seed (first install only, or to add new Golden-Dataset rows)

```
SEED_PROFILE=production DATABASE_URL=<target> pnpm db:seed
```

Idempotent (`upsert … update: {}` — never overwrites a row edited since). The production profile
seeds the canonical Golden Dataset with **no loginable account** and **no fixture provider**. Never
run the development profile against a real deployment: it creates six accounts sharing the password
`DevPassword123!` (one ADMIN) and an ACTIVE test provider whose fixture prices would be public.

## 5. First administrator (first install only)

The production seed creates no admin. After the API is up:
1. Register the operator account through the product (`POST /v1/auth/register`) and verify email.
2. Grant the role directly in the database, audited by the operator:
   `UPDATE "User" SET roles = ARRAY['USER','ADMIN']::"Role"[] WHERE email = '<operator email>';`
3. Further roles are granted through `PATCH /v1/admin/users/:id/roles` by that admin.

## 6. Start the API

`node dist/main.js` (one or more replicas). On first boot with an empty projection the search worker
rebuilds it automatically (Golden Dataset: ~105 documents in a few seconds). The process handles
SIGTERM/SIGINT gracefully since G12 (`enableShutdownHooks`): it stops accepting connections, waits
for the in-flight projection drain, closes BullMQ workers and disconnects Prisma.

## 7. Readiness and smoke

- `GET /v1/health` → `{"status":"ok","checks":{"api":"ok","database":"ok","redis":"ok"}}` is the
  readiness probe. Semantics since G12 (proven in Path D): **database unreachable → HTTP 503**
  (not ready — PostgreSQL is the authority for everything); **Redis unreachable → HTTP 200 with
  `status: "degraded"` and `redis: "error"`** (auth, trips, location, expenses, search and map keep
  working; only media-derivative and ingestion jobs cannot be queued). Each probe is time-boxed
  (1.5 s). For liveness use a TCP check, not this endpoint. Redis outage behaviour per API is
  classified in `G12_PERFORMANCE_SECURITY_REPORT.md`.
- Smoke (read-mostly, safe on production when pointed at a throwaway account; it creates its own
  users/trip and a fixture provider, so **run it on staging**, not production):
  `npx tsx scripts/g12/http-smoke.ts --base https://<host>/v1 --db <staging DATABASE_URL>`
  and `npx tsx scripts/g12/prod-mode-checks.ts --base https://<host>/v1 --allowed-origin <origin> --db <url>`.
- Production (no writes): `/v1/health`, `/v1/countries`, `/v1/destinations`, `/v1/search?q=hue`,
  `/v1/map/features?bbox=102,8,110,24&zoom=6`, `/v1/timeline?fromYear=1000&toYear=2000`, CORS
  preflight from the web origin, and one login in the browser.

## 8. Rollback and roll-forward boundaries

- **Application rollback** (redeploy the previous build) is safe after the G12 migrations: they add
  data/constraints/an enum value the G11 code tolerates. With G11 code a negative share would be
  refused only by the database CHECK (an error response, never stored data), and redirect replays
  would again skip the G02 re-check. (Reasoned from the code; not exercised in G12.)
- **Database rollback is not scripted.** No down-migrations exist and none was proven. Recovery is
  *restore from the pre-migration backup* (§2), accepting the loss of writes since the backup, or
  *roll forward* with a corrective migration. Prefer roll-forward.
- Never edit an applied migration file (checksum drift blocks later deploys).

## 9. Enabling external integrations later

Each is additive and must get its own live proof before being announced
(`G12_EXTERNAL_INTEGRATION_MATRIX.md`): set credentials; create the G02 provider, capability,
integration (environment!), license with rights, attribution rule; activate capabilities. G10 real
providers additionally need an adapter implementation. Disable at any time by setting the provider or
integration status or revoking the license — the next request is refused, no restart.

## 10. Operating notes

- Redis loss: no data loss (PostgreSQL is authoritative); queued media/ingestion jobs are lost and
  must be re-enqueued (media: re-confirm upload; ingestion: re-run job). Search is unaffected.
- Projection problems: `POST /v1/admin/search/projection/rebuild` (ADMIN) rebuilds deterministically
  from canonical tables; it never modifies canonical data.
- Retention: no automatic deletion jobs exist (sessions, locations, affiliate clicks, audit). Latest
  location rows expire logically by TTL but are not purged. Any legal retention requirement is a
  deployment decision to be implemented before launch (see final report).
