# G11 — Global Search & Map: Pre-Implementation Report

Written before any G11 schema, migration or code change.

## 1. Branch / HEAD

Branch `main`, HEAD `9931a16` — unchanged since G07 (G07–G10 remain uncommitted in this working
tree, per each phase's "do not commit" instruction). G11 builds on top.

## 2. Working tree / concurrent-owned files

`git status --short`: the cumulative G07–G10 diff plus the untracked `frontend-pass-10/` (a
concurrently-owned copy of the web/api tree). It is never touched. G11 owns only
`apps/api/src/modules/search/**`, `apps/api/src/modules/map/**` (extended), a new
`apps/api/src/common/search/**`, `prisma/schema.prisma` (additive), a new migration, tests, and
`docs/backend/**`. `apps/web/app/map/explore-map-client.tsx` consumes `/v1/map/features` and is read
only (no frontend work in G11).

## 3. Existing implementation audited

- `GET /v1/search`, `GET /v1/search/suggestions` (`SearchService`): live per-type SQL over
  translation tables using `immutable_unaccent(lower(...))` trigram similarity (threshold 0.15),
  a `historicalImportance*0.01` bonus, an exact-match bonus of 10, a community penalty of −0.05.
  Kinds covered: PLACE, PERSON, EVENT, ERA, STORY, JOURNEY, SOURCE, COMMUNITY_STORY. **Not covered:**
  Country, Region, City, Destination, Dynasty, Territory, Theme. No FTS, no cursor pagination
  (top 50 by score), no filters other than `types`, no stable tie-break, raw `score` is returned.
  Aliases are used only for PLACE/PERSON/EVENT.
- `GET /v1/map/features` (`MapService`): bbox required, strict validation, `west >= east` rejected
  (antimeridian explicitly rejected), zoom importance floors, cap 500 (100 at zoom ≤ 6). Serves
  PLACE (`location` point), TERRITORY (`geometry`, only `geometryStatus = PUBLISHED`, only when
  `year` is given, using `chronologyStart/End`), EVENT (one feature per `EventPlace` pair; `year`
  uses the legacy `dateSortStart/End` DateTime, so BCE events are excluded). Does not serve
  Country/Region/City/Destination. `zoom` is `@IsInt`, but the web client sends `map.getZoom()`
  (a float) — a latent mismatch that G11 fixes additively.
- Timeline (`/v1/timeline`) is out of G11 scope (not search/map).
- Existing tests: `search.service.spec.ts` (mock-based), `map.service.spec.ts` (mock-based, includes
  accepted G03 assertions that an undated Territory always matches the legacy `year` filter and
  that legacy Event `year` excludes BCE). One e2e assertion (`contribution-catalogue.e2e-spec.ts`)
  requires that an uncatalogued contribution title is not publicly searchable.
- No search projection table, no outbox, no event bus, no application cache. Redis is used only by
  BullMQ (mailer, ingestion). Rate limiting: global `ThrottlerGuard`, 120 req / 60 s default per IP,
  overridable per route with `@Throttle`.

## 4. Database capabilities (verified against the real dev DB)

PostgreSQL 16.4, PostGIS 3.4.3, `pg_trgm` 1.6, `unaccent` 1.1, all already installed (no
`CREATE EXTENSION` needed; the migration uses `CREATE EXTENSION IF NOT EXISTS` for safety).
`immutable_unaccent(text)` exists (wraps `unaccent('unaccent', $1)`). **Verified Vietnamese
behavior:** `Hội An→hoi an`, `Đà Nẵng→da nang`, `Thăng Long→thang long`, `Hoàng Sa→hoang sa`,
`Trường Sa→truong sa`, `đường→duong`, `đ→d`, and an NFD-decomposed `Hội An` also yields `hoi an`.
Geometry columns (all SRID 4326): `Place.location` POINT, `Place.geometry` GEOMETRY,
`Territory.geometry` GEOMETRY, `TerritoryGeometryRevision.geometry`, `Journey.routeGeometry`
LINESTRING. Existing GiST: `Place_location_gist`, `Place_geometry_gist`, `Territory_geometry_gist`,
`Journey_routeGeometry_gist`. Existing trigram GIN (expression, `immutable_unaccent(lower())`) on
Place/Person/Event/Era/Story/Journey/CommunityStory translations, Source title and EntityAlias.
**No trigram/GiST index exists for Country/Region/City/Destination** (they store plain
`latitude/longitude Float?`, by G01 design: "G11 can add PostGIS geometry additively").

## 5. Public canonical search corpus (from repository truth)

| Kind | Source table(s) | Public-eligibility rule (from the existing public API) | Trust class |
|---|---|---|---|
| COUNTRY / REGION / CITY / DESTINATION | `Country`,`Region`,`City`,`Destination` + `*Translation` | `status = PUBLISHED` | CANONICAL |
| PLACE / PERSON / EVENT | `Place`,`Person`,`HistoricalEvent` + translations | `publicationStatus = PUBLISHED` | CANONICAL |
| ERA / DYNASTY | `HistoricalEra`,`Dynasty` + translations | no status column; public list is ungated | CANONICAL |
| TERRITORY | `Territory` + translations | detail text is public; **geometry only when `geometryStatus = PUBLISHED`** | CANONICAL |
| THEME | `Theme` + translations | no status column; public | CANONICAL |
| STORY | `Story` + translations | `editorialStatus = PUBLISHED` | EDITORIAL |
| JOURNEY | `Journey` + translations | `editorialStatus = PUBLISHED` | EDITORIAL |
| SOURCE | `Source` | `archivedAt IS NULL` (matches the existing search) | SOURCE_RECORD |
| COMMUNITY_STORY | `CommunityStory` + translations | `moderationStatus IN (VISIBLE, LIMITED, LOCKED)` | COMMUNITY |

`SOURCE` and `COMMUNITY_STORY` keep existing behavior (already publicly searchable today) and stay
distinguishable through `trustClass`; community results sort after non-community results within the
same relevance tier and are never labeled verified.

## 6. Excluded / private corpus (structural, not by filter)

Never projected: `Trip*`, `TripMember`, `TripInvitation`, `TripLocationSharing`,
`TripMemberLocation`, `TripExpense*`, `TripSettlement`, `Affiliate*`, `ProviderBookingReference`,
`IngestionCandidate` and every other `Ingestion*` table, unpublished/draft/in-review/archived
content, `Contribution`, moderation data, `Comment`, `Report`, users, sessions, provider
credentials/licenses. **G05 provider entities** (`Accommodation`, `Restaurant`, `Activity`, offers,
provider references) are `PROVIDER_DATA` and have their own G05 discovery endpoints; they are
excluded from G11's search/map projection entirely (no canonical/provider mixing is possible
because no provider table is read by any projection loader). The projection loaders are an explicit
allowlist of the tables above.

