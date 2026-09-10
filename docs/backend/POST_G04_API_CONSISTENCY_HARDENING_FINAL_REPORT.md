# POST-G04 API CONSISTENCY HARDENING — Final Report

Scope: the known-deferred geography public-filter slug-vs-id inconsistency flagged during G04 live
QA. Not G05. G00/G01/G02/G03/G04 remain locked and unreopened. No Prisma migration required or
created. Full technical detail lives in `docs/backend/POST_G04_API_CONSISTENCY_HARDENING.md`; this
report is the gate-by-gate closure record.

## 1. Git / Baseline

- Current branch: `main`
- Current HEAD: `2a17620d1bc87e71d8b39d65939eb5937b7deec9` (also `origin/main`/`origin/HEAD`)
- `git log -8 --oneline --decorate`: `2a17620 (HEAD -> main, origin/main, origin/HEAD) [update] code`, `827000c commit v2`, `64f3388`, `bcce6be`, `f9e281f`, `93d2187`
- Working tree status at task start: 8 modified/untracked files carried over from the prior G04
  continuation (destinations module + G04 docs). No commit/reset/revert/stash/clean/amend/force-push
  was performed at any point in this task.
- Working tree status now: 21 files modified + 2 untracked (this report + the hardening doc are
  additional untracked; `docs/backend/G04_FINAL_REPORT.md` from the prior task remains untracked).
  `git diff --check`: clean (only benign LF->CRLF warnings, no whitespace errors, no conflict
  markers).

## 2. Defect Inventory

See `docs/backend/POST_G04_API_CONSISTENCY_HARDENING.md` section 2 for the full table. Summary:
6 endpoints carried the raw-id defect and/or the whitelist-binding defect
(`GET /v1/regions`, `GET /v1/cities`, `GET /v1/countries/:slug/regions`,
`GET /v1/countries/:slug/cities`, `GET /v1/countries/:slug/destinations`), all confirmed live
before any code change. 3 endpoints were audited and found NOT affected (`GET /v1/countries`,
`GET /v1/regions/:slug`, `GET /v1/cities/:slug`, `GET /v1/cities/:slug/destinations` - no
geography-id filter parameter exists on any of them).

## 3. Root Cause

Two independent defects, both already fixed once on `GET /v1/destinations` during G04, both never
caught on these sibling routes because no live QA had ever called these exact filters with a real
value before:

- **Defect A**: dual `@Query()` binding (`OffsetPaginationQuery` whole-object + individual
  `@Query('x')` params) collided with the global `ValidationPipe`'s `forbidNonWhitelisted: true`,
  producing `VALIDATION_ERROR: "property X should not exist"` for every documented filter.
- **Defect B**: once bound, the raw query string was forwarded straight through as the internal
  `countryId`/`regionId`/`parentRegionId`/`cityId`, so a real public slug silently matched zero
  rows.

## 4. Public Identifier Contract

- Country: `canonicalSlug`, `iso2`, `iso3` (all three pre-existing, unique G01 identity columns),
  or the raw internal id (compatibility fallback). No case-folding.
- Region: `canonicalSlug`, or the raw internal id. No ISO-code equivalent exists for Region.
- City: unchanged from G04 - `canonicalSlug` or the raw internal id, resolved inside
  `DestinationsService.listPublic()`, reused rather than duplicated.
- No fuzzy/display-name matching anywhere.

## 5. Country Fix

New shared `resolvePublicCountryId(prisma, value)` in
`apps/api/src/common/geography/geography-consistency.util.ts`:
`prisma.country.findFirst({ where: { status: PUBLISHED, OR: [canonicalSlug, iso2, iso3, id] } })`.
Used by `RegionsService.listPublic()` and `CitiesService.listPublic()`.

## 6. Region Fix

New shared `resolvePublicRegionId(prisma, value)`, same file: `canonicalSlug` or raw id,
`status: PUBLISHED` required. Used by `RegionsService.listPublic()` (`parentRegion`) and
`CitiesService.listPublic()` (`region`).

