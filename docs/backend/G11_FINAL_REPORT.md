# G11 — Global Search & Map: Final Report

## Verdict: **COMPLETE**

Not LOCKED. Not a Backend V2 Freeze claim. Does not reopen G00–G10. Does not start G12.
No environment blocker prevented any G11 requirement from being proven (the already-known G06.5/G10 external credentials are outside G11 and were not needed).

## Baseline

- Branch `main`, HEAD `9931a16 docs: close Country Detail V1 with verified Consumer QA` — unchanged (G07–G11 all remain uncommitted in this working tree).
- Working tree at start: the cumulative G07–G10 diff plus the untracked, concurrently-owned `frontend-pass-10/` (its own `.git`), never touched.
- Full detail: `G11_PRE_IMPLEMENTATION_REPORT.md` (written before any schema/code change).

## Pre-audit

Existing search covered 8 kinds (no Country/Region/City/Destination/Dynasty/Territory/Theme), no FTS, no cursor, no filters, raw `score`; the map served places, territories and events but no current geography, and its `zoom` was integer-only while the web client sends floats. PostgreSQL 16.4, PostGIS 3.4.3, `pg_trgm` 1.6 and `unaccent` 1.1 were already installed; `unaccent` was verified for `đ`, NFD input and the Hoàng Sa / Trường Sa names. No outbox, no application cache (Redis only for BullMQ). Seeded Golden-Dataset events/eras/dynasties carry **no chronology ordinals** (only legacy sort dates) — see Known limitations.

## Schema / projection

Additive migration `20260926000000_g11_global_search_map`: 3 enums (`SearchEntityKind`, `SearchTermKind`, `SearchTrustClass`), 4 tables (`SearchDocument`, `SearchTerm`, `SearchProjectionQueue`, `SearchProjectionRun`), 14 indexes, 3 trigger functions and 33 AFTER-row triggers. No accepted table/column/index/migration changed. `SearchDocument` holds one row per public `(entityKind, entityId)` (titles/summaries per existing locale only, normalized names/text, stored country/region/city ids, chronology ordinals, optional 4326 geometry). `SearchTerm` keeps `CANONICAL_TITLE`, `LOCALIZED_TITLE` and `ALIAS` (with `aliasType`) distinct. Physical projection justified: 15 kinds over ~35 tables with alias/multi-locale matching cannot share one trigram/FTS index or a stable global cursor via live UNION.

## Corpus, exclusions

Public corpus = explicit allowlist (`search-projection.loaders.ts`): COUNTRY, REGION, CITY, DESTINATION, PLACE, PERSON, EVENT, ERA, DYNASTY, TERRITORY, THEME, STORY, JOURNEY, SOURCE, COMMUNITY_STORY, each with the publication rule its public API already uses (Territory text public, geometry only when `geometryStatus = PUBLISHED`). Excluded structurally (no projection kind, no loader reads them): Trip, TripMember, TripInvitation, TripLocationSharing, TripMemberLocation, TripExpense/Share, TripSettlement, AffiliateSession/Click/Conversion, ProviderBookingReference, IngestionCandidate and every `Ingestion*` table, provider entities (Accommodation/Restaurant/Activity/...), unpublished content, moderation-private data. A unit test scans the loader source for forbidden tables.

## Normalization, VI/EN, aliases

One TypeScript `normalizeSearchText` for storage and query: NFD → drop marks → `đ/Đ→d` → lower-case → non-alphanumerics to one space. `Hội An`→`hoi an`, `Đà Nẵng`→`da nang`, `Thăng Long`→`thang long`; NFC and NFD converge; display text is never normalized. VI canonical + EN only; cross-language retrieval only through stored translations/aliases (no LLM/MT); a missing translation is never fabricated (response reports `locale`, `actualLocale`, `fallbackUsed`). Aliases are never invented (only the two accepted seed aliases exist for Paracel/Spratly) and never collapsed into translations; aliases are not unique (two entities sharing a name both return). Hoàng Sa / Hoang Sa / Trường Sa / Truong Sa are retrieved as the accepted canonical Places; no sensitive alias or relationship was added and no sovereignty/jurisdiction is inferred from centroid, bbox, nearest country or rank.

