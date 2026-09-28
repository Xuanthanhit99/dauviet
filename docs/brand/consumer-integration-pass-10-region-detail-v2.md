# Consumer Integration Pass #10 — Region Detail V2

Starting local and remote main: `9931a163234561fef53944d9c900e1518ce4f328`.
Status: **CLOSED_PRODUCTION_QA_PASS**.

## Contract discovery (read only)

The locked Region V2 is named in the Pass #1 inventory and Pass #9 registry next state. No separate Region screen specification or ordered post-Region inventory exists in this checkout. The supplied Pass #10 specification guides implementation, together with canonical brand packages. Route `/regions/[slug]` follows the canonical Region slug and existing entity detail route convention.

Verified against OpenAPI, Region/City/Destination controllers and services, and locale resolution:

- `GET /v1/regions/{slug}?locale=vi|en`: published Region only; missing/unpublished returns 404. Fields: id, slug, type, code, status, country {id,slug,iso2}, nullable parentRegion {id,slug}, nullable location {latitude,longitude}, resolved translation, meta {requestedLocale,resolvedLocale,fallbackApplied}. Translation includes locale/name/slug/summary/description/SEO/method; resolvedLocale can be null. No localized Country name is included, so the supplied ISO2 identifies the Country link.
- `GET /v1/destinations?region={slug}&locale=vi|en&page=N&pageSize=12`: backend resolves Region slug and filters published destinations. Items: id, slug, type, name, tagline, importance, placeCount, storyCount. Counts represent linked records, not necessarily published children; UI deliberately omits them and does not interpret importance as recommendation.
- `GET /v1/cities?region={slug}&locale=vi|en&page=N&pageSize=12`: published cities, fields id/slug/name/timezone. Cities are non-clickable geographic context.
- `GET /v1/regions?parentRegion={slug}&locale=vi|en&page=N&pageSize=12`: published immediate child regions, fields id/slug/type/name. Linked to the same Region detail surface.

All lists expose items/page/pageSize/total/totalPages. List translations resolve server-side but omit per-item locale metadata; frontend does not invent it. No `/regions/{slug}/...` subresource endpoints exist. Invalid filters return 404, never intentionally broaden the request.

## Limits

No Region media relationship, ready/public/rights/provenance metadata, citations, facts, epistemic certainty, boundary, route geometry, or direct Places/Stories/Journeys/People/Events/Culture relationships are exposed. Destination and City list DTOs have no coordinates or media. No child detail crawling, external boundaries, substitute media, inferred facts, or inferred connections are used. PublishedMedia was reviewed; without an exact MediaAsset relationship it is intentionally not invoked.

Backend locale selection currently supports vi/en only. Future locale text must wrap safely, but translation availability is never assumed. Parent references lack localized names; canonical identifiers are used without translating them.

The Region service checks the Region publication state; it does not separately publication-filter the embedded Country/parentRegion reference. The frontend links the exact supplied slug, and makes no claim about the linked profile's availability. Related lists independently enforce published status.

## Implemented experience

The server route resolves the slug and VI/EN interface choice; a focused client component handles runtime API requests, retries and pagination using existing API-envelope/credential patterns. Identity appears immediately without waiting for relationship requests. Each list loads independently, distinguishes a failed request from an empty collection, retains loaded records on a later-page failure, and retries that same page. Lists append and deduplicate by backend id.

The editorial no-media hero establishes World → supplied Country ISO2/link → localized Region name. A separate identity rail shows supplied code/type/parent Region only. Understand renders the exact supplied summary/description as text. Destinations are primary onward discovery; City rows are non-clickable geographic context, and immediate subregions link to Region detail. No other completed surface was redesigned or modified.

Spatial UI validates finite latitude/longitude and geographic ranges, keeps readable numeric coordinates outside the map, and uses the established MapLibre/configured OpenFreeMap style architecture with one noninteractive representative marker. There is no added boundary, route, line, polygon, inferred child coordinate or camera animation. The supplementary map does not require keyboard/touch interaction; attribution remains enabled. A ResizeObserver fixes the mobile marker positioning issue found in screenshot review. Basemap errors/timeouts leave the coordinates and all discovery content readable.

Media is deliberately absent because no Region MediaAsset relationship exists. Trust notes state that citations and confidence assessments are unavailable; no Verified claim or invented sources are shown. Unsupported relationships are described once in a compact note rather than empty decorative sections.

VI is canonical and EN interface copy is supplied. Backend editorial text is never translated by the frontend. Detail content uses resolvedLocale for lang; fallbackApplied displays requested/resolved languages. Null content and locale metadata are handled. Future CJK content is tested for wrapping, without exposing unsupported API locale choices. Existing linked Country/Destination screens retain their own locale behavior.

The 390px layout stacks the identity rail and contextual lists. Tablet/desktop use editorial columns with token colors and Noto font stacks. Native links/buttons, semantic main/sections/headings, visible focus, 44px targets, live request status, skip link and reduced-motion rules are present. Loading, 404, API error/retry, no editorial content/media/coordinates, empty lists and independent list failure states are implemented.

## Local QA

- Web TypeScript: PASS, direct installed `typescript/bin/tsc --noEmit`.
- Production build: PASS, direct installed Next binary; `/regions/[slug]` included.
- Focused Region Chromium suite: 12/12 PASS after map resize fix.
- Full web Chromium suite: 63/63 PASS, including 12/12 Region tests.
- Full-page screenshots: `apps/web/qa-evidence/pass-10/region-390.png`, `region-834.png`, `region-1536.png`.
- All three viewports manually reviewed for hierarchy, wrapping, spacing, maps, list density and footer. No pixel baseline comparison is claimed.
- Screenshots use explicitly synthetic test-only API fixtures and an intercepted empty map style. They verify point/layout behavior, not real-world basemap fidelity. Basemap failure is separately tested.
- Existing dependencies reused through junctions in an isolated checkout; no install or package/lock changes. Next reports the parent workspace lockfile and an existing outdated browser-baseline warning; build still passes.

- `git diff --check`: PASS (line-ending warnings only).

## GitHub QA / closure

Implementation Consumer QA: **PASS** (2026-09-23).
- Commit: `315b35db20582f6b49ad68397fdbf174af889544`
- Workflow run: `35809512762`
- Job: `107017678184`
- Conclusion: `success` for both run and job.
- Job log: `63 passed (22.6s)`; all 12 Region cases included.
- URL: https://github.com/Xuanthanhit99/dauviet/actions/runs/35809512762
- Web typecheck/build, browser suite, Admin typecheck/build and Mobile typecheck all passed.

Pass #10 is closed on this actual implementation CI evidence. The closure commit will trigger a further Consumer QA run; its exact SHA/run/job/result will be verified and supplied in the final report after push.

## Next pass

The canonical inventory lists Region/Person/Event/Culture V2 together but does not specify an ordered post-Region pass. No later screen has been started; the next pass cannot be verified as a specific Person/Event/Culture screen from this checkout.

BACKEND CHANGED BY THIS TASK: NO
