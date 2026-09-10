# G05 Pre-Implementation Architecture Report

Audit performed directly against the current repository (`main` @ `2a17620`, working tree also
carrying the uncommitted G04 + post-G04-hardening continuation) before any schema change.

## CURRENT ACCOMMODATION MODELS
None. No `Accommodation`/`Hotel`/`Stay`/`Lodging` model exists anywhere in `prisma/schema.prisma`.

## CURRENT FOOD MODELS
None. No `Cuisine`/`Dish`/`Restaurant`/`Menu`/`Food` model exists.

## CURRENT RESTAURANT MODELS
None (see above).

## CURRENT ACTIVITY/ATTRACTION MODELS
None. `Place` (V1/G03) is the closest existing concept but is explicitly knowledge/trust-domain,
not visitor-discovery-domain (confirmed: no `visitorFacing`/`ticketed`/commercial field exists on
`Place`).

## CURRENT PROVIDER MODELS
Full G02 stack already exists and is directly reusable, unchanged: `ExternalProvider`,
`ProviderCapability`, `ProviderIntegration`, `ProviderIntegrationCapability`, `ProviderLicense`,
`ProviderDataPolicy`, `ProviderAttributionRule`, `ProviderPolicyEvidence`. Critically,
`ProviderCapabilityType` **already** declares `ACCOMMODATION_SEARCH`, `ACCOMMODATION_DETAIL`,
`LIVE_PRICE`, `AVAILABILITY`, `RESTAURANT_SEARCH`, `RESTAURANT_DETAIL`, `ACTIVITY_SEARCH`,
`ACTIVITY_DETAIL` - G02 anticipated exactly these G05 needs; **no enum change required**.
`apps/api/src/modules/providers/provider-registry.service.ts`'s `getExecutionContext()` +
`provider-access.util.ts`'s `evaluateProviderAccess()` are a complete, already-tested,
already-exhaustively-e2e-proven (`test/provider-activation.e2e-spec.ts`, every lifecycle-status
branch) fail-closed gate - G05 services call it, they do not reimplement it.
`provider-test-fixture.ts` already exports `TEST_FIXTURE_PROVIDER_CODE =
'TEST_PROVIDER_G02_FIXTURE'` (unmistakably non-production) for exactly this purpose.

## CURRENT MONEY/CURRENCY TYPES
None. No `Decimal`/`Numeric` field and no currency-typed field exists anywhere in the schema today
- G05 is the first domain to need money representation in this codebase. `Decimal` (Prisma's
`@db.Decimal(12, 2)`, native Postgres `numeric`) will be used - never `Float` - and currency as a
validated 3-letter ISO 4217 `String`, following the exact `@Matches(/^[A-Z]{3}$/)` convention
`CreateCountryDto.iso3` already established.

## CURRENT MEDIA MODEL
`MediaAsset` (+ `MediaAssetTranslation`) exists, rights/status/access-policy-gated, already reused
by `Place`/`Person`/`HistoricalEvent`/`Story`/`Journey`/`CommunityStory`/`Destination.heroMediaId`
(G04). G05's canonical entities will reuse it identically via an optional `heroMediaId` - no new
media model.

## CURRENT DESTINATION LINKING
G04 established the exact pattern G05 will mirror: a small, explicit `Destination<Noun>` join
table per composed entity (`DestinationPlace`, `DestinationTheme`, `DestinationStory`,
`DestinationJourney`, `DestinationEvent`), each with `sortOrder`/`isFeatured` and a
`@@unique([destinationId, nounId])` DB constraint - never a single-sided FK on the composed entity,
since (as with Place) one Accommodation/Restaurant/Attraction/Activity may legitimately be relevant
to more than one Destination.

## CURRENT PLACE LINKING
`Place` has no G05-relevant relation today. G05 will NOT modify `Place`. Where an Attraction
corresponds to a real historical `Place` (e.g. a museum that is also a `HistoricalFact`-bearing
site), `Attraction.placeId` will be an optional, nullable, additive FK - a typed mapping, never a
merge, matching section 17/42's explicit instruction.

## CURRENT THEME LINKING
`Theme`/`DestinationTheme` (V1 + G04) exists and is reusable, but G05 does not need a new
Cuisine-as-Theme relation - `Cuisine` is a first-party domain concept in its own right (per section
30), not a `Theme` value, and is not modeled as one.

## CURRENT PUBLICATION MODEL
`PublicationStatus` (`DRAFT`/`PUBLISHED`/...) is the existing V1/G01/G04 lifecycle enum, reused
verbatim by every new G05 canonical model (`Accommodation`, `Restaurant`, `Attraction`, `Activity`,
`Cuisine`, `Dish`). No new lifecycle enum for canonical identities.

## CURRENT AUDIT/RBAC MODEL
`AuditService.log(entry, tx?)` (existing, transaction-client-aware) and `@Roles(Role.EDITOR,
Role.ADMIN)` + `@Public()` decorators (existing) are reused verbatim for every new G05 admin route,
exactly like every G01/G04 controller already does.

## CURRENT PROVIDER CAPABILITIES
See "CURRENT PROVIDER MODELS" above - all 8 relevant `ProviderCapabilityType` values already exist.
No new capability enum value is needed for G05's core search/detail/price/availability operations.

