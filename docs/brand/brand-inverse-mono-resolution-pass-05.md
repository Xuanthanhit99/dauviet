# CODEX PASS #5 - INVERSE MONO RESOLUTION

Audit date: 2026-09-18. STATUS: BLOCKED (asset resolution; the requested evidence audit is complete). DECISION: CANONICAL_ASSET_GAP.

No artwork, candidate, recoloring, registry promotion or production lock was created. The missing design decisions cannot be supplied by deterministic derivation from the inspected locked evidence.

## Repository recovery and preservation

Before editing, `git status --short` and `git diff --stat` showed five modified files (65 insertions, 13 deletions) and one untracked report from Pass #4.2:

- docs/brand/brand-asset-gap-matrix.md
- packages/brand-assets/README.md
- packages/brand-contracts/README.md
- scripts/brand/validate-dark-micro.mjs
- scripts/brand/validate.test.mjs
- docs/brand/brand-dark-micro-production-lock-pass-04-2.md (untracked)

All were retained without edits during Pass #5. No reset, restore, clean, stash or revert was used. Existing Horizontal V1.4.1 and Dark Micro V1.1 locks, package organization, scripts and QA inventory were inspected.

## Sources and integrity

Paths below beginning with a numbered phase are relative to `Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/` (B). Searches covered the entire Brand Bible and all five brand packages for mono, monochrome, inverse, dark, light, single-color, one-color, reversed, negative, micro mono and logo mono. Historical mono variants, current SVGs, manifests, Phase 01 validation, Phase 02 semantics, Phase 08 application rules, governance and repository usage records were considered. A search wildcard unsupported by Windows was rerun with explicit package directories.

SOURCE INTEGRITY: PASS. Every one of the 210 entries in `packages/brand-contracts/source-manifest.json` was checked against actual SHA-256 and byte length. The canonical validator additionally passed original manifest 133/133, registry/inventory reconciliation, source-package manifests and distribution checksums. No failing source was repaired or regenerated.

Primary mono source: `B/01-Logo-Master-Geometry/dau-viet-global-time-trace-v3-micro-v1.4-mono.svg`.

- Bytes: 2056.
- SHA-256: `ca59b22908a2a245c5f66cf1b5f20df1575fa01ce1b0c30742e1beba4c785abf`.
- Comparison source: `B/01-Logo-Master-Geometry/dau-viet-global-time-trace-v3-micro-v1.3.svg`.
- Comparison SHA-256: `5ea0abc6b5045ebda285a467ca5f112595473008832435f6177637c52d5d9e2d`.
- Distribution: `packages/brand-assets/logo/micro/dau-viet-global-time-trace-v3-micro-v1.4-mono.svg`, byte-identical to source.

Exact evidence anchors:

