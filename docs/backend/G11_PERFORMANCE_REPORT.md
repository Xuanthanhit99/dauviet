# G11 — Global Search & Map: Performance Report

Local, warm-database measurement on a disposable synthetic dataset. **Not** a claim about production internet latency.
Harness: `apps/api/test/perf/g11-benchmark.ts`. Dataset generator: `scripts/g11-perf/perf-load.sql`.
Both are test-only; the dataset lives in a throwaway database (`dauviet_perf`) and is never part of the Golden Dataset seed.

## 1. Environment

| Item | Value |
|---|---|
| Host | Windows 10 Pro 19045, Intel Core i7-8565U (4 cores / 8 threads, 1.8 GHz), 15.8 GB RAM (≈1.6 GB free during runs) |
| Database | PostgreSQL 16.4 in Docker Desktop (`postgis/postgis:16-3.4-alpine`), PostGIS 3.4.3 |
| Extensions | `postgis` 3.4.3, `pg_trgm` 1.6, `unaccent` 1.1 (all present before G11; migration uses `IF NOT EXISTS`) |
| Runtime | Node v22.17.0, NestJS 10, Prisma 5.20, real HTTP stack (supertest against the booted `AppModule`, same machine, no network) |
| Host load | **Shared laptop, ≈ 80 % CPU busy from unrelated applications** (Visual Studio/Roslyn, Chrome, chat apps). A control class (`GET /v1/health`) is measured in every round to quantify the noise floor; its p95 was 9–11 ms in the final run |

## 2. Dataset and method

- Canonical rows (deterministic `hashtext`-based pseudo-random SQL): **50,000 Place** (PostGIS points across a 60°×40° area, 50k vi + 25k en translations, 12,500 aliases, importance 0–10, 8 % DRAFT),
  10,000 Person, 10,000 HistoricalEvent (8,000 `EventPlace` links, chronology ordinals incl. BCE), 5,000 City, 2,000 Region,
  2,000 Territory polygons (32-segment buffers), 3,000 Story, 10 Country. Names are three Vietnamese syllables (≈80 syllables with diacritics) plus a number,
  so tokens are **far more repetitive than real data** (a deliberately harsh case for FTS/trigram).