## 7. Translation / alias architecture

Translations: one row per `(entity, locale)` in `*Translation`, locales `vi` (canonical) and `en`;
Japan has `defaultLocale = ja` with no `ja` translation. `resolveTranslation` = requested locale →
canonical `vi` → any, with `fallbackApplied`. Aliases: one polymorphic `EntityAlias(entityType,
entityId, locale, alias, aliasType)` with `AliasType` (ALTERNATE_NAME, HISTORICAL_NAME,
ROMANIZATION, TRANSLITERATION, ALTERNATE_SPELLING, ABBREVIATION, BIRTH_NAME, REGNAL_NAME,
TEMPLE_NAME, TITLE, EPITHET, OTHER); not globally unique. Accepted seed data: Hoàng Sa has the alias
"Paracel Islands", Trường Sa has "Spratly Islands" (both ROMANIZATION, accepted). No alias is
invented by G11.

## 8. Proposed search projection architecture

A rebuildable projection, never authority (`SEARCH INDEX != SOURCE OF TRUTH`):

- `SearchDocument` — one row per public `(entityKind, entityId)`: canonical slug, trust class,
  subtype, `importance` (reusing `historicalImportance`/`importance`, no new scale), per-locale
  `titles`/`summaries` JSON copied from the translation rows (only locales that exist — nothing
  fabricated), `normalizedNames`, `normalizedSearchText`, `countryIds/regionIds/cityIds` arrays,
  `chronologyStart/End`, optional `geom` (geometry, 4326) used only for the search `bbox` filter,
  `projectedAt`.
