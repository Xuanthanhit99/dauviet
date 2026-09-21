# Consumer Integration Pass #6 — Place Detail V4

Date: 2026-09-21
Status: **IMPLEMENTED — CI/BROWSER QA PENDING**

Implemented `/places/[slug]` against the frozen public Place endpoints: detail, timeline, sources, media, stories, journeys, and community.

Place V4 exposes the product's Time Travel / Then & Now / Evidence pillars without fabricating missing data. The detail hero uses backend-ready hero media only; historical dates come from backend formatted date responses; gallery items expose available provenance/rights metadata; public sources and public-visible community stories are rendered separately from editorial content.

Sections: geographic hierarchy + hero, Understand, historical timeline, Then & Now/media, Story Explorer, Journeys, Evidence & Sources, and Community. Loading/error/empty/fallback states are explicit. Backend/API/Prisma/database remain unchanged.


## Chromium browser QA gate

Added `apps/web/tests/place-detail-v4.spec.ts` to the existing Playwright Chromium runner. Deterministic contract-shaped endpoint interception covers all seven Place public reads. QA covers 390×844, 834×1112, and 1536×960 responsive layouts/no horizontal overflow; historical timeline; Then & Now/media provenance display; Story and Journey relationships; Evidence & Sources; public-visible Community; explicit empty states; locale fallback disclosure; API error; keyboard focus; and reduced-motion behavior.

Status remains pending until Consumer QA reports the suite PASS.


## Final Chromium QA / closure

Consumer QA run `35627136918`, job `106424152407`: **PASS**. Web typecheck/build, production server startup, browser smoke, Chromium browser QA, Admin typecheck/build, and Mobile typecheck all passed. Place Detail V4 browser coverage passed for responsive/no-overflow, historical timeline, Then & Now/media provenance, Story/Journey relationships, Evidence & Sources, Community, empty states, locale fallback, API errors, keyboard focus, and reduced motion.

**PASS #6 CLOSED — PLACE DETAIL V4 PRODUCTION QA PASS.** Next locked consumer implementation: Story Explorer V4.
