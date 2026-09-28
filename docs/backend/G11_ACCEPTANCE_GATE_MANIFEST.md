# G11 — Global Search & Map: Acceptance Gate Manifest

Derived directly from the numbered sections of the G11 brief before implementation (see
`docs/backend/G11_PRE_IMPLEMENTATION_REPORT.md`). Allowed states: `PASS`, `FAIL`, `UNVERIFIED`,
`PASS — NOT APPLICABLE`. Evidence lives in `G11_FINAL_REPORT.md` and `G11_PERFORMANCE_REPORT.md`.

| Gate | Requirement (brief section) | Status |
|---|---|---|
| G11-GATE-001 | SEARCH INDEX != SOURCE OF TRUTH; projection rebuildable, deleting it never deletes canonical content (Domain laws (§2)) | PASS - loaders allowlist + unit `search-projection.loaders.spec.ts`; search-map.e2e-spec.ts corpus/lifecycle/privacy/rebuild blocks |
| G11-GATE-002 | SEARCH RESULT != VERIFIED FACT; no result is labeled verified knowledge (Domain laws (§2)) | PASS - loaders allowlist + unit `search-projection.loaders.spec.ts`; search-map.e2e-spec.ts corpus/lifecycle/privacy/rebuild blocks |
| G11-GATE-003 | SEARCH RANK != HISTORICAL IMPORTANCE; text tier is primary, importance secondary (Domain laws (§2)) | PASS - loaders allowlist + unit `search-projection.loaders.spec.ts`; search-map.e2e-spec.ts corpus/lifecycle/privacy/rebuild blocks |
| G11-GATE-004 | TEXT MATCH != ENTITY IDENTITY; same name on two entities returns both (Domain laws (§2)) | PASS - loaders allowlist + unit `search-projection.loaders.spec.ts`; search-map.e2e-spec.ts corpus/lifecycle/privacy/rebuild blocks |
| G11-GATE-005 | ALIAS != TRANSLATION and TRANSLATION != ALIAS kept as distinct term kinds (Domain laws (§2)) | PASS - loaders allowlist + unit `search-projection.loaders.spec.ts`; search-map.e2e-spec.ts corpus/lifecycle/privacy/rebuild blocks |
| G11-GATE-006 | CURRENT GEOGRAPHY != HISTORICAL TERRITORY; distinct map layers/kinds (Domain laws (§2)) | PASS - loaders allowlist + unit `search-projection.loaders.spec.ts`; search-map.e2e-spec.ts corpus/lifecycle/privacy/rebuild blocks |
| G11-GATE-007 | HISTORICAL LOCATION != PRESENT-DAY POLITICAL CLAIM; no inference (Domain laws (§2)) | PASS - loaders allowlist + unit `search-projection.loaders.spec.ts`; search-map.e2e-spec.ts corpus/lifecycle/privacy/rebuild blocks |
| G11-GATE-008 | MAP MARKER != CANONICAL ENTITY; MAP FEATURE != SEARCH DOCUMENT (map served from canonical geometry) (Domain laws (§2)) | PASS - loaders allowlist + unit `search-projection.loaders.spec.ts`; search-map.e2e-spec.ts corpus/lifecycle/privacy/rebuild blocks |
| G11-GATE-009 | PROVIDER ENTITY != CANONICAL PLACE; PROVIDER POPULARITY != EDITORIAL AUTHORITY (Domain laws (§2)) | PASS - loaders allowlist + unit `search-projection.loaders.spec.ts`; search-map.e2e-spec.ts corpus/lifecycle/privacy/rebuild blocks |
| G11-GATE-010 | COMMERCIAL RANKING != ORGANIC RANKING; no commercial signal in ranking (Domain laws (§2)) | PASS - loaders allowlist + unit `search-projection.loaders.spec.ts`; search-map.e2e-spec.ts corpus/lifecycle/privacy/rebuild blocks |
| G11-GATE-011 | INGESTION CANDIDATE != PUBLIC SEARCH RESULT (Domain laws (§2)) | PASS - loaders allowlist + unit `search-projection.loaders.spec.ts`; search-map.e2e-spec.ts corpus/lifecycle/privacy/rebuild blocks |
| G11-GATE-012 | UNVERIFIED/COMMUNITY CONTENT != VERIFIED/CANONICAL KNOWLEDGE (Domain laws (§2)) | PASS - loaders allowlist + unit `search-projection.loaders.spec.ts`; search-map.e2e-spec.ts corpus/lifecycle/privacy/rebuild blocks |
| G11-GATE-013 | MISSING TRANSLATION != FABRICATED TRANSLATION; SEARCH FALLBACK != SILENT LANGUAGE REWRITE (Domain laws (§2)) | PASS - loaders allowlist + unit `search-projection.loaders.spec.ts`; search-map.e2e-spec.ts corpus/lifecycle/privacy/rebuild blocks |
| G11-GATE-014 | Pre-implementation audit performed and documented before schema changes (all 23 report items) (Audit (§3)) | PASS - G11_PRE_IMPLEMENTATION_REPORT.md (23 items) written before any schema/code change |
| G11-GATE-015 | Existing search/map/PostGIS/FTS/trgm/unaccent/Redis/queue/pagination/rate-limit audited (Audit (§3)) | PASS - G11_PRE_IMPLEMENTATION_REPORT.md (23 items) written before any schema/code change |
| G11-GATE-016 | PostgreSQL/PostGIS used; no external search service introduced (Database-first (§4/115)) | PASS - PostgreSQL FTS + pg_trgm + PostGIS only; benchmark shows targets met; no vendor added |
| G11-GATE-017 | Canonical PostgreSQL entities remain authoritative; rebuild/delete of projection leaves canonical intact (Source of truth (§5)) | PASS - search-map.e2e-spec.ts 'wiping the whole projection leaves canonical data intact and rebuild restores it' |
| G11-GATE-018 | Public corpus derived from repository truth and documented per kind (Corpus (§6)) | PASS - loaders allowlist (15 kinds) + per-kind eligibility unit tests + e2e kind coverage |
| G11-GATE-019 | Only accepted public/published entities are indexed (per-kind eligibility rule tested) (Corpus (§6)) | PASS - loaders allowlist (15 kinds) + per-kind eligibility unit tests + e2e kind coverage |
| G11-GATE-020 | Trip/TripMember/TripInvitation not indexed (Exclusion (§7)) | PASS - search-map.e2e-spec.ts private-data block (guessed ids, tokens, amounts, coordinates, types=TRIP*) + loaders privacy unit test |
| G11-GATE-021 | TripLocationSharing/TripMemberLocation not indexed (Exclusion (§7)) | PASS - search-map.e2e-spec.ts private-data block (guessed ids, tokens, amounts, coordinates, types=TRIP*) + loaders privacy unit test |
| G11-GATE-022 | TripExpense/TripExpenseShare/TripSettlement not indexed (Exclusion (§7)) | PASS - search-map.e2e-spec.ts private-data block (guessed ids, tokens, amounts, coordinates, types=TRIP*) + loaders privacy unit test |
| G11-GATE-023 | AffiliateSession/Click/Conversion/ProviderBookingReference not indexed (Exclusion (§7)) | PASS - search-map.e2e-spec.ts private-data block (guessed ids, tokens, amounts, coordinates, types=TRIP*) + loaders privacy unit test |
| G11-GATE-024 | Unpublished content not indexed (draft/in-review/archived) (Exclusion (§7)) | PASS - search-map.e2e-spec.ts private-data block (guessed ids, tokens, amounts, coordinates, types=TRIP*) + loaders privacy unit test |
| G11-GATE-025 | Private moderation data and secrets not indexed (Exclusion (§7)) | PASS - search-map.e2e-spec.ts private-data block (guessed ids, tokens, amounts, coordinates, types=TRIP*) + loaders privacy unit test |
| G11-GATE-026 | IngestionCandidate never indexed until a canonical public entity exists (Ingestion (§8)) | PASS - search-map.e2e-spec.ts 'ingestion candidates are never public search results' |
| G11-GATE-027 | Provider entities not represented as canonical knowledge; PROVIDER_DATA semantics preserved (Provider (§9)) | PASS - search-map.e2e-spec.ts provider-exclusion test; no provider table is read by any loader |
| G11-GATE-028 | CommunityStory distinguishable via trustClass; never verified/canonical (Community (§10)) | PASS - search-map.e2e-spec.ts community block (trustClass COMMUNITY, after canonical, UNDER_REVIEW/REMOVED hidden, body never projected) |
| G11-GATE-029 | Physical projection justified in audit; projection-only, no better-structured canonical field duplicated blindly (Projection (§11)) | PASS - G11_GLOBAL_SEARCH_MAP.md section 2; physical projection justified in the pre-implementation report section 8 |
| G11-GATE-030 | Deterministic uniqueness (entityKind, entityId); rebuild x2 yields no duplicates (Projection (§12)) | PASS - unique (entityKind, entityId); search-map.e2e-spec.ts rebuild x2 identical snapshot + duplicate rebuild; Path A md5 identical x3 |
| G11-GATE-031 | Translation tables remain content authority; no translations created for search (Translation (§13)) | PASS - loaders only read existing translation rows; unit: no fabricated locale |
| G11-GATE-032 | Term kinds distinguish canonical/localized/alias; aliasType preserved (Alias (§14)) | PASS - SearchTerm kinds CANONICAL_TITLE/LOCALIZED_TITLE/ALIAS with aliasType preserved (unit + e2e) |
| G11-GATE-033 | No alias invented; sensitive aliases keep accepted provenance only (Alias (§15)) | PASS - G11 creates no alias; e2e asserts only the 2 accepted seed aliases exist for Paracel/Spratly |
| G11-GATE-034 | Alias collision: two entities sharing a name both returned, ranked by context (Alias (§16)) | PASS - search-map.e2e-spec.ts 'alias collision' (two entities, one name, both returned) |
| G11-GATE-035 | Hội An -> hoi an retrieval (Vietnamese (§17)) | PASS - unit `search-normalization.util.spec.ts` + e2e accentless / đ-d + Path A HTTP smoke |
| G11-GATE-036 | Đà Nẵng -> da nang retrieval (Vietnamese (§17)) | PASS - unit `search-normalization.util.spec.ts` + e2e accentless / đ-d + Path A HTTP smoke |
| G11-GATE-037 | Thăng Long -> thang long retrieval (Vietnamese (§17)) | PASS - unit `search-normalization.util.spec.ts` + e2e accentless / đ-d + Path A HTTP smoke |
| G11-GATE-038 | đ <-> d matching both directions (Vietnamese (§17)) | PASS - unit `search-normalization.util.spec.ts` + e2e accentless / đ-d + Path A HTTP smoke |
| G11-GATE-039 | Case folding, whitespace and controlled punctuation normalization (Vietnamese (§17)) | PASS - unit `search-normalization.util.spec.ts` + e2e accentless / đ-d + Path A HTTP smoke |
| G11-GATE-040 | Display text is canonical/localized, never the normalized ASCII (Vietnamese (§17)) | PASS - unit `search-normalization.util.spec.ts` + e2e accentless / đ-d + Path A HTTP smoke |
| G11-GATE-041 | NFC and NFD queries return the same results, server-side (Unicode (§18)) | PASS - search-map.e2e-spec.ts NFC vs NFD identical results; Path A NFD query |
| G11-GATE-042 | Actual PostgreSQL unaccent Vietnamese behavior verified; app normalization is authoritative and cross-checked (Unaccent (§19)) | PASS - verified against real PostgreSQL unaccent (pre-implementation report section 4); app normalization authoritative |
| G11-GATE-043 | VI canonical and EN supported; no other locale implemented (Locale (§20)) | PASS - vi canonical + en only; no other locale implemented |
| G11-GATE-044 | Cross-language retrieval only via stored translations/aliases; no LLM/MT (Locale (§21)) | PASS - search-map.e2e-spec.ts cross-language only via stored translations; no LLM/MT anywhere |
| G11-GATE-045 | Missing EN translation not fabricated; requested vs resolved locale exposed (Locale (§22)) | PASS - search-map.e2e-spec.ts missing-translation fallback exposes locale/actualLocale/fallbackUsed |
| G11-GATE-046 | Hoàng Sa, Hoang Sa, Trường Sa, Truong Sa retrieval (Sensitive (§23)) | PASS - search-map.e2e-spec.ts Hoàng Sa/Hoang Sa/Trường Sa/Truong Sa + accepted English aliases + Path A smoke |
| G11-GATE-047 | Paracel/Spratly English aliases retrieved only because they already exist as accepted data (Sensitive (§23)) | PASS - search-map.e2e-spec.ts Hoàng Sa/Hoang Sa/Trường Sa/Truong Sa + accepted English aliases + Path A smoke |
| G11-GATE-048 | No politically sensitive alias/relationship added by G11 (Sensitive (§23)) | PASS - search-map.e2e-spec.ts Hoàng Sa/Hoang Sa/Trường Sa/Truong Sa + accepted English aliases + Path A smoke |
| G11-GATE-049 | No sovereignty/jurisdiction inferred from centroid/bbox/nearest country/provider/geocoder/tile/rank (Political (§24)) | PASS - search-map.e2e-spec.ts sensitive-names block; no sovereignty field; country ids are stored FKs only |
| G11-GATE-050 | Deterministic pipeline: validate, normalize, filters, exact, alias, prefix, FTS, fuzzy, rank, filter, locale, DTO (Pipeline (§25)) | PASS - search.service.ts pipeline + unit `search.service.spec.ts` |
| G11-GATE-051 | Exact strong matches are never displaced by fuzzy matches (Pipeline (§25)) | PASS - search.service.ts pipeline + unit `search.service.spec.ts` |
| G11-GATE-052 | Six relevance tiers implemented in stated order (Ranking (§26)) | PASS - six tiers in SQL + unit/e2e tier assertions |
| G11-GATE-053 | Secondary signals (importance, locale, kind) never override text tier (Ranking (§26)) | PASS - six tiers in SQL + unit/e2e tier assertions |
| G11-GATE-054 | Existing historicalImportance/importance reused; no new scale (Importance (§27)) | PASS - importance = existing historicalImportance/importance (loaders) |
| G11-GATE-055 | Verified is not an arbitrary relevance boost (Trust (§28)) | PASS - trustClass is provenance, never a rank boost (unit + fixed key list) |
| G11-GATE-056 | No affiliate commission/conversion/click signal in search or map ranking (Commercial (§29)) | PASS - search-map.e2e-spec.ts 'no affiliate/commission/click column exists in the projection' |
| G11-GATE-057 | No hidden sponsored ranking (Sponsored (§30)) | PASS - no sponsored logic; ordering key list is fixed (unit) |
| G11-GATE-058 | Entity kind filter (Filters (§31)) | PASS - search-map.e2e-spec.ts kind, country/region/city, period and bbox filters |
| G11-GATE-059 | Country, region, city filters (Filters (§31)) | PASS - search-map.e2e-spec.ts kind, country/region/city, period and bbox filters |
| G11-GATE-060 | Historical period filter (Filters (§31)) | PASS - search-map.e2e-spec.ts kind, country/region/city, period and bbox filters |
| G11-GATE-061 | bbox filter on search (Filters (§31)) | PASS - search-map.e2e-spec.ts kind, country/region/city, period and bbox filters |
| G11-GATE-062 | Trust/source class exposed and filterable via types; no speculative filters (Filters (§31)) | PASS - search-map.e2e-spec.ts kind, country/region/city, period and bbox filters |
| G11-GATE-063 | Deterministic cursor pagination with tamper rejection (Pagination (§32)) | PASS - search-map.e2e-spec.ts pages concatenate = full list; tampered/foreign/other-locale cursors -> 400; unit cursor spec |
| G11-GATE-064 | Stable total order with final entityId tie-break (Pagination (§33)) | PASS - final ORDER BY key ends in entityId (unit); determinism e2e |
| G11-GATE-065 | Raw database score not exposed as authority (Score (§34)) | PASS - score is an opaque tier-derived hint (unit DTO test); matchTier exposed |
| G11-GATE-066 | GET /v1/search per repository conventions, backward compatible response (API (§35)) | PASS - controller + DTO; original response shape preserved additively (e2e regression block) |
| G11-GATE-067 | Suggestions obey publication/privacy/trust boundaries (Suggestions (§36)) | PASS - search-map.e2e-spec.ts suggestions obey the publication boundary; minimal payload |
| G11-GATE-068 | Empty/whitespace query rejected; no corpus enumeration (Empty query (§37)) | PASS - empty/whitespace q -> 400 (unit + e2e + Path A) |
| G11-GATE-069 | Max query length, min fuzzy length, max page size, max filter values documented and enforced (Limits (§38)) | PASS - limits enforced + documented (q<=200, limit<=50, types<=15, ids<=64, fuzzy>=3) |
| G11-GATE-070 | One/two-character fuzzy queries do not run trigram search (Fuzzy (§39)) | PASS - unit: no similarity() for 1-2 char queries; e2e no FUZZY tier for short queries |
| G11-GATE-071 | All SQL parameterized; tsquery built from sanitized tokens only (SQL safety (§40)) | PASS - unit SQL-safety tests + e2e injection matrix (sanitized tsquery, bound params, fixed ORDER BY) |
| G11-GATE-072 | No user-controlled ORDER BY/column/PostGIS expression; allowlists only (SQL safety (§40)) | PASS - unit SQL-safety tests + e2e injection matrix (sanitized tsquery, bound params, fixed ORDER BY) |
| G11-GATE-073 | Map is a projection over canonical geometry; no runtime geometry inference from text (Map (§41)) | PASS - map served from canonical geometry; no text geocoding (map.service.ts) |
| G11-GATE-074 | EPSG:4326 reused; SRIDs never mixed (PostGIS (§42)) | PASS - SRID 4326 only (ST_MakeEnvelope/SetSRID 4326); projection geom column 4326 |
| G11-GATE-075 | Actual canonical geometry types returned (point/polygon/multi) (Geometry (§43)) | PASS - search-map.e2e-spec.ts Point and Polygon features returned as stored |
| G11-GATE-076 | Centroids only for display and never presented as territory/jurisdiction (Centroid (§44)) | PASS - geography points are display points, not territory/jurisdiction (contract + feature semantics) |
| G11-GATE-077 | Feature carries entityKind/id/geometry/title/resolved locale/marker semantic/trust/temporal context (Map feature (§45)) | PASS - feature properties: entityType, layer, trustClass, markerSemantic, locale, chronology (unit + e2e) |
| G11-GATE-078 | Longitude/latitude bounds validated (Bbox (§46)) | PASS - parseBbox util + unit + e2e validation matrix; antimeridian explicitly rejected (unit, e2e, Path A) |
| G11-GATE-079 | Antimeridian-crossing bbox explicitly rejected, never silently mis-queried (Bbox (§46)) | PASS - parseBbox util + unit + e2e validation matrix; antimeridian explicitly rejected (unit, e2e, Path A) |
| G11-GATE-080 | GET /v1/map/features per conventions, backward compatible (Map API (§47)) | PASS - GET /v1/map/features backward compatible (19 legacy assertions unmodified, all pass) + fractional zoom |
| G11-GATE-081 | World/low zoom bounded and density-aware (Zoom (§48)) | PASS - search-map.e2e-spec.ts zoom density + world bbox bounded; unit caps 100/250/500, total 1000 |
| G11-GATE-082 | No persistent cluster identity is exposed as an entity id (Clusters (§49)) | PASS - no cluster id returned (feature ids are canonical ids) |
| G11-GATE-083 | Backend returns semantic type/importance/state only; no CSS/pixel values (Marker (§50)) | PASS - search-map.e2e-spec.ts 'backend returns semantics only' (property-key scan) |
| G11-GATE-084 | Country/Region/City/Destination map features from stored coordinates (Current geography (§51)) | PASS - search-map.e2e-spec.ts current geography opt-in, layer CURRENT_GEOGRAPHY |
| G11-GATE-085 | Territory kept distinct and temporal; never merged into current hierarchy (Historical territory (§52)) | PASS - search-map.e2e-spec.ts Territory layer HISTORICAL, separate; never merged |
| G11-GATE-086 | Period filter returns only justified geometry/relations; no extrapolation (Time-aware map (§53)) | PASS - search-map.e2e-spec.ts strict period block (only TERRITORY/EVENT with known chronology) |
| G11-GATE-087 | Reconstruction/uncertainty semantics preserved; no exactness claim added (Uncertainty (§54)) | PASS - no exactness claim: generalization flagged (geometryGeneralized), stored chronology only |
| G11-GATE-088 | Events mapped only through modeled EventPlace links; no runtime geocoding (Event map (§55)) | PASS - search-map.e2e-spec.ts events only via explicit EventPlace of PUBLISHED places |
| G11-GATE-089 | No person geometry inferred from text (Person map (§56)) | PASS - no person geometry inferred (no person map layer exists) |
| G11-GATE-090 | No runtime NLP extraction; only accepted relationships (Story/Journey map (§57)) | PASS - no story/journey map extraction (no such layer) |
| G11-GATE-091 | Provider features not merged into canonical map (Provider map (§58)) | PASS - provider tables never read by map/search (grep + unit) |
| G11-GATE-092 | Search/map never create AffiliateClick (G10 boundary (§59)) | PASS - search-map.e2e-spec.ts search/map never create AffiliateClick/Session (counts unchanged) |
| G11-GATE-093 | No expense/settlement/financial search (G09 boundary (§60)) | PASS - search-map.e2e-spec.ts no expense/settlement/balance surface in public search/map |
| G11-GATE-094 | Public search never exposes TripLocationSharing/TripMemberLocation (guessed-ID HTTP negatives) (G08 privacy (§61)) | PASS - search-map.e2e-spec.ts G08 non-leak: no projection kind, bbox around the member coordinate returns nothing, response lacks the coordinate |
| G11-GATE-095 | Public map never exposes precise trip-member coordinates (G08 privacy (§61)) | PASS - search-map.e2e-spec.ts G08 non-leak: no projection kind, bbox around the member coordinate returns nothing, response lacks the coordinate |
| G11-GATE-096 | Private trips/memberships/invitations not searchable (G07 privacy (§62)) | PASS - search-map.e2e-spec.ts G07 non-leak (trip title, invitation email, guessed ids) |
| G11-GATE-097 | create/update/publish/unpublish/delete yield deterministic projection state (Lifecycle (§63)) | PASS - search-map.e2e-spec.ts create/update/delete/publish lifecycle; trigger -> queue -> worker |
| G11-GATE-098 | Unpublished content disappears from search and map within the freshness contract (Unpublish (§64)) | PASS - search-map.e2e-spec.ts unpublish -> document deleted; measured 0.4 s with the worker |
| G11-GATE-099 | Idempotent rebuild; twice => identical; no duplicates (Rebuild (§65)) | PASS - search-map.e2e-spec.ts rebuild idempotent (x2); Path A md5 identical |
| G11-GATE-100 | Normal writes do not require full rebuild (Incremental (§66)) | PASS - trigger-fed incremental queue; no full rebuild for normal writes (e2e) |
| G11-GATE-101 | Rebuild concurrent with canonical update cannot lose the update (Concurrency (§67)) | PASS - search-map.e2e-spec.ts rebuild vs canonical update cannot lose an update |
| G11-GATE-102 | Redis is not authority; flushing Redis does not affect correctness (Redis (§68)) | PASS - search-map.e2e-spec.ts flushing Redis leaves search/map results identical; no Redis dependency |
| G11-GATE-103 | If cached, key covers all dimensions; no leakage (decision: no cache, documented) (Cache (§69)) | PASS — NOT APPLICABLE - N/A: no result cache implemented (measured latency did not justify one; contract documents the dimensions a cache would need) |
| G11-GATE-104 | Measured publish/update freshness <= 60 s (Freshness (§70)) | PASS - freshness measured 0.3-1.4 s (worker 500 ms) in e2e; contract <= 60 s |
| G11-GATE-105 | Search p95 <= 300 ms on the benchmark dataset (Performance (§71)) | PASS - perf report: search pooled p95 <= 267 ms, suggestions 98 ms (<= 150), map <= 137 ms (<= 300) |
| G11-GATE-106 | Suggestions p95 <= 150 ms (Performance (§71)) | PASS - perf report: search pooled p95 <= 267 ms, suggestions 98 ms (<= 150), map <= 137 ms (<= 300) |
| G11-GATE-107 | Map bbox p95 <= 300 ms (Performance (§71)) | PASS - perf report: search pooled p95 <= 267 ms, suggestions 98 ms (<= 150), map <= 137 ms (<= 300) |
| G11-GATE-108 | Disposable synthetic dataset of at least 50k documents/features (Perf dataset (§72)) | PASS - perf report: 78,110 documents / 82,010 entities (>= 50k), synthetic, disposable |
| G11-GATE-109 | EXPLAIN (ANALYZE, BUFFERS) for exact, accent-insensitive, prefix/FTS, fuzzy, bbox, period queries (Query plans (§73)) | PASS - perf report section 5: EXPLAIN (ANALYZE, BUFFERS) for exact, accent, prefix/FTS, fuzzy, bbox, period and map queries |
| G11-GATE-110 | Only evidence-backed indexes added (Indexes (§74)) | PASS - perf report sections 4/5: every index has measured evidence; Country/Region point indexes removed |
| G11-GATE-111 | postgis/pg_trgm/unaccent audited; migration ensures state safely (Extensions (§75)) | PASS - migration uses IF NOT EXISTS; pre-implementation report section 4 |
| G11-GATE-112 | Low/medium/high zoom benchmarked with hard feature bounds (Map scale (§76)) | PASS - perf report: low/medium/high zoom benchmarked with hard bounds |
| G11-GATE-113 | No oversized unsimplified polygon payload at low zoom; canonical geometry never replaced (Geometry payload (§77)) | PASS - responses <= 118 KB; territory generalization at low zoom; canonical geometry unchanged (e2e) |
| G11-GATE-114 | Deterministic chronology-ordinal overlap; no lexicographic date comparison (Period (§78)) | PASS - chronology-ordinal overlap (unit + e2e); no lexical comparison |
| G11-GATE-115 | Unknown date does not match every period (new period params); legacy year semantics preserved (Unknown dates (§79)) | PASS - search-map.e2e-spec.ts unknown date never matches strict period; legacy `year` semantics unchanged |
| G11-GATE-116 | BCE handled via chronology ordinals, not JS Date (BCE/CE (§80)) | PASS - search-map.e2e-spec.ts BCE search + map through ordinals (no Date) |
| G11-GATE-117 | Search/map/admin routes rate limited via accepted infrastructure (Rate limit (§81)) | PASS - search-map.e2e-spec.ts rate-limiting block (429); admin routes throttled |
| G11-GATE-118 | No per-user search history stored (Search log (§82)) | PASS - search-map.e2e-spec.ts no query-history table; metrics contain no query text |
| G11-GATE-119 | Latency/count/zero-result/rebuild-duration/freshness observable without profiling (Metrics (§83)) | PASS - SearchMetricsService + admin status (latency, zero-result rate, queue depth, oldest queued age, last run) |
| G11-GATE-120 | Snippets derive from stored canonical text; none generated (Snippets (§84)) | PASS - snippet = stored canonical summary truncated to 240 chars (unit + e2e) |
| G11-GATE-121 | No LLM/AI used for translations, aliases, facts, sovereignty, geocoding, rank or geometry (AI (§85)) | PASS - no LLM/AI usage anywhere in G11 |
| G11-GATE-122 | Explicit DTOs; no raw Prisma records (DTO (§86)) | PASS - explicit DTO mapping (`SearchResultItem`); unit key-set assertion |
| G11-GATE-123 | Public endpoint returns public data only; no includeUnpublished flag; admin routes ADMIN-only (Authorization (§87)) | PASS - search-map.e2e-spec.ts includeUnpublished/status/sort/orderBy rejected 400; admin routes ADMIN-only |
| G11-GATE-124 | Same state+query+filters+locale => same search order; same bbox+zoom+filters => same map result (Determinism (§88)) | PASS - search-map.e2e-spec.ts determinism blocks (search + map) |
| G11-GATE-125 | Real PostgreSQL proof of FTS (Real DB (§89)) | PASS - search-map.e2e-spec.ts real PostgreSQL proofs for FTS, trigram, normalization, alias, PostGIS, temporal, lifecycle, rebuild, concurrency, recovery |
| G11-GATE-126 | Real PostgreSQL proof of trigram (Real DB (§89)) | PASS - search-map.e2e-spec.ts real PostgreSQL proofs for FTS, trigram, normalization, alias, PostGIS, temporal, lifecycle, rebuild, concurrency, recovery |
| G11-GATE-127 | Real PostgreSQL proof of normalization (Real DB (§89)) | PASS - search-map.e2e-spec.ts real PostgreSQL proofs for FTS, trigram, normalization, alias, PostGIS, temporal, lifecycle, rebuild, concurrency, recovery |
| G11-GATE-128 | Real PostgreSQL proof of alias lookup (Real DB (§89)) | PASS - search-map.e2e-spec.ts real PostgreSQL proofs for FTS, trigram, normalization, alias, PostGIS, temporal, lifecycle, rebuild, concurrency, recovery |
| G11-GATE-129 | Real PostGIS proof of bbox and geometry (Real DB (§89)) | PASS - search-map.e2e-spec.ts real PostgreSQL proofs for FTS, trigram, normalization, alias, PostGIS, temporal, lifecycle, rebuild, concurrency, recovery |
| G11-GATE-130 | Real proof of temporal filter (Real DB (§89)) | PASS - search-map.e2e-spec.ts real PostgreSQL proofs for FTS, trigram, normalization, alias, PostGIS, temporal, lifecycle, rebuild, concurrency, recovery |
| G11-GATE-131 | Real proof of index lifecycle and rebuild idempotency (Real DB (§89)) | PASS - search-map.e2e-spec.ts real PostgreSQL proofs for FTS, trigram, normalization, alias, PostGIS, temporal, lifecycle, rebuild, concurrency, recovery |
| G11-GATE-132 | Real proof of rebuild concurrency and transaction/recovery behavior (Real DB (§89)) | PASS - search-map.e2e-spec.ts real PostgreSQL proofs for FTS, trigram, normalization, alias, PostGIS, temporal, lifecycle, rebuild, concurrency, recovery |
| G11-GATE-133 | Rebuild vs canonical update (Concurrency (§90)) | PASS - search-map.e2e-spec.ts rebuild/update, publish, unpublish, duplicate rebuild, concurrent incremental updates |
| G11-GATE-134 | Publish vs search refresh (Concurrency (§90)) | PASS - search-map.e2e-spec.ts rebuild/update, publish, unpublish, duplicate rebuild, concurrent incremental updates |
| G11-GATE-135 | Unpublish vs search refresh (Concurrency (§90)) | PASS - search-map.e2e-spec.ts rebuild/update, publish, unpublish, duplicate rebuild, concurrent incremental updates |
| G11-GATE-136 | Duplicate rebuild (Concurrency (§90)) | PASS - search-map.e2e-spec.ts rebuild/update, publish, unpublish, duplicate rebuild, concurrent incremental updates |
| G11-GATE-137 | Concurrent incremental updates; no permanently stale/lost projection (Concurrency (§90)) | PASS - search-map.e2e-spec.ts rebuild/update, publish, unpublish, duplicate rebuild, concurrent incremental updates |
| G11-GATE-138 | Projection failure leaves canonical safe; retry/rebuild restores (Recovery (§91)) | PASS - search-map.e2e-spec.ts forced projection failure + retry, corrupted row repaired by rebuild |
| G11-GATE-139 | Fresh DB: all migrations, seed x2, rebuild x2, build, boot, HTTP smoke (VI, accentless, EN, alias, historical, bbox, privacy) (Path A (§92)) | PASS - Path A executed on a fresh DB: 24 migrations, seed x2 identical, rebuild x2 md5-identical, build, boot, HTTP smoke, DB dropped |
| G11-GATE-140 | Temporary database dropped (Path A (§92)) | PASS - Path A executed on a fresh DB: 24 migrations, seed x2 identical, rebuild x2 md5-identical, build, boot, HTTP smoke, DB dropped |
| G11-GATE-141 | Before/after proof on accepted pre-G11 dev baseline: hashes/counts of geography, knowledge, G07, G08, G09, G10 (Path B (§93)) | PASS - Path B executed on the dev DB: before/after identical except migrations 23->24, 33 triggers, new tables |
| G11-GATE-142 | Safe tooling; DATABASE_URL != SHADOW_DATABASE_URL; live DB never a shadow DB (Migration (§94)) | PASS - prisma migrate diff --from-url (no shadow DB); DATABASE_URL != shadow; 23 accepted migration checksums unchanged |
| G11-GATE-143 | No G00-G10 migration modified (Migration (§94)) | PASS - prisma migrate diff --from-url (no shadow DB); DATABASE_URL != shadow; 23 accepted migration checksums unchanged |
| G11-GATE-144 | No destructive DROP/rename of accepted schema (Additive (§95)) | PASS - additive migration only (3 enums, 4 tables, indexes, triggers); no DROP/rename of accepted schema |
| G11-GATE-145 | Production Golden Dataset not polluted; synthetic data disposable (Seed (§96)) | PASS - Golden seed untouched; perf data lives in the disposable dauviet_perf database |
| G11-GATE-146 | Vietnamese normalization, d/đ, NFC/NFD unit tests (Unit (§97)) | PASS - unit specs: normalization, locale, alias, ranking, tie-break, publication, trust, provider, period, bbox, cursor, DTO, privacy |
| G11-GATE-147 | Locale resolution, alias semantics, ranking tiers, stable tie-break unit tests (Unit (§97)) | PASS - unit specs: normalization, locale, alias, ranking, tie-break, publication, trust, provider, period, bbox, cursor, DTO, privacy |
| G11-GATE-148 | Publication filtering, trust/provider separation, privacy exclusions unit tests (Unit (§97)) | PASS - unit specs: normalization, locale, alias, ranking, tie-break, publication, trust, provider, period, bbox, cursor, DTO, privacy |
| G11-GATE-149 | Period logic, bbox validation, antimeridian, pagination/cursor, DTO unit tests (Unit (§97)) | PASS - unit specs: normalization, locale, alias, ranking, tie-break, publication, trust, provider, period, bbox, cursor, DTO, privacy |
| G11-GATE-150 | Exact canonical, localized, accentless, alias, prefix, fuzzy-threshold search over real HTTP (E2E (§98)) | PASS - search-map.e2e-spec.ts (114 tests) covers every listed scenario over real HTTP |
| G11-GATE-151 | Entity filters, locale fallback (E2E (§98)) | PASS - search-map.e2e-spec.ts (114 tests) covers every listed scenario over real HTTP |
| G11-GATE-152 | Unpublished and ingestion-candidate exclusion (E2E (§98)) | PASS - search-map.e2e-spec.ts (114 tests) covers every listed scenario over real HTTP |
| G11-GATE-153 | Provider/canonical and community/trust separation (E2E (§98)) | PASS - search-map.e2e-spec.ts (114 tests) covers every listed scenario over real HTTP |
| G11-GATE-154 | Historical/current geography separation; bbox map; zoom density; historical period (E2E (§98)) | PASS - search-map.e2e-spec.ts (114 tests) covers every listed scenario over real HTTP |
| G11-GATE-155 | G08, G07, G09, G10 private-data non-leak (E2E (§98)) | PASS - search-map.e2e-spec.ts (114 tests) covers every listed scenario over real HTTP |
| G11-GATE-156 | Full unit suite green; no assertion weakened (Regression (§99)) | PASS - full unit 98/98 (1352 tests) and full sequential e2e 12/12 (271 tests) |
| G11-GATE-157 | Full sequential E2E green (Regression (§99)) | PASS - full unit 98/98 (1352 tests) and full sequential e2e 12/12 (271 tests) |
| G11-GATE-158 | G10: affiliate pipeline unchanged; commercial data not a rank signal or searchable; fixture provider works (Regression (§100)) | PASS - search-map.e2e-spec.ts affiliate boundary block + affiliate.e2e-spec.ts green in the full run |
| G11-GATE-159 | G09: no financial data exposed globally (Regression (§101)) | PASS - search-map.e2e-spec.ts G09 boundary + trip-expense.e2e-spec.ts green |
| G11-GATE-160 | G08: no location leakage (P0) (Regression (§102)) | PASS - search-map.e2e-spec.ts G08 non-leak (P0) + trip-location.e2e-spec.ts green |
| G11-GATE-161 | G07: no private trip leakage (Regression (§103)) | PASS - search-map.e2e-spec.ts G07 non-leak + trips.e2e-spec.ts green |
| G11-GATE-162 | G06.5: IngestionCandidate private; no GeoNames/Google credential needed (Regression (§104)) | PASS - search-map.e2e-spec.ts ingestion exclusion; no GeoNames/Google credential used |
| G11-GATE-163 | G05: provider entity/offer remains PROVIDER_DATA and separate (Regression (§105)) | PASS - stay-food-activities + provider-activation e2e green; provider separation e2e |
| G11-GATE-164 | G03/G04 trust/citation/publication semantics intact (Regression (§106)) | PASS - contribution-catalogue + destination-composition e2e green; trust semantics unchanged |
| G11-GATE-165 | G01 hierarchy remains canonical and separate from historical territory (Regression (§107)) | PASS - geography-filters e2e green; current/historical separation e2e |
| G11-GATE-166 | Regenerated from the real app; exact path count reported vs 311 and every change explained (OpenAPI (§108)) | PASS - openapi.json regenerated from the real app: 314 paths (+3 admin projection routes); openapi-contract spec green |
| G11-GATE-167 | SQL injection, tsquery injection, sort/filter injection tests (Security (§109)) | PASS - search-map.e2e-spec.ts injection/tsquery/sort/geometry/bbox/pagination/enumeration/guessed-id blocks |
| G11-GATE-168 | Invalid geometry, oversized bbox/query, pathological fuzzy query tests (Security (§109)) | PASS - search-map.e2e-spec.ts injection/tsquery/sort/geometry/bbox/pagination/enumeration/guessed-id blocks |
| G11-GATE-169 | Pagination tampering, unpublished enumeration, private ID guessing tests (Security (§109)) | PASS - search-map.e2e-spec.ts injection/tsquery/sort/geometry/bbox/pagination/enumeration/guessed-id blocks |
| G11-GATE-170 | Secret/privacy scan of changed files/docs/logs is clean (Scan (§110)) | PASS - secret/privacy scan clean (final report) |
| G11-GATE-171 | frontend-pass-10/ and other concurrent files untouched (Working tree (§111)) | PASS - frontend-pass-10 untouched (a separate concurrent repo) |
| G11-GATE-172 | No git mutation command used (Git (§112)) | PASS - read-only git commands only |
| G11-GATE-173 | G12 not started (Scope (§113)) | PASS - G12 not started |
| G11-GATE-174 | No frontend redesign (Scope (§114)) | PASS - no frontend change; only backend + docs |
| G11-GATE-175 | No GeoNames/Google/Booking/Agoda/Viator credential acquired or required (Scope (§116)) | PASS - no GeoNames/Google/Booking/Agoda/Viator credential acquired or required |
| G11-GATE-176 | Gate manifest derived before implementation (Manifest (§117)) | PASS - manifest created before implementation |
| G11-GATE-177 | All five G11 docs created; handoff/roadmap/authorization/openapi updated (Documents (§118)) | PASS - five G11 docs created; handoff/roadmap/authorization/openapi updated |
| G11-GATE-178 | G11_PERFORMANCE_REPORT.md contains every required element (Performance report (§119)) | PASS - G11_PERFORMANCE_REPORT.md sections 1-7 |
| G11-GATE-179 | G11_FINAL_REPORT.md contains every required element (Final report (§120)) | PASS - G11_FINAL_REPORT.md covers every required element |
| G11-GATE-180 | Prisma validate, typecheck, lint, build, real app boot pass (Validation (§121)) | PASS - prisma validate, tsc, eslint, nest build, real app boot, full unit + e2e: all clean; no P0/P1 |
| G11-GATE-181 | No P0/P1 outstanding (Validation (§121)) | PASS - prisma validate, tsc, eslint, nest build, real app boot, full unit + e2e: all clean; no P0/P1 |
| G11-GATE-182 | Verdict is exactly one allowed state, justified by evidence (Verdict (§122)) | PASS - verdict COMPLETE, justified in the final report |
| G11-GATE-183 | G12 NOT STARTED; Backend V2 Freeze NOT claimed; G11 not marked LOCKED (After G11 (§123)) | PASS - G12 NOT STARTED; Backend V2 Freeze NOT claimed; G11 not marked LOCKED |
| G11-GATE-184 | No STOP condition silently bypassed (Stop (§124)) | PASS - no STOP condition reached |
