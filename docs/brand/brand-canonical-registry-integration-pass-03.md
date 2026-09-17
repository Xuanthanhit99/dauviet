# CODEX PASS #3 — CANONICAL REGISTRY INTEGRATION

Current outcome: **PASS - V1.4.1 corrective release integrated**. Earlier BLOCKED sections below are retained historical checkpoints; see the completed-release section at the end.

Date: 2026-09-17.

## Continuation / recovery checkpoint — 2026-09-17

The recovery request described a session/token interruption. Inspection of the persisted report and actual files establishes that the previous run had reached a concrete **BLOCKED** validation result, not a partially completed distribution integration. This continuation preserved the prior report and did not restart or reproduce completed work.

Starting Git state remains `main` at `D:/dauviet`, with the same four untracked directories. `git diff --stat` and `git diff` are empty. The untracked package/docs/script inventory was inspected explicitly. Comparison against the previous pre-report hash checkpoint confirms none of the 58 existing Pass #1/#2 package, documentation or validator files changed. The previous Pass #3 addition was this report alone.

| Recovery checkpoint | Verified state | Evidence |
| --- | --- | --- |
| SOURCE MANIFEST VERIFIED | DONE | Fresh verification: original 133/133 and V1.4 17/17 checksums pass |
| CANONICAL LIGHT COPIED | NOT_STARTED | No horizontal distribution directory or registry record |
| CANONICAL DARK COPIED | NOT_STARTED | No horizontal distribution directory or registry record |
| CANONICAL MONO COPIED | NOT_STARTED | No horizontal distribution directory or registry record |
| BYTE IDENTITY VERIFIED | NOT_STARTED | No package copies exist to compare |
| REGISTRY UPDATED | NOT_STARTED | Existing 36 records; zero horizontal records |
| REPOSITORY MANIFEST UPDATED | NOT_STARTED | Existing manifest/inventory unchanged |
| VALIDATOR UPDATED | NOT_STARTED | Existing assertions preserved; new source validation FAILED for all three variants |
| TESTS UPDATED | NOT_STARTED | Existing test file unchanged |
| GAP MATRIX UPDATED | NOT_STARTED | Existing matrix unchanged; no premature resolution |
| LOCK RECORD CREATED | NOT_STARTED | `docs/brand/locks` still absent |
| PASS #3 REPORT | DONE | Blocked-outcome report preserved and extended with this recovery checkpoint |
| FULL BRAND TESTS | FAIL | Fresh run: 14/15; source-inventory baseline still fails |
| FROZEN AREA VERIFICATION | PASS | No tracked changes; no frozen-area writes in either run |

Already completed before recovery: source discovery, checksum verification, source SVG failure diagnosis, existing test execution and the blocked report. Completed in recovery: actual-state reconstruction, repeat source verification, repeat all 15 brand tests, repeat existing SVG self-tests and seven registered SVG checks, direct checks of all three V1.4 sources, and this report update.

The new checks again return `BROKEN_REFERENCE title` for light, dark and mono. Their `aria-labelledby="title desc"` references remain unresolved because the corresponding elements have no IDs. The source hashes remain exactly those recorded below. Approval/lifecycle metadata does not remove this validation failure, and the continuation request explicitly prohibits both source mutation and weakening existing assertions. No failed step was bypassed.

Recovery commands: `git rev-parse --show-toplevel`, `git branch --show-current`, `git status --short`, `git diff --stat`, `git diff`, `rg --files packages docs/brand scripts/brand`, full report read, local Node `fs`/`crypto` checksum and checkpoint comparisons, `node --test scripts/brand/validate.test.mjs` (invoked through `spawnSync` to summarize output, exit **1**), `. ./scripts/brand/validate-svg.ps1 -SelfTest`, and the same per-variant `Assert-BrandSvg` loop documented below. The PowerShell catch blocks report failures rather than asserting success.

