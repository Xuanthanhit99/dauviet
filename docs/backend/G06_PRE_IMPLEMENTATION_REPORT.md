# G06 Pre-Implementation Report — Trip Planner + Cost Engine

Status: **DRAFT FOR REVIEW** (no schema/migration/code changes made by this report).

This report is the mandatory pre-implementation audit + design gate for G06, per the G06 phase
brief section 7/8. It is based on two full audits of the actual repository state at commit
`54e6f14` on `main` (clean working tree, up to date with `origin/main`):

1. A full read of `prisma/schema.prisma` (4058 lines).
2. A full audit of `apps/api/src` conventions: ownership/authorization, optimistic concurrency,
   audit/transaction patterns, error registry, pagination, slug/id resolution, G05 service/DTO
   shape, offer freshness, provider registry gating, license revocation behavior, money/currency
   handling, date/timezone handling, Prisma transaction patterns, seed idempotency, e2e bootstrap,
   OpenAPI decorators, rate limiting, queue usage, generic entity-reference patterns, soft-delete/
   version enforcement, and admin RBAC tiering.

No destructive change is required anywhere in this design. **G05's two migrations
(`20260910164143_g05_stay_food_activities`, `20260910164912_g05_entity_kind_values`) are not
touched, edited, renamed, or squashed by anything in this report or the plan it describes.**

A caveat on completeness: the G06 phase brief that prompted this report was truncated by the
client at roughly its section 115 of what is evidently a much longer document (sections on the API
surface, migration mechanics, audit/transaction rules, admin config, money/currency/rounding,
seed/idempotency, e2e/rollback proof, and OpenAPI/rate-limit/queue policy were received in full —
sections beyond ~115, if any exist covering final QA/sign-off mechanics, were not). This report
covers everything through the received sections plus the explicit follow-up questions asked
afterward. If further sections exist, they should be supplied before implementation begins.

---

## 1. CURRENT STATE INVENTORY

### 1.1 Trip/Journey/Itinerary/Budget/Cost/Money/Currency/FX/Transport models

**None exist.** A full-schema sweep for `Trip`, `Itinerary`, `Budget`, `Estimate`, `Cost`, `Money`,
`Currency` (as a model), `Fx`, `Transport`, `Expense`, `Booking` (as a record, not the two
`ProviderCapabilityType` values `BOOKING_REDIRECT`/`BOOKING_API` or the plain `bookingUrl: String?`
fields on the two G05 offer models) returns zero hits. `docs/backend/GLOBAL_V2_ROADMAP.md` and
`docs/backend/BACKEND_HANDOFF.md` both confirm this is deliberate — every phase from G01 through
G05 explicitly lists Trip/booking/expense/affiliate as out of scope, and `BACKEND_HANDOFF.md`'s G05
status section (its most recent entry) says verbatim: *"No `Booking`, `Trip`, `TripItem`, or
payment-processing table exists anywhere in this codebase as of G05."* G06 starts from zero schema
on all Trip-related concepts.

### 1.2 Current Journey model (G04) — and why it is not a Trip precedent for ownership/cost

`Journey`/`JourneyTranslation`/`JourneyStop` are **editorial, admin-authored content**: no owner
field, `editorialStatus: PublicationStatus`, `version: Int @default(0)`, `archivedAt: DateTime?`,
`publishedAt`/`scheduledAt`. `JourneyStop.order: Int` with `@@unique([journeyId, order])` is
admin-curated, not user-owned, and carries no dates, no travelers, no cost dimension.

What Journey *does* give G06 directly reusable, at the **code level** (not just schema): a
deterministic ordered-list reorder algorithm and the audit-log/version-increment shape used on
every status transition. See sections 3.1 and 3.7 below.

### 1.3 G05 canonical entities and provider layer (full field inventory)

`Accommodation`/`Restaurant`/`Attraction`/`Activity` (+ `*Translation`) each carry:
`id, canonicalSlug, countryId, regionId?, cityId?, <type-specific fields>, status: PublicationStatus,
heroMediaId?, createdAt, updatedAt` — no `version`, no lat/long on `Activity`.

Provider layer, per entity: `Provider*Reference` (`id, providerId, <entity>Id?, externalEntityId,
externalUrl?, status: ProviderReferenceStatus, firstSeenAt, lastSeenAt, lastVerifiedAt?, createdAt,
updatedAt`, unique on `[providerId, externalEntityId]`) plus either an `*Offer` model
(`AccommodationOffer`, `ActivityOffer`: `providerReferenceId, <dates/occupancy>, currency: String,
amount: Decimal @db.Decimal(12,2), taxAmount?/feeAmount?/totalAmount? (Accommodation only),
availability: AvailabilityStatus, bookingUrl?, fetchedAt, expiresAt?, refreshAfter?, createdAt`) or
`RestaurantOperationalSnapshot` (no money field — only `priceLevel: Int?`).

This `*Offer` shape (`Decimal(12,2)` amount + bare `currency String` + `fetchedAt`/`expiresAt`/
`refreshAfter` freshness triplet + `AvailabilityStatus`) is the **only existing precedent for
priced, time-sensitive data** in this codebase and is the direct template G06's `TripCostEstimateItem`
provider-evidence fields will imitate.

### 1.4 Money/currency/FX — exact current state (no shared utilities)

- **Representation**: `Decimal @db.Decimal(12, 2)` on `AccommodationOffer.amount`/`taxAmount`/
  `feeAmount`/`totalAmount` and `ActivityOffer.amount`. Never `Int` minor-units, never `Float`.
  Every other model has zero monetary fields.
- **Serialization**: **NOT FOUND** — no shared Decimal→JSON helper exists anywhere in
  `apps/api/src`. Each service call site manually does `offer.amount.toString()` inline
  (`accommodations.service.ts:373-375`, `activities.service.ts:209`) and returns an untyped
  `unknown[]` — there is no response DTO/class-transformer layer for offers at all.
- **Currency validation**: a bare, repeated `@Matches(/^[A-Z]{3}$/)` regex in each DTO
  (`accommodation.dto.ts:218-220`, `activity.dto.ts:133-135`), plus a local `@Transform` uppercase
  helper on `Country.defaultCurrency` (`country.dto.ts:102,155-158`). This checks "3 uppercase
  letters," **not** membership in the real ISO-4217 list (`"ZZZ"` currently passes). No
  `Currency` model, no currency enum.
- **FX**: **NOT FOUND**, confirmed by grep for `fx|exchangeRate|conversionRate` across the whole
  source tree — zero hits. Every currency-bearing field today is single-currency, stored and
  returned in its own native currency with no conversion path.

### 1.5 Date/timezone — exact current state

