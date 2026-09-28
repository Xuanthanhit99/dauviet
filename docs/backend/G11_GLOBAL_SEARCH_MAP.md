# G11 — Global Search & Map: Contract

Design rationale and audit: `G11_PRE_IMPLEMENTATION_REPORT.md`. Evidence: `G11_FINAL_REPORT.md`,
`G11_PERFORMANCE_REPORT.md`. Gates: `G11_ACCEPTANCE_GATE_MANIFEST.md`.

## 1. Domain laws (enforced structurally)

SEARCH INDEX != SOURCE OF TRUTH · SEARCH RESULT != VERIFIED FACT · SEARCH RANK != HISTORICAL IMPORTANCE ·
TEXT MATCH != ENTITY IDENTITY · ALIAS != TRANSLATION · CURRENT GEOGRAPHY != HISTORICAL TERRITORY ·
MAP FEATURE != SEARCH DOCUMENT · PROVIDER ENTITY != CANONICAL PLACE · COMMERCIAL RANKING != ORGANIC RANKING ·
INGESTION CANDIDATE != PUBLIC SEARCH RESULT · COMMUNITY CONTENT != CANONICAL KNOWLEDGE ·
MISSING TRANSLATION != FABRICATED TRANSLATION.

## 2. Architecture

PostgreSQL only (FTS, `pg_trgm`, PostGIS). No external search service.

```
canonical tables ──(AFTER row triggers)──► SearchProjectionQueue ──(worker / drain)──► refreshEntity
                                                                                        │ per-entity advisory lock,
                                                                                        │ re-read canonical truth
                                                                                        ▼
                                                                    SearchDocument + SearchTerm  (rebuildable projection)
GET /v1/search  ──► SearchService ──► projection only
GET /v1/map/features ──► MapService ──► canonical geometry (live, NOT the projection)
```

| Table | Role |
|---|---|
| `SearchDocument` | one row per public `(entityKind, entityId)`: slug, `trustClass`, `subtype`, `importance` (reused accepted value), per-locale `titles`/`summaries` JSON (only locales that exist), `normalizedNames`, `normalizedSearchText`, `countryIds/regionIds/cityIds` (stored FKs only), `chronologyStart/End` (G03 ordinals, NULL = unknown), `geom` (SRID 4326, search `bbox` only), `projectedAt` |
| `SearchTerm` | `CANONICAL_TITLE` / `LOCALIZED_TITLE` / `ALIAS` rows (alias keeps its `AliasType`); unique `(documentId, termKind, locale, normalizedText)` |
| `SearchProjectionQueue` | `(entityKind, entityId)` PK, `enqueuedAt`, `lockedAt`, `attempts`, `lastError`; filled by triggers |
| `SearchProjectionRun` | rebuild observability |

Deleting every row of these four tables never changes canonical data; `rebuildAll` restores them.

### 2.1 Corpus (explicit allowlist: `search-projection.loaders.ts`)

| Kind | Public rule | Trust class |
|---|---|---|
| COUNTRY, REGION, CITY, DESTINATION | `status = PUBLISHED` | CANONICAL |
| PLACE, PERSON, EVENT | `publicationStatus = PUBLISHED` | CANONICAL |
| ERA, DYNASTY, THEME | no status column (public by the existing read API) | CANONICAL |
| TERRITORY | text public; geometry only when `geometryStatus = PUBLISHED` | CANONICAL |
| STORY, JOURNEY | `editorialStatus = PUBLISHED` | EDITORIAL |
| SOURCE | `archivedAt IS NULL` | SOURCE_RECORD |
| COMMUNITY_STORY | `moderationStatus IN (VISIBLE, LIMITED, LOCKED)`; titles only | COMMUNITY |

Never projected: Trip, TripMember, TripInvitation, TripLocationSharing, TripMemberLocation, TripExpense*,
TripSettlement, Affiliate*, ProviderBookingReference, IngestionCandidate (and every `Ingestion*` table),
unpublished content, moderation-private data, provider entities (Accommodation/Restaurant/Activity/...), secrets.

