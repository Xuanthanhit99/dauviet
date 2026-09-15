# Dau Viet - Global Backend V2 Extension Roadmap

Tracks the Global Backend V2 phase program (G00 Product Constitution V2 section 100). Backend V1
(Phase 00-12.1) is `BACKEND_FREEZE_PASS` and is a separate, frozen program - see
`docs/backend/BACKEND_FREEZE_REPORT.md`. This file is updated as each Global phase completes; it
does not replace or amend any V1 document.

| Phase | Name | Status | Notes |
|---|---|---|---|
| G00 | Product Constitution V2 | LOCKED | Product-level decisions only, no code. |
| **G01** | **Global Geography Foundation** | **COMPLETE** | `Country`/`Region`/`City`/`Destination`, VI/EN translations, aliases, admin+public API, Vietnam+Japan seed. See `docs/backend/GLOBAL_GEOGRAPHY.md`. |
| **G02** | **Provider + Licensing Foundation** | **COMPLETE** | `ExternalProvider`, `ProviderLicense` (tri-state rights), capability model, admin-only API. See `docs/backend/PROVIDER_LICENSING.md`. |
| **G03** | **Global Historical Knowledge Extension** | **COMPLETE** | `DateEra` BCE/CE, chronology ordinals, `EventCountry`/`EraCountry`/`PersonPlace`, small Japan historical fixture. See this file's G03 summary below. |
| **G04** | **Destination Discovery** | **COMPLETE** | `DestinationPlace`/`Theme`/`Story`/`Journey`/`Event` composition, `DestinationCollection`, deterministic discovery ranking/related-destinations. See `docs/backend/G04_DESTINATION_DISCOVERY.md`. |
| **G05** | **Stay + Food + Activities** | **COMPLETE** | `Accommodation`/`Cuisine`/`Dish`/`Restaurant`/`Attraction`/`Activity` canonical identities, `Provider*Reference` + `*Offer`/`OperationalSnapshot` provider layer (reuses G02's `ProviderRegistryService` gate unchanged), Vietnam+Japan seed. See `docs/backend/G05_STAY_FOOD_ACTIVITIES.md`. |
| **G06** | **Trip Planner + Cost Engine** | **COMPLETE** | `Trip`/itinerary/`CostAssumption`/deterministic Cost Engine fully implemented and live-verified (Path A+B migration proofs, real generation+audit+CostAssumption rollback proofs, a real-HTTP concurrent-generation proof, 8/8 e2e (62 tests) + 73/73 unit (980 tests) suites green); G05 offer-evidence integration is wired in (`resolveOfferEvidence`, live-proven by a 10-case matrix). 290/290 canonical gates PASS, 0 FAIL, 0 UNVERIFIED, 0 P0, 0 P1. 2 gates (149, 177) are PASS - NOT APPLICABLE: both trace to explicit "MAY" clauses in the original brief (budget-vs-target comparison, time-conflict detection) that were deliberately not implemented - see `docs/backend/G06_FINAL_REPORT.md`'s "Optional capabilities intentionally not implemented in G06". Verdict COMPLETE, not LOCKED - this row is not a Backend V2 Freeze claim. |
| G07 | Trip Collaboration | Not started | Trip members, invitations, shared itinerary editing. |
| G08 | Location Sharing | Not started | Opt-in, trip-scoped, time-limited location sessions. |
| G09 | Expense Split / Settlement | Not started | `TripExpense`, settlement suggestions (bookkeeping only, no wallet). |
| G10 | Affiliate + Monetization | Not started | Affiliate click/conversion tracking. |
| G11 | Global Search + Map | Not started | Integrates G01+ geography into `/v1/search` and `/map/features`. |
| G12 | Backend Contract + Live QA | Not started | Full-program freeze gate. |
| - | **BACKEND V2 FREEZE** | Not reached | Not claimed by G01 or any phase before G12. |

## G01 summary (see `GLOBAL_GEOGRAPHY.md` for the full contract)

- New models: `Country`, `CountryTranslation`, `Region`, `RegionTranslation`, `City`,
  `CityTranslation`, `Destination`, `DestinationTranslation`.
- Additive-only V1 touches: `EntityKind` enum gained `COUNTRY`/`REGION`/`CITY`/`DESTINATION`;
  `AliasesService.assertEntityExists` gained four lookup cases.
- Migration: `prisma/migrations/20260906000000_g01_global_geography/`.
- Seed: `prisma/golden/geography.ts` - 2 countries (Vietnam, Japan), 4 regions, 4 cities, 4
  destinations, 28 aliases (locale-agnostic + `ja`-script).
- Regression: 50 suites / 633 tests (V1 baseline was 44/572), e2e unchanged at 2 suites / 3 tests.
- Live-verified: fresh migration chain, seed idempotency (exact before/after counts), real API
  boot, locale fallback (vi/en), scoped hierarchy routes, unpublished-hidden/published-visible,
  401/403 RBAC enforcement, cross-country relation rejection, audit rows.
- Explicitly out of scope (see `GLOBAL_GEOGRAPHY.md` section 17): providers, licensing, Trip,
  location, expenses, affiliate, AI planner, global search/map integration.

## G02 summary (see `PROVIDER_LICENSING.md` for the full contract)

- New models: `ExternalProvider`, `ProviderCapability`, `ProviderIntegration`,
  `ProviderIntegrationCapability`, `ProviderLicense`, `ProviderDataPolicy`,
  `ProviderAttributionRule`, `ProviderPolicyEvidence`.
- Additive-only V1/G01 touches: `EntityKind` gained `PROVIDER`/`PROVIDER_LICENSE`/
  `PROVIDER_INTEGRATION` (reuses the existing generic `Revision` model for license history rather
  than a new table); `common/errors/error-codes.spec.ts` gained the `GEOGRAPHY`/`PROVIDER`
  registries in its global-uniqueness inventory (closing a pre-existing gap from G01 too).
- Migration: `prisma/migrations/20260907000000_g02_provider_licensing/`.
- Seed: none - G02 adds zero production provider rows by design (no fake approved
  partnerships/licenses); the internal `TEST_FIXTURE_PROVIDER_CODE` exists for tests only.
- Regression: 55 suites / 696 tests (G01 baseline was 50/633), e2e up from 2/3 to 3/6 suites/tests
  (new `provider-activation.e2e-spec.ts`).
- Two real runtime defects found and fixed by this phase's own live QA (capability-enable
  incorrectly coupled to the license gate; the registry's license query pre-filtered to
  `APPROVED`, making `REVOKED`/`EXPIRED`/`NOT_APPROVED` unreachable in production) plus one
  design correction (`CONDITIONAL` rights now fail closed) - see `PROVIDER_LICENSING.md` section
  3a and `BACKEND_HANDOFF.md` section 15 for full root-cause/fix/regression/live-proof detail.
