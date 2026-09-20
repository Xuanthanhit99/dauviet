# Consumer Integration Pass #3 — Web App Shell + Home V5

Date: 2026-09-20
Status: **IMPLEMENTED — RUNTIME QA PENDING**

Implemented directly in `apps/web`:
- responsive sticky global shell/navigation;
- canonical Horizontal Logo V1.4.1 runtime asset;
- canonical Time Trace master asset in the hero;
- Home foundation following the locked discovery/story/connection/trust direction;
- canonical color, typography and motion packages;
- accessible skip link, semantic navigation/main/footer, focus contract;
- responsive desktop/tablet/mobile layout;
- reduced-motion inheritance;
- discovery entry points for Explore, Map, Stories and Journeys;
- Story Explorer / Connections / provenance and uncertainty messaging.

No fabricated ratings, reviews, historical claims or documentary imagery were added. No generic travel pin/plane/globe identity was introduced.

The source pass is complete. Executable QA remains pending because the GitHub connector does not run pnpm/Next/browser tooling. Required next checks: install/lockfile refresh, Next build + typecheck, responsive browser visual QA, keyboard/focus QA and reduced-motion QA.

No backend/API/Prisma/database/.env changes.


## Runtime QA automation follow-up

A dedicated GitHub Actions workflow is now present at `.github/workflows/consumer-qa.yml`. It installs the monorepo with the frozen lockfile and runs Web typecheck/build, Admin typecheck/build and Mobile typecheck. Root consumer scripts were added to `package.json`.

At the time this follow-up was recorded, GitHub had not yet exposed a workflow run for the workflow-creation commit. Therefore executable QA remains **PENDING_FIRST_CI_RUN** rather than being falsely marked PASS.

Browser-only gates (responsive visual review, keyboard/focus behavior and reduced-motion visual behavior) remain separate from compile/build CI and require browser evidence before final Pass #3 closure.
