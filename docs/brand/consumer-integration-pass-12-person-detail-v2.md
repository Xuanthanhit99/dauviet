# Consumer Integration Pass #12 — Person Detail V2

Date: 2026-09-23
Starting current remote main / isolated frontend HEAD: `b33c8ffc3a6b8e6dffcf86a3ccb1f29e4dc7039c`.
Status: **CLOSED_PRODUCTION_QA_PASS**.
Route: `/people/[slug]`.

## Focused preflight

**PERSON CONTRACT: UNCHANGED.** Read-only verification of current-main OpenAPI, People controller/service/input DTO, Prisma field types, translation resolver, historical-date responses, public fact-source helper, Stories `listForEntity`, existing media resolver and Event/Story/Place frontend patterns. Remote main matched the completed Event closure; the shared checkout still contained Claude's active backend changes and was not updated or edited. No broad discovery was repeated.

Public reads consumed:
- `GET /v1/people/{slug}?locale=vi|en`
- `GET /v1/people/{slug}/timeline?locale=vi|en`
- `GET /v1/people/{slug}/stories?locale=vi|en`
- `GET /v1/people/{slug}/sources`
- `GET /v1/media/{id}` only for exact supplied `heroMedia.id`.

People list/comments are public but unused. No protected/write API is consumed.

## Actual data and presentation

Detail: id, canonical slug, birth/death historical date structures, translation (displayName, alternateNames, summary, description, locale/method), raw heroMedia relation, places {id,slug,name,role}, meta {requestedLocale,resolvedLocale,fallbackApplied}. Person must be PUBLISHED; missing/unpublished returns 404. `alternateNames` is a nullable string, not an array; native disclosure preserves it verbatim and prevents a long list overwhelming identity. Missing displayName uses canonical slug with explicit disclosure.

Birth/death use backend `display` verbatim. Precision, circa, BCE/CE, ranges and unknown are not reinterpreted. Missing display remains unknown even when numeric fields exist. No JavaScript Date conversion, synthesized lifespan or age at death. Summary/description remain supplied plain text with paragraph breaks; no generated biography, titles, nationality, occupation, family, achievements or legacy.

Places: exact supplied slug links and raw role (BIRTH/DEATH/RESIDENCE/ACTIVITY/RULE/EXILE/OTHER). No inferred role or nationality. Embedded Place publication is not independently filtered, and per-Place language/publication metadata is not exposed; UI does not claim otherwise. No coordinate fetch, geocoding, map or travel route.

Timeline: published connected Events {id,slug,title,date}, in backend order (`dateSortStart` ascending), with date.display preserved. No frontend sort or invented participation semantics. Event links target the completed `/events/[slug]` route and preserve VI/EN selection. Labels do not claim per-event translation metadata which is absent.

Stories: published {id,slug,type,title}, capped at 50, no continuation. UI says list may be partial; no fake pagination, summaries, authors or images.

Sources: deduplicated Source rows cited by published facts. Display allowlist: title/sourceType/author/organization/publisher/publicationYear/url/credibilityLevel. Only absolute HTTP(S) links without credentials are actionable; external links have meaningful labels and `noopener noreferrer`. No internal Source fields displayed. PRIMARY/SECONDARY/TERTIARY/UNKNOWN describe Source credibility, not Person certainty. No public fact text, locator, per-fact certainty or paragraph/claim-source mapping exists; no fabricated footnotes or proof claims.

Media: unchanged PublishedMedia component resolves only exact heroMedia.id through public Media. Raw hero URL ignored. Existing ready/public/rights/provenance/type/id gates remain; classification, AI/reconstruction disclosure, rights and provenance stay visible. Missing or failed media never substitutes another image or removes identity.

## Architecture and navigation

Server route resolves slug/locale; client boundary supports independent retries. A small shared `editorial-related.tsx` extracts the existing Event request hook and Stories/Sources renderers without changing their behavior; Person uses the same contract and safety policy. Existing PublishedMedia and Story application code are unchanged.

