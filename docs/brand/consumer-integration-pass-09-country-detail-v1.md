# Consumer Integration Pass #9 - Country Detail V1

Date: 2026-09-22
Status: **CLOSED_PRODUCTION_QA_PASS**
Route: `/countries/[slug]`

## Contract discovery

Read-only backend/API evidence reviewed:
- `docs/backend/openapi.json`
- `apps/api/src/modules/countries/countries.controller.ts`
- `apps/api/src/modules/countries/countries.service.ts`
- `apps/api/src/modules/regions/regions.service.ts`
- `apps/api/src/modules/cities/cities.service.ts`
- `apps/api/src/modules/destinations/destinations.service.ts`

Public Country V1 endpoints consumed:
- `GET /v1/countries/{slug}?locale=vi`
- `GET /v1/countries/{slug}/regions?locale=vi&page=1&pageSize=24`
- `GET /v1/countries/{slug}/cities?locale=vi&page=1&pageSize=18`
- `GET /v1/countries/{slug}/destinations?locale=vi&page=1&pageSize=12`

The Country detail DTO exposes identity, `iso2`, `iso3`, `defaultLocale`, `defaultCurrency`, publication status, optional representative latitude/longitude, one resolved translation, and locale fallback metadata. Country list relationships expose lightweight Region, City, and Destination summaries. Country V1 does not expose hero media, Places, Stories, Journeys, People, Events, Culture/Theme relationships, citations, media provenance, or boundary geometry directly.

## Product implementation

Country Detail V1 now presents a production country surface at `/countries/[slug]`. The hero uses supplied country identity, code context, resolved translation, fallback status, relationship counts, and an intentional no-media statement. It does not substitute local, stock, or neighboring entity media.

The page explains the hierarchy `World -> Country -> Regions`, renders the supplied country summary/description, shows published Regions as the primary discovery layer, published Destinations as onward links to `/destinations/[slug]`, and Cities as neutral geographic context when exposed. Regions and Cities remain non-clickable because no verified frontend Region/City detail route exists in the current locked surface.

Spatial context is limited to the valid representative Country point when supplied. The page does not draw MapLibre borders or route lines because the consumed Country contract does not expose territory geometry, child entity coordinates in the country-scoped lists, or route geometry.

The continuation section truthfully shows available progression into Regions and Destinations and marks Places, Stories, and Journeys as not directly exposed by the Country contract. The trust section documents missing Country-level relationships and data categories rather than filling them from general knowledge.

## Empty, error, and accessibility behavior

Implemented states:
- loading announcement
- 404/API error with retry
- missing country summary/description
- no hero media
- no Regions
- no Cities
- no Destinations
- locale fallback
- invalid/missing coordinates
- relationship endpoint failure degrading to empty relationship sections while the Country identity remains usable

Accessibility and responsive work:
- semantic headings and landmarks
- named navigation landmarks
- visible focus
- 44px minimum interactive targets
- list-first relationship discovery
- no horizontal overflow at 390x844, 834x1112, and 1536x960 in focused Chromium QA
- reduced-motion CSS disables nonessential transitions

## Backend/API gaps

Not exposed by Country V1:
- Country hero media / MediaAsset reference
- Country media provenance/citations/sources
- Country boundary or region geometry
- Place, Story, Journey, Person, Event, Culture/Theme relationships
- child entity coordinates in country-scoped Region/City/Destination summaries
- population, area, capital, languages, visa, safety, weather, ratings, prices, bookings, travel time, or recommendations

These gaps are documented in the UI and no frontend data was fabricated.

## QA status

Local QA completed on 2026-09-22:
- Web TypeScript typecheck: PASS (`tsc --noEmit` via the app-local installed binary)
- Web production build: PASS (`next build` via the app-local installed binary)
- Focused Country Detail V1 Playwright browser QA: PASS, 8/8
- Full web Playwright browser suite: PASS, 51/51
- Screenshot evidence reviewed: `apps/web/qa-evidence/pass-09/country-390.png`, `country-834.png`, `country-1536.png`
- `git diff --check`: PASS; output only line-ending warnings for edited text files

Local QA does not close Pass #9.

GitHub Consumer QA passed for the implementation commit:
- Workflow: Consumer QA
- Run ID: `35755595305`
- Job ID: `106840425951`
- Commit SHA: `5343b96f8d079001bf24166437c50ec43381bfcc`
- Conclusion: `success`
- URL: `https://github.com/Xuanthanhit99/dauviet/actions/runs/35755595305`

Pass #9 is **CLOSED_PRODUCTION_QA_PASS**. The next locked candidate remains Region Detail V2, but it is not started in this pass.

**BACKEND CHANGED: NO** by this task.
