# G08 — Trip Location Sharing: Pre-Implementation Report

## 1. Branch / HEAD / working-tree state

- Branch: `main`
- HEAD at audit time: `9931a16 docs: close Country Detail V1 with verified Consumer QA`
- `git status --short`: clean except one untracked, unrelated directory `frontend-pass-10/` (a
  concurrent-owned working set — not touched by this phase).
- No accepted G00–G07 migration was modified. G08 will only add new, additive files under
  `prisma/migrations/`.

## 2. Concurrent-owned files

`frontend-pass-10/` is left untouched. No other concurrent-owned files were found overlapping the
backend paths this phase touches (`apps/api/src/modules/trips/**`, `prisma/schema.prisma`,
`prisma/migrations/**`, `docs/backend/**`).

Two local, gitignored environment files were adjusted to make a real PostgreSQL/Redis stack
reachable on this host (see section 15 — neither is tracked by git, so this has no working-tree/
git-status effect):

- `docker-compose.override.yml` — the existing host-specific Postgres port remap (added for an
  unrelated project already on 5432) pointed at `55432`, which turned out to fall inside a Windows
  Hyper-V dynamic port-exclusion range on this host (confirmed via
  `netsh interface ipv4 show excludedportrange protocol=tcp`), so Docker refused to bind it.
  Remapped to `57000`, which is outside every excluded range observed.
- `apps/api/.env` / root `.env` — `DATABASE_URL` port updated to match.

## 3. G07 authorization/lifecycle integration points (read, not modified in shape)

- `TripAuthorizationService.authorize(tripId, userId, capability)` — the single choke point for
  "does this user have this capability on this trip," re-reading `Trip.ownerId` +
  `TripMember` fresh from Postgres every call, never from a JWT claim. G08 reuses this unchanged
  for `VIEW_TRIP`/membership checks; it does **not** add a `MANAGE_LOCATION_SHARING`-style
  capability because location consent is never governance-gated (spec section 8/10/60) — a
  narrower, dedicated `TripLocationAuthorizationService`-equivalent set of checks (self-only,
  membership + trip-not-archived) lives directly in the new location services instead of the
  capability matrix, per spec section 60 ("keep concerns explicit").
- `TripMembersService.remove/leave` and `TripsService.archive` — each is a single
  `$transaction`. G08 extends these three transactions (additively — same method signatures,
  same return values, same existing statements) to also terminate location sharing and delete the
  latest-location row for the affected user(s), per spec sections 30/31/32. This is an authorized,
  spec-mandated modification of already-locked G06/G07 *service code* (not schema/migrations).
- `TripMembersService.transferOwnership` — read only. Confirmed it never touches
  `TripMember`/`Trip` rows belonging to a third party's consent state; G08 adds no hook here
  (spec section 28 — ownership transfer must not start/stop/extend/copy consent). Verified by
  inspection: the only rows it writes are `Trip.ownerId/version`, the transferor's own
  `TripMember` row, and the audit/collaboration event — none of which G08 needs to touch.
- `TripInvitationsService.accept` — read only. Confirmed acceptance never creates a
  `TripLocationSharing` row (spec section 33/7).
- `AuditService.log(entry, db)` — append-only, transaction-threadable (`db` defaults to
  `this.prisma`, accepts an in-flight `tx`). Reused as-is for sharing lifecycle events. No raw
  coordinates will ever be passed in `metadata`.
- `TripCollaborationEventService.record(entry, db)` — same transaction-threading discipline.
  Reused for `LOCATION_SHARING_STARTED`/`LOCATION_SHARING_STOPPED`-equivalent activity, again with
  metadata containing no coordinates.
- Error codes: `TRIP_ERROR_CODES` is a single flat `as const` object (`apps/api/src/common/errors/
  trip-error-codes.ts`). G08 appends new keys, does not rename/remove any.
- Route/controller convention: `@Controller('trips')` with `:id` path param, `@CurrentUser()`
  decorator for the authenticated actor, `class-validator` DTOs with `whitelist: true,
  forbidNonWhitelisted: true` global validation, `@Throttle({ default: { limit, ttl } })` per
  abuse-relevant route (e.g. invitation creation: 10/60s). G08 follows this exactly.