## Ranking, pagination, filters

Six tiers (exact canonical, exact localized, exact alias, prefix, FTS, controlled fuzzy) with text tier always primary; inside a tier: non-community before community → title-hit before body-hit → importance (the existing value) → requested-locale hit → kind order → entity id. `trustClass` labels provenance and is never a numeric boost; no commercial signal exists in the projection (asserted against `information_schema`). Keyset cursor bound to the exact query/filters/locale (tampered, foreign or other-locale cursors → `400`), limit ≤ 50, deterministic order. Filters: kinds, stored country/region/city, strict BCE/CE period (chronology ordinals, unknown dates never match), bbox. Limits: `q` ≤ 200, fuzzy ≥ 3 normalized characters and only as a top-up when fewer than 10 strong candidates exist (similarity ≥ 0.5, transaction-local), FTS skipped under 3 characters. Unknown query params (`includeUnpublished`, `sort`, `orderBy`, `status`) are rejected.

## Publication, trust, provider/community separation

Unpublish deletes the document (no ghost result, proven). Community stories are `COMMUNITY`, ordered after canonical results of the same tier, only `VISIBLE/LIMITED/LOCKED`, titles only. Provider data is not read at all; PROVIDER_DATA semantics unchanged. Ingestion candidates are never public.

## Current vs historical geography, PostGIS, bbox, zoom, temporal map

Map stays live over canonical geometry (MAP FEATURE != SEARCH DOCUMENT), SRID 4326, GeoJSON with real geometry types. Backward compatible (19 pre-existing map assertions pass unmodified; legacy `year` keeps its accepted G03 semantics). New: fractional `zoom` and `locale` (the web client sends both; the old DTO declared neither), opt-in `kinds` layers, current-geography points (`layer = CURRENT_GEOGRAPHY`) kept distinct from `HISTORICAL` territories, per-layer caps 100/250/500 by zoom and a hard 1000 cap, importance floors, countries only at zoom ≤ 7, Territory geometry generalized in the response at low zoom (canonical geometry untouched, proven by before/after `ST_AsText`), a strict BCE/CE period filter over ordinals for TERRITORY/EVENT only (no undated sites, no current geography for a past period). Antimeridian-crossing bbox is explicitly rejected. Events appear only through explicit `EventPlace` links of PUBLISHED places; nothing is geocoded from text; no person/story/journey map layer exists. Backend returns semantics only (`markerSemantic`, `layer`, `trustClass`), never CSS/pixel values.

## Lifecycle, rebuild, concurrency, recovery, cache, freshness

Triggers enqueue changed entities; the in-process worker (2 s, no Redis) recomputes each from canonical truth under a per-entity advisory lock (one transaction: upsert or delete + terms + geometry). The queue entry is deleted only if its claim token is unchanged; a failing refresh leaves canonical data untouched, keeps the entry and records the error. Real PostgreSQL proofs: rebuild ×2 identical (also Path A md5 ×3), wipe-and-rebuild restores byte-identical state, duplicate concurrent rebuild, rebuild vs canonical update (12 racing updates → last wins), publish vs refresh, unpublish vs refresh, 8 entities × 4 concurrent updates drained by 3 concurrent workers, forced projection outage + retry, corrupted row repaired by rebuild, canonical write not blocked by a broken projection. No result cache (measured latency did not justify one; Redis flush changes nothing — proven). Freshness measured 0.3–1.4 s with a 500 ms worker (contract ≤ 60 s).

## Performance and query plans

Full details in `G11_PERFORMANCE_REPORT.md` (78,110 documents from 82,010 synthetic entities built by the real rebuild; 6 interleaved rounds × 60 requests per class on a noisy shared laptop, with a health-endpoint control). Pooled p95: every search class ≤ 267 ms (target 300), suggestions 98 ms (150), every map class ≤ 137 ms (300); zero non-200. Measuring found and fixed two defects: the trigram-fuzzy branch (≈ 140 ms) dominated latency (now a transaction-local 0.5 top-up, exact/accent p95 539 → 66 ms), and Prisma's cached **generic plans mis-planned wide bboxes** (map p95 646 → 122 ms with a transaction-local `plan_cache_mode = force_custom_plan`). Search plans have no sequential scans; only evidence-backed indexes were kept (City and Destination point indexes: 0.36 vs 7.3 ms and 0.6 vs 23 ms; Country/Region indexes removed as unproven). Caveats: shared noisy host, sequential client, synthetic repetitive data; two individual rounds exceeded a target (broad-token page 368 ms, suggestions 156 ms) though pooled p95 passes.

