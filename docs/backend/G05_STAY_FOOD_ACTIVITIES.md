# Dau Viet - Stay + Food + Activities (G05)

Global Phase G05, Global Backend V2 Extension. G00-G04 (Constitution, Global Geography, Provider +
Licensing, Global Historical Knowledge, Destination Discovery) and both hardening passes (post-G03
operational hardening, post-G04 API consistency hardening) are separate, already-locked programs -
this document is the G05 contract; do not read it as reopening or amending any of them. See
`docs/backend/BACKEND_HANDOFF.md` for the full V1 contract, `docs/backend/GLOBAL_GEOGRAPHY.md` for
G01, `docs/backend/PROVIDER_LICENSING.md`/`docs/backend/PROVIDER_RESEARCH.md` for G02, and
`docs/backend/G04_DESTINATION_DISCOVERY.md` for G04.

## 1. What this is

The backend foundation for **STAY**, **FOOD**, and **ACTIVITIES** in the locked product principle
(`DISCOVER -> UNDERSTAND -> PLAN -> BOOK -> TRAVEL TOGETHER -> REMEMBER -> SHARE`). G05 does **not**
turn this platform into an OTA: it represents accommodations/restaurants/attractions/activities as
first-party canonical identities, connects them to external provider identities where useful, and
displays provider offers/operational data when a real, evaluated license permits it - it does not
implement Trip, booking transactions, payments, or affiliate conversion tracking (all deferred, see
section 24 below).

## 2. The three trust zones, preserved

G00's three non-negotiable trust zones are unchanged and never silently merged:

- **VERIFIED KNOWLEDGE** - a substantive historical/origin claim about a Dish, Cuisine, or
  Attraction still requires the existing `HistoricalFact`/`Citation`/`Source` chain. G05 introduces
  no new "trust-lite" claim path.
- **PROVIDER DATA** - operational/commercial data (accommodation offers, restaurant hours/rating,
  activity tickets) is always provider-scoped, time-boxed, and license-gated - never presented as
  permanent canonical truth.
- **COMMUNITY CONTENT** - untouched by this phase; no community rating/review is merged into any
  canonical or provider-scoped rating.

## 3. Core entity boundaries (non-negotiable, per G00)

`AccommodationIdentity` (`Accommodation`) `!= ProviderAccommodationReference != AccommodationOffer`.
`Cuisine != Dish != RestaurantIdentity (Restaurant) != ProviderRestaurantReference !=
RestaurantOperationalSnapshot`. `AttractionIdentity (Attraction) != Place != ActivityIdentity
(Activity) != ProviderActivityReference != ActivityOffer`. `Destination != Accommodation !=
Restaurant != Attraction != Activity`. `ExternalProvider != Source`. Provider data `!=
HistoricalFact`. A provider offer `!= a Booking` (no `Booking` model exists anywhere in this
codebase as of G05).

## 4. Schema additions (purely additive)

21 new models, 3 new enums (`AccommodationType`, `AvailabilityStatus`,
`ProviderReferenceStatus`), 6 new `EntityKind` values (`ACCOMMODATION`, `RESTAURANT`, `CUISINE`,
`DISH`, `ATTRACTION`, `ACTIVITY`, for `AuditLog`). Zero column/enum-value change to any existing
G00-G04 model; every new FK points outward at an existing `Country`/`Region`/`City`/`Destination`/
`ExternalProvider`/`MediaAsset`/`Place` row. See
`docs/backend/G05_PRE_IMPLEMENTATION_REPORT.md` for the full before/after model inventory.

**Stay:** `Accommodation` (+`AccommodationTranslation`), `DestinationAccommodation` (join, real
many-to-many mirroring `DestinationPlace` exactly - one property can be discoverable from more than
one Destination), `ProviderAccommodationReference`, `AccommodationOffer`.

**Food:** `Cuisine` (+`CuisineTranslation`, optional country/region scope - never a rigid
nationality-only hierarchy), `Dish` (+`DishTranslation`), `DishCuisine`/`DestinationDish` (joins),
`Restaurant` (+`RestaurantTranslation`), `DestinationRestaurant`/`RestaurantCuisine`/
`RestaurantDish` (joins), `ProviderRestaurantReference`, `RestaurantOperationalSnapshot`.

