# CODEX PASS #4.1 — DARK MICRO CANDIDATE

Date: 2026-09-17. Final status: **BLOCKED — render QA fails on Forest 700 at both required sizes**.

## Decision and authorization

Pass #4 correctly stopped for missing dark-micro color/background authority. Its report is preserved. The user now explicitly approves Dark Micro Treatment V1.0, dated 2026-09-17: preserve canonical micro V1.3 geometry; replace only #062A24 with #EADDC7; retain all other colors; permit only #062A24 and #18463C backgrounds. Treatment approval is not candidate visual approval or production lock.

The deterministic candidate was created and tested. Its two preserved #18463C visible regions have **1:1 contrast** on the approved #18463C surface. Actual 16px and 24px renders show those regions disappearing into the background, damaging the complete silhouette and Reveal. The authorized mapping therefore does not pass both required surfaces. No additional color mapping, optical correction, effect or geometry repair was made. Dark Micro remains CANONICAL_ASSET_GAP; candidate readiness was not asserted.

## Source integrity and geometry

Canonical source: `Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/01-Logo-Master-Geometry/dau-viet-global-time-trace-v3-micro-v1.3.svg`.

SHA-256: `5ea0abc6b5045ebda285a467ca5f112595473008832435f6177637c52d5d9e2d`. Verified against existing registry and source manifest before candidate generation. Original Brand Bible 133/133 and horizontal release checks pass.

Candidate package: `Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/01-Logo-Master-Geometry/Dau-Viet-Global-Dark-Micro-V1.0-CANDIDATE/`.

One `dvg-dark-micro-v1.0.svg` serves both 16px and 24px, matching the existing architecture. No separate optical geometry was fabricated. Candidate metadata pins the source and candidate SHA-256. Replacing the single candidate #EADDC7 fill back with #062A24 restores the complete source bytes. This proves identical viewBox `0 0 32 32`, all six paths and every d value, both mask paths, micro-cut dimensions, stroke geometry, transforms, clipping behavior, rendering structure, metadata and ordering. Geometry identity: **PASS**.

## Complete color diff and contrast

Exactly one change: third visible path `fill="#062A24"` becomes `fill="#EADDC7"`. Other visible fills remain #D4AF7C, #18463C and #18463C. Mask white/black/none and the existing mask stroke remain unchanged. Other fill/stroke/color differences: zero. Unauthorized mappings: **0**. No live text, raster image, filter, gradient, added stroke, opacity, blend mode or other effect was introduced. Every visible hex value belongs to the locked Phase 02 palette.

Calculated from current token values using sRGB linearization and relative luminance weights 0.2126/0.7152/0.0722; contrast = (lighter luminance + 0.05)/(darker luminance + 0.05):

| Pair | Actual ratio | Result |
| --- | ---: | --- |
| Warm Sand #EADDC7 / Deep Forest #062A24 | 11.481765:1 | PASS |
| Warm Sand #EADDC7 / Forest 700 #18463C | 7.911404:1 | PASS |
| Preserved Forest 700 / Deep Forest | 1.451293:1 | Low regional contrast; visible but faint |
| Preserved Forest 700 / Forest 700 | 1.000000:1 | Regions disappear; render QA FAIL |

Warm Sand contrast passes the Phase 02 3:1 graphical threshold and the previously reported ratios are confirmed by calculation. It does not prove visibility of every other region. No new global contrast or accessibility compliance claim is made.

## SVG accessibility and actual render QA

The unchanged title and desc have IDs referenced by `aria-labelledby="title desc"`; role is img. The existing PowerShell .NET XML validator was run directly against the candidate and passed: valid XML/viewBox, all IDs resolve, zero broken references and no prohibited SVG elements. Source title wording is deliberately retained; controlled package metadata distinguishes the derivative.

Rendered in locally installed Google Chrome headless with `--force-device-scale-factor=1 --window-size=560,700 --hide-scrollbars --disable-gpu`, using the retained `render-input.html` and data-URI SVGs. The screenshot is `render-board.png`. Pillow crops the original native pixel regions at (40,40), (320,40), (40,240), (320,240), (40,440), (320,440), at 16/24/32px as appropriate. `pixel-inspection-6x.png` enlarges these crops with nearest-neighbor sampling for inspection only. No candidate geometry or native render pixels were edited.

| Size / surface | Visual QA | Observation |
| --- | --- | --- |
| 16px / #062A24 | PASS, subject to human approval | Recognizable reduced mark; Journey/aperture retained, green regions faint; no clipping or filled aperture |
| 24px / #062A24 | PASS, subject to human approval | Journey/aperture and silhouette retained; low green-region contrast remains visible in evidence |
| 16px / #18463C | FAIL | Both preserved green regions merge with surface; incomplete silhouette and lost local Reveal |
| 24px / #18463C | FAIL | Same exact-color collision persists; larger size does not fix it |

