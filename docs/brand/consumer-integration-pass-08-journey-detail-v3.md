# Consumer Integration Pass #8 — Journey Detail V3

Date: 2026-09-22
Status: **CLOSED_PRODUCTION_QA_PASS**
Route: `/journeys/[slug]`

## Baseline and contract

Journey V3 follows Story Explorer V4 in the locked Web surface order in `consumer-integration-pass-01-inventory-mapping.md`. Pass #7 has a passing local production build, typecheck and 34/34 Chromium suite. Both passes are CLOSED_PRODUCTION_QA_PASS with the new CI evidence below. Existing brand colors/typography/motion, real-media rules and MapLibre/OpenFreeMap architecture are reused. The repository has the locked version inventory and brand contracts, but no standalone Journey V3 pixel reference board; no pixel-perfect claim is made.

Read-only contract evidence: `docs/backend/EDITORIAL_CONTENT.md` sections 9–11; `docs/backend/openapi.json`; existing Journey controller/service public DTO; existing Media controller/service public DTO. No backend implementation or generated contract changed.

Existing public reads:
- `GET /v1/journeys/{slug}?locale=vi`
- `GET /v1/media/{id}` for the exact hero MediaAsset

## Product implementation

An editorial hero introduces the Journey, supplied region and summary, published media with nearby rights/provenance/disclosure, and duration/distance/difficulty only when actually supplied. Unknown values remain explicit. The narrative introduction renders plain text safely with paragraph breaks.

An ordered stop sequence is sorted by the API's `order`, with supplied place names/title overrides, original editor notes, per-stop duration when supplied, and exact Place/Story/Event links. Numeric labels represent sequence, not fabricated historical chronology. No recommendations, travel times or related entities are inferred.

MapLibre displays numbered stop markers at actual valid API coordinates. Null/non-finite/out-of-range coordinates are excluded and disclosed in the list. Map/list selection is synchronized, keyboard operable and announced; list selection moves focus to the spatial section, and marker activation restores focus to the corresponding stop. The map includes navigation/attribution, a show-all action, static reduced-motion behavior and a list alternative when the basemap fails. There is no route polyline or invented road geometry.

Desktop uses a stop sequence alongside sticky spatial context. Tablet/mobile use a single flow with readable text, wrapping, 44px controls and all context available without hover. Loading, error/retry, empty data, partial coordinates and resolved-language fallback are explicit.

## Trust and remaining dependencies

- Media is fetched by exact CMS ID and rendered only when public/ready with usable declared rights, provenance and a returned HTTP(S) URL. Original aspect ratio and nearby attribution/disclosure are retained. Missing/failed media uses text, never a substitute image.
- The API supplies `routeGeometrySource` but no route coordinates. The source is disclosed as recorded metadata; it does not authorize the frontend to invent a route.
- No dedicated Journey source/citation list is returned. Readers can follow supplied Place/Story references; those references do not certify the whole Journey.
- No opening hours, ticket prices, bookings, transport modes, segment travel times or audio transcripts are returned by the consumed contracts.
- Stop titles/notes have no per-stop translation metadata. They remain in the editor's supplied language with a notice; only the Journey translation receives its resolved language tag.
- Story/Event relationship payloads have slugs rather than localized titles. Event detail belongs to a later locked pass.
- No world/country/destination hierarchy is inferred from the free-text Journey `region`.

## QA

Final local production-server validation: Web typecheck PASS; Next production build PASS; full Playwright Chromium suite **43/43 PASS**, 1.1 minutes, zero failures/retries. HTTP smoke checks for /, /map, /stories/[slug], /journeys/[slug] all returned 200. Actual 390×844, 834×1112 and 1536×960 screenshots were reviewed. A mobile two-digit stop number wrap found visually was repaired and checked again. Final screenshots: apps/web/qa-evidence/pass-08/journey-{390,834,1536}.png. Tests use contract-shaped interception and a neutral basemap style for deterministic screenshots; they do not claim provider tile availability, live database verification or pixel-perfect equivalence.

**BACKEND CHANGED: NO** by this task. Existing/concurrent backend edits are preserved.

## Current-main reconciliation

Read GitHub main at f2c62c3431c8e4a6835a9d82ba2f336dc04603bd and all five commits since local HEAD 9a16e4a. Existing remote Journey route, hero, description, region/metrics, ordered stops, Place/Story/Event links, coordinate text, duration formatting, disclosures and pending registry entry were reviewed. Refinements preserve those capabilities and add the spatial panel, media resolution and accessibility. A real remote product defect is corrected: routeGeometrySource alone previously claimed published route geometry; the public DTO returns no geometry, so the page now explicitly says none is available even when the provenance label exists.

No shared checkout pull/merge/reset or history operation was performed, because backend work is concurrently dirty. No newer remote backend files were restored into the workspace. The remote Pass #8 implementation metadata is retained and extended in the local registry.

## Verified publication and CI closure

[Consumer QA 35715276514](https://github.com/Xuanthanhit99/dauviet/actions/runs/35715276514), job [106705186638](https://github.com/Xuanthanhit99/dauviet/actions/runs/35715276514/job/106705186638), passed on commit `2387820c623fe5320accc1dee2c466886b261a99`. All 43 Chromium tests passed (16.7 seconds), along with web typecheck/build/smoke, admin typecheck/build and mobile typecheck. This new run is the closure evidence.

Pass #8: **CLOSED_PRODUCTION_QA_PASS**. Country Detail V1 remains unstarted, per the current publication-only instruction.
