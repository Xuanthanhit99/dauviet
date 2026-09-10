# Post-G04 API Consistency Hardening

Global Backend V2 Extension, hardening pass - **not** a phase (not G05). Scope: the known
deferred geography public-filter inconsistency flagged in `docs/backend/G04_DESTINATION_DISCOVERY
.md` section 14 and `docs/backend/BACKEND_HANDOFF.md` section 17. G00/G01/G02/G03/G04 remain
locked and unreopened; no Prisma migration was required or created.

## 1. Root Cause

Two independent, real defects were found on the exact same set of endpoints - both already fixed
once on `GET /v1/destinations` during G04, both never caught on their sibling geography routes for
the identical reason: no live QA had ever actually called these filters with a real value before.

**Defect A - whitelist-binding collision.** `RegionsController.list()`, `CitiesController.list()`,
and `CountriesController`'s `:slug/regions`/`:slug/cities`/`:slug/destinations` sub-routes all
bound BOTH a whole-object `@Query() query: OffsetPaginationQuery` (global `ValidationPipe` with
`whitelist: true` + `forbidNonWhitelisted: true`) AND separate `@Query('country')`-style individual
params over the exact same `req.query` object. The whole-object binding's whitelist validation runs
regardless of the individual params declared alongside it, so any filter key not declared on
`OffsetPaginationQuery` failed the whole request with `VALIDATION_ERROR: "property X should not
exist"` - the identical defect class `G04_DESTINATION_DISCOVERY.md` section 11 already documents
for `GET /v1/destinations`.

**Defect B - raw-query-value-as-internal-id.** Even once bound, the raw query string was forwarded
straight through as `countryId`/`regionId`/`parentRegionId`/`cityId` to each service's existing,
unchanged, id-based `list()` method - so `?country=viet-nam` (the real, correct public slug)
silently matched zero rows, indistinguishable from "no results," while only the raw internal cuid
ever worked. The identical defect class G04 already fixed on `GET /v1/destinations`
(`docs/backend/G04_DESTINATION_DISCOVERY.md` section 14).

## 2. Defect Inventory

| Endpoint | Query param | Defect A (whitelist) | Defect B (id-vs-slug) | Confirmed |
|---|---|---|---|---|
| `GET /v1/countries` | (none) | n/a | n/a | not affected |
| `GET /v1/countries/:slug/regions` | `type` | YES | n/a (enum, not id) | YES (A only) |
| `GET /v1/countries/:slug/cities` | `region` | YES | YES | YES |
| `GET /v1/countries/:slug/destinations` | `region`, `city`, `type` | YES | YES (region/city) | YES |
| `GET /v1/regions` | `country`, `parentRegion`, `type` | YES | YES (country/parentRegion) | YES |
| `GET /v1/regions/:slug` | (path only) | n/a | n/a | not affected |
| `GET /v1/cities` | `country`, `region` | YES | YES | YES |
| `GET /v1/cities/:slug` | (path only) | n/a | n/a | not affected |
| `GET /v1/cities/:slug/destinations` | (none) | n/a | n/a | not affected |

Reproduced live before any fix, on the real running app + real Postgres:

```
GET /v1/regions?country=viet-nam
-> 400 VALIDATION_ERROR "property country should not exist"

GET /v1/countries/viet-nam/destinations?region=ha-noi&city=ha-noi&type=HISTORIC_DISTRICT
-> 400 VALIDATION_ERROR "property region should not exist","property city should not exist","property type should not exist"

GET /v1/cities?country=viet-nam&region=ha-noi
-> 400 VALIDATION_ERROR "property country should not exist","property region should not exist"
```

## 3. Public Identifier Contract

- **Country filters** (`?country=` wherever it appears): `canonicalSlug`, `ISO2`, or `ISO3` (all
  three are real, pre-existing, unique G01 `Country` identity columns - not a new key system), or
  the raw internal id as a compatibility fallback.
- **Region filters** (`?region=`/`?parentRegion=`): `canonicalSlug`, or the raw internal id.
  Region has no ISO-code equivalent, so no additional form was invented.