Recovery result: **BLOCKED**, for the same verified source-reference defect. Integration copies, registry/manifest updates, new validator/tests, gap resolution and repository lock remain unperformed. Exact continuation modification: `docs/brand/brand-canonical-registry-integration-pass-03.md` only. Files copied: none. Source artwork, existing tests/validators, backend/API/Prisma/database/environment and application directories remain unchanged. No commit, push or Dark Micro work was performed. The seven actionable design gaps below remain separate from this unresolved horizontal integration blocker.

## Final status: BLOCKED

The approved Horizontal Logo V1.4 source package is present and all 17 entries in its `MANIFEST.sha256` pass. However, all three canonical distribution SVGs fail the existing SVG reference validator with `BROKEN_REFERENCE title`. Integration stopped before copying artwork or changing the registry, manifest, gap matrix, tests or validators.

This is **not** `CANONICAL_SOURCE_INTEGRITY_FAILURE`: the source checksums match. It is a source SVG accessibility-reference defect that cannot be corrected in this pass without violating the explicit prohibition on editing canonical V1.4 SVG contents. Existing assertions were not weakened.

## Workspace and Git state

- Workspace and Git root: `D:/dauviet`.
- Branch: `main`.
- Initial Git status: untracked `Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/`, `docs/brand/`, `packages/`, `scripts/`.
- All Pass #1/#2 files were preserved as existing user work. No tracked change, reset, clean, checkout, staging, commit or push was performed.
- Five packages exist: `brand-assets`, `brand-tokens`, `brand-icons`, `brand-motion`, `brand-contracts`.
- Registry: `packages/brand-contracts/brand-registry.json`, 36 asset records and 11 previously recorded gaps.
- Repository manifest/inventory: `packages/brand-contracts/source-manifest.json` and `source-inventory.json`.
- Validators/tests: `scripts/brand/validate.mjs`, `validate-svg.ps1`, `validate.test.mjs`.
- Gap matrix: `docs/brand/brand-asset-gap-matrix.md`.
- No existing `docs/brand/locks` or `docs/brand/qa` convention/directory was found. No application was created.

## Files inspected

Inventoried the five shared packages and `docs/brand`, located existing reports, registry, manifest, inventory, validators and tests, and read the current gap matrix and validator implementation. Inspected the new V1.4 directory and its:

- `README.md`
- `LOCK.json`
- `PRODUCTION-LOCK.md`
- `PRODUCTION-VALIDATION.json`
- `MANIFEST.sha256`
- All three `dvg-logo-horizontal-primary-*-v1.4.svg` files
- `dvg-logo-horizontal-construction-editable-v1.4.svg`

The nine QA PNGs were checksum-verified. They were not used to reconstruct or replace vector artwork. Earlier candidate directories and a rejected exploration image were observed as pre-existing source additions, not promoted to production assets.

## Source package verification

Source root:

```text
D:/dauviet/Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/01-Logo-Master-Geometry/Horizontal-Logo-Construction/Dau-Viet-Global-Horizontal-Logo-V1.4-PRODUCTION-LOCKED
```

The source lock states:

- Asset: Dấu Việt Global Horizontal Logo
- Version/lifecycle: `1.4 / PRODUCTION_LOCKED`
- Approved input: `Candidate B V1.3.1`
- Approval date: `2026-09-17`
- Canonical distribution variants: light, dark, mono
- Editable construction source: controlled source, not normal distribution
- Wide navigation target: 48px lockup height; 64px+ for brand-forward use; 32px PNGs are QA references

The editable file contains live `<text>` and style rules, consistent with its controlled-source role. It was not copied, exposed or used in place of the outlined distribution variants.

## SHA-256 verification

Original Brand Bible `MANIFEST.json`: **133 / 133 PASS**.

V1.4 package `MANIFEST.sha256`: **17 / 17 PASS** (three distribution SVGs, editable SVG, nine QA PNGs and four supporting documents). `MANIFEST.sha256` does not list itself. No source or production-copy bytes were changed.

