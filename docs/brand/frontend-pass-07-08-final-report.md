# Dấu Việt Global — Frontend Pass #7 / #8 final report

Date: 2026-09-22
Result: **PASS #7 / #8 CLOSED_PRODUCTION_QA_PASS**

## Existing work and current repository

Local main HEAD: `9a16e4a9880c38a1ff973ec1dd1fb069b1445c01`. Read-only GitHub inspection found main at `f2c62c3431c8e4a6835a9d82ba2f336dc04603bd`, five frontend commits ahead, implementing Journey V3. Their code, styles, documentation and pending registry record were compared with the in-progress local work. Existing Story Explorer was refined rather than recreated; Journey's existing domain capabilities are preserved and extended. No pull, checkout, reset, stage, commit, push or backend restore was performed in the concurrently dirty shared checkout.

## Screens and routes

- `/stories/[slug]`: keyboard source jump and exact return, missing references/connections/facts, retry/cancellation, language semantics, safe exact CMS media resolution, text wrapping and touch targets.
- `/journeys/[slug]`: editorial hero; supplied region, summary and description; supplied duration/distance/difficulty; ordered stop narratives; Place/Story/Event links; coordinate text; synchronized point map; provenance/disclosure; loading/error/retry/empty/fallback states.
- `/map`: type-only repair using MapLibre's exported GeoJSON source types. Runtime behavior and dependencies unchanged.

## API contracts

Only existing public reads are consumed: `GET /v1/stories/{slug}?locale=vi`, `GET /v1/journeys/{slug}?locale=vi`, `GET /v1/media/{id}`. Backend source/OpenAPI was read for contract verification only. No endpoint, DTO, migration, dependency or production fixture was added.

## Spatial, responsive and accessibility work

MapLibre reuses the existing OpenFreeMap configuration and attribution architecture. Markers represent real valid stop coordinates and editorial ordering. No inferred connecting line or road/walking route is rendered. The list remains primary and usable on basemap failure, including actual coordinate text. `routeGeometrySource` alone no longer claims that route geometry is available.

Checked 390×844, 834×1112 and 1536×960. Mobile/tablet stack the content; desktop pairs ordered stops with sticky spatial context. Long strings wrap without overflow. Actual screenshot review caught and corrected mobile two-digit stop labels breaking across lines.

Native ordered lists/headings/links, meaningful labels, visible focus, minimum 44px controls, keyboard map/list selection, focus return, status announcements and reduced-motion camera handling are implemented. Story citations support a keyboard round trip. Missing language metadata is not inferred.

## Trust / provenance

Media resolves the exact supplied CMS ID. Returned public/ready media must have usable declared rights, provenance and an HTTP(S) URL before rendering. Failed or restricted media keeps an explicit fallback; historical/AI/reconstruction identity and supplied disclosures remain visible. Original image proportions, caption, creator, rights and provenance remain nearby. No approximate, local-folder, random or fabricated image is substituted. AI imagery is never presented as documentary evidence.

Journey metrics are formatted only from supplied numbers; absent duration/distance/difficulty remain unknown. No opening hours, prices, bookings, travel times, ratings, recommendations or historical relationships are invented.

## Executed QA

- `node node_modules/typescript/bin/tsc --noEmit -p apps/web/tsconfig.json`: **PASS**, exit 0.
- `node apps/web/node_modules/next/dist/bin/next build apps/web`: **PASS**, exit 0; production routes include Story and Journey.
- `node apps/web/node_modules/@playwright/test/cli.js test --config apps/web/playwright.config.ts --workers 2`: **43/43 PASS**, final run 1.1 minutes, no retries/failures.
- HTTP smoke: `/`, `/map`, `/stories/thanh-co-va-ky-uc`, `/journeys/hanh-trinh-qa`: **200**. These verify route serving, not live backend content.
- `git diff --check` for frontend/docs/registry: **PASS**.
- Actual full-page Story and Journey screenshots at all three required viewports were inspected and retained in `apps/web/qa-evidence/pass-07` and `pass-08`.

The existing pipeline's installed tools were invoked directly after installed pnpm 11 attempted automatic workspace dependency reconciliation and safely aborted. No dependency reinstall was allowed to affect backend work. Next's required web TypeScript/generated declarations were retained.

Browser tests use deterministic API fixtures; Journey screenshots use a neutral test basemap. No pixel-perfect comparison, live database validation, production documentary image verification or live map-provider uptime is claimed. Backend/admin/mobile checks were not run by this frontend-only task.

## CI evidence and pass states