**Activity:** `Attraction` (+`AttractionTranslation`, optional nullable `placeId` - a typed mapping
when a historical `Place` is also a visitor attraction, never a merge), `DestinationAttraction`
(join), `Activity` (+`ActivityTranslation`, optional nullable `attractionId` - not every Activity
is tied to one Attraction), `DestinationActivity` (join), `ProviderActivityReference`,
`ActivityOffer`.

## 5. Migration

One migration, `20260910164143_g05_stay_food_activities` (purely additive - every statement is
`CREATE TYPE`/`CREATE TABLE`/`CREATE INDEX`/`ALTER TABLE ... ADD CONSTRAINT`, zero `DROP`), plus a
second small migration `20260910164912_g05_entity_kind_values` (6 `ALTER TYPE ... ADD VALUE`
statements for the new `EntityKind` values). **Known deferred item (not a G05 change):**
`prisma migrate dev`'s auto-diff, both times, also proposed an unrelated `ALTER TYPE "EntityKind"
ADD VALUE 'FACT'` and `DROP INDEX` for 17 pre-existing trigram/PostGIS GIST search indexes - this is
pre-existing drift between `schema.prisma` and migration history that predates G05 entirely
(verified live: the database already lacked `EntityKind.FACT` and already had all 17 indexes
before any G05 work started). Both were manually stripped from both migration files before either
was applied - see each file's own header comment for the full detail. A separate background task
was flagged for a dedicated fix; not part of G05.

## 6. Accommodation

Canonical identity: `id`, `canonicalSlug`, `countryId` (required), `regionId`/`cityId` (optional),
`type: AccommodationType`, `latitude`/`longitude`, `importance`, `status: PublicationStatus`,
`heroMediaId` (reuses the exact `MediaAsset` rights/access-policy gate every other `heroMediaId`
relation already has). No provider-specific pricing/review field lives on this table. Composes with
Destination via `DestinationAccommodation` exactly like `DestinationPlace`.

## 7. Provider Accommodation Reference

One external provider's record of a real-world property - `id`, `providerId`, `accommodationId`
(nullable - can exist unmapped), `externalEntityId` (unique only within that provider's namespace,
`@@unique([providerId, externalEntityId])`), `externalUrl`, `status: ProviderReferenceStatus`,
`firstSeenAt`/`lastSeenAt`/`lastVerifiedAt`. Mapping to a canonical `Accommodation` is always an
explicit admin action (`PATCH /v1/accommodations/provider-references/:id/map`) - never automatic
name/photo/coordinate matching.

## 8. Accommodation Offer

`providerReferenceId`, local calendar `checkInDate`/`checkOutDate` (`@db.Date`, never a UTC
timestamp), `guests`/`rooms`, `currency` (ISO 4217, validated `^[A-Z]{3}$`, same discipline as
`Country.iso3`), `amount`/`taxAmount`/`feeAmount`/`totalAmount` as `Decimal(12,2)` (never `Float`),
`availability: AvailabilityStatus`, `bookingUrl`, `fetchedAt`, `expiresAt`, `refreshAfter`. No
permanent `accommodation.price` column exists anywhere. `GET /v1/accommodations/:slug/offers`
requires `checkIn`/`checkOut`/`guests`/`rooms`/`currency` as mandatory query context (rejects
`checkOut <= checkIn`, `guests|rooms < 1`, non-ISO currency) and never presents an expired offer as
current - live-proven (section 19).

## 9. Cuisine / Dish

`Cuisine`: optional `countryId`/`regionId` scope (nullable - "Vietnamese" is country-scoped, "Kyoto
cuisine" narrower; a cross-country Cuisine is representable by leaving both null). `Dish`: no
geography of its own, links to `Cuisine` via `DishCuisine` and to `Destination` via
`DestinationDish` (many-to-many - a dish may be culturally associated with more than one
Destination). Neither carries a restaurant listing or a live price. No historical/origin claim
("invented in year Y") is asserted in this phase's seed content - editorial summaries are original,
non-substantive descriptive text only, the same discipline G04's Destination tagline/whyVisit copy
already follows.

## 10. Restaurant

Canonical identity mirrors Accommodation's shape (`countryId` required, `regionId`/`cityId`
optional, `heroMediaId`). Links to `Cuisine`/`Dish` via `RestaurantCuisine`/`RestaurantDish` -
editorial/curated relations, never auto-derived from a provider's own category list (which stays
provider operational metadata on `RestaurantOperationalSnapshot` instead).

## 11. Restaurant Operational Data

`ProviderRestaurantReference` (identical shape to the Accommodation one) + `RestaurantOperationalSnapshot`:
`address`/`phone`/`website`/`priceLevel`/`reservationUrl`, `openingHours` (small structured JSON
array of day/open/close entries - never a raw provider payload dump) + `timezone` (never assumed
UTC), `temporaryClosure`/`permanentlyClosed` (provider closure state never deletes the canonical
`Restaurant` row), `providerRating`/`providerRatingCount` (explicitly provider-scoped - never merged
across providers into one fake cross-provider score), `providerPhotoRef` (reference/URL only, never
the binary), `fetchedAt`/`expiresAt`/`refreshAfter`. `GET /v1/restaurants/:slug/operational-snapshot`
re-checks the provider gate at serve time and never presents an expired snapshot as current.

## 12. Attraction / Activity boundary

`Attraction` is the visitor-facing identity (a museum, a heritage district, an observation deck);
`Place` remains the knowledge/trust-domain identity. `Attraction.placeId` is an optional, additive,
nullable typed mapping for when a historical Place is also a visitor attraction - not every `Place`
is automatically an `Attraction`, and no `HistoricalFact`/`Citation` content is exposed through the
`Attraction` public route (it only surfaces `{id, slug}` if the linked Place is itself PUBLISHED).
`Activity` is a canonical visitor EXPERIENCE identity, deliberately optional to map: a
`ProviderActivityReference` can exist with zero canonical `Activity` at all (never "one canonical
Activity per provider tour product" - that would create thousands of near-duplicate rows from
provider catalog noise). `Activity.attractionId` is optional context, not a requirement.

## 13. Provider Activity Reference / Offer

Same shape as the Stay side: `ProviderActivityReference` (+ optional `destinationId` for provider
catalog browsing with no canonical mapping yet) and `ActivityOffer` (local calendar `activityDate`
+ optional local `activityTime` string - never assumes UTC means local attraction time,
`participants`, `currency`/`amount` as Decimal, `durationMinutes`, `ticketType`,
`cancellationSummary`, `bookingUrl`, `availability`, freshness fields). `GET
/v1/activities/:slug/offers` requires `date`/`participants`/`currency` context.

## 14. Provider Registry / Capabilities / License Gating

**Fully reused from G02, unchanged.** `ProviderCapabilityType` already declared
`ACCOMMODATION_SEARCH`/`ACCOMMODATION_DETAIL`/`LIVE_PRICE`/`AVAILABILITY`/`RESTAURANT_SEARCH`/
`RESTAURANT_DETAIL`/`ACTIVITY_SEARCH`/`ACTIVITY_DETAIL` before G05 touched anything - no enum value
was added for this. Every G05 provider-backed write (ingesting a `Provider*Reference`) and every
provider-backed read (offers, operational snapshot) calls
`ProviderRegistryService.getExecutionContext({providerCode, environment, capability, usage})` - the
exact same fail-closed gate G02's own `provider-activation.e2e-spec.ts` already exhaustively proves
(every license lifecycle state, `CONDITIONAL` fails closed, suspension/revocation take effect with
nothing cached). G05 does not reimplement or bypass this gate anywhere.

## 15. Attribution

A provider-backed public response includes structured attribution (`requirement`, `displayText`,
`logoRequired`, `linkUrl`) resolved from `ProviderExecutionContext.attribution` - never hardcoded
provider logos/text in a G05 domain model. `REQUIRED`/`UNKNOWN` attribution with nothing configured
fails the gate closed (`PROVIDER_ATTRIBUTION_REQUIRED`) before any provider-backed write or read
succeeds - live-proven.

## 16. Fixture Provider

`TEST_PROVIDER_G05_FIXTURE` (`prisma/golden/stay-food-activities.ts`) - seeded into the Golden
Dataset specifically because this phase's own brief asks for a demonstrable, seeded fixture-backed
offer/snapshot (distinct from G02's own `TEST_PROVIDER_G02_FIXTURE`, which stays e2e-test-only per
`docs/backend/PROVIDER_LICENSING.md` section 11 and is never seeded into the Golden Dataset).
Unmistakably non-production by naming convention (`TEST_PROVIDER_...`, provider `name` field
explicitly states "internal test only, never a real vendor"). Configured `ACTIVE`/`APPROVED`
end-to-end (provider -> 8 capabilities -> SANDBOX integration -> 8 enabled integration capabilities
-> one dataset-wide `APPROVED` license with `rightsStore: PROHIBITED` -> 8 data policies -> one
required attribution rule) so the seeded Golden Dataset offers/snapshot are live-servable out of the
box for QA/demo purposes, entirely through the real gate - not a bypass. Every real commercial
provider (Google Places, Booking.com, Agoda, Viator, Amadeus) remains exactly as G02 left it -
`DRAFT`/`NEEDS_PARTNERSHIP`/`BLOCKED`, never activated (section 21).

## 17. Provider Failure Isolation

A provider-backed offer/snapshot lookup iterates each mapped `Provider*Reference` independently -
one provider's gate failure (suspended, revoked, capability disabled) is skipped, not surfaced as a
request-level error, so the response is a valid (possibly empty) offer list rather than a 500. The
canonical entity's own detail route is completely unaffected by any provider-side failure - it never
depends on a successful provider gate check. Live-proven (section 19).

## 18. Public API surface

Under `/v1`, existing global error envelope/pagination/locale conventions, existing
`ListXQueryDto`-per-route pattern (one combined DTO, never a dual `@Query()` binding - the exact
class of defect G04/post-G04-hardening already found and fixed once, deliberately not repeated
here):

- `GET/POST /v1/accommodations`, `GET /v1/accommodations/:slug`, `GET
  /v1/accommodations/:slug/offers`, `PATCH /v1/accommodations/:id`, `.../translations/:locale`,
  `.../status`, `.../destinations`; `POST /v1/accommodations/provider-references`, `PATCH
  .../provider-references/:id/map`.
- `GET/POST /v1/cuisines`, `GET /v1/cuisines/:slug`, `PATCH /v1/cuisines/:id/translations/:locale`,
  `.../status`.
- `GET/POST /v1/dishes`, `GET /v1/dishes/:slug`, `PATCH /v1/dishes/:id/translations/:locale`,
  `.../status`, `.../cuisines`, `.../destinations`.
- `GET/POST /v1/restaurants`, `GET /v1/restaurants/:slug`, `GET
  /v1/restaurants/:slug/operational-snapshot`, `PATCH /v1/restaurants/:id/translations/:locale`,
  `.../status`, `.../cuisines`, `.../dishes`, `.../destinations`; `POST
  /v1/restaurants/provider-references`, `PATCH .../provider-references/:id/map`.
- `GET/POST /v1/attractions`, `GET /v1/attractions/:slug`, `PATCH
  /v1/attractions/:id/translations/:locale`, `.../status`, `.../destinations`.
- `GET/POST /v1/activities`, `GET /v1/activities/:slug`, `GET /v1/activities/:slug/offers`, `PATCH
  /v1/activities/:id/translations/:locale`, `.../status`, `.../destinations`; `POST
  /v1/activities/provider-references`, `PATCH .../provider-references/:id/map`.

All mutation routes are `EDITOR`/`ADMIN` (matches the existing G01/G04 tier - discovery/geography
content carries no historical-trust chain the way `HistoricalFact` does).

## 19. Live QA performed

Real Postgres + Redis + real Nest app, this phase: canonical Vietnam/Japan discovery and detail (VI
+ EN); a fresh stay offer served correctly with real Decimal amounts and real attribution; DTO
rejection of an invalid date range, zero occupancy, and a lowercase currency code; a restaurant
operational snapshot with opening hours/timezone/provider-scoped rating; a fresh activity offer;
publication safety (a DRAFT `Accommodation` 404s publicly and never appears in the public list);
**provider suspension live proof** - suspending the seeded fixture provider's `SANDBOX` integration
directly in Postgres immediately empties both the accommodation-offers and restaurant-snapshot
responses (200 with an empty list, not a 500), while the canonical `Accommodation`/`Restaurant`
detail routes remain fully reachable throughout - restoring the integration immediately restores
the offers, with nothing cached in between.

## 20. RBAC / Audit / Transactions

RBAC and `AuditService.log(entry, tx?)` reused verbatim from every G01/G04 controller. Every
`set*` composition mutation (`setDestinations`, `setCuisines`, `setDishes`) follows the exact
"replace style" transactional pattern G04 established: delete the existing relation set, recreate
the supplied one, write the audit row through the same transaction client, all inside one
`prisma.$transaction(...)`. A real PostgreSQL rollback probe
(`test/stay-food-activities.e2e-spec.ts`) proves a forced mid-transaction failure leaves the
pre-existing relation set untouched and zero orphaned "success" audit rows.

## 21. Provider Ingestion Idempotency

`upsertProviderReference` is a Prisma `upsert` keyed on `@@unique([providerId, externalEntityId])`
- calling it twice with the same `providerCode`+`externalEntityId` (even with a changed
`externalUrl`) updates the same row, never creates a duplicate. Live-proven in
`test/stay-food-activities.e2e-spec.ts`.

## 22. Media / Provenance

`heroMediaId` on `Accommodation`/`Restaurant`/`Attraction` reuses the exact `MediaAsset` rights/
access-policy/status gate every other `heroMediaId` relation in this schema already has. No image
was scraped, hotlinked, auto-matched from a public folder, or AI-generated as documentary evidence
in this phase's Golden Dataset - zero fixture row has a `heroMediaId` set (an honest gap, not a
hidden one, same discipline as G04's own Golden Dataset).

## 23. Security

Every G05 endpoint runs through the existing global `ValidationPipe` (`whitelist: true`,
`forbidNonWhitelisted: true`), `JwtAuthGuard`/`RolesGuard`, `ThrottlerGuard`, and CSRF middleware -
none of this phase's controllers opt out of any of it. No raw SQL is used anywhere in G05 - every
query goes through the Prisma client. `ProviderIntegration.credentialReference` is (as in G02) an
env-var/secret-manager key NAME only, never a secret value; no G05 code path logs it, and no G05
audit entry carries provider credentials or raw provider payloads.

## 24. Known deferred items / G06+/G10/G11 boundaries

Explicitly out of scope for G05 and not touched: `Trip`/`TripDay`/`TripItem`/`TripMember` (G06),
shared itinerary/budget/cost engine (G06), location sharing (G08), expense split/settlement (G09),
any booking transaction, card payment, wallet, or in-platform checkout, affiliate click/conversion
tracking or commission-weighted ranking (G10), any redesign of `/v1/search`/`/v1/map/features`
(G11 - none of the new G05 entities are integrated into either). No `Booking`, `Trip`, `TripItem`,
`AffiliateConversion`, or payment-processing table exists anywhere in this codebase as of G05. Also
deferred (pre-existing, not a G05 regression): the `EntityKind.FACT`/trigram-and-GIST-index
migration drift noted in section 5, flagged as a separate background task.

## 25. Provider research (reused from G02, spot-checked, not re-derived)

`docs/backend/PROVIDER_RESEARCH.md` (fetched 2026-09-07 from official
`developers.google.com`/`developers.booking.com`/`developer.agoda.com`/`docs.viator.com` pages
only) already covers every commercial candidate this phase's brief names (Google Places for
place/restaurant search, Booking.com and Agoda for accommodation, Viator for activities), plus
Amadeus for architecture-only validation. Given the ~3-day gap and no signal of material policy
change, this phase performed one live spot-check (Google's Places API policy page, fetched fresh)
rather than a full re-derivation - the quoted caching/exemption/attribution text was confirmed
byte-for-byte unchanged. No real provider is activated by G05; every real candidate remains exactly
as G02 left it (`DRAFT`/`NEEDS_PARTNERSHIP`/`BLOCKED`).