| Canonical file | Source SHA-256 |
| --- | --- |
| `dvg-logo-horizontal-primary-light-v1.4.svg` | `162530f8f61dd724ea9a8367899ab21db40e51461b09f7c38f588662d56e8315` |
| `dvg-logo-horizontal-primary-dark-v1.4.svg` | `893827b744448812c0e39b5d90f4b53c6ba26904fb45232b463d3beb9cbb8809` |
| `dvg-logo-horizontal-primary-mono-v1.4.svg` | `12bd1046f5ec0af990d69311c04d875ba84e27edbd606ed072abc1375153c5de` |

Source/package byte identity for new distribution copies: **NOT ESTABLISHED — no copies made after validation failure**. The three source files exist, but 0/3 have been integrated.

## Confirmed validation blocker

Every canonical distribution SVG begins with this structure:

```xml
<svg ... role="img" aria-labelledby="title desc">
<title>...</title>
<desc>...</desc>
```

The `title` and `desc` nodes have no `id` attributes. The actual IDs in each file are only `journey-cut` and `wordmark-outlined`. Consequently both tokens in `aria-labelledby` are unresolved. The validator stops on `title`, the first broken reference.

| Variant | Existing validator result |
| --- | --- |
| Light | `FAIL: BROKEN_REFERENCE title` |
| Dark | `FAIL: BROKEN_REFERENCE title` |
| Mono | `FAIL: BROKEN_REFERENCE title` |

The supplied `PRODUCTION-VALIDATION.json` reports six checks (no live text, Journey mask, outlined wordmark, no raster, no gradient, no filter). It does not establish that ARIA references resolve. Inspection confirms those six structural properties, but they do not override the existing reference validation failure.

Changing the source title/description IDs would change canonical bytes and hashes. Adding a validator exemption would weaken an existing assertion. Neither action is authorized by Pass #3. No such change was made.

Required unblock: the canonical asset owner must provide a corrected, explicitly approved source release and matching manifest/lock evidence with valid accessible references, or explicitly authorize a different scoped remediation. The integration agent cannot silently edit the current locked package. No geometry, typography, spacing or visual redesign is needed to explain this metadata defect.

## Registry, manifest, validator and test changes

- Registry: **unchanged**, 36 → 36 records; no primary horizontal entry or editable distribution entry added.
- Repository source manifest/inventory: **unchanged**; no source manifest rewritten or normalization applied.
- Validator: **unchanged**; broken-reference assertion retained.
- Tests: **unchanged**, all 15 existing tests run.
- New horizontal resolution/checksum/distribution tests: deferred because canonical SVG validation failed before integration.

The current whole-repository drift validator also flags **51 `UNREGISTERED_SOURCE` paths** from newly supplied horizontal/candidate/reference material outside the original 133-file manifest. This makes the existing baseline test fail before any integration edit. These additions need explicit supplemental manifest/inventory handling when integration can resume; neither blanket exclusions nor approval of historical/rejected artwork was introduced.

## Gap matrix and remaining gaps

Gap matrix: **unchanged**. Horizontal integration is **UNRESOLVED**, pending the SVG-reference blocker. The source artwork now exists and is approved; the old missing-source explanation is superseded by this report, but the integration gap is not falsely marked resolved.

Remaining actionable **design** gaps, excluding the separately blocked horizontal integration, are exactly **7**:

1. Dark Micro
2. Inverse Mono
3. Citation
4. Evidence
5. Reconstruction
6. AI Translation
7. Sensitive

People/Event/Time at 16px remain governed by Phase 04.1: use existing canonical glyphs at 20px+ rather than fabricate micro artwork. Those three policy constraints are unchanged and are not added to the seven-item actionable design backlog.

## Repository lock record

No new repository lock record was created because the distribution integration stopped at validation. The supplied immutable `LOCK.json` and `PRODUCTION-LOCK.md` retain their existing authority and approval date. No new lock, exception, approval or version was invented.

## Commands and results

