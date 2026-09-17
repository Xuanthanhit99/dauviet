# Brand asset gap remediation report — Pass #2

Date: 2026-09-17.

## Final statuses

**BRAND FOUNDATION: READY_WITH_CANONICAL_ASSET_GAPS**

**APPLICATION INTEGRATION: NOT_STARTED — NO APPLICATION CONSUMERS PRESENT**

The source-backed foundation is ready for supported usages. Horizontal wordmark construction, five trust glyphs, three 16px micro glyphs and unsupported dark micro/inverse mono usages remain explicit CANONICAL_ASSET_GAP records. No new artwork or derivative was justified by the supplied sources. Missing applications do not block completion of this remediation pass.

## Initial state

Read both complete Pass #1 reports before modification. Five shared packages, 36 asset records, 133 manifest artifacts, 10 passing tests and seven production SVGs existed. The initial validator passed. No additional source files or supported missing glyphs were discovered. No TODO/FIXME markers were found in the shared packages/validator.

The evidence checklist covered horizontal construction, master/mono/micro/symbol/theme variants, all 15 Phase 04 semantics, 16px optical corrections, registry/manifest completeness and SVG validation. Frontend typography/runtime, native adapters and backend provenance items were excluded except to distinguish missing artwork from deferred consumer exports.

## Git safety

- Root: `D:/dauviet`; branch: `main`.
- Initial and final `git status --short`: untracked Brand Bible directory, `docs/brand/`, `packages/`, `scripts/`; no tracked changes.
- Prior Pass #1 files were treated as existing work. Both original reports remain byte-identical.
- Because all Pass #1 work remains untracked, ordinary `git diff --stat` is empty and cannot show this pass's changes. A pre-edit content snapshot of the 55 existing brand/docs/script files was saved outside the repository in the OS temporary directory. Final content comparison identifies the exact nine modified and three created repository files listed below; no existing file was deleted.
- No reset, clean, checkout, history rewrite, staging or commit was performed.

## Source integrity

Before remediation: **SOURCE_ARTIFACT_CHECKSUM 133 / 133 PASS**.

After remediation: **SOURCE_ARTIFACT_CHECKSUM 133 / 133 PASS**.

All source bytes and sizes match MANIFEST, and source README/MANIFEST retain their pinned hashes. The 36 production copies also retain their original checksums. No original or copied SVG paths/fills/masks, PNGs, CSS tokens or canonical JSON were edited. Source inventory and manifest snapshot are unchanged. Registry checksums/paths/IDs remain unchanged.

## Logo audit

| Asset | Exact status | Resolution |
| --- | --- | --- |
| V1.3 master | CANONICAL_MASTER / PRODUCTION_LOCKED | Existing light SVG retained |
| V1.3 dark master | CANONICAL_MASTER / PRODUCTION_LOCKED | Existing dedicated dark SVG retained |
| V1.3 mono | CANONICAL_MONO / PRODUCTION_LOCKED | Fixed dark ink on light surface retained |
| V1.3 micro | CANONICAL_MICRO / PRODUCTION_LOCKED | Existing 16/24px SVG retained |
| V1.4 micro mono | CANONICAL_MICRO + CANONICAL_MONO / PRODUCTION_LOCKED | Existing 16/24px light-surface variant retained |
| Symbol-only | Already resolved by master/micro | No redundant copy created |
| Horizontal | MISSING / CANONICAL_ASSET_GAP | No canonical wordmark geometry or sufficient typography/spacing/clearspace rules; no assembly |
| Dark micro / inverse mono | CANONICAL_ASSET_GAP for those usages | No currentColor contract for logo recoloring; no new variant |
| V1.4 app icon | APPROVED_DERIVATIVE | Existing supplied PNG; status normalized using existing V1.4 production validation, not a new approval |

Master remains allowed from 32px, preferred at 48px+; 16/24px use micro only. The [gap matrix](brand-asset-gap-matrix.md) contains exact source names, production locations and horizontal evidence. Search covered all source Markdown/JSON/SVG and relevant Phase 01/08/10/11 reference boards. No board or general Noto family rule establishes exact wordmark production geometry. The eight horizontal acceptance conditions cannot all be demonstrated, so generation was not attempted.