### 2.2 Lifecycle and freshness

- Any insert/update/delete on a source table (entity, translation, alias, EventCountry/EventPlace/EraCountry)
  enqueues the entity. The trigger insert is a trivial upsert: a projection problem can never fail a canonical write.
- The in-process worker drains the queue every `SEARCH_PROJECTION_INTERVAL_MS` (default 2000). Redis is not involved.
- `refreshEntity` (one transaction): advisory lock on `(kind, id)` → re-read canonical → upsert, or **delete when the
  entity is no longer public** (unpublish leaves no ghost result) → replace the term set → set `geom`.
- The queue entry is deleted only if its claim token (`lockedAt`) is unchanged; any newer canonical change resets it.
  Abandoned claims expire after `SEARCH_PROJECTION_CLAIM_TIMEOUT_SECONDS` (60).
- A failing refresh leaves canonical data untouched, keeps the queue entry, records `attempts`/`lastError`.
- On a fresh deploy (no documents) the worker runs one `rebuildAll`.
- Measured freshness with a 500 ms worker: publish 1.4 s, rename 0.3 s, unpublish 0.4 s (contract: ≤ 60 s).

## 3. Normalization (one TypeScript implementation for write and query)

NFD → drop combining marks → `đ/Đ → d` → lower-case → non-letter/digit runs → one space → trim.
`Hội An → hoi an`, `Đà Nẵng → da nang`, `Thăng Long → thang long`; NFC and NFD inputs converge. Display text is never
normalized. Cross-checked against PostgreSQL `unaccent` (identical for the required Vietnamese examples).

## 4. `GET /v1/search`

Public, `@Throttle` 60 req/min/IP (`SEARCH_RATE_LIMIT_MAX`). `q` is required; an empty query is `400` (no corpus enumeration).

| Param | Meaning | Limit |
|---|---|---|
| `q` | text | 1–200 chars |
| `locale` | `vi` \| `en` (or `Accept-Language`) | |
| `types` | comma-separated kinds from §2.1 | ≤ 15; unknown/private/provider kinds → `400 SEARCH_INVALID_TYPE` |
| `countryId` `regionId` `cityId` | match STORED current-geography ids | ≤ 64 chars |
| `fromYear` `fromEra` `toYear` `toEra` | strict period (in-era 1-based year, BCE/CE), chronology-ordinal overlap; unknown dates never match; NULL end = instant | year 1..9999 CE / 1..100000 BCE |
| `bbox` | `west,south,east,north`, EPSG:4326; antimeridian-crossing rejected | |
| `cursor`, `limit` | keyset pagination | `limit` ≤ 50 (default 20) |

Response `data`: `{ query, results[], nextCursor, hasMore }`. Item: `entityType, id, slug, title, summary, matchedOn
('name'|'alias'), matchTier, score, trustClass, subtype, locale, actualLocale, fallbackUsed`.
`score` is an opaque, tier-derived hint kept for backward compatibility; it is not a database rank.
`locale` = requested, `actualLocale` = where the text came from, `fallbackUsed` = fallback applied (never a fabricated translation).

Ranking (text tier is always primary): 1 exact canonical title · 2 exact localized title · 3 exact alias ·
4 title prefix · 5 FTS (tokens AND, last token prefix) · 6 trigram fuzzy. A document keeps its best tier.
Inside a tier: non-community before community → title-hit before body-hit (tier 5) → higher `importance` →
requested-locale hit → kind order → `entityId`. Fuzzy runs only for normalized queries of ≥ 3 characters, only when fewer
than 10 strong candidates exist (identical on every page of a query), with similarity ≥ 0.5 (transaction-local).