- **City filters** (`?region=` on... no - City is never itself a filter *value* on these routes,
  only a filter *target*; the only City-keyed filter, `?city=` on `/v1/countries/:slug/destinations`
  and `/v1/destinations`, was already fixed by G04 and is unchanged here): `canonicalSlug`, or the
  raw internal id.
- No case-folding was added anywhere. Every other slug/id lookup in this API is exact-match, and
  `iso2`/`iso3` are only ever stored uppercase (`CreateCountryDto`'s `@Matches(/^[A-Z]{2}$/)` /
  `/^[A-Z]{3}$/`) - adding case-insensitivity would have been a new, un-requested normalization
  rule, not a preserved existing one. `?country=vn` (lowercase) does not match; `?country=VN` does.
- No fuzzy/display-name matching ("Hanoi", "Tokyo") was implemented or considered - not part of any
  existing G01 contract.

## 4. Country Fix

New shared resolver `resolvePublicCountryId(prisma, value)` in
`apps/api/src/common/geography/geography-consistency.util.ts` (the existing shared G01 geography
utility file - not a new module): `prisma.country.findFirst({ where: { status: PUBLISHED, OR:
[{canonicalSlug: value}, {iso2: value}, {iso3: value}, {id: value}] } })`. Returns the real id, or
the `GEOGRAPHY_FILTER_UNRESOLVED` sentinel if the value was supplied but did not resolve
(`undefined` means no value was supplied at all - three distinct states, never conflated). Used by
`RegionsService.listPublic()` and `CitiesService.listPublic()` (both new).

## 5. Region Fix

New shared resolver `resolvePublicRegionId(prisma, value)`, same file, same pattern:
`canonicalSlug` or raw id, `status: PUBLISHED` required. Used by `RegionsService.listPublic()`
(for `parentRegion`) and `CitiesService.listPublic()` (for `region`).

## 6. City Fix

No new City-value resolver was needed in this pass - the only City-keyed public filter
(`?city=` on `/v1/destinations` and `/v1/countries/:slug/destinations`) already has its own
resolver inside `DestinationsService.listPublic()`, built and proven during G04. This hardening
pass routes `CountriesService.getDestinations()`'s `city` parameter through that same, already-
tested resolver rather than duplicating it - see section 8.

## 7. Internal Service Compatibility

Every existing id-based internal `list()` method (`RegionsService.list()`, `CitiesService.list()`,
`DestinationsService.list()`) is **byte-for-byte unchanged** by this hardening pass - confirmed by
direct diff review (only a clarifying doc-comment was added above each). New `listPublic()` methods
sit in front of them as the sole public-boundary resolution point, exactly mirroring the pattern
`DestinationsService.listPublic()`/`list()` already established in G04:

```
public controller (combined DTO, no dual @Query() binding)
  -> Service.listPublic(filter: string-based slug/code/id)
       -> resolvePublicCountryId / resolvePublicRegionId (shared util)
       -> throws *_NOT_FOUND if an explicitly-supplied filter didn't resolve
  -> Service.list(filter: already-resolved ids)   <- UNCHANGED, id-based
```

`CountriesService.getCities()`/`getDestinations()` (which already resolve their own `:slug` path
param to a real `country.id` via `getPublishedIdBySlug`) now call `cities.listPublic()`/
`destinations.listPublic()` instead of the id-based `list()`, passing `country: country.id` through
the same resolver's id-fallback branch - one resolution boundary reused everywhere, not two
different calling conventions for the same method, and not a second ad-hoc resolver duplicating
G04's already-tested one.

## 8. Unknown Filter Behavior

An explicitly-supplied filter that fails to resolve throws the existing, established `*_NOT_FOUND`
convention every other slug-keyed public route in this API already uses (`COUNTRY_NOT_FOUND` /
`REGION_NOT_FOUND` / `CITY_NOT_FOUND` - all pre-existing `GEOGRAPHY_ERROR_CODES` entries, no new
code added, per the instruction to reuse existing codes rather than invent duplicates). This never
silently broadens the query (dropping the filter would return the whole unfiltered dataset) and
never silently returns an empty page (which would be indistinguishable from a merely-empty result
and hide a typo'd/stale filter value from the caller) - live-proven for every affected endpoint
(section 14).

## 9. Combined Filter Behavior

Every affected service's `list()` WHERE clause already ANDs every supplied field together (plain
Prisma object literal semantics, unchanged) - so once each filter independently resolves to a real
id, `country + region`, `country + city`, and `region + city` combinations are correct by
construction, with zero additional code. Live-proven: `?country=viet-nam&region=ha-noi` narrows
correctly; a real country from one country paired with a real region from a *different* country
(`?country=viet-nam&region=tinh-kyoto`, Kyoto is Japan's) returns an empty result (both ids resolve
independently and correctly, but no City/Region actually satisfies both `countryId` constraints
simultaneously) - never an error, never a silent single-filter match, never a cross-country leak.