## 7. City Fix

No new resolver needed - `CountriesService.getDestinations()`'s `city` parameter now routes through
`DestinationsService.listPublic()` (G04's already-built, already-tested resolver), not a
duplicate.

## 8. Internal Service Compatibility

`RegionsService.list()`, `CitiesService.list()`, `DestinationsService.list()` are byte-for-byte
unchanged (diff-confirmed - only a clarifying comment added above each). New `listPublic()` methods
are the sole public-resolution boundary, mirroring G04's own pattern exactly.
`CountriesService.getRegions()` is unchanged (no id/slug filter existed on that route - only
`type`, an enum). `getCities()`/`getDestinations()` now call `listPublic()` instead of `list()`.

## 9. Unknown Filter Behavior

An unresolvable explicit filter throws the existing `COUNTRY_NOT_FOUND`/`REGION_NOT_FOUND`/
`CITY_NOT_FOUND` codes (`GEOGRAPHY_ERROR_CODES`, no new code added) - never a silently broadened
query, never a silently emptied page. Live-verified for every affected endpoint.

## 10. Combined Filter Behavior

Plain Prisma AND semantics, unchanged - once each filter independently resolves, combinations are
correct by construction. Live-verified: `country+region`, `country+city`, and a genuinely
conflicting `country+region` (different countries) returning an empty, non-erroring result.

## 11. Publication Safety

Resolver `status: PUBLISHED` gate (on the *filter* entity) is separate from each `list()`'s own
`status: PUBLISHED` gate (on the *listed* entity) - both independently verified live; every
Destination returned from a filtered list is independently reachable via its own public detail
route.

## 12. Unit Tests

21 new tests: `regions.service.spec.ts` (+13), `cities.service.spec.ts` (+8),
`countries.service.spec.ts` (+4, plus updated constructor mocks for `regions`/`cities`/
`destinations`). All pass (see section 26, gate 31).

## 13. E2E

New `apps/api/test/geography-filters.e2e-spec.ts`, 23 tests, real compiled app + real Postgres,
real (unmodified) Golden Dataset. All pass; full e2e suite (5 files, 33 tests) passes together.

## 14. Live QA

Full 17-item live QA matrix (section 35 of the task brief) executed against the real running app +
real Postgres this session - see `docs/backend/POST_G04_API_CONSISTENCY_HARDENING.md` section 13
for the complete list and results. All passed.

## 15. G04 Regression

`GET /v1/destinations` country/theme filters re-verified live and via the untouched
`destination-composition.e2e-spec.ts` (4/4 still green). `destinations.service.ts`/
`destinations.controller.ts` were not modified by this pass.

## 16. G01 Regression

`regions.service.spec.ts`, `cities.service.spec.ts`, `countries.service.spec.ts` all pass (98 tests
combined across the three, including the 21 new ones). Every geography model/migration is
untouched - `git diff prisma/schema.prisma` is empty.

## 17. G02 Regression

`providers.service.spec.ts`, `provider-licenses.service.spec.ts`,
`provider-integrations.service.spec.ts` all pass, untouched by this pass.

## 18. G03 Regression

Historical-date/chronology/golden-dataset suites all pass, untouched by this pass.

## 19. Environment Precedence

`config/load-env.ts` was not modified. Live-verified this session: the real compiled dev boot
(three separate restarts, three separate PIDs across this task) consistently listened on
`apps/api/.env`'s `PORT=3099`, never root `.env`'s `PORT=3000`.

## 20. DB Target Proof

Separate from the port-number/env-precedence proof: (1) `docker ps --filter publish=5432` shows
host port 5432 bound exclusively to `dauviet-postgres-1` (the only other Postgres-image container,
`beaconvie-postgres`, is `Exited`); (2) `netstat -ano` shows the exact current API PID holding a
live `ESTABLISHED` TCP socket to `[::1]:5432`; (3) that same process, queried live, returns real
Golden Dataset content ("Phố cổ Hà Nội") that exists only in the intended `dauviet` database. All
three captured fresh this session, after the final restart.

## 21. OpenAPI

Regenerated from the real, current `AppModule` - 218 path templates (unchanged count - no route
added/removed). `git diff docs/backend/openapi.json`: 63 insertions / 10 deletions, entirely
confined to the parameter definitions of the exact routes touched - new `description` fields, new
`enum` arrays for `type`, and a correction of `required: true` -> `false` on every affected filter
(a pre-existing Swagger documentation inaccuracy that a bare individually-bound `@Query('x')`
param cannot correctly express, now fixed as a byproduct of moving to a proper DTO). Zero
unintended path/schema drift, zero leaked internal field. `openapi-contract.spec.ts` (32 tests):
pass.

## 22. Files Changed

See `docs/backend/POST_G04_API_CONSISTENCY_HARDENING.md` section 15 for the full per-file table
(reason changed / semantic effect / backward compatibility for each of the 15 changed source files
plus 3 documentation files). Summary: `git diff --stat` on this task's own changes (relative to
the state at task start) touches only `common/geography/geography-consistency.util.ts`,
`modules/{regions,cities,countries}/**`, one new e2e file, `docs/backend/openapi.json`, and
`docs/backend/BACKEND_HANDOFF.md`. No file outside those areas was touched.

