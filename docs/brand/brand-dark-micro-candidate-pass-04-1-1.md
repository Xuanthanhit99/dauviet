# CODEX PASS #4.1.1 — DARK MICRO V1.1 CANDIDATE

Date: 2026-09-17. Status: **PASS — CANDIDATE_READY_FOR_APPROVAL**. Human approval: **PENDING_FINAL_VISUAL_APPROVAL**. This is not a production lock.

## Recovery and approved correction

V1.0 correctly failed on Forest 700 at 16px and 24px: two unchanged #18463C regions matched the surface at 1:1 and disappeared. Its complete candidate package, nine QA artifacts and Pass #4.1 report remain unchanged as historical failed evidence. The baseline full suite passed 24/24 before edits.

The user explicitly approved Dark Micro Treatment V1.1 on 2026-09-17, authorizing exactly two mappings: #062A24 → #EADDC7 and #18463C → #EADDC7. The V1.1 sibling is derived directly from canonical micro V1.3. One candidate SVG serves both 16px and 24px; no master reduction, inverse mono substitution or optical variation was introduced.

The brief's “single-tone” description does not match the result of its exact permitted mappings: canonical micro V1.3 also contains #D4AF7C. The explicit prohibition on any other mapping was followed, so the gold accent is retained. V1.1 is three Warm Sand regions plus the unchanged gold region; no unauthorized gold-to-sand conversion was made. This distinction is visible in the real QA board and candidate README.

## Canonical source and geometry identity

Source: `Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/01-Logo-Master-Geometry/dau-viet-global-time-trace-v3-micro-v1.3.svg`.

Source SHA-256: `5ea0abc6b5045ebda285a467ca5f112595473008832435f6177637c52d5d9e2d`.

Candidate: `Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/01-Logo-Master-Geometry/Dau-Viet-Global-Dark-Micro-V1.1-CANDIDATE/dvg-dark-micro-v1.1.svg`.

Candidate SHA-256: `0733fcea85b2d32362b04f00f8fd0a700cac56abebea3e1411b7f1f9aa5e6b1d`.

Before creating the candidate, existing source checks passed, including the immutable original 133-entry manifest, repository inventory, source micro checksum and horizontal release manifests. The V1.1 SVG equals the source bytes after only the two authorized string replacements. Normalizing those three fill occurrences produces identical complete-content fingerprints:

`c5807f98b68e6f55334480dd19c833aa64aff650f579fff1660724d214ef16c1`.

Everything else is byte-identical: viewBox `0 0 32 32`, six paths (four visible and two mask paths), every path d, masks, Journey and Reveal, transforms, clipping behavior, spacing, dimensions, proportions, silhouette geometry, attributes, metadata and rendering order. No formatter, optimizer or redesign was used. **MICRO_GEOMETRY_IDENTITY: PASS**.

## Complete color diff

| Visible path | Source fill | V1.1 fill | Result |
| --- | --- | --- | --- |
| 1 | #D4AF7C | #D4AF7C | Preserved gold; no mapping authorized |
| 2 | #18463C | #EADDC7 | Authorized |
| 3 | #062A24 | #EADDC7 | Authorized |
| 4 | #18463C | #EADDC7 | Authorized |

Two unique mappings, three changed fill occurrences, **zero unauthorized mappings**. Other fill/stroke/color differences: none. Mask white/black/none and existing mask strokes remain unchanged. All visible hex values belong to the locked Phase 02 palette. No added stroke, shadow, glow, filter, gradient, opacity, blur, blend mode, texture, raster, live text or invented clipping was introduced.

Permitted backgrounds remain ONLY #062A24 and #18463C. No white, sand, stone, uncontrolled photography/video or unknown/dynamic background is approved. This treatment does not resolve Inverse Mono.

## Calculated contrast and SVG accessibility

Token input: `02-Color-Accessibility/dau-viet-global-color-system-final-validation-v1.1.json` in the Brand Bible. The calculation reads current forest_950, forest_700, sand_100 and gold_500 values. It linearizes sRGB channels, applies luminance weights 0.2126/0.7152/0.0722, and calculates (Lmax + 0.05)/(Lmin + 0.05).

| Pair | Actual contrast | Graphical threshold | Result |
| --- | ---: | ---: | --- |
| #EADDC7 / #062A24 | 11.4817651205:1 | 3:1 | PASS |
| #EADDC7 / #18463C | 7.9114037998:1 | 3:1 | PASS |
| Preserved #D4AF7C / #062A24 | 7.4922409168:1 | 3:1 | PASS |
| Preserved #D4AF7C / #18463C | 5.1624591373:1 | 3:1 | PASS |

The existing .NET XML validator was run directly against the candidate. SVG XML, viewBox, role img, title/desc IDs, aria-labelledby, internal references and allowed static elements pass. **Broken references: 0**. Title/desc wording remains source-exact; version and treatment identity are recorded in controlled metadata. No production SVG was changed.

## Actual SVG render QA

QA directory: `D:/dauviet/docs/brand/qa/dark-micro-v1.1/`.

`render-input.html` embeds the actual V1.1 SVG bytes four times as base64 data URIs. The validator decodes them and requires exact candidate equality. Local Google Chrome headless rendered at device scale factor 1, with `--disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size=560,500`. The retained screenshot is `render-board.png`. Four native PNGs were cropped using Pillow at (40,40), (320,40), (40,240), (320,240) with dimensions 16/16/24/24px. The inspection board uses nearest-neighbor 6x enlargement of those exact pixels. No AI-generated substitute or candidate geometry adjustment was used.