| Command / executed check | Result |
| --- | --- |
| `Get-Location` | `D:\dauviet` |
| `git rev-parse --show-toplevel` | `D:/dauviet` |
| `git branch --show-current` | `main` |
| `git status --short` | Four pre-existing untracked directories; no frozen-area changes |
| `rg --files docs/brand packages scripts/brand` | Existing package/report/validator paths discovered |
| Node `fs` + `crypto` verification of original JSON manifest and V1.4 SHA-256 manifest | 133/133 and 17/17 pass; no failure entries |
| `& ./scripts/brand/validate-svg.ps1 -SelfTest` | Existing seven production SVGs pass; one valid and ten invalid self-test cases behave correctly |
| `. ./scripts/brand/validate-svg.ps1`, then `Assert-BrandSvg` on each V1.4 primary source | All three fail `BROKEN_REFERENCE title` |
| `node --test scripts/brand/validate.test.mjs` | **14 / 15 PASS**, exit 1; baseline test reports unregistered new source additions |
| `git diff --stat` and `git diff --name-only` | No tracked edits; untracked report reviewed separately |

Exact source-validation invocation used after loading the existing validator:

```powershell
$horizontalSource = 'Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/01-Logo-Master-Geometry/Horizontal-Logo-Construction/Dau-Viet-Global-Horizontal-Logo-V1.4-PRODUCTION-LOCKED'
. ./scripts/brand/validate-svg.ps1
foreach ($variant in @('light','dark','mono')) {
  $horizontalFile = Join-Path $horizontalSource "dvg-logo-horizontal-primary-$variant-v1.4.svg"
  try { Assert-BrandSvg (Get-Content -LiteralPath $horizontalFile -Raw -Encoding UTF8) $false; Write-Output "HORIZONTAL_$variant PASS" }
  catch { Write-Output "HORIZONTAL_$variant FAIL: $($_.Exception.Message)" }
}
```

The catch blocks collected all three failures for reporting; they do not turn these checks into a pass. There was no network dependency, renderer, formatter, optimizer or artwork generation.

## Exact repository file changes

Created:

```text
docs/brand/brand-canonical-registry-integration-pass-03.md
```

Existing files modified: **none**.

Files copied: **none**.

A pre-report hash checkpoint of existing shared-package, brand-documentation and validator files was kept in the OS temporary directory to distinguish this report from earlier untracked work. Final comparison confirms the report is the only repository addition from this pass.

## Frozen-area verification

```text
BACKEND/API MODIFIED: NO
PRISMA MODIFIED: NO
DATABASE MODIFIED: NO
MIGRATIONS RUN: NO
.env MODIFIED: NO
CANONICAL SOURCE ARTWORK MODIFIED: NO
WEB APP CREATED: NO
MOBILE APP CREATED: NO
ADMIN APP CREATED: NO
COMMIT CREATED: NO
PUSH PERFORMED: NO
```

No backend/environment content was read or edited, and no backend, database, Prisma, install or application-scaffolding command was run. This pass is **BLOCKED** by a confirmed immutable-source reference failure, not by the absence of application consumers.

Next recommended design gap after unblocking this integration: **Dark Micro**.

## V1.4.1 corrective release and completed integration - 2026-09-17

Current status: **PASS**. The blocked V1.4 diagnosis and recovery history above are preserved. The latest user instruction explicitly authorizes a new sibling metadata-only corrective release. V1.4 was not patched in place.

The exact SVG edits were `<title>` to `<title id="title">` and `<desc>` to `<desc id="desc">`. Existing `role="img"` and `aria-labelledby="title desc"` were retained. Before: 3/3 parent variants fail BROKEN_REFERENCE; after: 0/3 corrected variants fail. Title and description each have exactly one referenced ID and nonempty content.