- Response envelope: `ResponseInterceptor` wraps everything in `{ success, data, meta? }`; errors
  go through `AllExceptionsFilter` → `{ success: false, error: { code, message }, path, timestamp,
  requestId }`. No custom envelope needed.

## 4. TripStatus / archive model (audited, not modified)

`Trip.archivedAt: DateTime?` is the sole archive signal (a `null`/non-null timestamp), independent
of the 3-value `TripStatus` enum (`DRAFT`/`PLANNING`/`READY` — no `ARCHIVED` status value exists).
G08's "archived trip exposes no location" requirement reads `trip.archivedAt`, exactly like every
other G06/G07 mutation guard.

## 5. Rate limiting / Redis / BullMQ (audited)

No dedicated rate-limit module exists beyond `@nestjs/throttler`'s global `ThrottlerGuard`
(registered once in `AppModule` via `APP_GUARD`) plus a per-route `@Throttle(...)` decorator
override, hardcoded per call site (e.g. invitation creation 10/60s, invitation accept/decline
20/60s, estimate generation 10/60s). G08's location-update route gets its own hardcoded
`@Throttle` value (see design section below) — no shared "location rate limit" config knob exists
elsewhere to reuse, and none is invented beyond a per-route constant, matching the existing
pattern exactly.

Redis/BullMQ exists only for `KnowledgeIngestion` (BullMQ queues) — nothing trip-related uses it.
G08 introduces no new Redis/BullMQ dependency (spec section 49) — PostgreSQL remains the sole
consent/location authority; rate limiting itself uses `@nestjs/throttler`'s existing in-memory
(single-instance) storage, identical to every other throttled route in this codebase today (no
Redis-backed throttler storage exists in this repo at all yet, for anyone).

## 6. Logging (audited)

No request/response body logging middleware exists anywhere in the app (`RequestIdMiddleware` only
stamps a correlation id; no morgan/winston/pino body logger). NestJS's own `Logger` is used only
for explicit `this.logger.error(...)` calls inside `AllExceptionsFilter` (message + stack, no
request body). Risk of accidental coordinate leakage into logs is therefore already low; G08 adds
no new logging of its own DTOs, and this is verified structurally rather than by grepping runtime
log output (no live app run was needed to establish this — it's a code-search fact, not a runtime
behavior).

## 7. Migration safety tooling (audited, reused)

`scripts/db/shadow-database-guard.ts` (`assertDistinctDatabaseTargets`) and
`scripts/db/safe-migrate-diff.ts` are the permanent post-G06.5-incident guards. G08 uses the
default file-to-file diff mode (`pnpm db:migrate:diff:safe --from <ref>`, no shadow database
needed) to derive the schema delta, and — since a real, disposable, isolated PostgreSQL instance
was made reachable for this phase (section 2) — a genuinely separate database name is used for any
shadow/Path-A/Path-B work, never the same physical target as the working dev database. Every
shadow-database use, if any, will be run only through this tooling.

## 8. E2E infrastructure (audited — a real finding)

`apps/api/test/` contains 8 `*.e2e-spec.ts` files. `trips.e2e-spec.ts` (`describe('Trips (G06) -
e2e')`) covers only the G06 aggregate root (create/list/get/update/archive/itinerary/estimates) —
grepping every `.post(/.get(/.patch(/.delete(` call in that file confirms **no e2e coverage exists
for any G07 collaboration route** (`/trips/:id/members`, `/trips/:id/invitations`, `/trips/:id/
leave`, `/trips/:id/transfer-ownership`, `/trip-invitations/accept|decline`), despite
`G07_FINAL_REPORT.md` gate table claiming "PASS (all live)" for several e2e matrices (e.g.
G07-GATE-105/107/108/109). This is a discrepancy in the accepted G07 baseline's documentation
versus its actual committed test artifacts — G07 is locked and out of scope to fix, but it means
G08 cannot assume any committed live-e2e precedent for collaboration-adjacent flows to build on;
its own new e2e suite (`trip-location.e2e-spec.ts`) is written from scratch against the real
running app, following `trips.e2e-spec.ts`'s own structure (`bootstrapTestApp()`, throwaway users
per file, explicit cleanup).