## 23. Documentation

`docs/backend/POST_G04_API_CONSISTENCY_HARDENING.md` (new, full technical detail),
`docs/backend/BACKEND_HANDOFF.md` section 17 (the G04 "known deferred" note replaced with a
"CLOSED" note describing the fix), this final report. `G04_DESTINATION_DISCOVERY.md`'s own
completion history was not rewritten.

## 24. Deferred Issues

None remain within this pass's scope. This pass's own scope was fully closed. Nothing new was
found that belongs to a later phase.

## 25. P0 / P1

**0 P0, 0 P1.** Both defects found (A and B, on 6 endpoints) are fixed with regression coverage and
re-verified live.

## 26. Acceptance Gates

PG04-API-GATE-01 — PASS — Evidence: static/git. `main` @ `2a17620`, recorded (section 1).

PG04-API-GATE-02 — PASS — Evidence: static/git. No commit/reset/revert/stash/clean/amend/force-push
performed at any point.

PG04-API-GATE-03 — PASS — Evidence: static. `prisma/schema.prisma`, `Country`/`Region`/`City`
identity model unchanged; only controller/service/DTO/test files touched.

PG04-API-GATE-04 — PASS — Evidence: static. `destinations.service.ts`/`destinations.controller.ts`
untouched (only read); `DestinationPlace`/`DestinationTheme`/`DestinationCollection` untouched.

