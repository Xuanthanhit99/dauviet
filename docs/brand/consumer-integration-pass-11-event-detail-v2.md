# Consumer Integration Pass #11 — Event Detail V2

Date: 2026-09-23
Starting remote main / isolated frontend HEAD: `befc25c48d41504a5abf7cd0e87f99637a04c8c5`.
Shared backend checkout remains separately owned; it started at `9931a163234561fef53944d9c900e1518ce4f328` with active backend changes.
Status: **CLOSED_PRODUCTION_QA_PASS**.
Route: `/events/[slug]`.

## Verified contract

Read-only verification: `docs/backend/openapi.json`, Event controller/service, historical-date formatter, Stories `listForEntity`, public fact-source helper, Media public resolver and established PublishedMedia policy. Contracts match completed discovery. Existing Story Connections/entity references and Journey stop links already target `/events/[slug]`.

Consumed public APIs:
- `GET /v1/events/{slug}?locale=vi|en`
- `GET /v1/events/{slug}/stories?locale=vi|en`
- `GET /v1/events/{slug}/sources`
- `GET /v1/media/{id}` only for exact `heroMedia.id`, when present.

Public Event list and comments endpoints exist but are not consumed. No write/private API is used.

Detail DTO: id, canonical slug, date, resolved translation (title/summary/description and locale/method), heroMedia relation, optional era/territory {id,slug}, places {id,slug,name}, people {id,slug,displayName}, themes {id,slug,category,name}, countries {id,slug,iso2,role}, meta {requestedLocale,resolvedLocale,fallbackApplied}. Event must be PUBLISHED; missing/unpublished returns 404. Embedded relationships lack individual locale/publication metadata and are not independently publication-filtered by the service; UI does not call them published or infer availability of linked records.

Historical date response has year/month/day, precision, qualifier, era, rangeEnd and display. UI displays `date.display` verbatim, including BCE/CE, partial precision, circa, ranges and unknown. No JS Date conversion, frontend date synthesis, interpolated timeline or inferred chronology. Missing display has an explicit unavailable state, even if numeric components exist.

Stories: array of published {id,slug,type,title}, ordered by backend, capped at 50 with no continuation or count; UI explicitly says the returned list may be partial. No fabricated pagination, summaries, authors, images or reading times.

Sources: deduplicated raw Source records cited by PUBLISHED facts associated with this Event. The UI whitelists title/sourceType/author/organization/publisher/publicationYear/url/credibilityLevel, omits internal fields and renders only valid absolute HTTP(S) links without embedded credentials. External links use `noopener noreferrer`. SourceCredibility values are PRIMARY/SECONDARY/TERTIARY/UNKNOWN; these are not overall Event certainty. No public fact text, paragraph citation locator or claim-source mapping is supplied. `/v1/facts` is role-protected and is never called.

## Product surface

An editorial forest hero pairs supplied title/summary with a prominent historical-date rail. Missing title deliberately falls back to canonical slug with disclosure. The breadcrumb does not choose a parent Country for a potentially multi-country Event. Missing media uses a compact intentional text composition.

Narrative preserves supplied paragraphs as text. Places link to existing Place routes. All Country slugs link to Country routes, preserving supplied relationship roles (OCCURRED_IN/AFFECTED/ORIGIN/DESTINATION/RELATED) without interpreting every link as occurrence. People, Themes, Era and Territory remain readable non-link context; no new missing-target routes or generated biographies/cultural content are introduced. Optional absent context is collapsed into one truthful message, not empty decorative subsections.

Exact PublishedMedia resolves the supplied id rather than using raw heroMedia URL/metadata. Existing public/ready, allowed-rights, provenance and media-type checks remain unchanged. No substitute imagery. Classification, AI/reconstruction disclosure, rights and provenance remain visible. An optional `locale` prop adds EN labels to the shared component, defaulting to the identical VI copy for completed screens; backend media text is never translated.

No Event map, point, boundary, polygon or route is rendered. Country/Place coordinates are not fetched. A general `/map` continuation link is not an Event map.

## Failure, locale and accessibility

Primary identity loads independently. Stories and Sources have independent loading/error/retry/empty states; either can fail without removing Event identity, narrative or the other section. Main 404 differs from general API error. Media resolution failure stays within its section.

VI canonical and EN interface selection; editorial content uses resolvedLocale, and fallbackApplied displays requested/resolved locale. Related labels have an explicit note about missing per-entity language/publication metadata. No inferred translation availability. Long VI/EN/CJK content and source URLs wrap.

Semantic main, sections and heading order, existing skip link, native links/buttons, visible focus, minimum 44px interactive targets, live request status, safe source-link semantics and shared media alt handling. Context-only entities do not have link styling. Reduced-motion disables smooth scrolling and nonessential animation. Layout explicitly supports 390×844, 834×1112 and 1536×960 using canonical token colors and Noto font stacks.

## Gaps and scope

No Event timeline, direct Journeys, related Events, Event coordinates/geometry, overall certainty, public fact-level evidence/citation mapping or individual relationship locale/publication metadata. Person/Era/Territory/Theme/Culture detail routes remain absent. Theme is not treated as Culture. No repository section-by-section locked Event composition was found; this implementation applies existing product/brand baselines and the supplied Pass #11 specification, without claiming a new canonical layout.

No completed detail surface is redesigned. The only shared component change is optional media interface localization. No dependencies, package files, environment, backend, Prisma, migrations, seed or backend docs are changed.

## QA and publication

Local QA completed:
- Web TypeScript: PASS, direct installed TypeScript binary (`--noEmit`).
- Web production build: PASS; `/events/[slug]` included.
- Focused Event Chromium: 20/20 PASS.
- Full web Chromium: 83/83 PASS, including prior Story/Journey media/provenance coverage.
- `git diff --check`: PASS (line-ending warnings only).
- Three required full-page screenshots manually reviewed: no overflow or clipped content; historical date, narrative, relationships, Stories, Sources and footer remain readable.
- Additional media screenshot reviewed: uncropped aspect ratio, readable classification/rights/provenance. Empty-state mobile layout reviewed separately.
- No package install/update; reused installed Node binaries and existing dependency junctions in the isolated checkout. Existing Next workspace-root/browser-baseline warnings did not fail build.

Implementation GitHub Consumer QA: **PASS**.
- Commit: `3d6ea5f97e6c19340bdcc04b7b426fd80ca35614`
- Workflow run: `35839617761`
- Job: `107111287826`
- Run and job conclusion: `success`
- Job log: `83 passed (27.1s)`, including all 20 Event cases.
- URL: https://github.com/Xuanthanhit99/dauviet/actions/runs/35839617761
- Web typecheck/build/browser QA, Admin typecheck/build and Mobile typecheck passed.

Pass #11 is closed on actual implementation CI evidence, not local QA alone. A separate closure commit will be pushed and its Consumer QA SHA/run/job/result verified in the final task report.

Required screenshots: `apps/web/qa-evidence/pass-11/event-390.png`, `event-834.png`, `event-1536.png`. Deterministic fixtures are synthetic QA data only, never production content. Screenshot review is manual layout inspection, not a pixel-baseline comparison.

## Following work

Person Detail V2 is the next evidence-based frontend candidate after Event closure; it remains partially ready. Culture V2 remains blocked by missing public detail contract and is not assumed equivalent to Theme. Canonical inventory still does not prescribe final pass numbering. Neither screen is implemented here.

BACKEND CHANGED BY THIS TASK: NO