Geometry proof was calculated before editing and verified after editing: SHA-256 of the complete UTF-8 SVG with only title and desc elements removed. All remaining bytes match, covering viewBox, all 20 paths per variant, every path d, masks including journey-cut, transforms, fills, strokes, opacity, outlined wordmark, spacing, dimensions and element ordering. Additionally, reversing the two ID insertions restores the exact full parent content. Visual geometry identity: **PASS 3/3**. No optimizer, formatter, tracing, raster generation or artwork rewrite was used.

| Variant | V1.4 parent SHA-256 | V1.4.1 source and repository SHA-256 | Identical geometry fingerprint |
| --- | --- | --- | --- |
| dvg-logo-horizontal-primary-light-v1.4.1.svg | `162530f8f61dd724ea9a8367899ab21db40e51461b09f7c38f588662d56e8315` | `ea6dfc833167956d2712ee52e1ae04a3b23abfe326f82e17edf97da879a9ee6a` | `39d1bbf5cc7a43298062343be640bfc4f6b2d7f7e10614b7e33ec2e6cd604b0c` |
| dvg-logo-horizontal-primary-dark-v1.4.1.svg | `893827b744448812c0e39b5d90f4b53c6ba26904fb45232b463d3beb9cbb8809` | `ce7d2c7e14686fa0d023d7f1fc98941dad50bc0372e66f51c5530ec53bf4e22e` | `0df49d0a88b4598af45dd07060836a31c0894eccef0319fc8b3b813286522091` |
| dvg-logo-horizontal-primary-mono-v1.4.1.svg | `12bd1046f5ec0af990d69311c04d875ba84e27edbd606ed072abc1375153c5de` | `5a531c086be82b8e4850b8c358509bb637e4d1ad7c5f25b3ef9cf36e4cb217e7` | `0681f9978e0c00797f4a29c38a8eb091e1f0dfcdd3d9c1d4020697907d42a18c` |

Source: `Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/01-Logo-Master-Geometry/Horizontal-Logo-Construction/Dau-Viet-Global-Horizontal-Logo-V1.4.1-PRODUCTION-LOCKED`. The new seven-entry MANIFEST.sha256 covers three corrected SVGs plus LOCK.json, README.md, PRODUCTION-LOCK.md and PRODUCTION-VALIDATION.json. Its manifest is pinned by the repository registry and inventory. Parent QA PNGs remain inherited comparison evidence at their original locations; none were copied or regenerated. The editable source remains reference-only in the parent package.

Before copying, existing Assert-BrandSvg checks passed for all three corrected sources, with no live text, raster image, filter or gradient, and with the Journey mask intact. Original 133/133, parent 17/17 and corrected 7/7 integrity checks passed. Only then were the three V1.4.1 primary SVGs copied and registered. Byte identity source to repository: **PASS 3/3**.

The original 36 registered resource identities, paths and checksums remain intact. Three current horizontal records bring the total to **39**, version 1.4.1, lifecycle PRODUCTION_LOCKED, correction METADATA_ONLY, parent 1.4, distribution true. Light/dark/mono resolve uniquely; historical parent, rejected candidates and editable construction do not become primary distribution. Registry schemaVersion remains 1. Wide navigation uses 48px minimum, 64px+ preferred; compact placements retain existing symbol/micro policy.

The previously failing baseline test also reported 51 UNREGISTERED_SOURCE findings for supplemental files beyond the original inventory. Fixing SVG metadata alone would not repair that inventory failure. The repository manifest now accounts for all 194 source artifacts, while independently pinning the immutable original 133-entry manifest and both release manifests. Historical/rejected files are observed reference records, not approved artwork. No source-directory blanket exclusion, broken-reference exception or removed assertion was introduced. The original XML validator remains byte-identical.

Validation commands and results:

- `node scripts/brand/validate.mjs`: PASS, original source 133/133, supplemental inventory 194/194, both release manifests, three canonical resolutions, source-copy checksums, geometry, registry and existing drift gates.
- `node --test scripts/brand/validate.test.mjs`: **20/20 PASS**, including all original 15 tests and five corrective-release regressions.
- `powershell -NoProfile -File scripts/brand/validate-svg.ps1 -SelfTest`: **10/10 registered SVGs PASS**; one valid and ten invalid self-test cases PASS.