- Live-verified: fresh migration chain, seed idempotency unchanged, real API boot, full mandated
  activation lifecycle (create -> capability -> integration -> enable -> blocked without license
  -> UNKNOWN blocked -> rights ALLOWED -> attribution -> activate succeeds -> execution context
  with no secret leak -> revoke -> immediate specific rejection -> restore -> suspend blocks
  independently), a dedicated matrix proving every license lifecycle status resolves to its own
  specific error code through the real Postgres-backed registry (not just the pure evaluator),
  RBAC (unauthenticated/USER/EDITOR/HISTORIAN_REVIEWER/MODERATOR rejected, ADMIN allowed), and a
  real transaction-rollback probe.
- Explicitly out of scope (see `PROVIDER_LICENSING.md` section 9 and this file's own G02 row):
  real provider API integration/credentials/activation, Trip/geography-provider linking,
  affiliate/monetization tracking, any public provider endpoint.

## G03 summary

- New: `DateEra` enum (BCE/CE), chronology ordinal columns (`*ChronologyStart`/`*ChronologyEnd`)
  across `HistoricalEvent`/`HistoricalFact`/`Person`/`HistoricalEra`/`Dynasty`/`Territory`,
  `Place.currentCountryId`/`currentRegionId`/`currentCityId`, `EventCountry`, `EraCountry`,
  `PersonPlace`.
- Migration: `prisma/migrations/20260908000000_g03_global_historical_knowledge/` - includes a
  live-proven legacy-year validation guard and an in-migration chronology backfill for every
  pre-existing row.
- Seed: `prisma/golden/japan.ts` - 3 eras, 5 events, 2 people, 9 sources (2 genuine `ja`-language
  government sources), 8 published facts.
- Post-G03 operational hardening: closed a real environment-precedence defect (`@prisma/client`'s
  own root-`.env` auto-load could win over `apps/api/.env`) via `apps/api/src/config/load-env.ts`.
- Live-verified: Migration Path A (fresh DB) and Path B (real pre-G03 seeded DB + G03 migration on
  top), direct-SQL chronology verification for representative CE years, BCE/CE live query matrix,
  seed idempotency, RBAC/audit/real-Postgres-rollback, full V1/G01/G02 regression, OpenAPI
  regenerated with zero drift.
- Explicitly out of scope: BCE Cổ Loa dating (no authoritative exact-date source found - left as
  `UNKNOWN_DATE`, unchanged), G11 global search/map BCE support.

## G04 summary (see `docs/backend/G04_DESTINATION_DISCOVERY.md` for the full contract)

- New: `DestinationPlace`, `DestinationTheme`, `DestinationStory`, `DestinationJourney`,
  `DestinationEvent`, `DestinationCollection`, `DestinationCollectionTranslation`,
  `DestinationCollectionMember`; `Destination.heroMediaId`; `DestinationTranslation.tagline`/
  `whyVisit`.
- Migration: `prisma/migrations/20260909000000_g04_destination_discovery/` - purely additive, zero
  destructive changes, live-proven to leave every pre-existing V1/G01/G02/G03 row byte-identical.
- Seed: `prisma/golden/destination-discovery.ts` - composes 2 already-existing G01 Destinations
  (Hanoi Old Quarter, Gion) with already-existing Places/Themes/Stories/Events - no new historical
  claim, no new Destination row.
- A real pre-existing G01 defect was found and fixed during this phase's own live QA: `GET
  /v1/destinations`'s documented filter query params (`country`/`region`/`city`/`type`) were
  silently rejected by `ValidationPipe`'s `forbidNonWhitelisted` (a dual `@Query()` binding
  collision) - fixed with one combined `ListDestinationsQueryDto`, permanent e2e regression added.
- Live-verified: Migration Path A/B (with exact before/after data-preservation proof across every
  V1/G01/G02/G03 table), seed idempotency, deterministic discovery ranking/pagination, VI/EN
  detail composition (themes/places/stories/journeys/historical turning points/related
  destinations), publication/draft exclusion, RBAC, audit, a real PostgreSQL rollback proof, full
  V1/G01/G02/G03 regression, environment-precedence regression, OpenAPI regenerated with zero
  drift.
- Explicitly out of scope (per the G04 brief): any provider/commercial/booking data, personalized
  ranking, community-signal-contaminated ranking, G11 global search/map redesign, G05+ scope.

## G05 summary (see `docs/backend/G05_STAY_FOOD_ACTIVITIES.md` for the full contract)

- New: `Accommodation`(+`Translation`), `DestinationAccommodation`, `ProviderAccommodationReference`,
  `AccommodationOffer`; `Cuisine`(+`Translation`), `Dish`(+`Translation`), `DishCuisine`,
  `DestinationDish`, `Restaurant`(+`Translation`), `DestinationRestaurant`, `RestaurantCuisine`,
  `RestaurantDish`, `ProviderRestaurantReference`, `RestaurantOperationalSnapshot`;
  `Attraction`(+`Translation`), `DestinationAttraction`, `Activity`(+`Translation`),
  `DestinationActivity`, `ProviderActivityReference`, `ActivityOffer`. 3 new enums
  (`AccommodationType`, `AvailabilityStatus`, `ProviderReferenceStatus`); 6 new `EntityKind` values.
- Migration: `prisma/migrations/20260910164143_g05_stay_food_activities/` +
  `20260910164912_g05_entity_kind_values/` - both purely additive, zero destructive changes. Both
  had an unrelated pre-existing drift artifact (`EntityKind.FACT` + 17 trigram/GIST index drops)
  manually stripped before applying - see each migration file's own note; flagged separately, not a
  G05 change.
- Reuses G02's `ProviderCapabilityType` (already declared `ACCOMMODATION_SEARCH`/
  `RESTAURANT_SEARCH`/`ACTIVITY_SEARCH`/etc before G05) and `ProviderRegistryService
  .getExecutionContext()` gate completely unchanged - no G02 model, enum, or service logic modified.
- Seed: `prisma/golden/stay-food-activities.ts` - 1 accommodation/cuisine/2 dishes/restaurant/
  attraction/activity per country (Hanoi Old Quarter, Gion), plus a dedicated, unmistakably
  non-production `TEST_PROVIDER_G05_FIXTURE` (distinct from G02's e2e-only fixture) configured
  `ACTIVE`/`APPROVED` end-to-end so the seeded offers/snapshot are live-servable through the real
  gate for QA/demo. No real commercial provider (Google/Booking/Agoda/Viator/Amadeus) is activated.
- Live-verified: canonical VI/EN discovery+detail for both countries, stay/activity offer freshness
  (an expired offer is never presented as current), restaurant operational snapshot with
  attribution, DTO rejection of invalid dates/occupancy/currency, publication safety, provider
  ingestion idempotency, a real PostgreSQL rollback proof, and a live provider-suspension proof
  (suspending the fixture provider's integration immediately empties offers/snapshot responses with
  zero restart and zero caching, while the canonical entity routes stay fully reachable throughout).
- Explicitly out of scope (per the G05 brief): `Trip`/booking/payment/wallet, affiliate/commission
  ranking, G11 global search/map redesign, G06+ scope.

## G06 summary (see `docs/backend/G06_FINAL_REPORT.md` for the full 290-gate audit — verdict COMPLETE, 290 PASS/0 FAIL/0 UNVERIFIED)

- New: `Trip`(+`archivedAt`/`version`), `TripDestination`, `TripDay`, `TripItem`,
  `TripTransportLeg`, `CostAssumption`, `TripCostEstimateGeneration`, `TripCostEstimate`,
  `TripCostEstimateItem`. 11 new enums (`TripStatus`, `TripItemType`, `TripTransportMode`,
  `TripCostProvenance`, `CostCategory`, `CostUnit`, `CostAssumptionScope`, `CostAssumptionStatus`,
  `CostScenario`, `EstimateCompleteness`, `EstimateConfidence`); 2 new `EntityKind` values (`TRIP`,
  `TRIP_COST_ASSUMPTION`).
- Migration: `prisma/migrations/20260911103710_g06_trip_planner_cost_engine/` - purely additive,
  zero destructive changes. Had the same pre-existing drift artifact G04/G05 each independently
  found (`EntityKind.FACT` + 17 trigram/GIST index drops) manually stripped before applying, same
  as before - flagged separately, not a G06 change.
- Cost Engine is split into a DB-free pure core (precedence resolution, unit multiplication,
  scenario aggregation, canonical input-hash) and a DB-touching orchestrator
  (`TripCostEstimatesService` + `resolveAssumptionCandidates`), per the brief's own purity
  requirement. G05 offer-evidence integration (`AccommodationOffer`/`ActivityOffer` as
  PROVIDER_EVIDENCE) is now wired in via `resolveOfferEvidence`, reusing G05's own
  `ProviderRegistryService.getExecutionContext` gate unchanged (fail-closed per reference, nothing
  cached, live-proven by a 10-case test matrix: fresh offer contributes, expired/suspended/revoked/
  missing-attribution/context-mismatch/currency-mismatch/unavailable all correctly fall back to
  `CostAssumption`/UNKNOWN, a persisted snapshot never changes after a later provider status change).
  Every category still resolves correctly via `CostAssumption`/UNKNOWN when no eligible offer exists.
- Seed: `prisma/golden/cost-assumptions.ts` - 4 DRAFT-only GLOBAL fixture rows (STAY/FOOD/ACTIVITY/
  TRANSPORT); real `ACTIVE` production figures are an explicit, un-invented product/finance input.
- Live-verified: Trip ownership (404-then-403)/optimistic concurrency (409, a deliberate divergence
  from Story/Journey/Contribution's 400)/non-destructive archive; itinerary replace-all + reorder;
  `CostAssumption` admin RBAC (ADMIN-only, stricter than catalogue content) + forward-only status
  machine; atomic 3-scenario estimate generation with a real PostgreSQL rollback proof extended to
  cover the transactional audit row too (zero rows survive a forced mid-transaction failure, not even
  the generation row or the audit entry); a separate real-PostgreSQL `CostAssumption` mutation
  rollback proof; a real-HTTP concurrent-generation proof (two simultaneous identical requests never
  produce more than one generation row); `inputHash` idempotency; Migration Path A (fresh DB) and
  Path B (17 pre-existing migrations + real seeded V1-G05 data, G06 applied on top - 19 table row
  counts and 5 content hashes byte-identical before/after, not re-run this delta pass since no
  schema/migration/seed change occurred); full regression both green (73/73 unit suites, 980 tests;
  8/8 e2e suites, 62 tests). A real, reproducible Postgres cascade-ordering conflict was found for a
  hypothetical future Trip/User hard-delete (not reachable from any current route - archive is the
  only lifecycle exit) and documented as a known latent risk for whichever phase eventually builds
  one.
- **COMPLETE**: the original G06 brief's missing sections 116-168 and the full
  `G06-GATE-188`-through-`290` manifest were subsequently supplied and individually delta-audited
  (see `G06_FINAL_REPORT.md`'s recovered manifest section) - all 290 canonical gates PASS, 0 FAIL, 0
  UNVERIFIED, 0 P0, 0 P1. 2 of the 290 (budget-vs-target comparison, day-level time-conflict
  detection) are PASS - NOT APPLICABLE: both are explicit "MAY"/"if implemented" clauses in the
  original brief, deliberately not built rather than added as unrequested scope just to force a
  number, listed by name (not hidden) in `G06_FINAL_REPORT.md`'s "Optional capabilities intentionally
  not implemented in G06". **COMPLETE here is a phase-level verdict only - it is not a Backend V2
  Freeze claim**, which remains gated on G12 alone.
- Explicitly out of scope (per the G06 brief, sections 0-115): Trip collaboration/`TripMember`
  (G07), location sharing (G08), expense settlement (G09), affiliate/monetization (G10), any
  booking/payment/wallet, any AI-generated numeric cost, G11 global search/map redesign.