Event People now link their supplied canonical slugs to Person; other Event context stays non-link. Event context copy and touch-target styling updated narrowly. Existing Story PERSON entity references/connections already link to `/people/[slug]`; no Story redesign/change needed. Event regression suite and an Event-to-Person navigation test cover this continuity.

## Locale, failure and accessibility

VI canonical, EN interface. Requested/resolved/fallback metadata disclosed; supplied editorial text uses resolved language and is never machine-translated here. String-based copy and wrapping remain ready for future locale additions, without claiming implemented FR/JA/KO/Chinese interface translations.

Identity/narrative survive timeline, Stories or Sources failure. Supporting resources have independent loading/error/retry/empty states. Primary loading, 404, other API error/retry, missing translation/name/alternateNames/summary/description/dates/media/Places all remain truthful. No decorative empty biography sections.

Canonical tokens, Noto font stacks, semantic main/headings, native links/buttons/disclosure, visible focus, 44px targets, live status, media alt handling and reduced-motion support. Timeline is readable without animation. Required QA viewports: 390×844, 834×1112, 1536×960. No new section-level canonical Person composition is claimed.

## Remaining contract gaps / following work

No Person coordinates, Country/Dynasty/Era relationships, Theme/Culture, Journeys, overall certainty, public fact text/citation locators, timeline participation roles, per-related-item locale metadata, individual Place publication metadata or Stories continuation. No unsupported feature is fabricated.

Current-main Theme controller exposes public catalog/list only; no sufficient public Culture/Theme detail endpoint. Culture remains BLOCKED. Do not treat Theme as Culture, start Culture, or promote Era/Dynasty/Territory/Community/collections to a numbered pass without canonical authorization. Next step is backend-owned public Culture contract clarification, followed by a bounded readiness check when available.

## QA and publication

LOCAL QA: PASS. Web TypeScript (--noEmit) and production build passed; build includes /people/[slug]. Focused Chromium run: 57/57 PASS (22 Person, 20 Event, 15 Story). Full Chromium: 105/105 PASS (3.8m). git diff --check passed. Three required full-page screenshots manually reviewed for hero/date hierarchy, timeline, sources, wrapping and footer. Additional portrait-aspect media/provenance and mobile empty-state screenshots reviewed. No clipping or horizontal overflow found. No pixel-baseline comparison claimed.

No dependency install/update or package/config change. Existing Next workspace-root and stale browser-baseline warnings did not fail the build. Old Pass #9/#11 deterministic screenshots regenerated by the full test run were restored individually from HEAD in the isolated checkout; no earlier pass evidence is included in this change.

GITHUB CI — implementation Consumer QA: **PASS**.
- Implementation SHA: `bdf41e0d0c0cdbc15857b2f8730c59fbe0e05e28`
- Run: `35846285728`; job: `107133134990`
- Run/job conclusion: `success`
- Job log: `105 passed (33.5s)` (22 Person, 20 Event, 15 Story plus all earlier suites).
- Web typecheck/build/browser QA, Admin typecheck/build and Mobile typecheck passed.
- URL: https://github.com/Xuanthanhit99/dauviet/actions/runs/35846285728

Closed on actual implementation CI evidence, not local tests alone. A separate closure commit will be published and its exact SHA/run/job/conclusion verified in the final task report. Required screenshots: `apps/web/qa-evidence/pass-12/person-390.png`, `person-834.png`, `person-1536.png`. Fixtures are synthetic QA data only. Manual screenshot review is not pixel-baseline comparison.

## Safety

Only explicit frontend-owned files are staged. No apps/api, Prisma, migrations, database, backend docs/tests, environment, package/lock/workspace changes. Claude's working tree is preserved. No historical facts, dates, age, relationships, map, media, citations or certainty are invented.

BACKEND CHANGED BY THIS TASK: NO