Horizontal logo gap: **RESOLVED**. Exactly seven actionable design gaps remain: Dark Micro, Inverse Mono, Citation, Evidence, Reconstruction, AI Translation, Sensitive. People/Event/Time 16px remain unsupported by the existing resolver and governed by the 20px minimum. No fabricated micro glyph or silent fallback was introduced. Repository lock: `docs/brand/locks/horizontal-logo-v1.4.1.md`.

Frozen-area verification: SHA-256 comparison against the pre-edit checkpoint preserves all **188 pre-existing source files**, including all 18 files in the V1.4 package. Every original token, icon, motion and other asset copy remains unchanged. `git status --short` retains the same four untracked directories; `git diff --stat` and `git diff --name-only` are empty. All writes are confined to the explicit brand files listed below. Backend/API/Prisma/database/environment files were not edited or operated on. No application consumer was scaffolded, so browser/native runtime QA is not asserted. No commit or push was performed; Dark Micro was not started.

### Exact file delta for this corrective-release request

Created:

- `Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/01-Logo-Master-Geometry/Horizontal-Logo-Construction/Dau-Viet-Global-Horizontal-Logo-V1.4.1-PRODUCTION-LOCKED/LOCK.json`
- `Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/01-Logo-Master-Geometry/Horizontal-Logo-Construction/Dau-Viet-Global-Horizontal-Logo-V1.4.1-PRODUCTION-LOCKED/MANIFEST.sha256`
- `Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/01-Logo-Master-Geometry/Horizontal-Logo-Construction/Dau-Viet-Global-Horizontal-Logo-V1.4.1-PRODUCTION-LOCKED/PRODUCTION-LOCK.md`
- `Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/01-Logo-Master-Geometry/Horizontal-Logo-Construction/Dau-Viet-Global-Horizontal-Logo-V1.4.1-PRODUCTION-LOCKED/PRODUCTION-VALIDATION.json`
- `Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/01-Logo-Master-Geometry/Horizontal-Logo-Construction/Dau-Viet-Global-Horizontal-Logo-V1.4.1-PRODUCTION-LOCKED/README.md`
- `Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/01-Logo-Master-Geometry/Horizontal-Logo-Construction/Dau-Viet-Global-Horizontal-Logo-V1.4.1-PRODUCTION-LOCKED/dvg-logo-horizontal-primary-dark-v1.4.1.svg`
- `Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/01-Logo-Master-Geometry/Horizontal-Logo-Construction/Dau-Viet-Global-Horizontal-Logo-V1.4.1-PRODUCTION-LOCKED/dvg-logo-horizontal-primary-light-v1.4.1.svg`
- `Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/01-Logo-Master-Geometry/Horizontal-Logo-Construction/Dau-Viet-Global-Horizontal-Logo-V1.4.1-PRODUCTION-LOCKED/dvg-logo-horizontal-primary-mono-v1.4.1.svg`
- `docs/brand/locks/horizontal-logo-v1.4.1.md`

Modified:

- `docs/brand/brand-asset-gap-matrix.md`
- `docs/brand/brand-canonical-registry-integration-pass-03.md`
- `packages/brand-assets/README.md`
- `packages/brand-contracts/README.md`
- `packages/brand-contracts/brand-registry.json`
- `packages/brand-contracts/source-inventory.json`
- `packages/brand-contracts/source-manifest.json`
- `scripts/brand/validate.mjs`
- `scripts/brand/validate.test.mjs`

Copied byte-for-byte from V1.4.1:

- `packages/brand-assets/logo/horizontal/dvg-logo-horizontal-primary-dark-v1.4.1.svg`
- `packages/brand-assets/logo/horizontal/dvg-logo-horizontal-primary-light-v1.4.1.svg`
- `packages/brand-assets/logo/horizontal/dvg-logo-horizontal-primary-mono-v1.4.1.svg`