| Evidence | Finding |
| --- | --- |
| Primary mono SVG, lines 1-3, 5-38 | 32-unit micro geometry, explicit 16-24px description, fixed #111111 visible fills |
| `01-Logo-Master-Geometry/dau-viet-global-time-trace-v3-production-validation-v1.4.json`, `minimum_size_rules`, `validation_checks` | 16/24 micro; 32 master allowed; 48+ master preferred; separate light, dark and monochrome PASS checks |
| Same validation `.md`, Locked validation rules and Production decision | Journey/reveal must survive monochrome; arbitrary recoloring prohibited; V1.4 validates V1.3 geometry |
| `02-Color-Accessibility/dau-viet-global-color-system-final-validation-v1.1.json`, `semantic` text/bg inverse entries; accompanying `.md`, lines 11-12 | White inverse text and Warm Sand inverse soft text on Deep Forest; these are text rules, not a mono logo mapping |
| `02-Color-Accessibility/dau-viet-global-phase02-color-accessibility-v1.0.md`, lines 7, 12-18, 42, 46 | Phase 02 does not redesign the logo; inverse surfaces/text semantics and structural Reveal rule do not assign an inverse logo fill |
| `02-Color-Accessibility/dau-viet-global-phase02-1-interaction-state-colors-v1.0.md`, line 7 | Interaction extension explicitly does not alter logo/core palette |
| `08-Web-iOS-Android/dau-viet-global-phase08-1-cross-platform-brand-accessibility-qa-v1.0.json`, `themes` and locked rules; accompanying `.md`, lines 25, 31 | No platform redraw; literal palette inversion prohibited |
| `08-Web-iOS-Android/dau-viet-global-phase08-brand-application-web-ios-android-v1.0.json`, web/iOS/Android logo entries; platform-token-map JSON | Horizontal/compact use and common geometry; no inverse mono treatment specification |
| `packages/brand-contracts/brand-registry.json`, asset `dvg-logo-time-trace-v3-micro-v1.4-mono` | PRODUCTION_LOCKED, theme light, sizesPx [16,24], CANONICAL_MICRO / CANONICAL_MONO, existing distribution path |
| Same registry, asset `dvg-logo-time-trace-v3-geometry-v1.3-mono` | PRODUCTION_LOCKED, theme light, master minimum 32 and preferred 48 |
| Same registry, gap `dark-monochrome` | CANONICAL_ASSET_GAP; no dedicated production SVG or currentColor recoloring contract |
| `packages/brand-contracts/source-inventory.json`, primary mono entry | SELECTED_SOURCE, existing micro distribution path, UNUSED_AT_AUDIT consumer status |
| `packages/brand-assets/README.md`, line 5; `docs/brand/brand-asset-gap-matrix.md`, Dark behavior, mono row | Supplied mono is for light surfaces; inverse dark usage remains missing |
| `docs/brand/locks/dark-micro-v1.1.md`; Dark Micro production README | Dark Micro explicitly distinct from inverse mono; no inheritance of its mappings or surfaces |
| `docs/brand/locks/horizontal-logo-v1.4.1.md` | Separate horizontal variants and lifecycle; no permission to derive a new inverse symbol |
| B `README.md`, Canonical rules / Logo production baseline | No silent redesign; screenshots/exports are not masters; existing master/micro size split |

## Definition and decision gate

The evidence identifies Inverse Mono only as the unresolved contrasting monochrome logo application on dark surfaces (repository gap `dark-monochrome`). It does not completely specify the asset. The independent Phase 01 checks for dark background and monochrome do not establish that one supplied mono SVG is approved for every dark surface.

| Question | Evidence-derived conclusion |
| --- | --- |
| A. Required geometry | UNDEFINED for inverse scope: master, micro, or both is not assigned. Both existing geometry families are available. |
| B. Intended sizes | Inverse-specific set UNDEFINED. General locked policy is micro at 16/24px, master allowed at 32px, preferred at 48px+. |
| C. Required single color | UNDEFINED for inverse. Existing light mono uses #111111. |
| D. Permitted backgrounds | Exact inverse background set UNDEFINED. Dark application is the gap context, not an approved hex set. |
| E. Meaning of inverse | No evidence selects White, Warm Sand, another fill, or a surface-dependent logo treatment. Text tokens cannot make this choice. |
| F. Existing micro mono sufficient? | NO: fixed #111111, theme light; no inverse distribution contract. |
| G. Separate master and micro inverse assets | UNDEFINED until intended inverse scope/sizes are explicitly selected; general size rules alone do not authorize both releases. |
| H. Optical adaptation | No new optical adaptation authorized. Existing micro geometry is already supplied; no evidence establishes a need or permission for additional inverse-specific changes. |

DECISION: CANONICAL_ASSET_GAP. Gate A fails because no existing inverse treatment/background/distribution role is established. Gate B fails because selecting inverse color, backgrounds and geometry/size scope requires new decisions. Gate C applies; artwork creation stops here.

Minimal missing decisions:

1. Canonical inverse visible fill / exact authorized mapping.
2. Permitted background set.
3. Required master/micro scope and corresponding intended sizes.

## Primary mono SVG inspection