## 10. Publication Safety

Slug/id resolution and publication filtering are kept as two separate concerns, exactly as G04
already established: `resolvePublicCountryId`/`resolvePublicRegionId` themselves require
`status: PUBLISHED` on the Country/Region row being resolved (a DRAFT geography row is not a valid
public filter target), and the downstream `list()` methods' own `status: PUBLISHED` WHERE clause
on the *listed* entity (Region/City/Destination) is completely untouched. Live-proven: every
Destination returned from `/v1/countries/:slug/destinations` is independently reachable via its own
public detail route (proof it's genuinely PUBLISHED, not merely listed).

## 11. Unit Tests

21 new tests across 3 spec files (824 total across the full suite, up from 803):

- `regions.service.spec.ts` (+13): canonicalSlug/ISO2/ISO3 country resolution, parentRegion
  resolution, id-fallback, combined filters, unresolved-country/region 404s, no-filter bare list.
- `cities.service.spec.ts` (+8): canonicalSlug/ISO2 country resolution, region resolution,
  id-fallback, combined filters, cross-scope-safety-by-construction, unresolved-country/region
  404s.
- `countries.service.spec.ts` (+4, new `listPublic`/`list` mocks added to the constructor
  wiring): `getRegions` still delegates to the unchanged `regions.list()`; `getCities`/
  `getDestinations` now delegate to `listPublic()` (not `list()`) with the resolved
  `country.id` plus raw filter strings; a bad `:slug` still 404s before any delegation.

## 12. E2E

New file `apps/api/test/geography-filters.e2e-spec.ts`, 23 tests, real compiled app + real
Postgres, real Golden Dataset (no new fixtures - `viet-nam`/`VN`/`VNM`, `nhat-ban`/`JP`/`JPN`,
region `ha-noi`/`tinh-kyoto`, city `ha-noi`/`kyoto`): whitelist-binding regression for every
affected route; canonicalSlug/ISO2/ISO3/id resolution for Country; canonicalSlug/id resolution for
Region; combined filters; cross-scope safety; unresolved-filter 404s for Country/Region/City; a
PUBLISHED-only re-verification; a direct G04-regression assertion. Existing
`destination-composition.e2e-spec.ts` (4 tests) untouched and still green.

## 13. Live QA

Full 17-item matrix from the task brief run against the real running app + real Postgres this
pass: health; Country by slug/ISO2/ISO3; Region by slug; City by slug (via
`/v1/countries/:slug/destinations?city=`); raw-id fallback; unknown Country/Region/City (each
404s with the correct code); combined Country+Region and Country+City; a genuinely conflicting
Country+Region combination (empty, not an error, not a leak); PUBLISHED-only re-check; G04
destination filters re-verified unaffected; VI/EN unaffected; OpenAPI live-served at `/docs-json`
matches the regenerated file (218 paths); full E2E (33/33); a final restart + health check with a
fresh PID and a fresh TCP-level + content-level database-target proof.

## 14. G04 Regression

`GET /v1/destinations?country=viet-nam&theme=heritage` and `?country=nhat-ban&theme=heritage`
re-verified live, correct. `destination-composition.e2e-spec.ts` (4 tests, including the G04 filter
regression test from that phase) re-run: still green. `destinations.service.ts`/
`destinations.controller.ts` were **not modified** by this hardening pass - only read, for the
`listPublic()` pattern to mirror and for `CountriesService.getDestinations()` to call.

## 15. Files Changed

| File | Why | Effect | Backward compatible |
|---|---|---|---|
| `apps/api/src/common/geography/geography-consistency.util.ts` | new shared resolvers | +`resolvePublicCountryId`, +`resolvePublicRegionId`, +`GEOGRAPHY_FILTER_UNRESOLVED` sentinel | yes - pure additions |
| `apps/api/src/modules/regions/regions.service.ts` | fix defect B | +`listPublic()`, +`PublicRegionListFilter`; `list()` unchanged | yes |
| `apps/api/src/modules/regions/regions.controller.ts` | fix defect A+B | `list()` now binds one `ListRegionsQueryDto`, calls `listPublic()` | yes - same route, same param names |
| `apps/api/src/modules/regions/dto/region.dto.ts` | fix defect A | +`ListRegionsQueryDto` | yes - additive |
| `apps/api/src/modules/cities/cities.service.ts` | fix defect B | +`listPublic()`, +`PublicCityListFilter`; `list()` unchanged | yes |
| `apps/api/src/modules/cities/cities.controller.ts` | fix defect A+B | `list()` now binds one `ListCitiesQueryDto`, calls `listPublic()` | yes |
| `apps/api/src/modules/cities/dto/city.dto.ts` | fix defect A | +`ListCitiesQueryDto` | yes - additive |
| `apps/api/src/modules/countries/countries.service.ts` | fix defect B | `getCities`/`getDestinations` now call `cities.listPublic()`/`destinations.listPublic()` instead of the id-based `list()`; `getRegions` unchanged (no id/slug filter existed there) | yes - same signatures |
| `apps/api/src/modules/countries/countries.controller.ts` | fix defect A | `getRegions`/`getCities`/`getDestinations` now bind one combined DTO each instead of dual `@Query()` | yes - same routes, same param names |
| `apps/api/src/modules/countries/dto/country.dto.ts` | fix defect A | +`ListCountryRegionsQueryDto`, +`ListCountryCitiesQueryDto`, +`ListCountryDestinationsQueryDto` | yes - additive |
| `apps/api/src/modules/{regions,cities,countries}/*.service.spec.ts` | regression coverage | +21 unit tests | n/a |
| `apps/api/test/geography-filters.e2e-spec.ts` | regression coverage | new file, +23 e2e tests | n/a |
| `docs/backend/openapi.json` | regenerated from the real app | corrected `required: true` -> `false` on every affected filter param (a pre-existing documentation inaccuracy - Swagger could not correctly infer optionality from a bare individually-bound `@Query('x')` param without a DTO; now fixed as a byproduct) + new descriptions | n/a (docs) |
| `docs/backend/BACKEND_HANDOFF.md` | close deferred item | replaced the G04 "known deferred" note with a "CLOSED" note | n/a (docs) |
| `docs/backend/POST_G04_API_CONSISTENCY_HARDENING.md` | this document | new | n/a (docs) |

No file outside `countries`/`regions`/`cities`/`destinations`(read-only)/docs was touched.
`prisma/schema.prisma` is byte-for-byte unchanged; no migration was created.

## 16. Documentation

This document, plus `docs/backend/BACKEND_HANDOFF.md` section 17 (updated) and the regenerated
`docs/backend/openapi.json`. `docs/backend/G04_DESTINATION_DISCOVERY.md`'s own completion history
was not rewritten - only referenced.

## 17. Deferred Issues

None remain from this pass's scope. The one issue this pass was scoped to close (the geography
public-controller slug-vs-id inconsistency) is fully fixed and verified. No new issue was found
that falls outside this pass's scope; the two occurrences of defect A that were not part of the
original suspected-issue list (`CountriesController.getRegions`'s `type` param, and the fact that
defect A existed at all on top of defect B) were confirmed live and fixed as part of the same
hardening pass rather than deferred, since fixing defect B alone would have been unreachable dead
code without also fixing defect A on the same routes.

## 18. Known Limitations

- Country's expanded accepted-form set (slug/ISO2/ISO3/id) is deliberately Country-specific, not a
  general pattern applied to Region/City - Region/City have no ISO-code equivalent in this schema,
  so inventing one would have been out of scope.
- No caching was added (none was justified or requested); each resolver performs exactly one query
  per supplied filter, matching the existing `DestinationsService.listPublic()` precedent.