`bootstrap-test-app.ts` replicates the real `main.ts` bootstrap (guards, filters, interceptors,
global prefix, validation pipe) — reused as-is.

## 9. Proposed domain models (additive only)

Two new tables, per spec sections 4–5, 13, 79, 80:

### `TripLocationSharing` — explicit consent, one mutable row per (tripId, userId)

Design decision (spec section 80): **a single mutable "current lifecycle" row**, not an
append-only session log. Starting a new session after a prior STOPPED/EXPIRED session **updates**
the existing row in place (new `startedAt`/`expiresAt`, `stoppedAt` cleared) rather than inserting
a new row. This is the simplest design that still satisfies every required property:

- *Explicit consent evidence*: every transition (`started`/`stopped`/`expired`/`terminated by
  removal`/`terminated by archive`) is written to the append-only `AuditLog` (metadata carries no
  coordinates), so the evidence trail survives even though the `TripLocationSharing` row itself is
  mutable.
- *Stop/expiry*: `status` transitions in place.
- *New session after expiry*: same row, new lifecycle values.
- *Privacy*: no session history to leak, and only one row to invalidate on removal/archive.
- *Query efficiency*: `@@unique([tripId, userId])` makes "is this user currently sharing in this
  trip" a single indexed point lookup, and the same row lock is the serialization point used to
  make the concurrency proofs below actually atomic (section 12).

This deliberately does **not** build "consent history" (spec section 80's explicit warning) — the
audit trail is the durable evidence; the operational row is just current state.

Fields: `id, tripId, userId, status(ACTIVE|STOPPED|EXPIRED), startedAt, expiresAt, stoppedAt?,
createdAt, updatedAt`.

### `TripMemberLocation` — latest operational location only, one row per (tripId, userId)

No append-only history (spec sections 13/19/109) — `@@unique([tripId, userId])` is the DB backstop
(spec section 79).

Fields: `id, tripId, userId, latitude(Float), longitude(Float), accuracyMeters(Float), capturedAt,
receivedAt, expiresAt, createdAt, updatedAt`.

**Coordinate precision (spec section 15)**: every existing latitude/longitude pair in this schema
(`City`, `Country`, `Region`, `Destination`, `Place`, etc. — 7 occurrences audited) uses plain
`Float`, never `Decimal`. G08 follows the same convention for consistency and because GPS-reported
coordinates/accuracy are inherently floating-point client measurements, not exact decimal
quantities requiring `Decimal`'s arbitrary-precision guarantees (unlike money fields elsewhere in
this schema, which correctly use `Decimal`).

### No new EntityKind values except one