- Valid XML; SVG namespace `http://www.w3.org/2000/svg`; viewBox `0 0 32 32`.
- Six paths total: four visible filled paths plus two mask paths. All six `d` values match Micro V1.3 exactly and in order.
- One `micro-cut` mask, userSpaceOnUse, x/y 0, width/height 32; applied to the visible group with `url(#micro-cut)`.
- Mask paints: white rect, black stroked journey with fill none, and black filled reveal. The journey has width 2.1 with round cap/join. Mask paints control coverage and are not extra visible logo colors.
- All four visible paths have fill #111111; no visible strokes, inherited alternate paints, styles or transforms. VISIBLE COLOR COUNT: 1.
- No live text, raster/image, filter, gradient or script elements.
- `role="img"`, `aria-labelledby="title desc"`; title and desc IDs exist exactly once. Mask ID resolves. BROKEN REFERENCES: 0.
- Title: Dấu Việt Global — Time Trace V3 Micro Mark V1.4 Monochrome.
- Description: Simplified micro mark for 16–24 px use, preserving the journey and reveal aperture.

MICRO MONO GEOMETRY RELATIONSHIP: IDENTICAL. Parsed path data and mask attributes match. A second check removed only title content and normalized hex fill values; the remaining complete SVG strings were equal. Thus viewBox, paths, mask contents, stroke geometry, structure and all remaining metadata match. This is geometry identity, not whole-file byte identity: title and visible colors differ. No source was altered.

Lifecycle evidence: the existing light micro mono is PRODUCTION_LOCKED in the registry, under the production-locked Bible with V1.4 PASS_WITH_RULES geometry validation. The source SVG itself has no lifecycle field. Its intended size is 16/24px, theme light; no exact permitted light-background hex whitelist is attached. Inventory and registry establish actual distribution, not an undocumented file. This existing lifecycle does not establish any inverse asset lifecycle or authorize inverse recoloring.

Other sources do not close the gap: the canonical V1.3 mono master also uses one visible #111111 ink, while the canonical V1.3 dark master contains three visible colors (#18463C, #D4AF7C, #EADDC7). Dark Micro retains two colors. These dark assets are not inverse monochrome substitutes.

## Validation and unchanged gap states

- `node scripts/brand/validate.mjs`: PASS.
- Direct verification of repository source manifest: 210/210 SHA-256 and byte lengths PASS.
- `node --test scripts/brand/validate.test.mjs`: 32/32 PASS, zero failures.
- `scripts/brand/validate-svg.ps1 -SelfTest`: 1 valid / 10 invalid cases PASS; distribution XML/reference checks 11/11 PASS. The source mono is byte-identical to its checked distribution copy.
- No new tests were needed for this documentation-only gate; no speculative inverse rules were encoded.
- No new rendering or QA surfaces were invented. Existing QA remains unchanged.

Inverse Mono remains CANONICAL_ASSET_GAP. The existing gap matrix already expresses that state, so no gap matrix or registry edit is required. Six actionable gaps remain overall: Inverse Mono plus the five unchanged other gaps Citation, Evidence, Reconstruction, AI Translation and Sensitive.

## Files and frozen-area verification

FILES CREATED: `docs/brand/brand-inverse-mono-resolution-pass-05.md`.

FILES MODIFIED IN PASS #5: NONE. FILES COPIED: NONE.

The six pre-existing uncommitted Pass #4.2 files remain preserved. This pass writes only this new report. Backend/API/NestJS/Prisma/migrations/database/PostgreSQL/PostGIS/Redis/BullMQ/OpenAPI/API contracts/auth/.env are UNCHANGED; no environment file was opened. Web/Mobile/Admin, Horizontal V1.4/V1.4.1, Dark Micro V1.0/V1.1, canonical Time Trace sources, registry, manifests and QA assets were not modified. Source integrity checks and the final Git diff/status confirm the audit scope.

GIT COMMIT: NOT CREATED. GIT PUSH: NOT PERFORMED.

NEXT: obtain an explicit locked Inverse Mono specification for the three missing decisions above; then re-run the deterministic derivation gate. Do not recolor, create a candidate, integrate or production-lock an inverse asset before that evidence exists. Citation and all Trust Glyph work remain unstarted.