| Actual candidate render | Result | Inspection |
| --- | --- | --- |
| 16px on #062A24 | PASS | Complete micro silhouette; Journey and Reveal open; former green regions visible |
| 16px on #18463C | PASS | Both former disappearing regions now Warm Sand and visible; aperture remains open |
| 24px on #062A24 | PASS | Complete silhouette and distinct Journey/Reveal; no missing regions |
| 24px on #18463C | PASS | Corrected regions clearly visible; silhouette and aperture retained |

Across all four: no clipping, filled aperture or severe pixel collapse observed. Normal small-size antialiasing remains, especially at 16px, without erasing the required structure. Recognizability passes this technical visual inspection; final human visual approval is still pending. **REAL SVG RENDER QA: PASS 4/4**.

## Lifecycle, gap and validation

New sibling package contains the SVG, CANDIDATE.json, VALIDATION.json, README.md and a four-entry MANIFEST.sha256. Lifecycle CANDIDATE; treatment specification APPROVED; human approval PENDING_FINAL_VISUAL_APPROVAL; distribution false. No PRODUCTION-LOCK.md and no PRODUCTION_LOCKED status exist for V1.1.

Registry production/reference assets remain 39 with unchanged identities and checksums. Only the Dark Micro gap record is updated to CANDIDATE_READY_FOR_APPROVAL, referencing the exact V1.1 metadata and evidence; it is not resolved. Repository inventory grows from 199 to 204 artifacts, with no selected production paths for the candidate. Original source manifest and both horizontal releases remain unchanged.

All six other actionable design gaps retain their state. The seven-item action list remains, with Dark Micro awaiting final approval. The gap matrix updates only Dark Micro and clarifies its historical Pass #3 checkpoint.

Validation results:

- `node scripts/brand/validate.mjs`: PASS, including original 133/133 checksums, repository inventory, horizontal V1.4.1 3/3 checks, both candidate manifests and pinned QA evidence.
- `node --test --test-reporter=dot scripts/brand/validate.test.mjs`: **29/29 PASS**. All 24 existing tests remain, with five new V1.1 regressions.
- `powershell -NoProfile -File scripts/brand/validate-svg.ps1 -SelfTest`: 10/10 existing production SVGs PASS; one valid and ten invalid self-test cases PASS.
- Direct `Assert-BrandSvg` on V1.1: PASS.

The V1.0 validator still requires its failed Forest 700 results and rejects its promotion. It now allows the separate gap to point to the validated V1.1 candidate. The corresponding old test explicitly tries to promote V1.0 and still requires rejection. The existing gap-count test now expects only Dark Micro's approved candidate-ready transition; the six other design gaps remain CANONICAL_ASSET_GAP. No failure evidence, checksum check or SVG restriction was removed. V1.1 checks reject additional color or geometry changes, promotion, expanded backgrounds/sizes, broken labels, effects, false contrast figures, missing or duplicate render combinations, wrong native PNG dimensions, altered artifacts and unrelated embedded SVGs.

## Frozen-area verification and next step

Initial Git state: the same four untracked directories; `git diff --stat` empty. Pre-edit hash checkpoint: `C:/Users/84366/AppData/Local/Temp/dvg-pass0411-before.json`. Final comparison verifies all pre-existing Brand Bible files, all V1.0 QA artifacts and previous reports remain unchanged. Only the brand files listed below were modified. All task writes were restricted to brand source/package metadata, QA, documentation, tests and the isolated temporary Chrome profile/checkpoint.

Backend/API/Prisma/database/environment and Web/Mobile/Admin were not modified or operated on. Horizontal V1.4/V1.4.1 are unchanged. No commit, push, reset, revert, stash or clean was performed. Inverse Mono and Trust Glyph work were not started.

Final status: **PASS — candidate ready only**. Next: **WAIT_FOR_FINAL_HUMAN_VISUAL_APPROVAL**. Do not production lock.

## Exact repository file delta

Created:

- `Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/01-Logo-Master-Geometry/Dau-Viet-Global-Dark-Micro-V1.1-CANDIDATE/CANDIDATE.json`
- `Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/01-Logo-Master-Geometry/Dau-Viet-Global-Dark-Micro-V1.1-CANDIDATE/MANIFEST.sha256`
- `Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/01-Logo-Master-Geometry/Dau-Viet-Global-Dark-Micro-V1.1-CANDIDATE/README.md`
- `Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/01-Logo-Master-Geometry/Dau-Viet-Global-Dark-Micro-V1.1-CANDIDATE/VALIDATION.json`
- `Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/01-Logo-Master-Geometry/Dau-Viet-Global-Dark-Micro-V1.1-CANDIDATE/dvg-dark-micro-v1.1.svg`
- `docs/brand/brand-dark-micro-candidate-pass-04-1-1.md`
- `docs/brand/qa/dark-micro-v1.1/dark-micro-16px-062a24.png`
- `docs/brand/qa/dark-micro-v1.1/dark-micro-16px-18463c.png`
- `docs/brand/qa/dark-micro-v1.1/dark-micro-24px-062a24.png`
- `docs/brand/qa/dark-micro-v1.1/dark-micro-24px-18463c.png`
- `docs/brand/qa/dark-micro-v1.1/pixel-inspection-6x.png`
- `docs/brand/qa/dark-micro-v1.1/render-board.png`
- `docs/brand/qa/dark-micro-v1.1/render-input.html`

Modified:

- `docs/brand/brand-asset-gap-matrix.md`
- `packages/brand-contracts/brand-registry.json`
- `packages/brand-contracts/source-inventory.json`
- `packages/brand-contracts/source-manifest.json`
- `scripts/brand/validate-dark-micro.mjs`
- `scripts/brand/validate.mjs`
- `scripts/brand/validate.test.mjs`