## Security and privacy

SQL: every value bound; tsquery built from sanitized tokens (operators can never reach `to_tsquery`); ORDER BY, table/column names and layer names come from constants/allowlists; injection, tsquery, sort/filter, invalid geometry, oversized bbox/query, pathological fuzzy (`%%%`, 200 × `a`), pagination tampering, unpublished enumeration and private-ID guessing all tested over HTTP (never 500). Privacy (P0): with a real trip owner, active location sharing, an expense, an invitation and affiliate session/click/conversion rows present, public search for their titles/emails/tokens/amounts/ids returns nothing, `types=TRIP*` / `kinds=TRIP_MEMBER_LOCATION` are `400`, a bbox around the member's exact coordinate returns no feature and the response never contains it. No search history is stored; metrics hold no query text. Rate limit: search 60/min/IP (`SEARCH_RATE_LIMIT_MAX`), admin rebuild 2/min; proven with 429s.

## Migration / Path A / Path B / seed

- Migration generated with `prisma migrate diff --from-url <dev DB> --to-schema-datamodel` (no shadow DB; `DATABASE_URL != SHADOW_DATABASE_URL`); the pre-existing drift artifact (`EntityKind.FACT` + 17 `DROP INDEX` for raw trigram/GiST/importance indexes) was stripped as in every phase since G04. No accepted migration changed (the 23 accepted checksums are identical before and after).
- **Path A** (fresh `dauviet_path_a`): all 24 migrations applied, `migrate status` up to date; seed ×2 byte-identical; build; booted the real compiled app — `/v1/health` all `ok`; the worker built the projection itself on first boot (105 documents / 206 terms); `rebuild` ×2 through the real ADMIN endpoint left an identical projection (same md5, 0 duplicates, no private kinds, queue empty); HTTP smoke: Vietnamese, accentless, đ/d, NFD, English, alias, Hoàng Sa/Trường Sa, historical entities, type/period/bbox filters, current-geography and historical map, fractional zoom, antimeridian rejection, and the privacy negatives (`400/404/401`). The DB was dropped afterwards. (Non-ASCII curl arguments are mangled by this Windows shell; the smoke used explicit UTF-8 percent-encoding.)
- **Path B** (dev DB): to re-prove with the FINAL migration file, my own unaccepted G11 objects were reverted first (triggers, functions, 4 tables, 3 enums, indexes, the migration rows — disclosed below), then captured BEFORE, applied only G11, captured AFTER: every count and hash (geography, knowledge, aliases, translations, G07 members, G08 location, G09 financial, G10 commercial) is identical; the only differences are migrations 23→24, 33 new triggers and the new tables.
- Nothing was added to the Golden Dataset; synthetic data lives only in the disposable `dauviet_perf` database (dropped at the end).

## Tests

- **Unit:** 98/98 suites, 1352/1352 tests (G10: 93/1197). New/replaced: normalization (18), cursor/period/bbox utils, loaders eligibility and privacy allowlist, projection service, search service (30, replacing the old mock-based spec — every prior behavioral assertion was ported: validation, exact-over-fuzzy, community ordering, fallback reporting, suggestions), map G11 extensions (23). The 19 pre-existing map assertions pass unmodified (only the mock gained a `$transaction` passthrough).
- **E2E (real PostgreSQL + Redis + PostGIS, `--runInBand`):** 12/12 suites, 271/271 tests (G10: 157). New `search-map.e2e-spec.ts` (114 tests): retrieval/normalization, sensitive names, aliases, corpus kinds and filters, publication lifecycle and exclusions, private-data non-leak (G07/G08/G09/G10/G06.5/G05), map, temporal, determinism/pagination, security, rebuild/concurrency/recovery, freshness with the real worker, regression contracts, rate limiting.
- Regression sub-suites (all green in the full run): affiliate (G10), trip-expense (G09), trip-location (G08 P0), trips (G06/G07), provider-activation (G02), stay-food-activities (G05), destination-composition (G04), contribution-catalogue, geography-filters (G01), cost-assumptions, health. G06.5: `IngestionCandidate` proven private without any GeoNames/Google credential.
- Prisma validate, `tsc`, ESLint (all G11 files), `nest build` and real-app boot are clean.