- The projection was built by the **real** `SearchProjectionService.rebuildAll` (not inserted by hand): **82,010 entities processed → 78,110 public documents / 112,663 terms**
  (≥ 50k target met). Rebuild took **693 s** (#1) and **765 s** (#2, idempotent re-run) at concurrency 6, i.e. ≈ 8.4–9.3 ms/entity, on the noisy host.
- Warm-up: 30 requests per class. Sampling: **6 interleaved rounds × 60 sequential requests = 360 samples per class**, so host noise is spread across classes.
  Reported: pooled p50/p95/p99/max and the per-round p95 (min / median / max).
- 12 search classes (exact canonical, accent-insensitive, exact alias, prefix, out-of-order FTS, one-character typo, common 2-char prefix, types+country filter, period filter, bbox filter, broad-token page, suggestions) and 8 map classes (world/country/regional/city/street zoom, geography layers, generalized territories, strict period).

## 3. Results (final code, 360 samples per class)

| Class | p50 | p95 | p99 | max | round-p95 min / med / max | Target | Verdict |
|---|---:|---:|---:|---:|---|---|---|
| CONTROL `GET /v1/health` (noise floor) | 7.5 | 10.7 | 13.1 | 27 | 8 / 11 / 13 | – | – |
| search: exact canonical | 38.7 | 72.6 | 102.7 | 121 | 52 / 78 / 95 | p95 ≤ 300 | PASS |
| search: accent-insensitive | 38.6 | 65.6 | 98.7 | 129 | 57 / 68 / 99 | ≤ 300 | PASS |
| search: exact alias | 63.9 | 112.9 | 139.0 | 168 | 65 / 104 / 141 | ≤ 300 | PASS |
| search: prefix (3 of 4 tokens) | 24.9 | 54.0 | 76.5 | 95 | 38 / 53 / 80 | ≤ 300 | PASS |
| search: FTS multi-token, out of order | 38.3 | 77.2 | 102.2 | 330 | 54 / 86 / 99 | ≤ 300 | PASS |
| search: fuzzy (1-char typo) | 32.2 | 54.8 | 84.1 | 112 | 38 / 52 / 97 | ≤ 300 | PASS |
| search: common short prefix ("ha") | 43.9 | 77.0 | 107.1 | 122 | 59 / 76 / 115 | ≤ 300 | PASS |
| search: types + country filter | 55.6 | 133.7 | 218.2 | 280 | 116 / 143 / 183 | ≤ 300 | PASS |
| search: period filter (CE) | 33.8 | 72.4 | 89.9 | 132 | 51 / 60 / 92 | ≤ 300 | PASS |
| search: bbox filter | 40.6 | 81.8 | 110.5 | 129 | 62 / 86 / 101 | ≤ 300 | PASS |
| search: broad-token page ("nhan vat", 10k matches) | 154.6 | 267.4 | 367.8 | 436 | 190 / 269 / 368 | ≤ 300 | PASS (pooled); one round 368 |
| suggestions | 49.0 | 98.3 | 154.7 | 221 | 72 / 95 / 156 | ≤ 150 | PASS (pooled); one round 156 |
| map: world zoom 2 (bbox = whole world) | 57.8 | 121.5 | 196.4 | 259 | 68 / 93 / 222 | ≤ 300 | PASS |
| map: country zoom 5.4 | 52.0 | 79.1 | 108.9 | 122 | 63 / 98 / 105 | ≤ 300 | PASS |
| map: regional zoom 8.2 | 53.8 | 85.2 | 105.7 | 112 | 71 / 85 / 98 | ≤ 300 | PASS |
| map: city zoom 12.5 | 23.7 | 38.9 | 52.1 | 61 | 24 / 38 / 49 | ≤ 300 | PASS |
| map: street zoom 15 | 16.6 | 23.1 | 45.0 | 47 | 22 / 24 / 45 | ≤ 300 | PASS |
| map: geography layers zoom 6 | 34.6 | 48.6 | 53.4 | 83 | 43 / 50 / 53 | ≤ 300 | PASS |
| map: territories zoom 5 (generalized) | 33.9 | 59.2 | 79.9 | 95 | 43 / 50 / 84 | ≤ 300 | PASS |
| map: strict period events + territories | 85.8 | 136.7 | 163.4 | 215 | 108 / 145 / 158 | ≤ 300 | PASS |

All values in milliseconds; **zero non-200 responses** in the final run. Map payloads: ≤ 118 KB (≤ 280 features).
Target verdict: **met on every class by pooled p95**. In two classes one individual round's p95 exceeded its target
(broad-token page 368 ms in one round; suggestions 156 ms in one round) - rounds that also show the highest control jitter; reported, not hidden.

## 4. What the measurements changed (defects found by measuring)

| # | Evidence | Change | Effect |
|---|---|---|---|
| 1 | First run: accent-insensitive p95 539 ms, FTS 600, suggestions 348 (target 150). `EXPLAIN ANALYZE`: exact/prefix/FTS branches ≈ 0.5 ms total, the **trigram-fuzzy branch ≈ 108–140 ms** (≈ 7k GIN candidates rechecked) and it ran for every query | Fuzzy is now a **top-up**: evaluated only when fewer than 10 strong (tier 1–5) candidates exist. The count is identical on every page of a query, so pagination stays deterministic and a strong match can never be displaced | Exact/accent p95 539 → ≈ 70 ms |
| 2 | Trigram GIN scan at the default threshold 0.3: **140 ms**; at 0.5: **21 ms** (long names), short names similar | `pg_trgm.similarity_threshold = 0.5`, set **transaction-locally** | Fuzzy branch 140 → ≈ 20 ms; a one-character typo in a normal-length name still qualifies |
| 3 | FTS on a 2-character token (`ha:*`) ≈ 100 ms server-side, adds nothing beyond the prefix branch | FTS skipped for queries under 3 normalized characters | "ha" class p95 ≈ 380 → 77 ms |
| 4 | World-zoom map p95 **646 ms** although the place query is 8–17 ms server-side. Reproduced in psql: a **generic** (cached prepared-statement) plan picks the GiST bitmap for the whole-world bbox: **53.9 ms vs 8.0 ms** with a custom plan. Forcing custom plans on the DB: p95 646 → 66 ms | Map and search run in one short transaction with a **transaction-local `plan_cache_mode = force_custom_plan`** (no global/DB change) | World zoom p95 646 → 122 ms |
| 5 | `Country`/`Region` point indexes: Region 2k rows 0.23 vs 1.7 ms, Country a few hundred rows | Those two indexes were **removed** from the migration (not evidence-backed) | – |
| 6 | Destination (20k rows) 0.6 ms with `Destination_point_gist` vs 23 ms without; City (5k) 0.36 vs 7.3 ms | `City_point_gist`, `Destination_point_gist` **kept** | – |

## 5. Query plans (`EXPLAIN (ANALYZE, BUFFERS)`, planned under the same settings the service uses)

Server-side execution time of the representative search queries: exact/accent-insensitive **19.5 ms**, prefix + FTS **28.0 ms**, fuzzy **10.3 ms**,
period filter **16.5 ms**, bbox filter **24.5 ms**. Map: place bbox world **8–17 ms**, country **≈ 19 ms**, city **2 ms**, strict-period events **18 ms**,
strict-period territories **37 ms** (generalization), geography City **0.36 ms**.

Indexes used across the search plans (counts of plan nodes): `SearchDocument_pkey` (20), `SearchTerm_normalizedText_c` (10; equality + byte-order prefix range),
`SearchTerm_normalizedText_trgm` (5; trigram GIN), `SearchDocument_fts_idx` (5; FTS GIN), `SearchDocument_geom_gist` (1), `SearchDocument_chronologyStart_chronologyEnd_idx` (1).
Map plans use `Place_historicalImportance_idx`, `Place_location_gist`, `Territory_geometry_gist`, `Territory_chronologyStart_idx`, `HistoricalEvent_importance_idx`, `City_point_gist`.

**Sequential scans found:** none in any search plan. One in the map: the strict-period event query seq-scans `HistoricalEvent` (10k rows, 3.3 ms) and `EventPlace`
(8k rows, 1.3 ms) - cheaper than the index at this size; to be re-checked if events grow past ~10^6. The planner also needs the custom-plan setting (change #4) to avoid a
bad generic plan on wide bboxes.

## 6. Freshness and rebuild (from the e2e suite, real PostgreSQL)

Background worker at a 500 ms interval: publish → searchable **1.4 s**, rename → searchable **0.3 s**, unpublish → gone **0.4 s**
(production default interval 2 s → expected ≈ 2–3 s; contract ≤ 60 s). Rebuild throughput ≈ 110–120 entities/s (≈ 12 min for 82k entities on this host);
incremental updates never require a rebuild. Write-side trigger overhead was **not** separately measured (one trivial queue upsert per changed row).

## 7. Limitations

- Single noisy laptop; Docker Desktop VM; client and server on the same machine; no network, no TLS, no concurrent-user load test (requests were sequential). Absolute numbers on a server will differ.
- Synthetic data with repetitive tokens; real data will have fewer very-common-token queries (the broad-token class is the worst case here).
- Two earlier runs contained clock-jump artifacts (`max` values of several million ms, one isolated non-reproducible `400` coinciding with a ≈ 109-minute wall-clock jump; a replay of all 500 sampled aliases returned 0 non-200); they are excluded from the tables above, which come from a run with zero non-200 responses.
- Percentiles are over 360 samples per class; p99/max are indicative only.
- The 50k+ target is met for search documents (78,110) and for map features (50,000 Place points + 10,000 events + 2,000 territories + 5,000 cities + 2,000 regions). Millions-scale behavior is not claimed.
