# G08 — Trip Location Sharing: Contract Reference

Status: **COMPLETE**. See `docs/backend/G08_PRE_IMPLEMENTATION_REPORT.md` for design rationale and
audit findings, and `docs/backend/G08_FINAL_REPORT.md` for the full verification record.

Core product law (unchanged from the brief, restated here as the contract's north star):

```
TRIP MEMBERSHIP  != LOCATION CONSENT
TRIP ACCESS      != LOCATION ACCESS
LOCATION SHARING != LOCATION HISTORY
LOCATION SHARING != PUBLIC MAP
DEVICE PERMISSION != SERVER CONSENT
LOCATION SHARING DEFAULT = OFF
```

## 1. Data model

### `TripLocationSharing` — explicit consent (one mutable row per `(tripId, userId)`)

| Field | Type | Notes |
|---|---|---|
| `id` | `String` (cuid) | |
| `tripId` / `userId` | `String` | `@@unique([tripId, userId])` |
| `status` | `ACTIVE` \| `STOPPED` \| `EXPIRED` | |
| `startedAt` | `DateTime` | |
| `expiresAt` | `DateTime` | always `> startedAt`, server-computed |
| `stoppedAt` | `DateTime?` | set only by an explicit stop |
| `createdAt` / `updatedAt` | `DateTime` | |

A new `start` call after a prior `STOPPED`/`EXPIRED` session **updates this same row in place**
(new `startedAt`/`expiresAt`, `stoppedAt` cleared) — it never inserts a second row and never builds
a session history. The durable evidence trail is the append-only `AuditLog`
(`tripLocationSharing.started`/`.stopped`/`.terminated`), not this row's own history.

### `TripMemberLocation` — latest location only (one mutable row per `(tripId, userId)`)

| Field | Type | Notes |
|---|---|---|
| `id` | `String` (cuid) | |
| `tripId` / `userId` | `String` | `@@unique([tripId, userId])` |
| `latitude` | `Float` | `-90..90`, same convention as every other lat/lng column in this schema |
| `longitude` | `Float` | `-180..180` |
| `accuracyMeters` | `Float` | `>= 0` |
| `capturedAt` | `DateTime` | device-reported, never trusted for ordering beyond the newer-wins rule below |
| `receivedAt` | `DateTime` | server-owned |
| `expiresAt` | `DateTime` | `receivedAt + AppConfig.tripLocation.ttlSeconds` — **independent** of `TripLocationSharing.expiresAt` |
| `createdAt` / `updatedAt` | `DateTime` | |

No history table exists anywhere in this design — `@@unique([tripId, userId])` is the database
backstop.

## 2. Configuration (`AppConfig.tripLocation`, `src/config/configuration.ts`)

| Key | Env var | Default | Meaning |
|---|---|---|---|
| `sharingMinDurationMinutes` | `TRIP_LOCATION_SHARING_MIN_DURATION_MINUTES` | 5 | minimum requestable consent duration |
| `sharingMaxDurationMinutes` | `TRIP_LOCATION_SHARING_MAX_DURATION_MINUTES` | 720 (12h) | maximum requestable consent duration — never indefinite |
| `ttlSeconds` | `TRIP_LOCATION_TTL_SECONDS` | 300 (5m) | how long a stored coordinate remains disclosable at all |
| `freshnessSeconds` | `TRIP_LOCATION_FRESHNESS_SECONDS` | 90 | FRESH/STALE boundary, computed at read time |
| `maxFutureClockSkewSeconds` | `TRIP_LOCATION_MAX_FUTURE_CLOCK_SKEW_SECONDS` | 120 | reject a `capturedAt` claiming to be more than this far in the future |

Consent duration and location TTL are two independent clocks (spec section 53) — a session may
stay `ACTIVE` for hours while the underlying coordinate goes stale/unavailable after minutes
without a fresh update.

## 3. API

All five routes live on the existing `TripMembersController` (`@Controller('trips')`), authenticated,
never `@Public()`.

| Method | Path | Body | Notes |
|---|---|---|---|
| `POST` | `/v1/trips/:id/location-sharing/start` | `{ durationMinutes: number }` | self only; 409 if already ACTIVE-and-unexpired; 409 `TRIP_ARCHIVED` on an archived trip |
| `POST` | `/v1/trips/:id/location-sharing/stop` | `{}` | self only; 409 `TRIP_LOCATION_SHARING_NOT_ACTIVE` if nothing is active |
| `GET` | `/v1/trips/:id/location-sharing/me` | — | `{ status, startedAt, expiresAt, stoppedAt, locationAvailability }` |
| `PUT` | `/v1/trips/:id/location` | `{ latitude, longitude, accuracyMeters, capturedAt }` | self only; rate-limited `60/60s` |
| `GET` | `/v1/trips/:id/locations` | — | every accepted participant's currently-shareable location |

`GET /locations` response shape (per entry):

```json
{
  "userId": "...",
  "displayName": "...",
  "avatarMediaId": null,
  "availability": "FRESH" | "STALE" | "UNAVAILABLE",
  "latitude": 21.03,        // present only when availability != UNAVAILABLE
  "longitude": 105.85,
  "accuracyMeters": 12,
  "capturedAt": "..."
}
```

No email, device id, IP, session/token, or internal consent-row id is ever returned.

## 4. Error codes (`TRIP_ERROR_CODES`)

| Code | HTTP | When |
|---|---|---|
| `TRIP_LOCATION_SHARING_NOT_ACTIVE` | 409 | `stop`/`update` with no currently-ACTIVE session |
| `TRIP_LOCATION_SHARING_EXPIRED` | 409 | `update` against a session whose `expiresAt` has passed |
| `TRIP_LOCATION_SHARING_ALREADY_ACTIVE` | 409 | `start` while already ACTIVE-and-unexpired |
| `TRIP_LOCATION_STALE_UPDATE` | 409 | `update` with a `capturedAt` strictly older than the stored row |
| `TRIP_LOCATION_INVALID` | 400 | out-of-range duration, or a `capturedAt` too far in the future |
| `TRIP_ARCHIVED` | 409 | reused from G06/G07 — `start`/`update` on an archived trip |
| `TRIP_PERMISSION_DENIED` | 403 | reused from G07 — no membership relationship at all |

Coordinate-shape validation (`-90<=lat<=90`, `-180<=lng<=180`, `accuracyMeters>=0`, valid ISO 8601
`capturedAt`) is enforced by `class-validator` on the DTO and surfaces as the standard
`VALIDATION_ERROR` envelope, not a G08-specific code.

## 5. Concurrency (see pre-implementation report section 11 for the full mechanism)

Every mutating path (`start`, `stop`, `update`, and the G07 `remove`/`leave`/`archive`
integrations) locks the `TripLocationSharing` row for the affected `(tripId, userId)` — or, for
archive, every such row for the trip — as its transaction's first statement, either via a raw
`SELECT ... FOR UPDATE` or a conditional `UPDATE ... WHERE status = 'ACTIVE'` that is simultaneously
the lock and the atomic transition. This is the single serialization point that makes the following
all hold under real concurrent PostgreSQL load (live-proven in `trip-location.e2e-spec.ts`):

- newer `capturedAt` always wins, regardless of network arrival or transaction commit order;
- an exact-duplicate `capturedAt` retry is idempotent, never an error, never a second row;
- a stop/removal/leave/archive racing a concurrent location update never results in a location
  surviving past the point its consent was terminated.

## 6. Lifecycle integration with G06/G07 (additive changes to already-locked files)

- `TripMembersService.remove` / `.leave` — each gains a `terminateLocationSharing` call (stop +
  delete the location row + conditional audit entry) before the existing membership mutation, in
  the SAME transaction.
- `TripsService.archive` — gains a trip-wide bulk stop + bulk location delete + one summary audit
  entry, in the SAME transaction as the existing `archivedAt` update.
- `TripMembersService.transferOwnership` / `TripInvitationsService.accept` — untouched by design;
  consent is keyed by `(tripId, userId)`, never by `TripMember.id` or invitation state, so neither
  operation can affect it.

## 7. Explicitly out of scope (unchanged from the brief)

No location history/trail/timeline endpoint. No reverse geocoding (Google Places/GeoNames/OSM) is
ever triggered from a location update. No WebSocket transport was introduced. No Redis-backed
consent authority — PostgreSQL is the sole source of truth; Redis/BullMQ are untouched by this
phase. No public/anonymous location exposure of any kind.
