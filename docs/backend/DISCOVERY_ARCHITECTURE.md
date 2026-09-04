# Dau Viet - Discovery: Map, Timeline, Search & Nearby (Phase 07)

Audience: any engineer/agent touching `MapService`, `TimelineService`, `SearchService`, or
`PlacesService.findNearby`. This document is the contract for how the four public discovery
surfaces read from the same underlying domain data (`docs/backend/HISTORICAL_DOMAIN.md`
dates, `docs/backend/TRUST_MODEL.md`/`EDITORIAL_CONTENT.md` publication gates) - if code
disagrees with this doc, treat it as a bug.

## 1. Map (`GET /v1/map/features`, spec section 3-12)

`bbox` (`west,south,east,north` = `minLng,minLat,maxLng,maxLat`) is **required** - the
endpoint never returns an unscoped dump of every point in Vietnam. `MapService.parseBbox`
validates strictly before any value reaches SQL: exactly four finite numbers, `lng` in
`[-180,180]`, `lat` in `[-90,90]`, `west < east` and `south < north` - a malformed or
SQL-injection-shaped string (e.g. `0,0,1,1); DROP TABLE...`) is rejected with
`MAP_INVALID_BBOX` before `$queryRaw` is ever called (unit-tested in `map.service.spec.ts`).
All spatial SQL uses `$queryRaw` tagged templates / `Prisma.sql` - never string
concatenation of a request parameter.

Three feature sources are merged into one GeoJSON `FeatureCollection`:

- **`PLACE`** - published `Place` points intersecting the bbox (`ST_Intersects` against
  `ST_MakeEnvelope(...,4326)`), `properties: { entityType: 'PLACE', id, slug, placeType,
  historicalImportance, name, locale, actualLocale, fallbackUsed }`.
- **`TERRITORY`** - only when `year` is supplied: published (`geometryStatus = 'PUBLISHED'`)
  `Territory` polygons intersecting the bbox whose `sortStart`/`sortEnd` cover that year.
  Draft/in-review geometry **never** reaches this endpoint regardless of caller role - there
  is no admin variant of `/map/features` in this phase; territory review stays on the
  `PATCH /territories/:id/geometry-status` path (`docs/backend/BACKEND_HANDOFF.md` section 2).
- **`EVENT`** (new in Phase 07, spec section 7) - published `HistoricalEvent`s joined through
  `EventPlace` to a `Place` with a resolvable point, one feature per (event, place) pair (an
  event linked to several places renders at each of them, never an averaged point).
  Optional `theme` (via `EventTheme`/`Theme.slug`), `eraId`, and `year` (overlap semantics,
  matching Timeline - section 2 below) filters.

**Zoom-based density (spec section 9)** is a small, explicit threshold table -
`minImportanceForZoom(zoom)`: `zoom<=6` (national) -> importance `>=7` only; `zoom<=10`
(regional) -> `>=4`; otherwise (city/street) -> everything published. This governs both
`Place` and `Event` features via the same `historicalImportance`/`importance` column every
other query already orders by - **there is no id/slug allowlist or special case anywhere in
this path.** Hoang Sa and Truong Sa are visible at national zoom purely because the golden
dataset gives them a real `historicalImportance` of 9 (`prisma/golden-dataset.ts`), the same
mechanism as Co Loa (8) or Co do Hue (10) - regression-tested in `trust-regression.spec.ts`
("Hoang Sa / Truong Sa discovery regression") and `map.service.spec.ts`. At national zoom the
result cap also tightens to 100 (from the general 500-feature cap) so a wide bbox at low zoom
cannot return an overwhelming point cloud; `meta.truncated`/`meta.limit`/`meta.minImportance`
tell the client exactly what filtering was applied, so a "zoom in for more" affordance never
has to guess.

`types` filters `Place`/`Event` results to a comma-separated, validated list of `PlaceType`
values (`MAP_INVALID_FILTER` on an unrecognized value - never silently ignored).

## 2. Timeline (`GET /v1/timeline`, spec section 21-31)