Errors: `SEARCH_QUERY_REQUIRED`, `SEARCH_QUERY_TOO_LONG`, `SEARCH_INVALID_TYPE`, `SEARCH_INVALID_CURSOR`
(tampered/foreign/other-locale cursor), `SEARCH_INVALID_BBOX`, `SEARCH_INVALID_PERIOD`; unknown query params are rejected
(`VALIDATION_ERROR`), so `includeUnpublished`, `sort`, `orderBy`, `status` cannot exist.

`GET /v1/search/suggestions?q=` — same pipeline and boundaries, minimal payload `{ entityType, id, slug, title }`, ≤ 8.

## 5. `GET /v1/map/features`

Live over canonical geometry (SRID 4326, GeoJSON, real geometry types). Backward compatible: the default layer set and
`year` semantics are unchanged.

| Param | Meaning |
|---|---|
| `bbox` (required), `zoom` (0–22, **fractional accepted**), `locale` | |
| `types` | legacy `PlaceType` filter; `theme`, `eraId` legacy event filters |
| `year` | **legacy** (CE only; an undated Territory still matches — accepted G03 behavior) |
| `kinds` | opt-in layers: `PLACE, EVENT, TERRITORY` (historical) and `COUNTRY, REGION, CITY, DESTINATION` (current geography) |
| `fromYear/fromEra/toYear/toEra` | **strict** period: only TERRITORY and EVENT with a KNOWN chronology overlapping the period; BCE-correct; no current geography and no undated sites |

Density: per-layer cap 100 (zoom ≤ 6) / 250 (≤ 9) / 500, whole-response hard cap 1000, importance floors by zoom
(7 / 4 / 0), countries only at zoom ≤ 7, regions at 3–10, cities/destinations from 5. Territory geometry is generalized in the
response at low zoom (`ST_SimplifyPreserveTopology`, flagged `geometryGeneralized`); canonical geometry is never modified.
`meta`: `truncated, limit, minImportance, maxFeatures, periodApplied`.

Feature `properties` carry semantics only: `entityType`, `layer` (`CURRENT_GEOGRAPHY` | `HISTORICAL` |
`HISTORICAL_KNOWLEDGE_SITE`), `trustClass`, `markerSemantic`, importance, resolved locale, and stored chronology
(`chronologyStart/End`, `dateLabel`) — never CSS or pixel values. A country/region/city point is a display point, not a border or jurisdiction.
Events appear only through explicit `EventPlace` links of PUBLISHED places; provider entities and every private table are not readable here.
Clusters are a client presentation concern; no cluster id is returned.

## 6. Operations (ADMIN only)

`GET /v1/admin/search/projection/status` (document counts, queue depth, oldest queued age, last run, latency/zero-result metrics
without any query text) · `POST …/drain` · `POST …/rebuild`. No admin route returns unpublished content.

Config: `SEARCH_PROJECTION_WORKER_ENABLED` (true), `SEARCH_PROJECTION_INTERVAL_MS` (2000),
`SEARCH_PROJECTION_CLAIM_TIMEOUT_SECONDS` (60), `SEARCH_PROJECTION_DRAIN_BATCH_SIZE` (200), `SEARCH_RATE_LIMIT_MAX` (60).
Deploy: `prisma migrate deploy`; the first worker tick builds the projection (or call `POST …/rebuild`).

## 7. Known limitations

1. Golden-Dataset Vietnam seed rows (events, eras, dynasties) have no stored chronology ordinals (only legacy sort dates), so they
   are "unknown-dated" for strict period filters. G11 does not mutate accepted data; entities created through the API carry ordinals.
2. Map strict-period and search period use stored ordinals only (no derivation), so behavior is uniform.
3. Fuzzy requires similarity ≥ 0.5: a typo in a very short (< 5 character) name may not match.
4. No search-result cache (measured latency did not justify one; a cache would add a staleness dimension).
5. `pg_trgm.similarity_threshold` is set per query, transaction-locally.
6. Antimeridian-crossing bbox is rejected; clients split it into two calls.