- `SearchTerm` — one row per name a document can be found by: `CANONICAL_TITLE` (canonical locale),
  `LOCALIZED_TITLE` (other locales), `ALIAS` (with the source `aliasType` preserved). Unique on
  `(documentId, termKind, locale, normalizedText)`. Drives the exact / alias / prefix / trigram
  tiers. Aliases are never collapsed into one array; translations are never treated as aliases.
- `SearchProjectionQueue` — `(entityKind, entityId)` PK, `enqueuedAt`, `lockedAt`, `attempts`,
  `lastError`. Filled by AFTER row triggers on the source tables (so seeds, raw SQL and every
  service are covered, no ghost results). The trigger insert is a trivial upsert; it cannot fail a
  canonical write for projection reasons.
- `SearchProjectionRun` — rebuild/drain observability (duration, counts, status).

A physical projection **is** justified here: the corpus now spans 15 kinds across ~35 tables with
alias and multi-locale matching; a per-request live UNION cannot use one trigram/FTS index and
cannot support a stable global cursor. PostgreSQL only — no external search service is introduced
(section 4 of the brief; no benchmark evidence of insufficiency exists).

## 9. Normalization algorithm (single TypeScript implementation)

`normalizeSearchText(s)`: NFD → remove combining marks (`\p{M}`) → `đ/Đ → d` → `toLowerCase()` →
replace every run of characters that are not letters/digits (`[^\p{L}\p{N}]+`) with one space → trim.
Applied identically when writing the projection and when normalizing the query (same code path, so
no SQL/TS drift; NFC and NFD inputs converge; display text is never normalized). Verified against
PostgreSQL `unaccent` (section 4) as a cross-check.

## 10. VI / EN strategy

VI canonical, EN supported; no other locale. Cross-language retrieval only through stored
translation titles and stored aliases (no LLM/MT). A `locale=en` query for `Hue` matches the stored
`en` title. A missing `en` translation is never invented: the response resolves through the existing
`resolveTranslation` policy and returns `locale` (requested), `actualLocale` (resolved) and
`fallbackUsed`. A silent language rewrite of the query is not performed.

## 11. Ranking model

Text tiers (primary): 1 exact canonical title, 2 exact localized title, 3 exact accepted alias,
4 canonical/localized-title prefix, 5 FTS (`to_tsvector('simple', …)` over normalized text, AND of
tokens, last token prefix), 6 controlled trigram fuzzy (only when the normalized query has ≥ 3
characters). A document keeps its best tier. Secondary keys inside a tier, in order: non-community
before community, higher `importance`, requested-locale title match, entity-kind order, then
`entityId` (final deterministic tie-break). No commercial signal (commission, conversion, click)
exists in the projection; "verified" is not a numeric boost.

## 12. Pagination

Opaque keyset cursor over `(tier, communityRank, −importance, kindOrder, entityId)`, bound to a hash
of the normalized query + filters + locale so a tampered/foreign cursor is rejected with `400`.
Page size default 20, max 50; the candidate window per query is capped (300). `total` is not
returned (no unbounded counts). Same projection + same query ⇒ same order.

## 13. PostGIS / map architecture