Returns `{ items: [...] }`, each item either `{ kind: 'ERA', ... }` or `{ kind: 'EVENT', ...
}`, every item carrying a full `date: HistoricalDateResponse`
(`docs/backend/HISTORICAL_DOMAIN.md` section 2) - **never a bare year integer.** Sorting uses
the internal, always-populated-when-known `dateSortStart`/`sortStart` DateTime; an item whose
date is wholly `UNKNOWN` sorts **last**, deterministically, not first (it is not treated as
"the beginning of time").

**Range semantics - the Phase 07 fix (spec section 26).** `fromYear`/`toYear` use **overlap**
semantics, not containment: an event spanning 1250-1310 matches `fromYear=1200&toYear=1300`
because its span overlaps the query window, even though its end (1310) falls outside it. The
query window itself spans the full calendar year at each edge (`fromYear`'s window starts
Jan 1 UTC, `toYear`'s window ends Dec 31 23:59:59 UTC), so a single-year query
(`fromYear=toYear=1288`) still matches an item dated exactly within 1288. Concretely:

```
dateSortStart <= windowEnd   (the item starts at or before the window closes)
dateSortEnd   >= windowStart (the item ends at or after the window opens)
```

Before this phase the query instead required `dateSortStart >= from AND dateSortEnd <= to`
(containment) - an event merely overlapping the requested window, rather than being fully
contained by it, was silently dropped. This is the single highest-value correctness fix in
Phase 07; `timeline.service.spec.ts` asserts the exact Prisma `where` shape (`lte`/`gte` on
the correct fields, no stray `dateSortStart.gte`) so a future refactor cannot silently
reintroduce containment semantics.

When any range filter is active, items with no known date are excluded (a nullable-field
comparison filter never matches `null` in Postgres/Prisma) - an unbounded `GET /timeline` with
no range still includes them, sorted last per the rule above.

`eraId`/`placeId`/`personId`/`theme` (via `EventTheme`) filter `EVENT` items; `eraId` also
filters the `ERA` list. `minImportance` and `limit` (capped at 300, `MAX_TIMELINE_ITEMS`) bound
result size. A range wider than 6000 years (`MAX_RANGE_YEARS`) is rejected
(`TIMELINE_RANGE_TOO_LARGE`) - generous enough for any real Vietnamese-history query, but a
real guard against a pathological request, not a silently-unbounded scan.

**Map/Timeline sync:** both use the identical overlap-window construction for `year`/
`fromYear`+`toYear`, so a client driving a synced map+timeline UI (a common product pattern)
gets consistent results from both endpoints for the same year, not two subtly different
notions of "in range."

## 3. Search (`GET /v1/search`, `GET /v1/search/suggestions`, spec section 32-50)

**PostgreSQL-native only** (`pg_trgm` trigram similarity + `unaccent`) - no OpenSearch/
Elasticsearch cluster. The spec explicitly permits this only if clearly justified: at this
data scale (a few thousand rows across 8 entity types, all served from one Postgres instance
that already exists for every other query) a second search-specific service would be
operational overhead with no measured need, and the per-entity-type query method below is
already the seam a real search engine would slot into later without touching the controller,
DTO, or ranking contract clients depend on.

**Vietnamese diacritic + case normalization (spec section 33/34/38):** every `similarity()`
call wraps both sides in `immutable_unaccent(lower(...))`. Postgres's built-in `unaccent()` is
`STABLE`, not `IMMUTABLE`, and Postgres refuses to use a `STABLE` function inside a GIN
expression index - so the Phase 07 migration
(`prisma/migrations/20260904000005_phase07_discovery/migration.sql`) defines a thin
`IMMUTABLE` SQL wrapper:

```sql
CREATE OR REPLACE FUNCTION immutable_unaccent(text) RETURNS text AS
$$ SELECT unaccent('unaccent', $1) $$ LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT;
```

This is the standard, documented Postgres workaround for indexing `unaccent()` output; every
query-time `similarity()` call and every migration-time expression index use the same
wrapper, so a query never fails to hit its index. A search for `"Hue"` or `"hue"` matches
`"Huế"` for exactly this reason - no client-side normalization is required or should be
assumed absent.

**Cross-language / alias search (spec section 37):** each per-type query also checks
`EntityAlias` (already normalized through the same `immutable_unaccent(lower(...))` wrapper),
so `"Nguyen Hue"` matches Quang Trung via his `BIRTH_NAME` alias even though it doesn't appear
in either translation's canonical name. `matchedOn: 'name' | 'alias'` on every result tells the
client which one actually matched.

**Locale handling:** each per-type query is a `DISTINCT ON (entity.id)` subquery over
`WHERE translation.locale = :locale OR translation.locale = 'vi'`, ordered so the requested
locale wins when both exist - this closes a Phase 06-era latent bug where an entity with both
an `en` and a `vi` translation could appear twice in one result set. `matchedLocale`/
`actualLocale`/`fallbackUsed` on each result follow the same contract as every other
translated response (`docs/backend/HISTORICAL_DOMAIN.md` section 6).

**Ranking (spec section 40):** `score = max(nameSimilarity, aliasSimilarity) +
importanceBonus + (exactMatch ? 10 : 0)`. The exact-match bonus is large enough that a
diacritic/case-insensitive exact title match **always** outranks a fuzzy high-importance
match - protecting a major historical entity's discoverability from being buried by a
merely-similar but non-matching result, which is the opposite failure mode of section 39
below. Results below `SIMILARITY_THRESHOLD` (0.15) are dropped unless they are an exact match.

**Popularity never outranks historical importance (spec section 39):** `CommunityStory`
carries a small **negative** `importanceBonus` (-0.05) while `Place`/`HistoricalEvent` carry a
small positive one (`historicalImportance * 0.01`) - deliberately asymmetric so that, at equal
textual similarity, community content can never outrank a major historical entity purely on
relevance score, regardless of how many comments/votes it has accumulated (nothing in the
ranking formula reads engagement counters at all).

**Publication safety:** every per-type query filters at the SQL `WHERE` clause - `Place`/
`Person`/`HistoricalEvent` require `publicationStatus = 'PUBLISHED'`, `Story`/`Journey`
require `editorialStatus = 'PUBLISHED'`, `CommunityStory` requires `moderationStatus =
'VISIBLE'`, and `Source` excludes `archivedAt IS NOT NULL` (closing a Phase 06-era gap where
an archived Source could still surface in search). `HistoricalEra` has no publication gate
(eras are not gated content in this schema, same as every other public era read). A DRAFT
entity is never fetched-then-filtered client-side - it never leaves Postgres.

`GET /search/suggestions?q=` (spec section 50) is a thin wrapper around `search()` with no
`types` restriction, returning `{ entityType, id, slug, title }` only - the fast/lightweight
shape for a dropdown, not the full ranked payload.

**Query validation:** `q` is required and capped at 200 characters
(`SEARCH_QUERY_REQUIRED`/`SEARCH_QUERY_TOO_LONG`); `types` must be a comma-separated list of
valid `EntityKind` values (`SEARCH_INVALID_TYPE`).

## 4. Nearby (`GET /v1/places/nearby`, spec section 51-54)

`GET /v1/places/nearby?lat=&lng=&radius=&types=&limit=&locale=` - a new, stateless discovery
endpoint ("Kham pha quanh toi" / "explore around me"). **`lat`/`lng` are request parameters
only, never persisted** - no table stores a user's queried coordinates, and no additional
location logging beyond ordinary infrastructure request logs is added (spec section 52).

Distance is **always meters** (spec section 53), computed by casting both the `Place.location`
geometry and the query point to `::geography` before calling `ST_DWithin`/`ST_Distance` - a
plain `geometry` comparison would return raw degree units, which is not a distance a client
can render. `radius` defaults to 5,000m and is capped at 50,000m
(`MAX_NEARBY_RADIUS_METERS`) rather than erroring on an over-large request - a client asking
for 500km back just gets the capped 50km result, which is still useful, instead of a rejected
request. `limit` defaults to 20, capped at 100. Invalid/non-finite/out-of-range coordinates
are rejected with `NEARBY_INVALID_COORDINATES`; a non-positive radius (after capping) with
`NEARBY_INVALID_RADIUS`.

Only `publicationStatus = 'PUBLISHED'` places with a non-null `location` are eligible - same
publication-safety rule as every other public discovery surface. Optional `types` filters to a
comma-separated, validated list of `PlaceType` values. Results are ordered by distance
ascending and each carries `distanceMeters` (rounded to the nearest meter) plus the usual
locale-fallback `meta`.

## 5. Indexes & extensions (spec section 45/62/63)

`prisma/schema.prisma`'s `datasource db { extensions = [postgis, pg_trgm, unaccent] }` plus
the Phase 07 migration add: the `immutable_unaccent` wrapper (section 3); GIN trigram
expression indexes on `immutable_unaccent(lower(...))` for every searched translation column
(`PlaceTranslation.name`, `PersonTranslation.displayName`, `HistoricalEventTranslation.title`,
`HistoricalEraTranslation.name`, `StoryTranslation.title`, `JourneyTranslation.title`,
`Source.title`, `CommunityStoryTranslation.title`, `EntityAlias.alias`) so every `similarity()`
call in section 3 can actually use an index rather than a sequential scan; and plain btree
indexes on `Place.historicalImportance`/`HistoricalEvent.importance` supporting the zoom-
density `ORDER BY`/`WHERE >= floor` pattern in section 1. GiST spatial indexes on
`Place.location`/`Territory.geometry` predate this phase (Phase 01/03) and are unchanged.

## 6. Deferred in this phase (be explicit, not hidden)

- **`SearchDocument` materialized projection (spec section 45).** Not built. The per-entity-
  type raw-SQL query in section 3 already answers every current search requirement with
  index-backed trigram queries at this data scale; a materialized, denormalized search table
  would add write-path complexity (keeping it in sync on every translation/alias/publication
  change) for no measured performance problem. Revisit if/when `EXPLAIN ANALYZE` against a
  real, populated database shows the per-type query approach is actually a bottleneck - the
  spec explicitly permits deferring this pending that evidence, which does not exist yet
  (no live Postgres was available in this build session - see `BACKEND_FREEZE_REPORT.md`).
- **`AdministrativeArea` model (spec section 56).** Not built. Nothing in Map/Timeline/Search/
  Nearby needs a modern administrative-boundary hierarchy (province/district/commune) - the
  existing `Place`/`Territory` models already cover every entity these four endpoints surface.
  Introducing a new model with no consumer would be exactly the premature-complexity pattern
  `docs/backend/EDITORIAL_CONTENT.md` section 10 warns against for the analogous
  `JourneyStopTranslation` case. Revisit only when a concrete feature (e.g. "browse by
  province") needs it. Regression-tested in `trust-regression.spec.ts` (no such model exists).
- **Redis/CDN response caching.** Every discovery response here is a pure function of
  published data plus request parameters (no per-user state), which is exactly the shape
  that's cacheable later - but no caching is wired up in this phase, matching the same
  "documented as deferred, not silently claimed to work" pattern as `EDITORIAL_CONTENT.md`
  section 20. Redis itself remains live-unverified regardless (`BACKEND_FREEZE_REPORT.md`).
- **Route-aware / turn-by-turn "nearby along my route" search.** Out of scope for this phase's
  Nearby endpoint, which is a simple radius query from one point.

## 7. Live verification required before production use

No live PostgreSQL+PostGIS instance was reachable in this build session (see
`BACKEND_FREEZE_REPORT.md`). Everything in this document is verified via `tsc`, `eslint`, and
unit tests against a mocked `PrismaService` (asserting the exact SQL/`where`-clause shape sent,
not live query results) - **not** executed against a real database. Before relying on this in
production, run `pnpm infra:up && pnpm db:migrate:deploy && pnpm db:seed` and then manually
verify: (1) the `immutable_unaccent` index actually gets used by `EXPLAIN` for a representative
search query rather than falling back to a sequential scan; (2) `ST_DWithin`/`ST_Distance`
nearby-query timing at the full golden-dataset scale; (3) the Timeline overlap-semantics fix
against real seeded event date ranges; (4) that no PostGIS/pg_trgm/unaccent extension is
missing from the target database (`CREATE EXTENSION IF NOT EXISTS` in the migration handles a
fresh database, but an existing database without superuser-run `CREATE EXTENSION` privileges
may need it applied manually first).