## CURRENT LICENSE/POLICY MODEL
Fully reusable as-is (see above). `docs/backend/PROVIDER_RESEARCH.md` (G02, fetched 2026-09-07 from
official `developers.google.com`/`developers.booking.com`/`developer.agoda.com`/`docs.viator.com`
pages only) already covers exactly the four commercial candidates G05's brief names (Google Places,
Booking.com, Agoda, Viator) plus Amadeus. Given the 3-day gap since that research and no signal of
material policy change, this pass performs one light official-source spot-check (not a full
re-research) to confirm currency, and reuses the existing findings rather than re-deriving them -
see the G05 Final Report section 3 for the spot-check result and rationale. **No real provider will
be activated in G05** - every real candidate above remains `DRAFT`/`NEEDS_PARTNERSHIP`/`BLOCKED`
exactly as G02 left it; only `TEST_PROVIDER_G02_FIXTURE` is exercised end-to-end.

## CURRENT GOLDEN FIXTURES
Vietnam: `Country` `viet-nam`, `Region` `ha-noi`/`da-nang`, `City` `ha-noi`/`hoi-an`, `Destination`
`pho-co-ha-noi` (Hanoi Old Quarter)/`pho-co-hoi-an` (Hoi An Ancient Town), `Place`
`PLACE_THANG_LONG`/`PLACE_VAN_MIEU`. Japan: `Country` `nhat-ban`, `Region` `tokyo`/`tinh-kyoto`,
`City` `tokyo`/`kyoto`, `Destination` `gion`/`arashiyama`, G03 Kyoto/Heian-kyō 794 founding event.
G05's fixtures will hang off these existing rows - no new Country/Region/City/Destination.

---

## PROPOSED G05 MODELS

Stay: `Accommodation`, `AccommodationTranslation`, `DestinationAccommodation` (join),
`ProviderAccommodationReference`, `AccommodationOffer`.

Food: `Cuisine`, `CuisineTranslation`, `Dish`, `DishTranslation`, `DishCuisine` (join),
`DestinationDish` (join), `Restaurant`, `RestaurantTranslation`, `DestinationRestaurant` (join),
`RestaurantCuisine` (join), `RestaurantDish` (join), `ProviderRestaurantReference`,
`RestaurantOperationalSnapshot`.

Activity: `Attraction`, `AttractionTranslation`, `DestinationAttraction` (join), `Activity`,
`ActivityTranslation`, `DestinationActivity` (join), `ProviderActivityReference`, `ActivityOffer`.

New enums: `AccommodationType`, `AvailabilityStatus` (shared by Accommodation/Activity offers),
`ProviderReferenceStatus` (shared by all three Provider*Reference models).

21 new models, 3 new enums. Zero new columns on any existing G00-G04 table. Zero enum value added
to any existing G00-G04 enum (`ProviderCapabilityType` already has everything needed).

## PROPOSED EXISTING MODELS TO EXTEND
None. `MediaAsset` is reused via FK only (no new column on `MediaAsset` itself).
`ProviderCapabilityType`/`ExternalProvider`/etc. are reused via FK only (no new column, no new enum
value).

## PROPOSED PROVIDER CAPABILITIES
None new - `ACCOMMODATION_SEARCH`/`ACCOMMODATION_DETAIL`/`LIVE_PRICE`/`AVAILABILITY`/
`RESTAURANT_SEARCH`/`RESTAURANT_DETAIL`/`ACTIVITY_SEARCH`/`ACTIVITY_DETAIL` already exist on
`ProviderCapabilityType`.

## PROPOSED FIXTURE PROVIDER
Extend (not replace) the existing `TEST_PROVIDER_G02_FIXTURE` pattern with a small, deterministic
in-memory adapter (`apps/api/src/modules/providers/fixtures/stay-food-activity-fixture.adapter.ts`)
implementing the `ProviderAdapter` shape for the 6 relevant capabilities, driven by the same
`ProviderRegistryService.getExecutionContext()` gate every real adapter would have to pass. No
network calls. Deterministic canned responses proving: fresh offer, expired offer, unavailable
offer, one restaurant operational snapshot with opening hours + attribution.

## PROPOSED API SURFACE
`GET/POST/PATCH /v1/accommodations`, `.../:id/translations/:locale`, `.../:id/status`,
`.../:id/destinations` (composition, mirrors G04's `PATCH /destinations/:id/places`),
`GET /v1/accommodations/:slug`, `GET /v1/accommodations/:slug/offers` (requires
checkIn/checkOut/guests/rooms/currency), admin `POST /v1/admin/accommodations/:id/provider-references`
(mapping). Same shape repeated for `cuisines`, `dishes`, `restaurants` (+
`.../:slug/operational-snapshot`), `attractions`, `activities` (+ `.../:slug/offers`). Full
enumeration in the Final Report section 32-33.

## EXPECTED FILES CHANGED
`prisma/schema.prisma` (additive), one new migration, ~10 new NestJS modules under
`apps/api/src/modules/{accommodations,cuisines,dishes,restaurants,attractions,activities}`, one new
error-code file, one new fixture-provider file, `prisma/golden/stay-food-activities.ts` (+ import
wiring in `prisma/seed.ts`), unit + e2e test files, `docs/backend/G05_STAY_FOOD_ACTIVITIES.md`,
updates to `BACKEND_HANDOFF.md`/`GLOBAL_V2_ROADMAP.md`/`AUTHORIZATION_MATRIX.md`/`openapi.json`.

## DESTRUCTIVE CHANGES REQUIRED: NONE

No G00-G04 table is dropped, renamed, or has a column removed/retyped. No G00-G04 migration is
edited. This satisfies section 127 - no STOP condition applies; proceeding to implementation.
