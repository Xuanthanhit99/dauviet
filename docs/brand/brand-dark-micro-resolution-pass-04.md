# CODEX PASS #4 — DARK MICRO RESOLUTION

Date: 2026-09-17. Workspace: `D:/dauviet`.

Status: **BLOCKED**. Decision: **CANONICAL_ASSET_GAP**. Dark-surface evidence is insufficient to produce a deterministic candidate without a new visual decision.

## Git state and inspection scope

Initial `git status --short` reported the existing four untracked directories: Brand Bible, `docs/brand/`, `packages/`, `scripts/`. `git diff --stat` was empty. No staging, commit, push, reset or cleanup was performed.

Source paths below are relative to `Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/`.

Inspected the root README and source inventory; Phase 01 micro SVGs and production validation; master light/dark SVG paint attributes; Phase 02 color/application Markdown, token JSON and final validation JSON; Phase 08/08.1 theme rules; registry micro records and Dark Micro gap. Searched Phase 01 text and JSON, including horizontal construction records, for micro, 16px, 24px, dark, inverse and monochrome. Earlier micro V1.1/V1.2 and V1.1 raster size references exist but are not the current locked baseline. Phase 04 micro icon sprites are not logo geometry.

## Exact canonical sources and size rules

| Source under `01-Logo-Master-Geometry/` | Lifecycle | Surface and palette | Sizes / distribution |
| --- | --- | --- | --- |
| `dau-viet-global-time-trace-v3-micro-v1.3.svg` | PRODUCTION_LOCKED; named by V1.4 production validation | Registry theme light; visible fills #D4AF7C, #18463C, #062A24, #18463C | Same canonical source for 16px and 24px; existing byte-identical distribution copy |
| `dau-viet-global-time-trace-v3-micro-v1.4-mono.svg` | PRODUCTION_LOCKED in existing registry | Registry theme light; fixed #111111 visible ink, not currentColor | Same source for 16px and 24px; existing byte-identical distribution copy; not an inverse treatment |

Production copies retain these filenames under `packages/brand-assets/logo/micro/`.

V1.3 micro SHA-256: `5ea0abc6b5045ebda285a467ca5f112595473008832435f6177637c52d5d9e2d`.

V1.4 micro mono SHA-256: `ca59b22908a2a245c5f66cf1b5f20df1575fa01ce1b0c30742e1beba4c785abf`.

Both have viewBox `0 0 32 32`, six paths total (four visible paths and two mask paths), `micro-cut` user-space mask and negative-space Journey/Reveal. The Journey mask stroke is 2.1 source units with round caps/joins. No separate locked 16px versus 24px geometry is specified. The existing source explicitly covers both sizes.

`dau-viet-global-time-trace-v3-production-validation-v1.4.json` names the V1.3 micro geometry and records PASS_WITH_RULES. Its Markdown states: 16px micro only; 24px micro; 32px master allowed; 48px+ master preferred. A scaled normal master cannot replace the 16px or 24px micro baseline.

## Dark-surface evidence and decision gate

- Phase 01 V1.4 validation reports dark-background PASS at application level, but supplies no micro-specific dark fill assignment, named dark micro source or recoloring procedure. It also prohibits arbitrary recoloring.
- `dau-viet-global-time-trace-v3-geometry-v1.3-dark.svg` provides a concrete dark **master** precedent: its third visible fill is #EADDC7 instead of the light master's #062A24. The remaining visible fills are #D4AF7C and #18463C. No inspected locked rule extends that replacement to the distinct micro geometry. Applying it to micro would be an inferred design decision.
- `02-Color-Accessibility/dau-viet-global-phase02-color-accessibility-v1.0.md` and `dau-viet-global-color-system-final-validation-v1.1.json` define inverse surface #062A24, white inverse text, sand inverse soft text, and gold accent contrast. These specify semantic color roles, not a per-path dark micro palette. Palette membership alone does not authorize a logo treatment.
- Phase 02 states it does not redesign the Phase 01 logo. Phase 08.1 prohibits literal palette inversion. Neither supplies a dark micro conversion contract.
- The existing registry records both micro variants as light and Dark Micro as CANONICAL_ASSET_GAP. The mono file's fixed #111111 is not evidence for an inverse monochrome or dark micro asset.

Canonical locked micro geometry and unambiguous size classification exist. The missing requirement is an approved **micro-specific dark-surface treatment**: exact mapping for all four visible fills, permitted background(s), and confirmation that this mapping applies unchanged to both 16px and 24px with the locked mask/geometry. In particular, evidence must explicitly authorize or reject extending the master replacement #062A24 → #EADDC7 to micro and specify whether the two #18463C regions remain unchanged. No alternative mapping is selected in this pass.

Decision: **CANONICAL_ASSET_GAP**. The user's Section 3 stop condition applies. No candidate package or artwork was generated.

## Geometry, palette, SVG and size QA

Dark Micro geometry identity: NOT_APPLICABLE. Candidate palette validation: NOT_APPLICABLE. Candidate SVG accessibility: NOT_APPLICABLE. There is no derivative to compare or approve.

Existing micro SVGs retain `role="img"`, valid `aria-labelledby="title desc"`, title/desc IDs and the mask reference. The unchanged complete SVG validator passes all ten registered SVGs. This validates existing assets, not a hypothetical Dark Micro candidate.

16px QA: NOT_CREATED. 24px QA: NOT_CREATED. 32px comparison: NOT_CREATED. The derivation gate failed before artwork generation; no candidate raster evidence or visual pass is claimed. Journey/Reveal perceptibility, silhouette, clipping and subpixel behavior for a new dark treatment remain untested. Existing source QA is not relabeled as candidate QA.

## Tests and gap state

- `node scripts/brand/validate.mjs`: PASS; original source 133/133, horizontal V1.4.1 geometry and source-copy checks 3/3, source manifests and registry integrity pass.
- `node --test --test-reporter=dot scripts/brand/validate.test.mjs`: **20/20 PASS**.
- `powershell -NoProfile -File scripts/brand/validate-svg.ps1 -SelfTest`: **10/10 SVG XML/reference checks PASS**, one valid and ten invalid self-test cases PASS.

No test was added, removed or weakened because no deterministic candidate was created. Registry remains 39 assets. Dark Micro remains CANONICAL_ASSET_GAP in the unchanged registry and gap matrix. All seven actionable design gaps remain; horizontal V1.4.1 remains resolved. Inverse Mono and Trust Glyph work were not started.

## File delta and frozen-area verification

Created: `docs/brand/brand-dark-micro-resolution-pass-04.md` only.

Modified existing files: none. Copied assets: none.

A pre-write SHA-256 snapshot of the Brand Bible, packages, brand documentation and brand scripts is retained outside the repository at `C:/Users/84366/AppData/Local/Temp/dvg-pass04-before.json`. Final comparison confirms every pre-existing file in that scope is unchanged, including Horizontal Logo V1.4/V1.4.1, registry, manifests, validators, tests and gap matrix. All task writes are restricted to this report and that temporary checkpoint. Backend/API/Prisma/database/environment and application files were neither modified nor operated on. No commit or push was performed.

Final status: **BLOCKED — CANONICAL_ASSET_GAP**. Stop pending explicit dark micro treatment evidence described above.