- Calendar dates (`AccommodationOffer.checkInDate/checkOutDate`, `ActivityOffer.activityDate`) are
  `@db.Date` in Prisma and validated in DTOs with a hand-rolled `@Matches(/^\d{4}-\d{2}-\d{2}$/)`
  regex (`GetAccommodationOffersDto`, `GetActivityOffersDto`) — **not** `@IsDateString()` — a
  deliberate choice (per the DTO's own doc comments) to keep them pure calendar dates with no
  time/offset component.
- The only IANA timezone field in the schema is `City.timezone: String` (required), validated by a
  real, wired-in utility: `apps/api/src/common/util/timezone.util.ts::isValidIanaTimezone()`
  (`Intl.DateTimeFormat` construct/catch, deliberately chosen over
  `Intl.supportedValuesOf('timeZone')` so IANA link-aliases like `Asia/Ho_Chi_Minh` still validate),
  called from `CitiesService.assertValidTimezone()` on create and on update-when-provided. No
  `Country`/`Region`-level timezone; no dedicated `Timezone` model.
- `RestaurantOperationalSnapshot.timezone: String?` is a separate, optional, provider-supplied
  field with no validation — explicitly there so opening-hours data is never assumed to be in UTC.

### 1.6 Ownership/privacy — exact current state (two live patterns, both usable)

**Pattern A — implicit scoping** (`Bookmark`, `PlaceVisit`): every query is pre-filtered by
`where: { userId }` sourced from `@CurrentUser()`; a non-owner can never even reference another
user's row because the lookup key itself includes `userId`. No explicit 403 branch exists or is
needed for list/add; `remove` 404s (never 403s) if the composite key doesn't resolve for that user.

**Pattern B — explicit lookup-then-compare** (`Comment`, `CommunityStory`, `Contribution`,
`MediaAsset`): fetch by bare `id` regardless of caller, `NotFoundException` (404) if it doesn't
exist at all, then `if (record.ownerId !== actor.id) throw new ForbiddenException(...)` (403) if it
exists but belongs to someone else. **Existence is never hidden** — the codebase's established
convention is 404-then-403, not 404-always. Example: `contributions.service.ts`'s `getOr404()` +
`assertOwnerOrPrivileged()`; `comments.service.ts:201-217` (`update`/`remove`).

**G06 decision (section 4.2 below): Trip uses Pattern B**, because Trip supports full CRUD with
replace-style children (destinations/days/items) much closer to Contribution/Comment's shape than
to Bookmark's simple membership-set shape, and because Trip mutations need a single reusable
"load-and-authorize" guard shared across many sub-resource endpoints (destinations, days, items,
transport legs, estimates) — exactly the role `getOr404`/`assertOwnerOrPrivileged` play for
Contribution.

### 1.7 Optimistic concurrency — exact current state, with a decision to diverge

`version: Int @default(0)` exists today only on `Story`, `Journey`, `Contribution`. All three read
an `expectedVersion?: number` from the request DTO and compare-then-reject with
**`BadRequestException` → HTTP 400** (not 409) on mismatch (`journeys.service.ts:311-320`,
`stories.service.ts:373-378`, `contributions.service.ts:128-135`), each with its own
`*_VERSION_CONFLICT` error code. `ConflictException`(409) exists elsewhere in the codebase for
unique-constraint-style conflicts (citations, aliases, countries, auth, providers, themes) but is
never used for version mismatches specifically.

**G06 decision**: Trip's version-conflict endpoint returns **409 Conflict**
(`TRIP_VERSION_CONFLICT`), per the G06 brief's explicit instruction (section 62: *"Conflict:
409"*). This is a **documented, deliberate divergence** from the existing Story/Journey/
Contribution 400-based convention — it does not touch or "fix" those three (they are locked,
frozen phases; changing their status code would be an unrequested, out-of-scope backwards
change) — it only sets the convention for new G06 code, which the brief mandates explicitly for
this exact scenario. Future phases should probably follow G06's 409, not the older 400, but that
migration (if ever done) is out of scope here.

### 1.8 Audit service — exact current state

`AuditService.log(entry: AuditEntry, db: Db = this.prisma)` (`audit.service.ts:38-58`) accepts an
optional second parameter that is either the ambient `PrismaService` or an in-flight
`Prisma.TransactionClient`, specifically so a caller can pass its own `tx` and have the audit
insert roll back with everything else. The doc comment on this parameter cites a real regression
it fixed (an orphaned `source.created` audit row surviving a rolled-back transaction because the
call site ignored the in-flight `tx`).

**In practice, this is used inconsistently, and the inconsistency is real, not a false read**:
simple single-row create/update/status-change call sites in the G05 services (`create`,
`setStatus`, translation upsert) call `audit.log()` as a **separate, non-atomic statement after**
the Prisma write — e.g. `accommodations.service.ts:97-124` (`create`), `:167-172` (`setStatus`).
Only **composite/replace-style** writes (setting many-to-many destination/cuisine/dish links, or
`DestinationCollectionsService.setMembers`) wrap `audit.log(..., tx)` inside the same
`$transaction` — `accommodations.service.ts:188-195`, `restaurants.service.ts:119-154`,
`activities.service.ts:102-105`, `destination-collections.service.ts:104-111`.

**G06 decision**: G06 follows the **composite/replace-style pattern universally**, i.e. every
Trip-domain mutation that can be meaningfully audited passes `tx` through, including simple
create/update — not just replace-all-children operations. This is required, not optional, by the
G06 brief itself (section 94/95: *"No success audit after rollback,"* mandatory transactions for
"multi-write assumption updates" and estimate generation) and is strictly safer than the mixed G05
precedent; it does not modify G05's existing (already-accepted) inconsistency, it just doesn't
repeat it in new code.

### 1.9 Error registry — exact current state

Ten domain registries live either in `common/errors/*-error-codes.ts` (cross-cutting domains:
`geography`, `provider`, `community`, `contribution`, `stay-food-activity`, `discovery`,
`trust`) or module-locally (`auth`, `media`, `editorial`) as `*-error-codes.ts` next to the module
that owns them exclusively. All are plain `as const` objects; a single spec file
(`common/errors/error-codes.spec.ts`) imports every registry into one `REGISTRIES` map and asserts
(a) no duplicate `code` value across registries, (b) no internal duplicates, (c) no collision with
reserved generic codes (`VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT`, etc.), (d) SCREAMING_SNAKE_CASE
format, (e) `total > 50`.

**G06 decision**: add `common/errors/trip-error-codes.ts` (cross-cutting domain, like `geography`/
`provider`, since Trip touches many sub-resources under one owner-scoped umbrella) and register it
in `REGISTRIES` in `error-codes.spec.ts` — purely additive, following the exact convention G02
established for `PROVIDER_ERROR_CODES` and G05 for `STAY_FOOD_ACTIVITY_ERROR_CODES`.

### 1.10 Pagination, slug/ID resolution, RBAC, rate limiting, queue — exact current state

- **Pagination**: shared `OffsetPaginationQuery` (`page`/`pageSize`, max 100) exists but list
  endpoints with filters (destinations, accommodations) don't literally import it — each defines
  its own combined `List*QueryDto` re-declaring the same two fields inline alongside filters. This
  combined-DTO shape is **mandatory**, not stylistic: it is the fix for the Post-G04 hardening
  defect (a route binding both a whole-object `@Query()` DTO and separate `@Query('x')` params over
  the same `req.query`, whose whitelist validation rejected the individual params). **G06 must use
  one combined DTO per list endpoint, never a dual binding.**
- **Slug/ID resolution**: public DTOs accept `country`/`region`/`city`/`destination` as
  **canonicalSlug strings** (raw internal id also still resolves, but is undocumented); an
  unresolvable slug is a `404 *_NOT_FOUND`, never a silently empty/broadened page. The service-layer
  shape is `listPublic(stringFilter) → resolvePublicXId(...) → list(idFilter)` — the id-based
  `list()` is unchanged/reused, only a slug→id resolution step is added in front of it. **G06's
  `TripDestination`/itinerary-item selection DTOs must accept destination/accommodation/restaurant/
  activity/attraction slugs this same way, never require the caller to know an internal cuid.**
- **RBAC**: `@Roles(...Role[])` + `RolesGuard` (`getAllAndOverride`, override not merge). Tiering
  observed: content catalogue mutations → `EDITOR, ADMIN`; reviewer-gated content → adds
  `HISTORIAN_REVIEWER`; moderation → `MODERATOR, ADMIN`; **config/admin-only entities (provider,
  provider-license, provider-integration, users-admin, audit-log viewing) → `ADMIN` only, or
  `ADMIN` + a small reviewer set.** No `Roles` gate at all is needed on Trip's own CRUD routes
  (ownership check replaces RBAC there — any authenticated `USER` may create/manage their own
  Trip), but **`CostAssumption` admin mutation is config-like and must be `ADMIN`-only**, mirroring
  `provider-licenses.controller.ts`'s pattern exactly (every mutating route `@Roles(Role.ADMIN)`),
  not the looser `EDITOR, ADMIN` used for public catalogue content.
- **Rate limiting**: `@nestjs/throttler` wired globally via `APP_GUARD` (`ThrottlerGuard`), with
  per-route `@Throttle({ default: { limit, ttl } })` overrides on a few mutation-heavy /
  abuse-prone routes (comment create/vote, reports, auth, community). **G06 applies `@Throttle` to
  `POST /v1/trips/:id/estimates` (explicit recalculation)**, per brief section 111.
- **Queue/Redis**: BullMQ is wired at the root (`app.module.ts`) but the **only real
  producer/consumer pair in the entire codebase is `media-processing`** (`media.service.ts` +
  `media.processor.ts`); `health.module.ts` merely re-registers the same queue for health-check
  purposes. No other feature — including nothing analogous to G06's needs — uses a queue.
  **G06 decision: no queue.** Cost calculation is small, bounded, and must be deterministic and
  synchronous per the brief (section 113/46); this matches the existing precedent that queues are
  reserved for genuinely async, unbounded work (media transcoding), not request-scoped computation.

### 1.11 Generic entity-reference pattern — confirmed, and confirmed *not* to be reused for Trip items

`Comment`/`Bookmark` use a generic `targetType: EntityKind` + `targetId: String` pair with **no
database-level FK** — referential integrity is enforced entirely in application code via a
hand-written `switch`/ternary dispatch to the correct concrete model's `findUnique` per
`targetType`. This is a deliberate, working tradeoff for those two features (many heterogeneous,
loosely-coupled "commentable"/"bookmarkable" types where a broken/dangling reference is a cosmetic
problem, not a financial one).

**G06 explicitly rejects this pattern for `TripItem`'s canonical target**, per the brief's own
instruction (sections 17-18: *"Do NOT create a dangerous generic entityType + entityId without FK
integrity... Prefer typed nullable FKs"*). A cost estimate's correctness depends on the itinerary
item actually resolving to a real, current canonical entity; a silently-dangling generic reference
here would corrupt cost calculations invisibly. `TripItem` therefore gets one nullable, real
Postgres FK per canonical type (`accommodationId?`, `restaurantId?`, `activityId?`, `attractionId?`,
`placeId?`), enforced consistent with `type` at the service layer (see section 3.3).

### 1.12 Everything else audited and confirmed reusable as-is

- **Prisma transaction patterns**: both the array-of-promises form (`$transaction([p1, p2])`, used
  for count+findMany pairs) and the interactive-callback form (`$transaction(async (tx) => {...})`,
  used for delete-then-recreate replace operations) are established; Journey's **two-phase
  reorder** (move every affected row to a unique negative placeholder order in one `$transaction`,
  then to final `0..n-1` order in a second `$transaction`, to never transiently violate a
  `@@unique([parentId, order])` constraint) is the exact, direct precedent for `TripItem`/
  `TripDay`/`TripDestination` reordering.
- **Seed idempotency**: `prisma/golden/*.ts` fixtures are upserted by natural unique key
  (`upsert({ where: { canonicalSlug }, update: {}, create: {...} })`), never
  findFirst-then-skip; the one exception (`ProviderLicense`, no natural slug) synthesizes a
  lookup key via a preceding `findFirst`. G06's `CostAssumption` needs a natural composite unique
  key for the same idempotent-upsert shape to work (see section 3.6).
- **E2E bootstrap**: `apps/api/test/bootstrap-test-app.ts::bootstrapTestApp()` boots the real
  `AppModule` (real Postgres, real global pipes/filters/interceptors/guards) — no mocked
  `PrismaService`. Each `.e2e-spec.ts` does its own `beforeAll`/`afterAll` fixture cleanup via raw
  `prisma.*.deleteMany`. G06's e2e spec follows this exact shape.
- **OpenAPI**: `@ApiTags` (class) + `@ApiBearerAuth` (protected method) are used; `@ApiOperation`/
  `@ApiResponse` are **not** used anywhere in G05 controllers — Swagger infers response shape from
  the method return type. `pnpm --filter api run openapi:generate` (script name confirmed in
  `apps/api/package.json:16`, calls `src/generate-openapi.ts`) regenerates
  `docs/backend/openapi.json`. G06 matches the existing decorator minimalism — no new documentation
  convention introduced.
- **Soft-delete/archive/version-in-code**: `PublicationStatus.ARCHIVED` + `archivedAt` +
  `version: { increment: 1 }` are all set together in one `update()` call on every editorial status
  transition (`journeys.service.ts:337-345`, `stories.service.ts:433-450`). G06's Trip lifecycle
  (`DRAFT/PLANNING/READY` + optional archive, section 4.3) follows this same "set them all in one
  write" shape.

---

## 2. WHAT G06 REUSES VS. WHAT IS ACTUALLY NEW

### 2.1 Reused verbatim (no new pattern invented)

- `Decimal @db.Decimal(12, 2)` for every monetary amount.
- Bare `currency: String` + `@Matches(/^[A-Z]{3}$/)` validation (G06 does **not** invent an ISO-4217
  list validator or a `Currency` model — see section 4.5 for why).
- `@db.Date` + `@Matches(/^\d{4}-\d{2}-\d{2}$/)` for every calendar date (Trip start/end,
  TripDestination arrival/departure, TripDay date, offer/estimate dates).
- `isValidIanaTimezone()` util, reused unchanged (not re-implemented) wherever G06 needs to resolve
  a destination's timezone.
- The `List*QueryDto` combined-query-DTO convention for every list endpoint.
- The `listPublic(stringFilter) → resolve*Id → list(idFilter)` slug-resolution shape for every
  place a Trip sub-resource references canonical geography/G05 entities by slug.
- `@Roles(...)` + `RolesGuard`, with `CostAssumption` admin mutation set to `ADMIN`-only (matching
  `provider-licenses` tier), and **no** `@Roles` gate on Trip's own owner-scoped CRUD.
- `@nestjs/throttler`'s `@Throttle` decorator on the estimate-recalculation endpoint.
- `AuditService.log(entry, tx)` — used, not reinvented; called from inside every mutation's own
  `$transaction` (a stricter, not looser, application of the existing mechanism).
- Journey's two-phase reorder algorithm, applied to `TripDay`/`TripItem` ordering.
- `bootstrapTestApp()` for the new `trips.e2e-spec.ts`.
- Prisma `$transaction` (both forms) for every multi-row/replace-style Trip mutation.
- Upsert-by-natural-unique-key seeding for `CostAssumption` fixtures.
- `EntityKind` enum extended additively (`TRIP`, `TRIP_COST_ASSUMPTION`) exactly as G01/G02/G05 each
  added their own values — never renamed/reordered.

### 2.2 Genuinely new (first time this pattern appears in the codebase)

- **A user-owned, private resource with a full sub-resource graph** (destinations → days → items,
  plus transport legs) — Bookmark/PlaceVisit are single flat rows; Comment/Contribution are single
  rows with no children. Trip is the first "aggregate root with owned children" pattern scoped to
  a non-privileged end user, not an editor/admin.
- **Typed nullable FK integrity on a polymorphic-shaped item** (`TripItem`) — the codebase's only
  existing polymorphic-shaped models (`Comment`, `Bookmark`) deliberately use the generic,
  DB-unenforced pattern; G06 deliberately does not follow that precedent (see section 1.11).
- **A three-scenario, atomic-generation cost calculation** (`TripCostEstimateGeneration` +
  `TripCostEstimate` × 3 + `TripCostEstimateItem`) — nothing like this (multi-row atomic snapshot
  generation with a documented precedence/assumption-resolution algorithm) exists anywhere in the
  codebase; the closest analogue (G05's `*Offer` freshness check) is a single-row filter, not a
  multi-source calculation.
- **A versioned, scoped, temporally-effective configuration table consumed by a deterministic
  calculation engine** (`CostAssumption`) — `ProviderLicense`/`ProviderDataPolicy` are the closest
  precedent (also versioned, temporally scoped, admin-only), but they gate access to data, they
  don't feed arithmetic.
- **409 for optimistic-concurrency conflict** — see section 1.7; a deliberate divergence, not an
  oversight.
- **Audit write inside the transaction on every mutation, not just replace-style ones** — a
  stricter application of an existing mechanism, not a new one.

---

## 3. G06 DESIGN

### 3.1 Trip aggregate (ownership + lifecycle + concurrency)

```
model Trip {
  id                    String       @id @default(cuid())
  ownerId               String
  title                 String
  status                TripStatus   @default(DRAFT)   // DRAFT | PLANNING | READY
  startDate             DateTime     @db.Date
  endDate               DateTime     @db.Date
  primaryCurrency       String                          // ISO 4217, @Matches, uppercase
  travelerCount         Int          @default(1)
  roomCount             Int?
  originCountryId       String?
  originRegionId        String?
  originCityId          String?
  originLabel           String?
  targetBudgetAmount    Decimal?     @db.Decimal(12, 2)
  targetBudgetCurrency  String?
  notes                 String?
  version               Int          @default(0)
  archivedAt            DateTime?
  createdAt             DateTime     @default(now())
  updatedAt             DateTime     @updatedAt

  owner        User @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  destinations TripDestination[]
  days         TripDay[]
  items        TripItem[]
  transportLegs TripTransportLeg[]
  estimateGenerations TripCostEstimateGeneration[]

  @@index([ownerId, archivedAt])
  @@index([ownerId, status])
}

enum TripStatus { DRAFT PLANNING READY }
```

- `endDate >= startDate` enforced at the service layer (Prisma has no native cross-column CHECK in
  this schema's Prisma version; every other cross-field invariant in this codebase — e.g. G05
  offer date ordering — is likewise a service-layer check, not a DB constraint, so this matches
  existing convention rather than introducing a new one).
- `startDate == endDate` (a one-day trip) is valid — no minimum-duration check.
- `travelerCount >= 1` enforced at the DTO layer (`@Min(1)`).
- No `TripMember`/collaboration — `travelerCount` is a plain planning integer, not a relation, per
  brief section 34 (explicitly deferred to G07).
- `TripOrigin` is **not** a separate model — it's a single value per trip, so four optional fields
  directly on `Trip` are simpler and sufficient (see section 5, "not needed").
  `TripBudgetTarget` is likewise fields on `Trip`, not a separate model, for the same reason.

### 3.2 Ownership/privacy enforcement

Every Trip route loads via a shared `TripsService.getOwnedOrThrow(tripId, userId)`:
```
async getOwnedOrThrow(tripId: string, userId: string) {
  const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) throw new NotFoundException({ code: TRIP_ERROR_CODES.TRIP_NOT_FOUND, ... });
  if (trip.ownerId !== userId) throw new ForbiddenException({ code: TRIP_ERROR_CODES.TRIP_NOT_OWNER, ... });
  return trip;
}
```
This mirrors `ContributionsService.getOr404()` + `assertOwnerOrPrivileged()` exactly (Pattern B,
section 1.6) — every sub-resource controller (destinations/days/items/transport/estimates) calls
this guard first. No public Trip route exists at all — no `@Public()` decorator anywhere in the
`trips` module, no listing in `/v1/search` or `/v1/map/features` (G11 scope, untouched).
Admins get **no** implicit read access (brief section 61) — `getOwnedOrThrow` does not special-case
any role; a future admin-moderation feature would be a distinct, explicitly-designed endpoint, not
a bypass of this guard.

### 3.3 Itinerary: TripDestination, TripDay, TripItem, target integrity

```
model TripDestination {
  id            String    @id @default(cuid())
  tripId        String
  destinationId String
  sortOrder     Int
  arrivalDate   DateTime? @db.Date
  departureDate DateTime? @db.Date
  notes         String?
  createdAt     DateTime  @default(now())

  @@unique([tripId, sortOrder])
}

model TripDay {
  id        String   @id @default(cuid())
  tripId    String
  date      DateTime @db.Date
  dayNumber Int
  title     String?
  notes     String?

  @@unique([tripId, date])
}

enum TripItemType { ACCOMMODATION RESTAURANT ACTIVITY ATTRACTION PLACE TRANSPORT CUSTOM }

model TripItem {
  id               String        @id @default(cuid())
  tripId           String
  tripDayId        String
  type             TripItemType
  sortOrder        Int
  accommodationId  String?
  restaurantId     String?
  activityId       String?
  attractionId     String?
  placeId          String?
  transportLegId   String?
  title            String?        // required when type = CUSTOM, else display-snapshot only
  notes            String?
  startLocalTime   String?        // "HH:mm", @Matches
  endLocalTime     String?
  allDay           Boolean        @default(false)
  plannedAmount    Decimal?       @db.Decimal(12, 2)
  plannedCurrency  String?
  createdAt        DateTime       @default(now())
  updatedAt        DateTime       @updatedAt

  @@unique([tripDayId, sortOrder])
}
```

**Target integrity rule (service-layer, validated on every create/update, mirroring how G05
services already validate DTO/entity consistency rather than relying on a DB CHECK)**:

| `type`          | required FK        | all other FKs must be null |
|-----------------|---------------------|------------------------------|
| ACCOMMODATION   | `accommodationId`   | yes |
| RESTAURANT      | `restaurantId`      | yes |
| ACTIVITY        | `activityId`        | yes |
| ATTRACTION      | `attractionId`      | yes |
| PLACE           | `placeId`           | yes |
| TRANSPORT       | `transportLegId`    | yes |
| CUSTOM          | none (all null)     | yes; `title` required instead |

`TripDay.date` must fall within `[Trip.startDate, Trip.endDate]`; `TripDestination.arrivalDate`/
`departureDate`, if present, must fall within Trip dates and satisfy `arrival <= departure`.
Overlapping `TripDestination` date ranges are explicitly **allowed** (brief section 15).

Reordering `TripItem` within a `TripDay` (or `TripDestination` within a `Trip`) reuses Journey's
exact two-phase negative-placeholder-then-final `$transaction` algorithm against the
`@@unique([tripDayId, sortOrder])` / `@@unique([tripId, sortOrder])` constraints.

Canonical FK targets (`Accommodation`, `Restaurant`, `Activity`, `Attraction`, `Place`,
`Destination`) are validated at selection time against their **public/current** status
(`PublicationStatus.PUBLISHED`), reusing each module's existing `findBySlug(..., includeUnpublished
= false)` shape — consistent with brief section 67 ("Trip can reference only entities that owner
was allowed to access at selection time... do not expose hidden current canonical content"). No
snapshot of the canonical entity's full content is stored — only what's declared in section 3.5
below (offer-evidence amounts), per brief section 64 ("do not duplicate entire canonical entity
into Trip").

### 3.4 Transport legs

```
enum TripTransportMode { WALK LOCAL_TRANSIT TRAIN BUS FLIGHT FERRY CAR TAXI_RIDESHARE BIKE OTHER }
enum TripCostProvenance { USER_INPUT RULE_BASED_ESTIMATE PROVIDER_EVIDENCE UNKNOWN }

model TripTransportLeg {
  id               String              @id @default(cuid())
  tripId           String
  sortOrder        Int
  mode             TripTransportMode
  fromLabel        String
  toLabel          String
  fromDestinationId String?
  toDestinationId   String?
  plannedDate      DateTime?           @db.Date
  plannedAmount    Decimal?            @db.Decimal(12, 2)
  plannedCurrency  String?
  provenance       TripCostProvenance  @default(UNKNOWN)
  notes            String?
  createdAt        DateTime            @default(now())

  @@unique([tripId, sortOrder])
}
```

No routing/distance provider exists in this codebase (confirmed — no routing/mapping provider
capability is wired to any real integration); `TripTransportLeg` never computes or stores a
distance. No live fare fetch, no flight/train API — `plannedAmount` is always either
`USER_INPUT` or a `RULE_BASED_ESTIMATE` from a `CostAssumption` (section 3.6), never a fabricated
"live" price, per brief section 41.

### 3.5 Cost Engine: assumptions, precedence, generations, estimates, items

```
enum CostCategory { STAY FOOD ACTIVITY TRANSPORT OTHER }
enum CostUnit { PER_PERSON PER_PERSON_PER_DAY PER_ROOM_PER_NIGHT PER_TRIP PER_ITEM PER_LEG }
enum CostAssumptionScope { GLOBAL COUNTRY REGION CITY DESTINATION }
enum CostAssumptionStatus { DRAFT ACTIVE RETIRED }

model CostAssumption {
  id              String                @id @default(cuid())
  scope           CostAssumptionScope
  scopeId         String?               // null only when scope = GLOBAL
  category        CostCategory
  unit            CostUnit
  currency        String
  lowAmount       Decimal               @db.Decimal(12, 2)
  typicalAmount   Decimal               @db.Decimal(12, 2)
  highAmount      Decimal               @db.Decimal(12, 2)
  effectiveFrom   DateTime              @db.Date
  effectiveTo     DateTime?             @db.Date
  status          CostAssumptionStatus  @default(DRAFT)
  version         Int                   @default(1)
  source          String                // provenance note, e.g. "editorial estimate" / cited source
  createdAt       DateTime              @default(now())
  updatedAt       DateTime              @updatedAt

  @@unique([scope, scopeId, category, unit, effectiveFrom])
  @@index([scope, scopeId, category, status])
}
```

`low <= typical <= high` is enforced at the service layer on create/update (brief section 80).
Admin-only mutation (`@Roles(Role.ADMIN)`, matching `provider-licenses` tier — see section 1.10).
Lifecycle `DRAFT → ACTIVE → RETIRED`; only `ACTIVE` rows with `effectiveFrom <= tripDate <
(effectiveTo ?? +infinity)` are eligible for a given trip date.

**Precedence** (brief section 79, implemented as an explicit ordered array the engine walks, never
nested conditionals):
```
1. USER_OVERRIDE            (TripItem.plannedAmount / TripTransportLeg.plannedAmount)
2. SELECTED_FRESH_PROVIDER_OFFER   (fresh, eligible G05 AccommodationOffer/ActivityOffer)
3. CostAssumption scope=DESTINATION
4. CostAssumption scope=CITY
5. CostAssumption scope=REGION
6. CostAssumption scope=COUNTRY
7. CostAssumption scope=GLOBAL
8. UNKNOWN
```
Tie-break within a scope level: newest `effectiveFrom <= tripDate`, highest `version`.

**Estimate generation** (atomic parent + 3 scenario children + component breakdown):
```
model TripCostEstimateGeneration {
  id            String   @id @default(cuid())
  tripId        String
  tripVersion   Int                 // Trip.version at calc time (idempotency key component)
  inputHash     String              // canonical hash of resolved inputs
  engineVersion String              // e.g. "g06-v1"
  calculatedAt  DateTime @default(now())

  estimates TripCostEstimate[]
  @@unique([tripId, inputHash, engineVersion])
}

enum CostScenario { LOW TYPICAL HIGH }
enum EstimateCompleteness { COMPLETE PARTIAL }
enum EstimateConfidence { HIGH MEDIUM LOW }

model TripCostEstimate {
  id             String                @id @default(cuid())
  generationId   String
  scenario       CostScenario
  currency       String
  totalAmount    Decimal               @db.Decimal(12, 2)
  completeness   EstimateCompleteness
  confidence     EstimateConfidence
  unknownCount   Int                   @default(0)

  items TripCostEstimateItem[]
  @@unique([generationId, scenario])
}

model TripCostEstimateItem {
  id               String              @id @default(cuid())
  estimateId       String
  category         CostCategory
  tripDayId        String?
  tripItemId       String?
  transportLegId   String?
  currency         String?             // null when provenance = UNKNOWN
  amount           Decimal?            @db.Decimal(12, 2)
  provenance       TripCostProvenance
  assumptionId     String?
  offerId          String?             // AccommodationOffer.id or ActivityOffer.id (no relation, cross-domain evidence pointer, see 3.5.1)
  description      String?
}
```

`inputHash` is a canonical JSON hash (stable key order) of: Trip's own planning fields
(`startDate`, `endDate`, `travelerCount`, `roomCount`, `primaryCurrency`), every `TripDestination`/
`TripDay`/`TripItem`/`TripTransportLeg` row's cost-relevant fields, the `CostAssumption.version`
of every assumption actually used, and the identity+`fetchedAt` of every provider offer actually
used. **Idempotency** (brief section 93): `POST /v1/trips/:id/estimates` first computes
`inputHash`; if a `TripCostEstimateGeneration` already exists for
`(tripId, inputHash, engineVersion)`, it is returned as-is (no duplicate row) — enforced by the
`@@unique` constraint plus an upsert-style check-then-return in the service.

**Atomicity** (brief section 92): the parent generation + 3 `TripCostEstimate` rows + all
`TripCostEstimateItem` rows are written in one interactive `$transaction(async (tx) => {...})`; a
failure calculating HIGH rolls back LOW and TYPICAL too — no partial scenario set ever persists.
`sum(items.amount where amount is not null) === estimate.totalAmount` is a service-layer invariant,
covered by a dedicated unit test per scenario (brief section 28).

**Scenario invariant** `LOW <= TYPICAL <= HIGH`: since every component's low/typical/high already
satisfies this (enforced at the `CostAssumption` row level, section above) and provider-evidence
components use the same fixed amount across all three scenarios (a live offer has one price, not
three), the summed totals are non-decreasing by construction — no runtime renormalization or
percentage fallback is needed, satisfying brief section 30's ban on "arbitrary multipliers."

**UNKNOWN vs. zero** (brief section 42): a component with no resolvable provenance (no user
override, no fresh offer, no matching assumption at any scope) gets
`provenance = UNKNOWN, amount = null, currency = null` and increments `unknownCount` on the
estimate; it is never coerced to `0`. `completeness = PARTIAL` whenever `unknownCount > 0`, else
`COMPLETE`. `confidence` is a simple, explicitly-documented (not statistical) function of evidence
composition: `HIGH` if every included component's provenance is `USER_OVERRIDE` or
`SELECTED_FRESH_PROVIDER_OFFER`; `LOW` if any component resolved only at `GLOBAL` scope or is
`UNKNOWN`; `MEDIUM` otherwise.

#### 3.5.1 G05 offer-evidence integration

An `AccommodationOffer`/`ActivityOffer` is eligible evidence only if: it matches the exact
accommodation/activity, dates, occupancy/participants, and currency the `TripItem` specifies, is
**not expired** (`!offer.expiresAt || offer.expiresAt > now` — same post-fetch check pattern as
`accommodations.service.ts:365-367`/`activities.service.ts:203-204`, not a Prisma `where` filter,
for consistency with existing code), and its provider reference/license/integration currently
passes `ProviderRegistryService.getExecutionContext(...)` (the exact same gate G05 already calls —
**reused unchanged**, per brief section 38: "G02/G05 license and policy constraints still apply").
An expired offer is never used as HISTORICAL/STALE evidence (brief section 37, option A) — it's
simply not eligible, and the engine falls through to the next precedence level.

`TripCostEstimateItem.offerId` stores only the offer's own id (a plain string, no Prisma relation)
plus the `amount`/`currency` already copied into the item's own `amount`/`currency` fields — this
is the "minimal permitted evidence snapshot" the brief requires (section 65/66): if the original
offer later expires or is deleted, the estimate item remains numerically self-contained and
explainable without depending on the offer still existing. No provider raw payload, no
attribution/contact/booking-URL fields are copied — those stay exclusively in G05's own
domain and are never re-served through a Trip response (brief section 38's "separate estimate
provenance record from redisplaying provider payload").

If a license is revoked between offer-fetch-time and a later recalculation, the **next**
recalculation simply finds the offer ineligible (gate fails) and falls through to
`CostAssumption` evidence — exactly mirroring G05's existing "revocation takes effect on the very
next call" behavior, reused unchanged.

#### 3.5.2 Line-item quantification per category (resolved during implementation)

`resolveComponent`/`aggregateEstimate` (the pure cost-engine core) and `resolveAssumptionCandidates`
(the DB-side precedence query) are both built and unit-tested. What remained open going into the
estimate-generation orchestrator was: **where does each category's line item actually come from,
and how many of them are there per trip?** Resolved as follows, each chosen to avoid double-counting
between a specific itemized cost and a generic day-level fallback for the same money:

- **STAY**: one `TripCostEstimateItem` per `TripItem` of `type = ACCOMMODATION`. Evidence order:
  the item's own `plannedAmount` (USER_INPUT) → an eligible fresh `AccommodationOffer` (per
  section 3.5.1) → a `CostAssumption` resolved at that item's day's location context, unit
  `PER_ROOM_PER_NIGHT` × `roomCount` (RULE_BASED_ESTIMATE) → UNKNOWN. Multi-night stays are never
  specially detected — a 3-night hotel stay is simply 3 separate `ACCOMMODATION` `TripItem`s (one
  per `TripDay`) referencing the same `accommodationId`; summing three `PER_ROOM_PER_NIGHT` line
  items already produces the correct 3-night total with no "consecutive-day" logic needed.
- **ACTIVITY**: one `TripCostEstimateItem` per `TripItem` of `type = ACTIVITY` or `ATTRACTION`.
  Evidence order: `plannedAmount` (USER_INPUT) → an eligible fresh `ActivityOffer` (ACTIVITY only;
  ATTRACTION has no G05 offer layer) → a `CostAssumption` at that item's location context, unit
  `PER_PERSON` × `travelerCount` → UNKNOWN.
- **FOOD**: **one `TripCostEstimateItem` per `TripDay`, never per restaurant** — this is the one
  category where itemizing and falling back would otherwise double-count. If the day has one or
  more `RESTAURANT`-type `TripItem`s with a `plannedAmount` set, the day's food line item sums
  those overrides (USER_INPUT) — a restaurant item with no `plannedAmount` contributes nothing
  numerically (no G05 restaurant pricing exists per the pre-implementation audit, so there is no
  offer-evidence tier for FOOD at all). If the day has no priced restaurant items, the line item
  falls back to a `CostAssumption` at that day's location context, unit `PER_PERSON_PER_DAY` ×
  `travelerCount` (RULE_BASED_ESTIMATE). Never both summed for the same day.
- **TRANSPORT**: two independent sources, both included:
  1. One `TripCostEstimateItem` per `TripTransportLeg` — `plannedAmount` (USER_INPUT) → a
     `CostAssumption` at the leg's `fromDestinationId` location context (falling back to
     `toDestinationId` if `fromDestinationId` is unset, then GLOBAL), unit `PER_LEG` if such an
     assumption exists, else UNKNOWN (no PER_LEG rows are seeded in v1 - see section 3.6 below).
  2. One additional "local transport" `TripCostEstimateItem` per `TripDay`, always resolved from a
     `CostAssumption` at that day's location context, unit `PER_PERSON_PER_DAY` × `travelerCount`
     (RULE_BASED_ESTIMATE only - there is no itemized way for an owner to override day-to-day local
     transit specifically, unlike the other categories). This is deliberately a *separate* line from
     `TripTransportLeg` cost, matching the real-world distinction between "the train between cities"
     and "getting around once you're there."
- **A `TripDay`'s location context** (used by the FOOD and local-TRANSPORT day-level fallbacks, and
  by any item-level fallback that needs one) is the first `TripDestination` (by `sortOrder`) whose
  `[arrivalDate, departureDate]` covers that day, or — if no `TripDestination` has dates set, or none
  covers this day — the trip's first `TripDestination` overall, or GLOBAL-only if the trip has no
  destinations yet. Overlapping destinations on the same day (explicitly allowed, spec section 15)
  are not split or blended; picking the first by `sortOrder` is a deliberate, documented
  simplification, not an oversight.
- **OTHER**: no automatic line items in v1 - a category that exists in the schema/enum for future
  use (e.g. a manually-added miscellaneous cost) but nothing in the itinerary maps to it yet.

This design is captured here, ahead of writing `TripCostEstimatesService`, specifically so the
double-counting question (the one genuinely ambiguous part of the whole cost engine) is settled by
inspection and documentation before code is written against it, rather than discovered mid-implementation.

### 3.6 Seed / idempotency

`prisma/golden/cost-assumptions.ts` — upserted by the natural composite unique key
`[scope, scopeId, category, unit, effectiveFrom]`, matching the established idempotent-upsert
convention exactly.

**This report does not invent real-world cost figures.** `CostAssumption` values are a genuine
product/finance decision (per-diem food costs, typical accommodation fallback ranges, local
transport allowances for Vietnam/Japan), not something this audit is positioned to fabricate
responsibly — doing so would itself violate the brief's own repeated instruction never to invent
numeric costs. The seed file will ship with a small number of clearly-labeled illustrative
`GLOBAL`-scope rows in `DRAFT` status (not `ACTIVE`) sufficient to exercise the precedence engine
and pass deterministic unit/e2e tests, plus a note in the seed file itself that production `ACTIVE`
promotion (and any country/destination-specific rows for Vietnam/Japan) requires an explicit
product/finance sign-off before go-live. This mirrors G02's own precedent of shipping zero real
production provider licenses by design.

### 3.7 Audit / transaction strategy

Every Trip mutation (`create`, `update`, `archive`, destination/day/item/transport-leg
replace-or-reorder, `CostAssumption` admin mutation, estimate generation) wraps its Prisma write(s)
and `audit.log(entry, tx)` in one `$transaction` — see section 1.8/2.1 for why this is stricter
than, not a copy of, G05's mixed precedent. `EntityKind` gains `TRIP` and
`TRIP_COST_ASSUMPTION` additively (alongside the existing 27 values — never renumbered).
`Trip.version` increments by 1 inside the same transaction on every mutating write that changes
cost-relevant state (matching the `journey.editorialStatus` "set status + archivedAt + version in
one update()" shape).

### 3.8 API surface

All under `/v1/trips`, authenticated, no `@Public()` anywhere, JWT guard applies globally already
(`bootstrapTestApp`'s `JwtAuthGuard`/`RolesGuard` wiring confirms this is the existing default —
routes must opt **out** via `@Public()`, not opt in via a guard, so Trip routes need zero extra
annotation beyond normal auth).

```
POST   /v1/trips                          create
GET    /v1/trips                          list (owner-scoped, ListTripsQueryDto: page/pageSize/status; excludes archived by default)
GET    /v1/trips/:id                      detail (bounded: destinations, days+items, transport legs, latest estimate summary only; owner can still fetch an archived trip by id)
PATCH  /v1/trips/:id                      update (expectedVersion required -> 409 on mismatch; rejected with TRIP_ARCHIVED if archivedAt is set)
POST   /v1/trips/:id/archive              archive (sets archivedAt, owner-only, audited - see corrected note below)
PUT    /v1/trips/:id/destinations         replace-all (transactional, reorderable; rejected with TRIP_ARCHIVED once archived)
PUT    /v1/trips/:id/days/:dayId/items    replace-all-for-day (transactional, two-phase reorder; rejected with TRIP_ARCHIVED once archived)
PATCH  /v1/trips/:id/days/:dayId/items/reorder   reorder only (rejected with TRIP_ARCHIVED once archived)
PUT    /v1/trips/:id/transport-legs       replace-all (transactional, reorderable; rejected with TRIP_ARCHIVED once archived)
POST   /v1/trips/:id/estimates            calculate (idempotent on inputHash; @Throttle'd; rejected with TRIP_ARCHIVED once archived)
GET    /v1/trips/:id/estimates/latest     latest generation, all 3 scenarios (still readable once archived)
GET    /v1/trips/:id/estimates            bounded history list (still readable once archived)

ADMIN (separate module, provider-licenses-tier RBAC):
POST   /v1/admin/cost-assumptions
PATCH  /v1/admin/cost-assumptions/:id
GET    /v1/admin/cost-assumptions
```

**Corrected note on archive** (this section originally proposed hard-delete-only; that decision was
overridden before migration generation and is superseded by this note - the `Trip.archivedAt`
field shown in section 3.1 was already part of the design at that point but the API-surface/
lifecycle text below it had not been updated to match, an internal inconsistency in the original
draft that this correction resolves): brief section 10's ban on `BOOKED/TRAVELING/COMPLETED` is
about the **planning** lifecycle (`TripStatus`) and is unaffected - `archivedAt` is a second,
independent axis, exactly like `Journey`/`Story` already keep `editorialStatus` and `archivedAt`
separate in this schema. Archiving is required now (not deferred to G07) because G07 Collaboration,
G08 Location, and G09 Expense will all reference `Trip` by id and need a Trip row that can stop
being "active" without disappearing out from under them.

Behavior:
- `POST /v1/trips/:id/archive` sets `archivedAt = now()` (owner-only via the same
  `getOwnedOrThrow` guard as every other Trip route), increments `version`, and is audited
  (`trip.archived`) inside the same `$transaction`, matching section 3.7's universal
  audit-in-transaction rule.
- `GET /v1/trips` (the list endpoint) excludes archived trips by default
  (`where: { archivedAt: null }`) — an archived trip is not an active planning trip. No
  `includeArchived` filter is added in v1 (not required by the brief; trivial to add later as an
  additive optional query param).
- Every itinerary/transport/estimate-mutation route (update, destinations/days/items/transport-leg
  replace-or-reorder, estimate generation) checks `trip.archivedAt` in the same `getOwnedOrThrow`-
  style guard and rejects with `409 TRIP_ARCHIVED` if set — an archived trip is read-only.
  `GET /v1/trips/:id` and the estimate-read routes remain available on an archived trip (viewing
  history is exactly the use case archiving exists for).
- Archiving never touches `TripDestination`/`TripDay`/`TripItem`/`TripTransportLeg`/estimate rows —
  they remain fully intact, satisfying "Trip children remain intact for future restore/history
  compatibility." No restore/unarchive endpoint is built in v1 (not required by the brief and not
  needed by G07-G09's reference-by-id use case) — restoring is a one-line `archivedAt: null` write
  whenever a future phase actually needs it, not a redesign.
- `DELETE /v1/trips/:id` is **not implemented in v1** (removed from the route list above) now that
  archive covers the "I'm done with this" case — a hard-purge endpoint was never required by the
  brief ("no public hard-purge endpoint is required in G06") and archiving is the only lifecycle
  exit needed for now. If a genuine hard-delete is wanted later, it would cascade only
  `TripDestination`/`TripDay`/`TripItem`/`TripTransportLeg`/estimate rows (all `onDelete: Cascade`
  from `Trip`) and never touch canonical entities, exactly as originally analyzed — that analysis
  is preserved as the basis for a future hard-delete if one is ever added, it simply isn't wired to
  a route in G06.

Every list/create/update DTO uses the combined-DTO pattern (section 1.10) and slug-based selection
for any canonical reference (`destinationSlug`, `accommodationSlug`, etc.) resolved via each
existing module's `resolvePublic*Id` helper — no new resolution mechanism invented.

---

## 4. WHAT IS EXPLICITLY NOT NEEDED (vs. the original brief's suggested models)

- **`TripOrigin` as a separate model** — four optional fields on `Trip` are sufficient for a
  single per-trip value; a child table would only be justified for a collection.
- **`TripBudgetTarget` as a separate model** — same reasoning; two optional fields on `Trip`.
- **`CostAssumptionSet` as a grouping/versioning wrapper around `CostAssumption`** — each
  `CostAssumption` row is already independently scoped, versioned (`version: Int`), and
  temporally bounded (`effectiveFrom`/`effectiveTo`); a wrapper table would add a join with no new
  capability the precedence query doesn't already get from `(scope, scopeId, category, unit,
  status, effectiveFrom)`.
- **A `Currency` model or an ISO-4217 validation library** — no such infrastructure exists
  anywhere in the codebase today (section 1.4); introducing one for G06 alone would create two
  competing currency-representation conventions in the same codebase. G06 reuses the existing bare
  `String` + regex convention, accepting the same known gap (no real ISO-4217 membership check)
  that already exists on every other currency field.
- **Any FX/exchange-rate model** — brief section 55 explicitly forbids inventing live FX; no
  seeded/admin-supplied FX snapshot table is introduced either, because G06's own multi-currency
  policy (below) avoids ever needing to convert between currencies at all in v1.
- **`TripMember`, `TripInvitation`, any collaboration model** — explicitly deferred to G07.
- **Routing/distance provider integration or a stored `distanceMeters` on `TripTransportLeg`** —
  no routing provider capability is activated anywhere in this codebase; brief section 24
  explicitly forbids inventing road distance or mislabeling a straight-line approximation as
  driving distance, so the field is simply omitted rather than added-and-left-null.
- **A BullMQ queue for cost calculation** — confirmed synchronous is correct; no other
  request-scoped computation in the codebase uses a queue, and brief section 113 agrees.
- **A generic `entityType + entityId` polymorphic FK on `TripItem`** — deliberately rejected in
  favor of typed nullable FKs (section 1.11/2.2); this is the one place G06 diverges from an
  existing repo-wide pattern (`Comment`/`Bookmark`), and it's a deliberate, brief-mandated
  divergence, not an oversight.
- **A fourth `TripStatus` value (e.g. `ARCHIVED`) instead of `Trip.archivedAt`** — archiving is an
  independent axis from the DRAFT/PLANNING/READY planning lifecycle (section 3.8's corrected
  design), exactly like `Journey`/`Story` already keep `editorialStatus` and `archivedAt` separate;
  folding it into `TripStatus` would conflate "what stage of planning is this trip at" with
  "is this trip still active," which are genuinely different questions G07-G09 need answered
  independently.
- **A restore/unarchive endpoint in v1** — not required by the brief and not needed by any G07-G09
  reference-by-id use case; Trip children are kept fully intact specifically so this remains a
  trivial one-column additive change (`archivedAt: null`) whenever a future phase actually needs it.
- **`TripDay` capacity/feasibility AI judgment or opening-hours-based rejection** — brief sections
  74-77 explicitly forbid this; only deterministic overlapping-explicit-time-range warnings are in
  scope, and even those are optional-enough to defer to a follow-up if time-boxing requires it
  (the core cost engine does not depend on them).

### 4.1 Multi-currency policy (resolves brief section 54's A/B choice)

**Decision: Option B, with a stricter twist.** A `TripCostEstimateItem` is stored in its own
evidence currency (never silently converted). It counts toward the estimate's `totalAmount` only
if its currency equals the estimate's `currency` (which equals `Trip.primaryCurrency`); if not, its
`amount`/`currency` are still recorded on the item for transparency, but the item is treated as
`provenance = UNKNOWN` for total-summation purposes and increments `unknownCount` — the same
UNKNOWN-not-zero rule from section 3.5 applies. This never adds mismatched currencies together
(brief section 54's hard rule) and never fabricates a 1:1 or invented FX rate (section 55), at the
cost of estimates being marked `PARTIAL` for genuinely cross-currency trips until a real FX
capability exists in a later phase. This is called out as a known v1 limitation, not hidden.

---

## 5. MIGRATION PLAN

One new, purely additive migration:
`prisma/migrations/<generated-timestamp>_g06_trip_planner_cost_engine/migration.sql`

Contents (all `CREATE TABLE`/`CREATE TYPE`/`ALTER TYPE ... ADD VALUE`, zero `DROP`/`ALTER COLUMN
TYPE`/`ALTER COLUMN ... DROP NOT NULL` on any pre-existing table):

- New enums: `TripStatus`, `TripItemType`, `TripTransportMode`, `TripCostProvenance`,
  `CostCategory`, `CostUnit`, `CostAssumptionScope`, `CostAssumptionStatus`, `CostScenario`,
  `EstimateCompleteness`, `EstimateConfidence`.
- New tables: `Trip`, `TripDestination`, `TripDay`, `TripItem`, `TripTransportLeg`,
  `CostAssumption`, `TripCostEstimateGeneration`, `TripCostEstimate`, `TripCostEstimateItem`.
- `ALTER TYPE "EntityKind" ADD VALUE 'TRIP'` and `ADD VALUE 'TRIP_COST_ASSUMPTION'` — additive,
  same mechanism G01/G02/G05 each already used for their own `EntityKind` extensions.
- No FK from any new table to `AccommodationOffer`/`ActivityOffer` (evidence is a plain id
  pointer, per section 3.5.1 — deliberately not a relation, so a future G05 offer retention-policy
  deletion never cascades into or is blocked by G06 data).

**Confirmed: this migration does not touch, in any way, the two existing G05 migration
directories (`20260910164143_g05_stay_food_activities/`, `20260910164912_g05_entity_kind_values/`)
or any migration before them** — verified present and unmodified at commit `54e6f14` (17 migration
directories total, `20260903000000_init` through `20260910164912_g05_entity_kind_values`, plus
`migration_lock.toml`). G06's migration is purely additive on top of that unchanged chain.

**Destructive changes required: NONE.**

### 5a. Migration Path A/B proof (live-verified)

Matching the exact rigor G01-G05 each recorded:

- **Path A (fresh DB)**: all 18 migrations (17 pre-existing + G06) applied cleanly to a brand-new
  Postgres database with `prisma migrate deploy`, followed by a clean full seed run (`pnpm run
  db:seed`) - proven earlier in this phase's work.
- **Path B (real pre-existing seeded DB + G06 migration on top)**: a separate temporary database
  (`dauviet_pathb`, dropped after the proof) was migrated through only the 17 pre-G06 migrations
  (the G06 migration directory was moved out of `prisma/migrations/` for this step only, then moved
  back immediately after - confirmed via `git status` to be unmodified, still untracked, throughout),
  then seeded with the real golden dataset (V1 through G05 - the seed run failed, as expected, at
  its G06-specific step, since `CostAssumption` did not exist yet - `P2021: The table
  public.CostAssumption does not exist`). Before applying G06, 19 representative table row counts
  were captured (`User`, `Country`, `Region`, `City`, `Destination`, `Place`, `Person`,
  `HistoricalEvent`, `HistoricalFact`, `Story`, `Journey`, `Accommodation`, `Restaurant`,
  `Attraction`, `Activity`, `ProviderAccommodationReference`, `AccommodationOffer`,
  `ExternalProvider`, `AuditLog`), plus MD5 content hashes of `Country`, `Destination`,
  `Accommodation`, `User`, and `HistoricalFact` (concatenated id + identifying columns). The G06
  migration was then applied (`prisma migrate deploy`, one migration applied cleanly). **All 19
  counts and all 5 content hashes were byte-identical before and after** - no pre-existing V1-G05
  row was touched, added, or removed. Re-running the seed afterward completed the previously-failing
  G06 step successfully (`G06 Cost Assumptions: 4 DRAFT-only GLOBAL fixture rows`), confirming the
  new tables are correctly usable immediately after the upgrade. The temporary database was dropped
  and the real dev database (`dauviet`, on its remapped port - see the `.env`/`docker-compose.override.yml`
  note in section 7) was never touched by this proof - `.env`'s `DATABASE_URL` was overridden only at
  the shell-session level for these commands, never edited on disk.

---

## 6. EXPECTED FILES TO CHANGE / ADD

**New**:
- `prisma/migrations/<ts>_g06_trip_planner_cost_engine/migration.sql`
- `prisma/golden/cost-assumptions.ts` (+ export wired into `prisma/golden/index.ts`, additive)
- `apps/api/src/common/errors/trip-error-codes.ts`
- `apps/api/src/modules/trips/trips.module.ts`
- `apps/api/src/modules/trips/trips.controller.ts`
- `apps/api/src/modules/trips/trips.service.ts`
- `apps/api/src/modules/trips/dto/trip.dto.ts`
- `apps/api/src/modules/trips/trip-itinerary.service.ts` (destinations/days/items/reorder — split
  out from `trips.service.ts` to keep file size sane, matching how G05 keeps offer logic in the
  same service file but Journey keeps stop logic in the same service file too — a single
  `trips.service.ts` is also acceptable; final split is an implementation-time call, not a
  pre-implementation decision)
- `apps/api/src/modules/trips/trip-cost-engine.service.ts` (pure calculation core, no DB/network —
  brief section 101's purity requirement; unit-testable standalone)
- `apps/api/src/modules/trips/trip-cost-estimates.service.ts` (persistence/orchestration wrapper
  around the pure engine)
- `apps/api/src/modules/cost-assumptions/*` (admin module: controller/service/dto/module)
- `apps/api/test/trip-planner.e2e-spec.ts`
- Unit spec files alongside each new service.

**Modified, additive-only**:
- `prisma/schema.prisma` (new models/enums appended; `EntityKind` gains two values;
  `User` gains a `trips Trip[]` back-relation line)
- `apps/api/src/common/errors/error-codes.spec.ts` (register `TRIP_ERROR_CODES` in `REGISTRIES`)
- `apps/api/src/app.module.ts` (import `TripsModule`, `CostAssumptionsModule`)
- `prisma/golden/index.ts` (export the new seed module)
- `docs/backend/openapi.json` (regenerated via existing `openapi:generate` script — no manual edit)
- `docs/backend/GLOBAL_V2_ROADMAP.md` (G06 row updated to COMPLETE with summary, once phase is
  actually done and live-verified — not part of this pre-implementation step)

**Untouched**: everything under `prisma/migrations/` prior to the new G06 directory; every G01-G05
service/controller/DTO file (G06 only *calls* existing `findBySlug`/`resolvePublic*Id`/
`getExecutionContext` methods, it does not modify their signatures or bodies); `EntityKind`'s
existing 27 values (only appended to, never reordered/renamed).

---

## 6a. E2E EXECUTION CONTRACT (found during live verification, not part of the original design)

Two real, confirmed issues in the e2e test-infrastructure itself, distinct from any G06 application
defect:

1. **Parallel e2e workers racing the same database**: running `pnpm exec jest --config
   ./test/jest-e2e.json` with Jest's default parallel worker pool can intermittently fail *every*
   suite at `beforeAll` (`Cannot read properties of undefined (reading 'close')` and similar) when
   multiple suites boot their own full Nest app instance against the same shared Postgres/Redis
   containers simultaneously right after a fresh container (re)start. Each e2e spec file is
   self-contained (its own `bootstrapTestApp()`, its own fixture cleanup) but none of them are
   isolated from *each other* at the database-connection-pool level. **Contract: e2e suites in this
   repository must be run with `--runInBand`** (sequential, one Nest app instance at a time) rather
   than Jest's default parallel workers, until/unless per-suite database isolation (e.g. a dedicated
   schema or database per worker) is added - a real fix, not scoped to G06, so not attempted here.
2. **A too-thin default hook timeout for `beforeAll(async () => bootstrapTestApp() + ...))`**: Jest's
   default hook timeout is 5000ms. `bootstrapTestApp()` boots the entire Nest DI graph (Postgres +
   Redis/BullMQ connections) and `trips.e2e-spec.ts`'s own `beforeAll` additionally performs two real
   register+login round trips (each hashing/verifying a password with argon2, deliberately
   expensive). This is fine once a suite is "warm," but the *first* suite to run in a sequential
   session right after a fresh container start can legitimately exceed 5000ms - confirmed live: every
   other e2e suite in the same run passed in 5-45s once already warm, only the suite that happened to
   run first failed on the hook timeout, not on any assertion. Fixed by giving that specific
   `beforeAll` an explicit `30_000`ms timeout (`test/trips.e2e-spec.ts`) - not a blind global
   increase, and not applied to the other five e2e files, since only this one had a proven failure.
   The same class of risk technically applies to any e2e file if it happens to draw the "runs first"
   slot in a future cold run; flagged here rather than pre-emptively patched, per "fix only a proven
   defect."
3. **A pre-existing (not G06-caused) open-handle warning**: after a full e2e run's tests all pass,
   the process can take an extra beat to exit, printing `ETIMEDOUT`/`ECONNRESET` from `ioredis`/
   `bullmq`'s `media-processing` queue reconnecting to Redis after the Jest environment has already
   torn down. This is `MediaModule`'s BullMQ queue not being force-closed in `bootstrapTestApp()`'s
   teardown - present before G06, reproducible on every e2e run regardless of which suites are
   included, and does not fail any test (Jest still reports the correct final PASS/FAIL summary
   first) - it only delays process exit. Out of scope for G06 to fix; noted here as a known
   characteristic, not silently patched.

Live-verified after both fixes: `trips.e2e-spec.ts` alone (14/14 passed, 73s) and the full sequential
suite (`--runInBand`) together (7/7 suites, 49/49 tests, 89.9s).

4. **A latent PostgreSQL cascade-ordering conflict, found once the estimate-generation e2e tests
   started creating real `TripCostEstimateGeneration`/`TripCostEstimate`/`TripCostEstimateItem` rows**:
   deleting a `User` who owns a `Trip` with a generated cost estimate fails with `insert or update on
   table "TripCostEstimateItem" violates foreign key constraint "TripCostEstimateItem_estimateId_fkey"`.
   Confirmed via a direct SQL repro (`BEGIN; DELETE FROM "User" WHERE id = '...'; ROLLBACK;` against
   the live dev DB) - not a Prisma quirk, a genuine Postgres behavior. Root cause: `TripCostEstimateItem`
   carries both a `CASCADE` FK (`estimateId -> TripCostEstimate`) and separate `SET NULL` FKs
   (`tripDayId`/`tripItemId`/`transportLegId` -> `TripDay`/`TripItem`/`TripTransportLeg`) that all
   originate, in different numbers of hops, from the same `Trip` being cascade-deleted at once - when
   Postgres's cascade/trigger resolution processes the `SET NULL` update on one of those columns for a
   row whose parent `TripCostEstimate` has already been (or is concurrently being) removed by the other
   cascade path, the row's own re-validated `estimateId` FK now points at nothing.
   - **This is not reachable from any current product route** - G06 ships no Trip/User hard-delete
     endpoint (archive is the only lifecycle exit, per section 3.8's corrected design), so this can only
     fire today from test cleanup that explicitly deletes a `User`/`Trip` row via Prisma directly. Fixed
     at the test level (`test/trips.e2e-spec.ts`'s `afterAll` now explicitly deletes
     `TripCostEstimateItem` → `TripCostEstimate` → `TripCostEstimateGeneration` in that order, in three
     separate statements, before letting the `User` cascade handle the rest) - the migration/schema was
     deliberately left untouched, since this isn't a live defect and the G06 migration is accepted.
   - **Flagged as a real, latent risk for whichever future phase (G07 collaboration, G09 expense
     settlement, or a future account-deletion feature) is the first to actually hard-delete a `Trip` or
     `User` that has generated cost estimates** - that feature's own implementation will need either the
     same explicit multi-statement deletion order, or a schema change (e.g. making
     `TripCostEstimateItem`'s `tripDayId`/`tripItemId`/`transportLegId` FKs `CASCADE` instead of
     `SET NULL`, which would sidestep the conflicting-action-on-one-row scenario entirely, but is a
     genuine schema decision for that phase to make deliberately, not a G06 test-infrastructure patch).

---

## 7. STATUS (updated post-implementation — this section originally listed pre-code-write
open questions; all of them have since been resolved through actual implementation and live
verification, recorded below for an accurate current picture)

### 7.1 Resolved during implementation

1. ~~Confirm 409-for-version-conflict divergence~~ — **accepted and implemented**. `TripsService`
   uses `409 TRIP_VERSION_CONFLICT` throughout; live-verified in `trips.e2e-spec.ts`.
2. ~~Confirm the "no archive/soft-delete in v1" decision~~ — **superseded and implemented**:
   `Trip.archivedAt: DateTime?` is in the schema and migration; archive is owner-only, audited,
   excludes archived trips from the default list, blocks itinerary/transport/estimate mutations
   with `409 TRIP_ARCHIVED`, and never touches Trip children or canonical entities. Live-verified.
3. ~~Confirm the illustrative-DRAFT-only cost-assumption seed strategy~~ — **implemented as
   designed**: `prisma/golden/cost-assumptions.ts` ships 4 DRAFT-only GLOBAL fixture rows with an
   explicit doc comment that real `ACTIVE` figures require product/finance sign-off; nothing in
   this codebase promotes them to `ACTIVE` automatically.
4. The original brief's truncation past ~section 115 was never resolved with a supplied
   continuation. In its absence, this implementation adopted the G01-G05 live-verification bar
   directly (fresh-DB migration path, a real rollback proof, RBAC/audit matrix, and the
   multi-currency/UNKNOWN/idempotency/atomicity proofs already committed to in section 3) rather
   than inventing a different one.

### 7.2 Implemented and live-verified (with evidence)

- **Full CRUD + lifecycle**: Trip create/list/get/update/archive, ownership (404-then-403),
  optimistic concurrency (409), non-destructive archive. `trips.e2e-spec.ts`.
- **Itinerary sub-resources**: TripDestination/TripDay/TripItem replace-all + reorder-only,
  TripTransportLeg replace-all with the in-use protection guard. Same file.
- **Cost engine**: pure precedence resolver, unit multiplier, scenario aggregation, canonical
  input-hash — all DB-free and unit-tested (`cost-engine/*.spec.ts`).
- **Estimate generation orchestrator**: wires the pure engine to real Trip/itinerary/
  CostAssumption data per the section 3.5.2 quantification rules; atomic 3-scenario persistence;
  inputHash idempotency; a **real PostgreSQL rollback proof** (forced mid-transaction failure,
  confirmed zero rows survive, not even the generation row itself). `trips.e2e-spec.ts`.
- **CostAssumption admin module**: ADMIN-only RBAC, range/effective-date validation, the
  GLOBAL-scope duplicate-identity guard, forward-only DRAFT→ACTIVE→RETIRED.
  `cost-assumptions.e2e-spec.ts`.
- **Migration Path A** (fresh DB, all 18 migrations + seed) and **Path B** (17 pre-existing
  migrations + real seeded V1-G05 data, G06 applied on top — 19 table counts and 5 content hashes
  confirmed byte-identical before/after) — section 5a.
- **Full regression, both green**: unit 73/73 suites (968 tests), e2e 8/8 suites (60 tests).
- **OpenAPI contract**: regenerated and drift-checked clean (`openapi-contract.spec.ts`).
- **A genuine e2e test-infrastructure execution contract** (section 6a) and **a genuine, documented
  latent Postgres cascade-ordering risk** for any future hard-delete feature (section 6a item 4) —
  both found via live verification, not anticipated in the original design.

### 7.3 Still genuinely open (not done, not silently assumed)

- **G05 offer-evidence integration** (`AccommodationOffer`/`ActivityOffer` as PROVIDER_EVIDENCE
  tier) is not wired into `TripCostEstimatesService` — `resolveOfferEvidence()` is a documented
  stub returning `undefined`. Every category correctly degrades to `CostAssumption`/`UNKNOWN`
  without it (a completeness gap, not a correctness one), but no provider-license-revocation proof
  exists for G06 specifically because there is nothing provider-backed in G06 yet to revoke.
- **No `GLOBAL_V2_ROADMAP.md` entry or `G06_..._FINAL_REPORT.md`** has been written — per explicit
  standing instruction, G06 is not to be declared COMPLETE, and G07 is not to be started, until
  directed.
- Real `ACTIVE` `CostAssumption` figures for production use remain a product/finance input, not an
  engineering one — nothing in this codebase will promote the DRAFT fixtures on its own.
