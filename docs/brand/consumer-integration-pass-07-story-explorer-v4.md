# Consumer Integration Pass #7 — Story Explorer V4

Date: 2026-09-22
Status: **CLOSED_PRODUCTION_QA_PASS**

Route: `/stories/[slug]`. Existing APIs: `GET /v1/stories/{slug}?locale=vi` and `GET /v1/media/{id}`.

The editorial reading baseline is preserved. Source references now have real targets, keyboard focus moves to the citation, and a return link restores the exact reading reference. Unknown citations are visibly unavailable rather than broken links. Entity references use only matching IDs in supplied Place/Person/Event relationships. Empty connections/facts, retry, request cancellation, resolved-language markup, wrapping and 44px interaction targets are included.

Media resolves the exact CMS ID using the existing public Media endpoint (confirmed in `docs/backend/EDITORIAL_CONTENT.md` and the read-only Media controller/service). No URL is derived from an ID. PUBLIC/READY media with declared usable rights and provenance can render its returned image/audio URL; unavailable, restricted, unknown-rights or missing-provenance media keeps a visible fallback. Native image proportions, captions, authorship, rights, provenance, historical classification and AI/reconstruction disclosure remain visible. AI content is never labeled documentary evidence. No production fixture or invented historical imagery is shipped.

## Executed QA

Local Windows production server on port 3001, existing Consumer QA commands invoked via installed Node entry points. The installed pnpm 11 command attempted workspace dependency reconciliation and aborted before removing modules; direct existing binaries were used to avoid changes to backend dependencies. No dependency installation or backend test was performed.

- Web TypeScript: PASS, exit 0.
- Next production build: PASS, exit 0.
- Existing full Playwright Chromium suite plus targeted Story coverage: **34/34 PASS**, 58.6 seconds, no retries in the final run.
- First browser run: 32/34; ambiguous test selectors matched both Place/Event slugs and the Next route announcer. Selectors were scoped without weakening the product assertions; one further source-title ambiguity was fixed before the final passing run.
- 390×844, 834×1112, 1536×960: no horizontal overflow; full-page screenshots actually reviewed for reading hierarchy, wrapping, disclosure and source layout.
- Keyboard citation round trip, reduced motion, locale fallback, empty/error/retry states, long source text, exact media resolution and restricted-media refusal: PASS.
- Evidence: `apps/web/qa-evidence/pass-07/story-{390,834,1536}.png`. Images use test-only contract fixtures, not production content.

This is local production-server QA, not a newly executed GitHub Actions run or pixel-perfect comparison against unavailable screen reference images. Existing map GeoJSON types were repaired through MapLibre's exported contract without altering map behavior or dependencies. Next's required web-only TypeScript configuration updates are retained.

## Remaining contract / frontend boundaries

- Person/Event detail routes are later locked frontend passes; their supplied relationship links are preserved.
- Story relationships supply slugs, not localized display names; no names are inferred.
- Source payload supplies title/page/locator, not an external citation URL; no external link is invented.
- Audio transcripts and per-stop locale metadata are not supplied. Media without publishable rights/provenance stays unavailable.
- The repository identifies locked screen versions and brand rules but does not contain standalone Story V4/Journey V3 pixel reference boards; exact pixel equivalence is not claimed.

**PASS #7 — STORY EXPLORER V4: CLOSED_PRODUCTION_QA_PASS.**
Next: **Pass #8 — Journey Detail V3**, confirmed by the ordered locked-surface mapping in `consumer-integration-pass-01-inventory-mapping.md` and this registry transition.

**BACKEND CHANGED: NO** by this frontend task. The shared working tree already contains unrelated backend changes; they are preserved.

## Verified publication and CI closure

[Consumer QA 35715276514](https://github.com/Xuanthanhit99/dauviet/actions/runs/35715276514), job [106705186638](https://github.com/Xuanthanhit99/dauviet/actions/runs/35715276514/job/106705186638), passed on commit `2387820c623fe5320accc1dee2c466886b261a99`. All 43 Chromium tests passed (16.7 seconds), along with web typecheck/build/smoke, admin typecheck/build and mobile typecheck. This new run is the closure evidence.

Publication used an isolated checkout based on current origin/main and only the 23 task-owned files. Claude’s shared backend working-tree changes were not staged or modified.

## Final regression result

After Journey refinements, the full local Chromium suite passed **43/43**, 1.1 minutes, zero failures/retries. Final web typecheck/build and HTTP smoke checks passed. Pass #7 is CLOSED_PRODUCTION_QA_PASS based on the new successful Consumer QA run.