No geometric path collapse or clipping was observed; the failure is color/background visibility. Small-size antialiasing is visible, especially at 16px; it does not repair the Forest 700 failure. The 32px comparison uses the existing normal dark master, not a substituted micro source. It exhibits the same background collision on Forest 700 and does not authorize micro modification.

## Lifecycle, inventory and checks

Lifecycle: **CANDIDATE**. Version: V1.0. Treatment: APPROVED_TREATMENT_SPECIFICATION. Candidate QA status: BLOCKED_RENDER_QA. Human approval: PENDING_HUMAN_APPROVAL. Distribution: false. No PRODUCTION-LOCK file or production asset record was created.

Registry still contains 39 production/reference asset records with unchanged identities and checksums. Only its repository-manifest checksum changed to cover the five new candidate source files. Repository source manifest/inventory now cover 199 artifacts; candidate entries have no selected production paths. The original source manifest and all pre-existing source bytes, including horizontal V1.4/V1.4.1, remain unchanged. A four-entry candidate MANIFEST.sha256 pins the SVG and three metadata documents; VALIDATION.json pins all nine QA artifacts.

Dark Micro's gap-matrix row now records the failed candidate while retaining CANONICAL_ASSET_GAP. Other gap rows and registry gap records are unchanged. Inverse Mono and Trust Glyphs were not started.

Validation:

- `node scripts/brand/validate.mjs`: PASS for controlled source integrity, registry/inventory, existing horizontal checks and candidate evidence safeguards. This integrity result is not visual approval.
- `node --test --test-reporter=dot scripts/brand/validate.test.mjs`: **24/24 PASS**, preserving the original 20 tests and adding four candidate regression tests.
- `powershell -NoProfile -File scripts/brand/validate-svg.ps1 -SelfTest`: existing 10 registered SVGs PASS; one valid and ten invalid self-test cases PASS.
- Direct `Assert-BrandSvg` on the candidate: PASS, zero broken references.

New checks reject unauthorized color or geometry changes, invalid lifecycle/distribution, expanded surfaces or sizes, broken labels, effects/raster/live text, missing QA evidence and premature promotion of this failed candidate. No existing assertions were weakened. The narrowly collected QA HTML is hash-checked as evidence and is not an application/token consumer.

## Frozen areas and next step

Initial Git status contained the same four untracked directories; `git diff --stat` was empty. Pre-write SHA snapshot: `C:/Users/84366/AppData/Local/Temp/dvg-pass041-before.json`. Final comparison confirms only the brand files listed below changed; no pre-existing Brand Bible source or previous report changed. Backend/API/Prisma/database/environment and Web/Mobile/Admin were not modified or operated on. The Chrome render profile and snapshot files are temporary artifacts outside the repository. No commit, push, reset, revert, stash or clean was performed.

Final decision: **BLOCKED**. Candidate retained for human review of the failed surface treatment; do not promote or mark ready. WAIT_FOR_HUMAN_VISUAL_APPROVAL / treatment direction. A further approved decision is needed to address the Forest 700 collision; none is inferred here.

## Exact repository file delta

Created:

- `Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/01-Logo-Master-Geometry/Dau-Viet-Global-Dark-Micro-V1.0-CANDIDATE/CANDIDATE.json`
- `Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/01-Logo-Master-Geometry/Dau-Viet-Global-Dark-Micro-V1.0-CANDIDATE/MANIFEST.sha256`
- `Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/01-Logo-Master-Geometry/Dau-Viet-Global-Dark-Micro-V1.0-CANDIDATE/README.md`
- `Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/01-Logo-Master-Geometry/Dau-Viet-Global-Dark-Micro-V1.0-CANDIDATE/VALIDATION.json`
- `Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/01-Logo-Master-Geometry/Dau-Viet-Global-Dark-Micro-V1.0-CANDIDATE/dvg-dark-micro-v1.0.svg`
- `docs/brand/brand-dark-micro-candidate-pass-04-1.md`
- `docs/brand/qa/dark-micro-v1.0/dark-micro-16px-062a24.png`
- `docs/brand/qa/dark-micro-v1.0/dark-micro-16px-18463c.png`
- `docs/brand/qa/dark-micro-v1.0/dark-micro-24px-062a24.png`
- `docs/brand/qa/dark-micro-v1.0/dark-micro-24px-18463c.png`
- `docs/brand/qa/dark-micro-v1.0/master-reference-32px-062a24.png`
- `docs/brand/qa/dark-micro-v1.0/master-reference-32px-18463c.png`
- `docs/brand/qa/dark-micro-v1.0/pixel-inspection-6x.png`
- `docs/brand/qa/dark-micro-v1.0/render-board.png`
- `docs/brand/qa/dark-micro-v1.0/render-input.html`
- `scripts/brand/validate-dark-micro.mjs`

Modified:

- `docs/brand/brand-asset-gap-matrix.md`
- `packages/brand-contracts/brand-registry.json`
- `packages/brand-contracts/source-inventory.json`
- `packages/brand-contracts/source-manifest.json`
- `scripts/brand/validate.mjs`
- `scripts/brand/validate.test.mjs`