## OpenAPI

Regenerated from the real app: **314 path templates (+3 from G10's 311)** — exactly the three ADMIN routes `GET /v1/admin/search/projection/status`, `POST …/drain`, `POST …/rebuild`. `/v1/search`, `/v1/search/suggestions` and `/v1/map/features` already existed; their schemas gained optional parameters/fields only. `openapi-contract.spec.ts` (no-drift) passes.

## Secret / privacy scan, public API leak scan, working tree

Scan of every G11-created/changed file and doc for JWTs, DB URLs with credentials, keys, tokens, private emails, precise coordinates, trip/financial/commercial data: clean (the only hits are synthetic test constants — a fake coordinate pair asserted absent from responses, the shared synthetic e2e password — and one pre-existing config address; the harness comment now uses a placeholder URL). Projection models are referenced only inside `modules/search`. `frontend-pass-10/` untouched. Only read-only git commands were used.

## Disclosures

1. The first application of my own G11 migration failed (Prisma's update-banner text had been captured into the SQL file); nothing applied. I removed the banner, marked that failed attempt rolled back (`prisma migrate resolve --rolled-back`, touching only my migration's row) and re-applied.
2. For the definitive Path B I reverted my own unaccepted G11 objects on the dev DB with a targeted script (scoped to those objects and the two `_prisma_migrations` rows of my migration) and re-applied the final migration. No accepted object was touched.
3. The e2e suite flushes the project's dev Redis (`FLUSHALL` via `docker exec`) to prove Redis is not the authority; that also clears any dev BullMQ jobs.
4. While tuning, one perf-DB setting (`ALTER DATABASE dauviet_perf SET plan_cache_mode`) was set and then reset to prove the generic-plan diagnosis; only the throwaway database was affected.
5. The roadmap briefly carried a duplicate G11 row from the G10 edit; fixed.
6. Two e2e assertions written too strictly (a near-identical old title legitimately reappears at the FUZZY tier) were corrected to the right property (never an exact/prefix/text match; stored terms exact); no product assertion was weakened.

## Scope exclusions (confirmed, none built)

No external search service, no LLM/MT, no result cache, no sponsored ranking, no search history/profiling, no provider search/map, no person/story/journey map layer, no runtime geocoding, no frontend work, no G12.

## Known limitations / risks (none blocking)

1. Golden-Dataset Vietnam seed events/eras/dynasties have no stored chronology ordinals, so they are "unknown-dated" for strict period filters and never match one; entities created through the API carry ordinals. G11 does not mutate accepted data; a seed/backfill follow-up is recommended before G12.
2. Fuzzy requires similarity ≥ 0.5; typos in very short (< 5 character) names may not match.
3. Rebuild throughput ≈ 110–120 entities/s (≈ 12 min for 82k entities on the benchmark host); incremental updates never need it.
4. Write-side trigger overhead was not separately benchmarked (one trivial upsert per changed row).
5. Performance was measured on a noisy shared laptop with sequential clients and synthetic repetitive data; no concurrency/network load test.
6. The generic-plan hazard (Prisma cached prepared statements) may affect other modules' wide-range raw queries; G11 fixed only its own.
7. Antimeridian-crossing bbox is rejected (clients split it).

## P0 / P1

None.

## Individual gate manifest

`G11_ACCEPTANCE_GATE_MANIFEST.md` — 184 gates, derived before implementation: 183 `PASS`, 1 `PASS — NOT APPLICABLE` (the conditional result-cache requirement), 0 `FAIL`, 0 `UNVERIFIED`.

## After G11

G12 remains NOT STARTED. Backend V2 Freeze remains NOT CLAIMED. G11 is not independently labeled LOCKED; external review decides baseline acceptance.
