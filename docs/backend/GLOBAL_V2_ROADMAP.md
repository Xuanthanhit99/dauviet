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
| **G06.5** | **Knowledge & Place Data Ingestion** | **COMPLETE_WITH_ENVIRONMENT_BLOCKERS** | `IngestionSource`/`IngestionSourcePolicy`/`IngestionJob`/`IngestionRun`/`IngestionRecord`/`IngestionCandidate`/`ExternalEntityIdentity`/`EntityResolution`/`IngestionEvidence`/`IngestionError`/`IngestionCheckpoint` (12 new additive tables, zero relations into canonical geography/knowledge models). Live-verified against real Wikidata/Wikimedia Commons/UNESCO (data.unesco.org DataHub, not the paid XML transport) for the VN/JP pilot scope, including a real Commons media promotion (real download, checksum, S3 upload, MediaAsset). GeoNames/Google Places are contract-complete but disabled by default (no real credential in this environment - fail-closed live-proven); OpenStreetMap/Nominatim is permanently disabled by design (public usage policy prohibits the bulk use this pipeline would need). 105/105 canonical gates PASS or PASS-NOT-APPLICABLE, 0 FAIL, 0 UNVERIFIED. Verdict is `COMPLETE_WITH_ENVIRONMENT_BLOCKERS`, not bare `COMPLETE`, specifically because GeoNames/Google Places live ingestion could not be proven without a real credential this environment doesn't have - see `docs/backend/G06_5_FINAL_REPORT.md`. Not a Backend V2 Freeze claim; does not reopen G00-G06; does not start G07. |
| **G07** | **Trip Collaboration** | **COMPLETE** | `TripMember`/`TripInvitation`/`TripCollaborationEvent` (3 new additive tables, zero relations weakening G06's `Trip.ownerId` as sole ownership authority - owner is never materialized as a member row). Centralized `TripAuthorizationService` (7-capability matrix) replaces G06's bare owner-equality check without changing any call site's control flow. Live-verified: full OWNER/EDITOR/VIEWER/UNRELATED/UNAUTHENTICATED authorization matrix; full invitation lifecycle (accept/decline/revoke/expire/reuse/recipient-mismatch/self-invite/duplicate-pending/already-member/archive-before-accept); a real concurrent-invitation-acceptance race (exactly one of two simultaneous requests for the same token succeeds); a real concurrent-ownership-transfer race (exactly one of two simultaneous transfers succeeds, one-owner invariant holds); a real forced-rollback proof (a mid-transaction unique-constraint failure during ownership transfer leaves zero orphaned state - not even the target member's mid-transaction-deleted row, which Postgres correctly restored); immediate role/removal/transfer effect with no re-login (JWT never carries trip role); archive interaction (no new/pending-acceptable invitations, no planning edits, members/activity preserved). One real authorization gap (`GET .../activity` missing its capability check) was found and fixed during implementation, before any live exposure - see `G07_FINAL_REPORT.md`. Full regression: 81/81 unit suites (1059/1059 tests), 8/8 e2e suites; OpenAPI 296 paths (+9 from G06.5's 287). Verdict COMPLETE, not LOCKED - not a Backend V2 Freeze claim. |
| **G08** | **Trip Location Sharing** | **COMPLETE** | `TripLocationSharing`/`TripMemberLocation` (2 new additive tables, one additive `EntityKind` value, two additive `TripCollaborationEventType` values - zero relations weakening G06/G07's Trip/TripMember model). Explicit, self-consent-only, finite-duration location sharing, fully separate from trip membership (accepting an invitation/joining/role-change/ownership-transfer never starts or extends sharing). Single mutable consent row + single mutable latest-location row per (trip, user) - no GPS history/trail is ever built. Real PostgreSQL concurrency proofs: newer-`capturedAt`-always-wins regardless of arrival order, idempotent duplicate retries, and the update/stop/remove/leave/archive race family all resolve correctly via a shared row-lock serialization point. Immediate effect with no re-login on stop/removal/leave/archive (same JWT proven). Full regression: 83/83 unit suites (1085/1085 tests), 9/9 e2e suites (91/91 tests, +29 from G07's 62); OpenAPI 301 paths (+5 from G07's 296). See `docs/backend/G08_FINAL_REPORT.md`. Verdict COMPLETE, not LOCKED - not a Backend V2 Freeze claim; does not reopen G00-G07; does not start G09. |
| **G09** | **Trip Expense & Settlement** | **COMPLETE** | `TripExpense`/`TripExpenseShare`/`TripSettlement` (3 new additive tables, one additive `EntityKind` value, four additive `TripCollaborationEventType` values - zero relations weakening G06/G07/G08's Trip/TripMember/location model, and no FK to `TripMember` at all - financial history survives membership removal structurally). EQUAL/EXACT/PERCENTAGE splits resolved via a deterministic, centralized `Decimal`-based rounding utility (`sum(shares) === amount` proven in every mode). Balances/settlement suggestions are pure live-computed projections, never a stored column; conservation (`sum(net) == 0` per currency) proven with a real-PostgreSQL matrix. Real PostgreSQL concurrency proofs: edit/edit, edit/delete, member-removal-vs-create, role-downgrade-vs-mutation, archive-vs-mutation, and a genuine forced-rollback (real unique-constraint violation reverting an already-executed expense+share change atomically). One real PostgreSQL deadlock (`40P01`) was found live between a concurrent expense-create and `TripMembersService.remove`, and fixed by reordering G09's own internal row-lock sequence to match G07's - see `G09_FINAL_REPORT.md`'s "Lock-ordering incident". Full regression: 88/88 unit suites (1151/1151 tests), 10/10 e2e suites (126/126 tests, +35 from G08's 91); OpenAPI 306 paths (+5 from G08's 301). See `docs/backend/G09_FINAL_REPORT.md`. Verdict COMPLETE, not LOCKED - not a Backend V2 Freeze claim; does not reopen G00-G08; does not start G10. |
| **G10** | **Affiliate + Monetization** | **COMPLETE_WITH_ENVIRONMENT_BLOCKERS** | `AffiliateSession`/`AffiliateClick`/`AffiliateConversion`/`ProviderBookingReference` (4 new additive tables, one additive `EntityKind` value - zero relations weakening G06/G07/G08/G09's Trip/TripMember/location/expense model; every reference into Trip/Destination/User is `onDelete: SetNull`). DISCOVERY/TRIP -> G05 offer -> G02 policy gate -> `AffiliateSession` -> `AffiliateClick` -> validated redirect; `AffiliateConversion` exists ONLY from provider-supplied/approved evidence - a click or a successful redirect never creates one (live-proven). Reuses G02's `ProviderRegistryService.getExecutionContext` unchanged as the sole fail-closed policy gate (live-proven: revoking a license mid-session fails the very next redirect, no restart). Open-redirect-proof: exact hostname allowlist + `https:`-only + userinfo/CRLF rejection, the server/adapter is the sole authority for the destination (no `url`/`label` field accepted from the client at all). Idempotent conversion ingestion via the same `INSERT ... ON CONFLICT ... WHERE stored.providerOccurredAt <= EXCLUDED.providerOccurredAt` newer-wins pattern G08/G09 established, real-PostgreSQL-proven for concurrent-duplicate delivery, out-of-order evidence, and a genuine forced-rollback (real unique-constraint violation leaves zero partial commercial state). Commercial reporting/evidence-ingestion is `ADMIN`-only; trip role (including OWNER) grants no commercial access - only `VIEW_TRIP` gates whether a click may reference a trip at all. No wallet, no payment, no FX, no guaranteed-commission field. Verdict is `COMPLETE_WITH_ENVIRONMENT_BLOCKERS`, not bare `COMPLETE`, because no real Booking.com Demand API / Agoda Partner API / Viator Partner API credential exists in this environment - only the internal `FixtureAffiliateAdapter` is registered; a real adapter is additive, not a rewrite, once real provider credentials/agreements exist - see `docs/backend/G10_FINAL_REPORT.md`. Full regression: 93/93 unit suites (1197/1197 tests), 11/11 e2e suites (157/157 tests, +31 from G09's 126); OpenAPI 311 paths (+5 from G09's 306). Not a Backend V2 Freeze claim; does not reopen G00-G09; does not start G11. |
| **G11** | **Global Search & Map** | **COMPLETE** | A rebuildable PostgreSQL projection (`SearchDocument`/`SearchTerm`/`SearchProjectionQueue`/`SearchProjectionRun`, 4 new additive tables, 3 additive enums, zero change to any canonical model or accepted migration) behind `GET /v1/search` and `/search/suggestions`, kept fresh by AFTER-row triggers -> queue -> worker (measured publish/update/unpublish freshness 0.3-1.4 s at a 500 ms interval; contract <= 60 s). PostgreSQL only - no external search service (FTS + `pg_trgm` + PostGIS; benchmark: search p95 <= 267 ms and map p95 <= 137 ms on 78k documents / 82k entities). Public corpus is an explicit allowlist of 15 kinds (Country/Region/City/Destination/Place/Person/Event/Era/Dynasty/Territory/Theme/Story/Journey/Source/CommunityStory) with `trustClass` (CANONICAL/EDITORIAL/SOURCE_RECORD/COMMUNITY); Trip/G08 location/G09 expense/G10 affiliate/G06.5 ingestion/G05 provider data have no projection kind (live-proven with guessed ids and known private rows). Deterministic VI/EN normalization (`Hội An`=`hoi an`, `đ`=`d`, NFC=NFD), six relevance tiers with a stable total order and tamper-proof keyset cursors, alias/translation kept distinct, no fabricated translation. `/map/features` stays live over canonical geometry, backward compatible, adds current-geography layers, fractional zoom, hard density caps, generalized territories and a strict BCE/CE period filter (unknown dates never match). Defects found by measuring and fixed: a trigram-fuzzy branch that dominated latency, and Prisma generic plans mis-planning wide bboxes (map p95 646 -> 122 ms). Path A + Path B proven. Full regression: 98/98 unit suites (1352/1352 tests), 12/12 e2e suites (271/271 tests, +114 new); OpenAPI 314 paths (+3 from G10's 311). See `docs/backend/G11_FINAL_REPORT.md`. Verdict COMPLETE, not LOCKED - not a Backend V2 Freeze claim; does not reopen G00-G10; does not start G12. |
| **G12** | **Final Contract + Live QA + Freeze Certification** | **COMPLETE_WITH_ENVIRONMENT_BLOCKERS** | No product feature. Pre-freeze remediation: seeded chronology backfill (from each row's own cited dates, UNKNOWN left unknown), run-scoped Redis test isolation (no FLUSHALL; external sentinel proof), production-safe seed profile, missing `EntityKind.FACT` enum value, 8 DB CHECK constraints, negative-share rejection, production CORS/secret validation, backup/restore-safe `immutable_unaccent`, a real transfer-vs-removal deadlock fixed by lock order, redirect re-gating, health/shutdown/error-contract hardening. 4 additive G12 migrations (28 total, 24 accepted byte-identical). Path A (fresh, production profile, smoke 56/56), Path B (accepted G11 → G12, every delta classified, none unexpected), Paths C/D 16/16, graceful shutdown 6/6, backup/restore proven locally. Unit 105/105 suites (1516 tests), e2e 13/13 (320 tests); OpenAPI 314 paths / 363 operations. External blockers unchanged (GeoNames, Google Places, Booking.com, Agoda, Viator). See `docs/backend/G12_FINAL_REPORT.md`. |
| - | **BACKEND V2 FREEZE** | **Recommended: FREEZE_WITH_EXTERNAL_INTEGRATION_BLOCKERS — awaiting external review** | G12 recommends only; it does not mark Backend V2 Production LOCKED. See `docs/backend/BACKEND_V2_FREEZE_CANDIDATE.md`. |

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
  (G07, since complete), location sharing (G08, since complete), expense settlement (G09, since
  complete), affiliate/monetization (G10), any booking/payment/wallet, any AI-generated numeric
  cost, G11 global search/map redesign.