Map is a live projection over canonical geometry, not over `SearchDocument` (`MAP FEATURE != SEARCH
DOCUMENT`). Existing feature families stay (PLACE point, TERRITORY polygon, EVENT via `EventPlace`).
G11 adds current-geography features (COUNTRY/REGION/CITY/DESTINATION points from their stored
`latitude/longitude`) via additive expression GiST indexes, fixes fractional zoom, adds BCE-correct
strict period filtering as **new** params, and adds hard, zoom-aware caps. SRID is 4326 everywhere;
bbox stays `west,south,east,north`; an antimeridian-crossing bbox (`west > east`) is explicitly
rejected (documented), as today. Geometry is returned as stored GeoJSON (Point / Polygon /
MultiPolygon etc., never assumed to be a point).

## 14. Current vs historical geography

Country/Region/City/Destination stay the current navigation hierarchy; Territory stays the
temporal/evidential historical layer. Features carry `entityType` and a `layer`
(`CURRENT_GEOGRAPHY` | `HISTORICAL` | `HISTORICAL_KNOWLEDGE_SITE`) so they are never merged. No
sovereignty or jurisdiction is inferred from centroid, bbox, nearest country or search rank; the
only country relation returned is the stored `currentCountryId` (Place) or an explicit
`EventCountry` link, never computed spatially. Hoàng Sa/Trường Sa are ordinary accepted Places
found by their stored names/aliases; no sensitive alias or relationship is added.

## 15. Trust / provider / community separation

`trustClass` on every document and feature (`CANONICAL`, `EDITORIAL`, `SOURCE_RECORD`,
`COMMUNITY`). Provider data is not read at all. A community story cannot become canonical through
the projection (it is a distinct kind + class). Ingestion candidates are not read.

## 16. Projection freshness / rebuild

Incremental: trigger → queue → in-process worker (default every 2 s, plus `POST
/v1/admin/search/projection/drain`) → `refreshEntity(kind, id)`. `refreshEntity` runs in one
transaction that takes a per-entity `pg_advisory_xact_lock`, re-reads canonical truth inside the
lock, then upserts or deletes the document and its terms (unpublish ⇒ delete ⇒ no ghost result).
Target freshness ≤ 60 s; expected ≈ worker interval. Full `rebuildAll` iterates canonical ids and
existing documents through the same `refreshEntity` (idempotent; twice ⇒ identical; no duplicates
thanks to `@@unique([entityKind, entityId])`).

## 17. Concurrency / recovery

Because every refresh recomputes from current canonical state under a per-entity lock, a refresh
that raced a canonical write cannot leave a permanently stale row: the write's own trigger
re-queues the entity (`enqueuedAt` changes) and the queue row is only deleted when `enqueuedAt` is
unchanged since claim. Claims are short transactions (`UPDATE … SET lockedAt`), never held during
the refresh, so canonical writers are never blocked by the projection worker; abandoned claims
expire after 60 s. A failing refresh leaves the canonical row committed, increments `attempts` and
records `lastError`; the next drain or a rebuild restores correctness. Tested against real
PostgreSQL: rebuild vs canonical update, publish vs refresh, unpublish vs refresh, duplicate
rebuild, concurrent incremental updates, forced projection failure + recovery.

## 18. Cache strategy

No search-result cache in G11: measured latency is the deciding factor (see the performance report)
and a cache would add a staleness dimension against the ≤ 60 s freshness contract for no proven
need. If measurements had demanded it, the cache key would include query, locale, filters, bbox,
zoom, period and a projection version. Redis is not used for search correctness (flushing Redis has
no effect on results — asserted in e2e).

## 19. Performance dataset

Disposable database `dauviet_perf` (never the dev DB, never the seed): ≥ 50,000 synthetic
`SearchDocument` rows (+ terms) and ≥ 50,000 synthetic Places/Territories/Events for the map, built
with `generate_series` SQL with Vietnamese-diacritic names. Targets: search p95 ≤ 300 ms,
suggestions p95 ≤ 150 ms, map bbox p95 ≤ 300 ms (local, warm, no WAN).