[Consumer QA 35715276514](https://github.com/Xuanthanhit99/dauviet/actions/runs/35715276514), job [106705186638](https://github.com/Xuanthanhit99/dauviet/actions/runs/35715276514/job/106705186638), passed on commit `2387820c623fe5320accc1dee2c466886b261a99`. All 43 Chromium tests passed (16.7 seconds), along with web typecheck/build/smoke, admin typecheck/build and mobile typecheck. This new run is the closure evidence.

- **Pass #7: CLOSED_PRODUCTION_QA_PASS.**
- **Pass #8: CLOSED_PRODUCTION_QA_PASS.**
- Published branch: **main**, normal push, no force.
- Implementation commit: `2387820c623fe5320accc1dee2c466886b261a99`.
- Exact committed file list: the 23 frontend-owned files below. The closure follow-up changes only this report, both pass documents and the registry.
- Shared checkout branch/index and Claude’s backend working-tree changes remain untouched; publication used an isolated checkout based on remote main.

## Remaining frontend dependencies and next screen

The updated frontend passed Consumer QA and both passes are closed. Journey has no route geometry, dedicated citation list, bookings, practical service data or stop-specific translation metadata in the consumed contract. Story relationships expose slugs rather than localized names; Person/Event detail routes remain later frontend work. Audio transcripts are not supplied. Media missing rights/provenance remains intentionally unavailable.

The next locked screen after Pass #8 closure is **Country Detail V1**, as ordered in the existing canonical surface inventory. It remains unstarted under the current publication-only instruction.

## Frontend-owned changed/new files

The implementation commit contains exactly these 23 files:

```text
apps/web/.gitignore
apps/web/app/components/published-media.tsx
apps/web/app/globals.css
apps/web/app/journeys/[slug]/journey-detail.tsx
apps/web/app/journeys/[slug]/journey-map.tsx
apps/web/app/journeys/[slug]/page.tsx
apps/web/app/map/explore-map-client.tsx
apps/web/app/stories/[slug]/story-explorer.tsx
apps/web/next-env.d.ts
apps/web/qa-evidence/pass-07/story-1536.png
apps/web/qa-evidence/pass-07/story-390.png
apps/web/qa-evidence/pass-07/story-834.png
apps/web/qa-evidence/pass-08/journey-1536.png
apps/web/qa-evidence/pass-08/journey-390.png
apps/web/qa-evidence/pass-08/journey-834.png
apps/web/qa-evidence/README.md
apps/web/tests/journey-detail-v3.spec.ts
apps/web/tests/story-explorer-v4.spec.ts
apps/web/tsconfig.json
docs/brand/consumer-integration-pass-07-story-explorer-v4.md
docs/brand/consumer-integration-pass-08-journey-detail-v3.md
docs/brand/frontend-pass-07-08-final-report.md
packages/brand-contracts/brand-registry.json
```

No path in this task-owned list belongs to backend/API/Prisma/database/migrations/.env or backend configuration.

## Actual git diff --name-only (whole shared checkout)

This command intentionally includes the pre-existing and concurrent backend changes from the other session. They were inspected by path only for this audit and were not edited, staged or reverted by this task. It would be inaccurate to claim that the whole shared diff contains no backend files.

```text
.env.example
apps/api/src/app.module.ts
apps/api/src/common/errors/error-codes.spec.ts
apps/api/src/common/errors/trip-error-codes.ts
apps/api/src/common/historical-date/golden-dataset-validation.spec.ts
apps/api/src/config/configuration.ts
apps/api/src/modules/mailer/mailer.service.ts
apps/api/src/modules/trips/trip-cost-estimates.service.spec.ts
apps/api/src/modules/trips/trip-cost-estimates.service.ts
apps/api/src/modules/trips/trip-itinerary.service.ts
apps/api/src/modules/trips/trips.module.ts
apps/api/src/modules/trips/trips.service.spec.ts
apps/api/src/modules/trips/trips.service.ts
apps/api/test/trips.e2e-spec.ts
apps/web/app/globals.css
apps/web/app/map/explore-map-client.tsx
apps/web/app/stories/[slug]/story-explorer.tsx
apps/web/next-env.d.ts
apps/web/tests/story-explorer-v4.spec.ts
apps/web/tsconfig.json
docs/backend/AUTHORIZATION_MATRIX.md
docs/backend/BACKEND_HANDOFF.md
docs/backend/GLOBAL_V2_ROADMAP.md
docs/backend/openapi.json
docs/brand/consumer-integration-pass-07-story-explorer-v4.md
package.json
packages/brand-contracts/brand-registry.json
pnpm-lock.yaml
pnpm-workspace.yaml
prisma/golden/index.ts
prisma/schema.prisma
prisma/seed.ts
```

**BACKEND CHANGED BY THIS TASK: NO**