`EntityKind` (used by `AuditLog.entityType`) gets exactly one additive value,
`TRIP_LOCATION_SHARING`, appended after G07's block, with the same "additive-only, no
rename/remove/reorder" comment convention. Consumer: `AuditService.log({ entityType:
EntityKind.TRIP_LOCATION_SHARING, ... })` calls from the new `TripLocationSharingService`. No
second value is added for `TripMemberLocation` — individual location updates are never audited
(spec section 35), so there is no consumer that would need one.

### No fields added to `TripMember` (spec section 3 compliance)

Confirmed: no `latitude`/`longitude`/`isSharingLocation` field is added to `TripMember`. Consent
and location state live in the two new tables.

## 10. Retention / freshness defaults (spec sections 17/52/53 — two independent clocks)

Two genuinely separate durations, each configurable via `AppConfig.tripLocation` (new section in
`src/config/configuration.ts`, same `parseInt(process.env.X ?? 'default', 10)` pattern as every
other numeric config value in that file):

- **Consent duration** (`TripLocationSharing.expiresAt - startedAt`): client requests a duration
  in minutes at `start` time; server validates against
  `TRIP_LOCATION_SHARING_MIN_DURATION_MINUTES` (default 5) /
  `TRIP_LOCATION_SHARING_MAX_DURATION_MINUTES` (default 720 = 12h) and rejects
  (`TRIP_LOCATION_INVALID`) if outside that range — never silently clamped, so the user always
  knows exactly how long they agreed to share for.
- **Location freshness/TTL** (`TripMemberLocation.expiresAt`): `receivedAt +
  TRIP_LOCATION_TTL_SECONDS` (default 300s / 5 minutes) — independent of consent duration, exactly
  per spec section 53. A separate, shorter `TRIP_LOCATION_FRESHNESS_SECONDS` (default 90s) draws
  the FRESH/STALE line for the read-path status field; it is never persisted, only computed at
  read time from `now - capturedAt`.

## 11. Concurrency / "newer-wins" strategy (spec sections 21/22/73–77)

Both the consent row and the location row are point-locked via the row each transaction touches
first — no advisory locks, no Redis, no application-level mutex:

- **Location update** (`PUT .../location`): inside one `$transaction`, first statement is
  `SELECT ... FROM "TripLocationSharing" WHERE tripId=$1 AND userId=$2 FOR UPDATE` (raw SQL — the
  Prisma client API has no `FOR UPDATE`). This is the single serialization point shared with
  `stop`/`remove`/`leave`/`archive` (below), so a location write can never race a consent
  termination into an inconsistent final state. After confirming ACTIVE + unexpired + current
  membership + trip not archived, the location row itself is upserted with a conditional
  `INSERT ... ON CONFLICT (tripId, userId) DO UPDATE ... WHERE "TripMemberLocation".capturedAt <
  EXCLUDED.capturedAt` (raw SQL) — an equal `capturedAt` is treated as an idempotent no-op
  (retry-safe, spec section 23), a strictly older `capturedAt` is rejected with
  `TRIP_LOCATION_STALE_UPDATE` without ever touching the stored row (spec sections 21/22/76), and a
  strictly newer `capturedAt` overwrites in place (still just one row — never history).
- **Stop** (`POST .../stop`): `UPDATE "TripLocationSharing" SET status='STOPPED', stoppedAt=now()
  WHERE tripId=$1 AND userId=$2 AND status='ACTIVE'` as the transaction's first statement (this
  single conditional `UPDATE` both acquires the row lock *and* performs the atomic transition —
  the same pattern G07's invitation accept/decline already uses for exactly this reason), followed
  by `DELETE FROM "TripMemberLocation" WHERE tripId=$1 AND userId=$2` in the same transaction.
- **Remove/leave**: the existing G07 transactions gain the same two statements (scoped to the
  removed/leaving user) before/alongside the existing `TripMember` delete.
- **Archive**: the existing G06 `TripsService.archive` transaction gains a *bulk* conditional
  update (`WHERE tripId=$1 AND status='ACTIVE'`, no `userId` filter) plus a bulk delete of every
  `TripMemberLocation` row for that trip.

Because every one of these transactions locks the same row (or overlapping row set, for archive)
as its *first* statement, whichever transaction commits first fully determines the state the loser
observes on retry/re-evaluation — there is no interleaving window where a location write can land
after a stop/removal/archive has already committed. This is the concrete mechanism the required
concurrency proofs (spec sections 73–77) exercise against a real PostgreSQL instance.

## 12. Removal/leave/archive transaction integration (confirmed safe)

- `TripMembersService.remove` / `.leave`: both already single `$transaction` blocks; G08 adds the
  conditional-stop + location-delete statements to each, scoped to the affected `userId`, before
  the existing `audit.log`/`collaborationEvents.record` calls (so a G08-specific audit entry for
  "terminated by removal/leave" can be threaded through the same `tx`).
- `TripsService.archive`: single `$transaction`; G08 adds the trip-wide bulk statements plus one
  audit entry summarizing the bulk termination (not one per affected member — spec section 35's
  "no per-coordinate/per-event audit spam" principle extended sensibly to bulk archive).
- `TripMembersService.transferOwnership`: no G08 hook needed (section 3 above).
- `TripInvitationsService.accept`: no G08 hook needed (accepting never starts sharing).

## 13. Logging / privacy findings (summary)

- No coordinates will be logged (section 6).
- No coordinates will be audited (only lifecycle transitions, with `metadata` limited to
  `{ requestedDurationMinutes }` / `{ reason: 'MEMBER_REMOVED' | 'LEFT' | 'ARCHIVED' }`-shaped
  data).
- No coordinates will appear in `TripCollaborationEvent.metadata`.
- The read DTO returns only `latitude, longitude, accuracyMeters, capturedAt, freshness/status,
  member identity fields already exposed elsewhere` (display name, id) — no email, no device info,
  no internal consent row id.

## 14. Migration plan

One additive migration, `<timestamp>_g08_trip_location_sharing`, adding:
- `TripLocationSharingStatus` enum (`ACTIVE`, `STOPPED`, `EXPIRED`)
- `TripLocationSharing` table + `@@unique([tripId, userId])` + supporting indexes
- `TripMemberLocation` table + `@@unique([tripId, userId])` + supporting indexes
- One additive `EntityKind` enum value (`TRIP_LOCATION_SHARING`)
- Two additive relation arrays on `Trip` (`locationSharings`, `memberLocations`) and `User`
  (`tripLocationSharings`, `tripMemberLocations`)

Generated via the safe file-to-file diff tool (`pnpm db:migrate:diff:safe --from HEAD --script`),
reviewed, then written into a new migration folder by hand (matching this repo's existing migration
folder convention) rather than via a live `prisma migrate dev` shadow-database round-trip, per the
tooling's own stated preference (section 7).

## 15. Environment made available for this phase

Docker Desktop was not initially running; it was started, and `docker compose up -d postgres
redis` (from `docker-compose.yml` + the corrected local `docker-compose.override.yml`, section 2)
brings up a real, disposable PostgreSQL 16 + PostGIS and Redis 7 for this phase's live proofs. This
gives G08 a real database to run Prisma migrations, seed x2, Path A/B, the full unit+e2e suite, and
the mandatory PostgreSQL concurrency/rollback/restart proofs against — unlike G06.5's credential
blockers, this was a fixable local infra issue, not a genuine external dependency, so it does not
by itself justify a `COMPLETE_WITH_ENVIRONMENT_BLOCKERS` verdict. Any genuine remaining gaps will
be stated plainly in `G08_FINAL_REPORT.md`, not glossed over.

## 16. Expected APIs (spec section 62, route shape audited against G07 convention)

```
POST   /v1/trips/:id/location-sharing/start
POST   /v1/trips/:id/location-sharing/stop
GET    /v1/trips/:id/location-sharing/me
PUT    /v1/trips/:id/location
GET    /v1/trips/:id/locations
```

All five live on the existing `TripMembersController` (`@Controller('trips')`), matching where
every other trip-scoped sub-resource controller already lives (`:id/members`, `:id/invitations`,
`:id/activity`) rather than a new controller — no new module boundary needed, just new providers
(`TripLocationSharingService`, `TripLocationsService`) registered in the existing `TripsModule`.

## 17. Risks

1. G07's documented e2e claims exceed its committed test files (section 8) — noted, not fixed
   (out of scope), but means G08's own e2e suite carries more weight than usual as the *only* real
   collaboration-adjacent live proof in this codebase.
2. Row-lock-based concurrency (section 11) depends on every mutating path acquiring the
   `TripLocationSharing` row lock *first* and consistently — a future change that adds a new
   mutation path touching this row without following the same lock-first discipline could
   reintroduce a race. Documented prominently in code comments at each call site.
3. Windows/Docker port exclusions (section 2) are host-specific and may recur on a different
   machine; the override file's comment now documents the workaround.

## 18. Gate count

See `G08_ACCEPTANCE_GATE_MANIFEST.md` (companion file) for the full canonical list, derived
directly from this document's numbered spec sections — not chosen in advance.