## 20. Proposed indexes (each to be justified by EXPLAIN)

`SearchDocument`: unique `(entityKind, entityId)`, GIN `to_tsvector('simple', normalizedSearchText)`,
GIN on `countryIds/regionIds/cityIds`, GiST `geom`, btree `(entityKind)`, btree `(chronologyStart,
chronologyEnd)`. `SearchTerm`: btree `(normalizedText text_pattern_ops)`, GIN
`(normalizedText gin_trgm_ops)`, btree `(documentId)`. Map: expression GiST on
`ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)` for Country/Region/City/Destination,
plus btree on `importance`/status where EXPLAIN shows a need. Nothing speculative.

## 21. Migration plan

One additive migration `<ts>_g11_global_search_map`: four new tables, three new enums, additive
indexes, the trigger function and triggers, `CREATE EXTENSION IF NOT EXISTS` for the three
extensions. Generated with the G06.5-approved tooling (`prisma migrate diff --from-url <dev DB>
--to-schema-datamodel …`, no shadow DB, `DATABASE_URL != SHADOW_DATABASE_URL`), with the
pre-existing `EntityKind.FACT` + 17 trigram/GIST drop-index drift artifact stripped as in every
phase since G04. No G00–G10 migration is touched; no `DROP`/rename of accepted schema.

## 22. APIs

- `GET /v1/search` (extended, backward-compatible): `q`, `types`, `locale` (header/param as today),
  `countryId`, `regionId`, `cityId`, `fromYear/fromEra/toYear/toEra`, `bbox`, `cursor`, `limit`.
  Response keeps `query` and `results[]` (same item fields) and adds `nextCursor`, `matchTier`,
  `trustClass`, `summary`, `subtype`; `score` is kept but documented as an opaque ordering hint.
- `GET /v1/search/suggestions` (kept; served from the projection; same privacy/trust boundaries).
- `GET /v1/map/features` (extended, backward-compatible): adds current-geography features,
  fractional `zoom`, `era`, and new strict `fromYear/fromEra/toYear/toEra`; legacy `year` unchanged.
- `POST /v1/admin/search/projection/rebuild`, `POST …/drain`, `GET …/status` (ADMIN only).
- Empty/whitespace `q` stays `400 SEARCH_QUERY_REQUIRED` (no corpus enumeration).
- Limits: `q` ≤ 200 chars; fuzzy needs ≥ 3 normalized chars; `limit` ≤ 50; `types` ≤ 15 values;
  each filter id ≤ 64 chars; `bbox` = 4 numbers; map caps 500 (100 at zoom ≤ 6, 250 at ≤ 9).

## 23. Risks

1. A projection can be stale by up to the worker interval; mitigated by queue + tests, documented.
2. Trigger coverage: every source table that feeds a document needs a trigger; a missed table would
   leave stale data until rebuild. Mitigated by a test that mutates each source and observes the
   projection, and by `rebuild`.
3. `pg_trgm` similarity threshold is the server default 0.3 (documented, not per-session).
4. Legacy `year` map param semantics intentionally unchanged (accepted G03 behavior); strict
   BCE/unknown-date semantics apply to the new period params only.
5. In-process worker: multi-instance safe (`SKIP LOCKED`) but each instance polls.
6. Existing mock-based search unit tests describe the replaced implementation; their behavioral
   assertions are ported to the new implementation (exact-over-fuzzy, community ordering,
   validation, fallback reporting), not dropped.
7. Removing `SearchService`'s per-type live SQL changes `/v1/search` internals only; the response
   contract is preserved additively.

## 24. Canonical gate count

`docs/backend/G11_ACCEPTANCE_GATE_MANIFEST.md`, derived from this brief's numbered sections.