## Glyph audit

| Semantic | Classification | Supported mapping / gap |
| --- | --- | --- |
| Place | CANONICAL_AVAILABLE | `dv-icon-place`, 16/20/24/32 |
| People | CANONICAL_AVAILABLE | `dv-icon-people`, 20/24/32; 16px CANONICAL_ASSET_GAP |
| Event | CANONICAL_AVAILABLE | `dv-icon-event`, 20/24/32; 16px CANONICAL_ASSET_GAP |
| Culture | CANONICAL_AVAILABLE + CANONICAL_MICRO_AVAILABLE | `dv-icon-culture`; `dv-icon-culture-micro` at 16 |
| Time | CANONICAL_AVAILABLE | `dv-icon-time`, 20/24/32; 16px CANONICAL_ASSET_GAP |
| Source | CANONICAL_AVAILABLE + CANONICAL_MICRO_AVAILABLE | `dv-icon-source`; `dv-icon-source-micro` at 16 |
| Story | CANONICAL_AVAILABLE + CANONICAL_MICRO_AVAILABLE | `dv-icon-story`; `dv-icon-story-micro` at 16 |
| Journey | CANONICAL_AVAILABLE + CANONICAL_MICRO_AVAILABLE | `dv-icon-journey`; `dv-icon-journey-micro` at 16 |
| Citation | CANONICAL_ASSET_GAP | No dedicated symbol or explicit sprite alias |
| Evidence | CANONICAL_ASSET_GAP | No dedicated symbol or explicit sprite alias |
| Verified | CANONICAL_AVAILABLE | `dv-icon-verified`, 16/20/24/32 |
| Reconstruction | CANONICAL_ASSET_GAP | No dedicated symbol; disclosure remains mandatory |
| AI Translation | CANONICAL_ASSET_GAP | No dedicated symbol; language/disclosure text remains mandatory |
| Warning | CANONICAL_AVAILABLE | `dv-icon-warning`, 16/20/24/32 |
| Sensitive | CANONICAL_ASSET_GAP | No dedicated symbol; explicit notice remains mandatory |

All existing canonical glyphs are correctly mapped in the existing resolver; it was not changed. A sprite symbol is an available canonical glyph even without a standalone SVG. Citation's descriptive “source marker” language is not treated as permission to silently alias it to the Source domain symbol. No icon library or custom glyph was introduced. Generic OS actions remain outside the brand sprite requirement.

## Registry

```text
previous asset count: 36
new asset count: 36
added assets: 0
removed assets: 0
corrected existing asset records: 28
```

Corrections: 22 `REFERENCE_CONTRACT` labels become controlled `REFERENCE_ONLY`; one existing supplied app icon changes `GENERATED_DERIVATIVE` to `APPROVED_DERIVATIVE` with its existing validation-source reference; five logo records gain explicit canonical roles. The 23 status changes normalize lifecycle vocabulary; they do not grant a new Production Lock. No asset ID, source path, production path, checksum, geometry or version changes.

Top-level metadata now separates foundation and application statuses and records 11 evidence-backed gaps outside `assets`. Gaps have no invented file/checksum/rights information and do not inflate the resource count. Inspection also found `D?u Vi?t Global` encoding damage in the generated registry brand name and all five package descriptions; these metadata strings now correctly read `Dấu Việt Global` in UTF-8. Source copies were unaffected by that metadata encoding issue.

## Changes — exact Pass #2 file list