PG04-API-GATE-05 — PASS — Evidence: live. `pnpm exec prisma generate` ran clean with zero schema
diff; `git diff prisma/schema.prisma` empty; no new migration folder created (latest remains G04's).

PG04-API-GATE-06 — PASS — Evidence: static, direct code read of `CountriesController`/
`RegionsController`/`CitiesController` and their services/DTOs (section 2).

PG04-API-GATE-07 — PASS — Evidence: live. Both defects reproduced with real HTTP requests against
the real running app before any fix (section 3, exact request/response pairs recorded).

PG04-API-GATE-08 — PASS — Evidence: live. `?country=viet-nam`/`VN`/`VNM` on `GET /v1/regions` all
return identical, correct results.

PG04-API-GATE-09 — PASS — Evidence: live + unit. Raw internal Country id still resolves
(`?country=<cuid>` on `/v1/regions` matches the slug-based result exactly).

PG04-API-GATE-10 — PASS — Evidence: live. `?country=VN` works identically to `?country=viet-nam`.

PG04-API-GATE-11 — PASS — Evidence: live. `?country=VNM` works identically.

PG04-API-GATE-12 — PASS — Evidence: live. `?region=tinh-kyoto` on `GET /v1/cities` returns exactly
`kyoto`.

PG04-API-GATE-13 — PASS — Evidence: live + unit. Raw internal Region/City id fallback covered by
unit tests and the shared resolver's `OR: [..., {id: value}]` clause.

PG04-API-GATE-14 — PASS — Evidence: live. `?region=ha-noi` on `GET /v1/countries/viet-nam/cities`
returns exactly `ha-noi`.

PG04-API-GATE-15 — PASS — Evidence: unit + code. `resolvePublicRegionId`'s `OR` clause includes
`{id: value}`.

PG04-API-GATE-16 — PASS — Evidence: live. `?country=not-a-real-country` on `/v1/regions` -> 404
`COUNTRY_NOT_FOUND`, empty result set not silently returned as "everything."

PG04-API-GATE-17 — PASS — Evidence: live. `?parentRegion=not-a-real-region` -> 404
`REGION_NOT_FOUND`.

PG04-API-GATE-18 — PASS — Evidence: live. `?city=not-a-real-city` on
`/v1/countries/viet-nam/destinations` -> 404 `CITY_NOT_FOUND`.

PG04-API-GATE-19 — PASS — Evidence: static + live. Reused the exact `NotFoundException({code:
GEOGRAPHY_ERROR_CODES.X_NOT_FOUND, ...})` convention already used by
`CountriesService.getPublishedIdBySlug` and G04's `DestinationsService.listPublic()`.

PG04-API-GATE-20 — PASS — Evidence: static. No `contains`/`ILIKE`/fuzzy-name query anywhere in
either new resolver - exact-match `canonicalSlug`/`iso2`/`iso3`/`id` only.

PG04-API-GATE-21 — PASS — Evidence: live + unit. `canonicalSlug` resolution for Country/Region
both live- and unit-tested throughout.

PG04-API-GATE-22 — PASS — Evidence: static. No localized-translation-slug resolution mechanism
exists anywhere in G01 for Country/Region/City query filters (only `canonicalSlug`) - nothing to
preserve beyond what already existed; not invented here either.

PG04-API-GATE-23 — PASS — Evidence: static + unit. `RegionsService.list()`/`CitiesService.list()`
diff-confirmed byte-for-byte unchanged; unit tests assert `CountriesService.getRegions()` still
calls the id-based `regions.list()` unchanged.

PG04-API-GATE-24 — PASS — Evidence: static. Exactly 2 new pure functions
(`resolvePublicCountryId`/`resolvePublicRegionId`) shared across `RegionsService`/`CitiesService`/
(indirectly) `CountriesService` - no per-service duplicate resolver was written.

PG04-API-GATE-25 — PASS — Evidence: live + e2e. `?country=viet-nam&region=ha-noi` on
`GET /v1/cities` returns exactly `ha-noi`.

PG04-API-GATE-26 — PASS — Evidence: live + e2e. `?country=viet-nam&city=ha-noi` (via
`/v1/countries/:slug/destinations`) returns exactly `pho-co-ha-noi`.

PG04-API-GATE-27 — PASS — Evidence: live + e2e. `?region=ha-noi` combined with the country-scoped
path param on `/v1/countries/:slug/cities` correctly narrows.

PG04-API-GATE-28 — PASS — Evidence: live + unit. `?country=viet-nam&region=tinh-kyoto` (a real
country paired with a real region from a different country) returns an empty result, not an error,
not a silent single-filter match, not a cross-country leak.

PG04-API-GATE-29 — PASS — Evidence: live. Every filtered Destination result independently
re-verified reachable via its own public `PUBLISHED`-gated detail route.

PG04-API-GATE-30 — PASS — Evidence: static + live. No `createdById`/audit/internal field appears in
any Region/City/Country list or filter response (unchanged response-shaping code, only the WHERE
clause resolution changed).

PG04-API-GATE-31 — PASS — Evidence: unit. 21 new tests across 3 spec files, all passing (98 total
across `regions`/`cities`/`countries` specs).

PG04-API-GATE-32 — PASS — Evidence: e2e. New `geography-filters.e2e-spec.ts`, 23 tests, real
Postgres, all passing.

PG04-API-GATE-33 — PASS — Evidence: live, real Postgres. Full 17-item live QA matrix, this session
(section 14).

PG04-API-GATE-34 — PASS — Evidence: live + e2e. G04's `/v1/destinations` country/theme filters
re-verified correct; `destination-composition.e2e-spec.ts` still 4/4 green.

PG04-API-GATE-35 — PASS — Evidence: unit. `regions.service.spec.ts`/`cities.service.spec.ts`/
`countries.service.spec.ts` all pass in the full suite.

PG04-API-GATE-36 — PASS — Evidence: unit. Provider suites pass, untouched by this pass.

PG04-API-GATE-37 — PASS — Evidence: unit. Historical-date/chronology suites pass, untouched.

PG04-API-GATE-38 — PASS — Evidence: `tsc --noEmit` clean, zero errors, this session (run twice,
before and after the whitelist-binding fix).

PG04-API-GATE-39 — PASS — Evidence: `eslint` on every touched file, zero errors/warnings.

PG04-API-GATE-40 — PASS — Evidence: `nest build`, clean, zero errors.

PG04-API-GATE-41 — PASS — Evidence: full Jest, 58 suites / 824 tests / 0 failures.

PG04-API-GATE-42 — PASS — Evidence: full E2E, 5 suites / 33 tests / 0 failures.

PG04-API-GATE-43 — PASS — Evidence: `pnpm exec ts-node ... src/generate-openapi.ts` against the
real, current `AppModule` this session - 218 paths written.

PG04-API-GATE-44 — PASS — Evidence: diff review - every affected param now carries an accurate
`description` naming its real accepted forms and the exact `*_NOT_FOUND` code on failure.

PG04-API-GATE-45 — PASS — Evidence: `git diff docs/backend/openapi.json` confined entirely to the
touched routes' parameter definitions - no unrelated path or schema changed.

PG04-API-GATE-46 — PASS — Evidence: live. Fresh app boot this session still listens on
`apps/api/.env`'s `PORT=3099`, not root `.env`'s `PORT=3000`. `config/load-env.ts` untouched.

PG04-API-GATE-47 — PASS — Evidence: live, TCP + content (section 20) - not port-number-only.

PG04-API-GATE-48 — PASS — Evidence: `git diff --stat` (section 22) - change surface is exactly
countries/regions/cities + one shared util + e2e + OpenAPI + docs, nothing else.

PG04-API-GATE-49 — PASS — Evidence: `docs/backend/BACKEND_HANDOFF.md` section 17 updated -
the G04 "known deferred" note replaced with a "CLOSED" note (section 23/diff).

PG04-API-GATE-50 — PASS — Evidence: this report + `POST_G04_API_CONSISTENCY_HARDENING.md` +
`BACKEND_HANDOFF.md` update collectively document root cause, fix, tests, and regressions.

PG04-API-GATE-51 — PASS — Evidence: section 25. 0 P0 remaining.

PG04-API-GATE-52 — PASS — Evidence: section 25. 0 P1 remaining.

PG04-API-GATE-53 — PASS — Evidence: live + unit + e2e, all 6 originally-affected endpoints
individually re-verified fixed; the 3 audited-and-not-affected endpoints confirmed to genuinely
have no id/slug filter to fix.

PG04-API-GATE-54 — PASS — Evidence: live, this pass's final restart. Fresh `prisma generate` ->
fresh boot (new PID) -> health -> DB-target proof -> full live QA matrix -> full E2E, all captured
after the very last code change, not carried over from an earlier point in the session.

**Gate Tally: 54/54 PASS. 0 FAIL. 0 UNVERIFIED.**

## 27. Final Verdict

# COMPLETE

G05 has not been started. Backend V2 Freeze is not claimed. Nothing has been committed or pushed -
all changes from this pass remain in the working tree alongside the prior G04 continuation's
changes, awaiting explicit instruction.
