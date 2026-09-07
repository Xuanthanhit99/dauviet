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
| G03 | Global Historical Knowledge Extension | Not started | Historical content for non-Vietnam countries. |
| G04 | Destination Discovery | Not started | Destination editorial experiences. |
| G05 | Stay + Food + Activities | Not started | Provider-backed accommodation/restaurant/activity data. |
| G06 | Trip Planner + Cost Engine | Not started | `Trip`, itinerary, estimated/live cost. |
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