| File | Reason | Source | Phase | Status |
| --- | --- | --- | --- | --- |
| `packages/brand-contracts/brand-registry.json` | Normalize 23 lifecycle labels, five roles, spelling, readiness and explicit gaps | Existing locked sources and gap matrix evidence | 01,04,08,11 | Modified metadata only |
| `packages/brand-contracts/README.md` | Explain controlled statuses, gaps and XML gate | Registry and validator | 11 | Modified documentation |
| `packages/brand-assets/package.json` | Repair Vietnamese brand spelling | Brand Bible README | 11 | Modified description only |
| `packages/brand-contracts/package.json` | Repair Vietnamese brand spelling | Brand Bible README | 11 | Modified description only |
| `packages/brand-icons/package.json` | Repair Vietnamese brand spelling | Brand Bible README | 11 | Modified description only |
| `packages/brand-motion/package.json` | Repair Vietnamese brand spelling | Brand Bible README | 11 | Modified description only |
| `packages/brand-tokens/package.json` | Repair Vietnamese brand spelling | Brand Bible README | 11 | Modified description only |
| `scripts/brand/validate.mjs` | Validate required metadata/status, gap evidence, variant IDs and status-only deprecation; print source count | Registry, Phase 11 and Pass #2 validation requirements | 11 | Modified validator |
| `scripts/brand/validate.test.mjs` | Add focused source, path, lifecycle, gap and micro-logo tests | Existing source/registry; in-memory faults | 01,04,11 | Modified tests |
| `scripts/brand/validate-svg.ps1` | Real XML parsing and internal-reference/viewBox/paint/label checks; reject unsafe XML/SVG subset | Pass #2 SVG requirements and supplied seven SVGs | 01,04,11 | Created validator |
| `docs/brand/brand-asset-gap-matrix.md` | Complete asset/semantic classification and source evidence | Phase 01/04/08/10/11 | 01,04,08,10,11 | Created report |
| `docs/brand/brand-asset-gap-remediation-report.md` | Record actual results, changes and separate statuses | This pass's evidence | 11 | Created report |

## Validation

| Exact command | Result |
| --- | --- |
| `git rev-parse --show-toplevel` | `D:/dauviet` |
| `git branch --show-current` | `main` |
| `git status --short` | Pre-existing four untracked directories; no unexpected paths |
| `node scripts/brand/validate.mjs` | PASS before and after; final explicit `SOURCE_ARTIFACT_CHECKSUM 133 / 133 PASS` |
| `node --test scripts/brand/validate.test.mjs` | 15 / 15 PASS, including all original 10 tests |
| `powershell -NoProfile -File scripts/brand/validate-svg.ps1 -SelfTest` | Seven production SVGs pass XML/reference/paint/label checks; one valid and ten invalid in-memory XML fixtures behave as expected |
| `git diff --stat` | Empty because prior brand work is still untracked; supplemented with pre-edit content comparison |
| `git diff --name-only` | Empty: no tracked backend/configuration changes |

The SVG check uses .NET XML with DTD processing prohibited and no resolver; it performs no network access and writes nothing. It checks well-formed XML, SVG namespace, finite positive viewBoxes, unique IDs, mask/href/ARIA references, no script/event handlers/raster/foreign elements/external resources, sprite currentColor paint and meaningful logo labels. Canonical checksums preserve exact geometry, mask and clipping behavior. It validates the supplied static subset, not every possible SVG feature. Arbitrary path rendering, actual background contrast and assistive-technology/browser/native behavior still require future consumer QA; no runtime or pixel-level certificate is claimed.

The first XML self-test exposed a PowerShell fixture-array concatenation issue; parentheses corrected the test construction. All malformed/unsafe fixtures and actual SVGs then passed their expected outcomes. No canonical asset required repair. No dependencies, frameworks or lifecycle scripts were installed.

## Backend isolation

```text
BACKEND/API MODIFIED: NO
PRISMA MODIFIED: NO
DATABASE MODIFIED: NO
MIGRATIONS RUN: NO
.env MODIFIED: NO
WEB APP CREATED: NO
MOBILE APP CREATED: NO
ADMIN APP CREATED: NO
```

No backend/environment content was read or edited. No backend command, API request, Prisma generation, database action, framework scaffold, install or platform export ran. Application directories remain absent. Prior source files, canonical copies, token/icon/motion behavior and reports remain unchanged outside the explicitly listed metadata/validator/documentation edits.
