# Brand asset gap matrix — Pass #3

Date: 2026-09-17. Foundation: **READY_WITH_CANONICAL_ASSET_GAPS**.
Application integration: **NOT_STARTED — NO APPLICATION CONSUMERS PRESENT**.

All file references below resolve under the immutable Brand Bible unless explicitly marked as production. Source checksum: **133 / 133 PASS** before and after remediation. No artwork was created or changed.

| Asset / Semantic | Phase | Source Status | Production Status | Action | Final Result |
| ---------------- | ----- | ------------- | ----------------- | ------ | ------------ |
| Master logo | 01 | CANONICAL_MASTER — geometry V1.3 | PRODUCTION_LOCKED; exact copy | Retain paths/mask | Resolved at 32px+, preferred 48px+ |
| Mono logo | 01 | CANONICAL_MONO — V1.3 mono | PRODUCTION_LOCKED; exact copy | Retain supplied fixed ink | Resolved on light background |
| Micro mark | 01 | CANONICAL_MICRO — V1.3 | PRODUCTION_LOCKED; exact copy | Retain 16/24px rule | Resolved |
| Micro mono | 01 | CANONICAL_MICRO / CANONICAL_MONO — V1.4 mono | PRODUCTION_LOCKED; exact copy | Use on light background | Resolved at 16/24px |
| Horizontal logo | 01,08 | V1.4.1 PRODUCTION_LOCKED; metadata-only correction, parent V1.4 | Three byte-identical light/dark/mono copies | Preserve visual baseline; use 48px minimum, 64px+ preferred | RESOLVED |
| Symbol-only | 01 | CANONICAL_MASTER / CANONICAL_MICRO | Existing registered SVGs already are symbol-only | No duplicate standalone symbol | Resolved by existing size variants |
| Light behavior | 01,02 | Canonical master, micro, mono | PRODUCTION_LOCKED | Use supplied fills unchanged | Resolved within source-supported use |
| Dark behavior, master | 01,02 | CANONICAL_MASTER — V1.3 dark | PRODUCTION_LOCKED; exact copy | Use dedicated dark asset, 32px+ | Resolved; runtime contrast still consumer QA |
| Dark behavior, micro | 01 | Dark Micro V1.1; human approval 2026-09-17 | PRODUCTION_LOCKED; approved candidate bytes | 16/24px only on #062A24 and #18463C; real SVG QA PASS 4/4 | RESOLVED |
| Dark behavior, mono | 01 | Inverse Mono V1.0; final human approval 2026-09-18 | PRODUCTION_LOCKED; exact approved candidate bytes | White #FFFFFF, MICRO ONLY 16/24px on #062A24 / #18463C; QA PASS 4/4 | RESOLVED |
| App icon 1024 | 01,08 | APPROVED_DERIVATIVE — supplied V1.4 PNG with validation | APPROVED_DERIVATIVE; exact copy | Normalize lifecycle label; do not regenerate | Resolved as supplied derivative, not a complete native set |
| Place | 04 | CANONICAL_AVAILABLE — `dv-icon-place` | `semantic.svg` | Existing resolver retained | 16/20/24/32px; 16px explicitly passes QA |
| People | 04 | CANONICAL_AVAILABLE — `dv-icon-people` | `semantic.svg` | Existing resolver retained | 20/24/32px |
| Event | 04 | CANONICAL_AVAILABLE — `dv-icon-event` | `semantic.svg` | Existing resolver retained | 20/24/32px |
| Culture | 04 | CANONICAL_AVAILABLE + CANONICAL_MICRO_AVAILABLE | `dv-icon-culture`, `dv-icon-culture-micro` | Existing resolver selects micro at 16px | Resolved at 16/20/24/32px |
| Time | 04 | CANONICAL_AVAILABLE — `dv-icon-time` | `semantic.svg` | Existing resolver retained | 20/24/32px |
| Source | 04 | CANONICAL_AVAILABLE + CANONICAL_MICRO_AVAILABLE | `dv-icon-source`, `dv-icon-source-micro` | Existing resolver selects micro at 16px | Resolved at 16/20/24/32px |
| Story | 04 | CANONICAL_AVAILABLE + CANONICAL_MICRO_AVAILABLE | `dv-icon-story`, `dv-icon-story-micro` | Existing resolver selects micro at 16px | Resolved at 16/20/24/32px |
| Journey | 04 | CANONICAL_AVAILABLE + CANONICAL_MICRO_AVAILABLE | `dv-icon-journey`, `dv-icon-journey-micro` | Existing resolver selects micro at 16px | Resolved at 16/20/24/32px |
| Citation | 04 | Citation Trust Glyph V1.0; final human approval 2026-09-18 | PRODUCTION_LOCKED; byte-identical brand-icons copy | 24x24; stroke 1.75; 20/24/32px QA PASS 3/3; 16px NOT_SUPPORTED | RESOLVED |
| Evidence | 04 | Evidence Trust Glyph V1.0; final human approval 2026-09-20 | PRODUCTION_LOCKED; byte-identical brand-icons copy | Document + Inspection Lens; exact 24×24 geometry; QA 20/24/32 PASS; 16px NOT_SUPPORTED | RESOLVED |
| Verified | 04 | CANONICAL_AVAILABLE — `dv-icon-verified` | `semantic.svg` | Retain bounded check and accessible semantics | 16/20/24/32px; 16px explicitly passes QA |
| Reconstruction | 04 | Reconstruction Trust Glyph V1.0; final human approval 2026-09-20 | PRODUCTION_LOCKED; canonical brand-icons copy | Layered Frame + Offset Trace; structural/accessibility QA PASS; raster QA pending executable validation; 16px NOT_SUPPORTED | RESOLVED_WITH_RASTER_QA_PENDING |
| AI Translation | 04 | CANONICAL_ASSET_GAP | No dedicated symbol | Preserve explicit language/disclosure text; no invented glyph | CANONICAL_ASSET_GAP |
| Warning | 04 | CANONICAL_AVAILABLE — `dv-icon-warning` | `semantic.svg` | Retain triangle/exclamation and text | 16/20/24/32px; 16px explicitly passes QA |
| Sensitive | 04 | CANONICAL_ASSET_GAP | No dedicated symbol | Explicit notice; no arbitrary shield substitution | CANONICAL_ASSET_GAP |
| People 16px | 04.1 | CANONICAL_ASSET_GAP | Resolver rejects size | Use canonical 20px minimum; no unapproved optical change | CANONICAL_ASSET_GAP |
| Event 16px | 04.1 | CANONICAL_ASSET_GAP | Resolver rejects size | Use canonical 20px minimum | CANONICAL_ASSET_GAP |
| Time 16px | 04.1 | CANONICAL_ASSET_GAP | Resolver rejects size | Use canonical 20px minimum | CANONICAL_ASSET_GAP |
| Close/back/forward/menu/search/share/settings | 04,08 | GENERIC_SYSTEM_ACTION | No brand glyph needed | Future OS/system action icons permitted | NOT_REQUIRED in canonical brand sprite |
| PWA/favicon/native export sets | 01,08 | Canonical inputs exist; no consumer export requirement | No exports generated | Defer to real consumer build pipeline | NOT_REQUIRED in Pass #2; not foundation blockers |
| Social/store screenshots | 10 | Rules and reference boards exist | No real application screenshots | No invented UI or media | NOT_REQUIRED in Pass #2 |

## Exact logo sources and production locations

All source names below are in `01-Logo-Master-Geometry/` and begin `dau-viet-global-time-trace-v3-`:

| Source suffix | Production directory under `packages/brand-assets/` | Classification |
| --- | --- | --- |
| `geometry-v1.3.svg` | `logo/master/` | CANONICAL_MASTER |
| `geometry-v1.3-dark.svg` | `logo/master/` | CANONICAL_MASTER, dark application |
| `geometry-v1.3-mono.svg` | `logo/monochrome/` | CANONICAL_MONO |
| `micro-v1.3.svg` | `logo/micro/` | CANONICAL_MICRO |
| `micro-v1.4-mono.svg` | `logo/micro/` | CANONICAL_MICRO / CANONICAL_MONO |
| `v1.4-app-icon-1024.png` | `app-icons/` | APPROVED_DERIVATIVE |

Within the original 133-file baseline, the other 53 Phase 01 artifacts remain REFERENCE_ONLY for distribution selection, including earlier masters/revisions, raster size evidence, previews, masks and validation documentation. This does not revoke the authority of the V1.4 validation document. No file is deleted or designated a new master.

## Exact glyph evidence

- `04-Iconography/dau-viet-global-phase04-semantic-icon-sprite-v1.0.svg`: 10 actual symbols; production `packages/brand-icons/canonical/semantic.svg`.
- `04-Iconography/dau-viet-global-phase04-1-micro-icon-sprite-v1.0.svg`: 4 actual symbols; production `packages/brand-icons/canonical/micro.svg`.
- `04-Iconography/dau-viet-global-phase04-iconography-semantic-system-v1.0.json`: `entities`, `trust` and accessibility vocabulary.
- `04-Iconography/dau-viet-global-phase04-1-icon-optical-context-qa-v1.0.json`: actual `size_matrix`, `micro_corrections`, `decision`.
- Matching Phase 04/04.1 Markdown states the 20px minimum and 24px preferred semantic sizes. No current glyph is classified CANONICAL_ONLY_AT_24 because 20px is explicitly allowed. No SEMANTIC_ALIAS_ALLOWED mapping is inferred from descriptive prose.

## Historical Pass #2 horizontal decision

`08-Web-iOS-Android/dau-viet-global-phase08-brand-application-web-ios-android-v1.0.md` specifies “horizontal master logo in wide navigation”; its JSON `web.logo` and `dau-viet-global-phase08-platform-token-map-v1.0.json` `web.logoWide` repeat that requirement. They do not define a wordmark font file/version, outlines, tracking, symbol-to-wordmark ratio, gap or measured clearspace.

Phase 10 press/co-branding rules require correct masters, clearspace and separate partner marks. They do not specify an internal Time Trace + wordmark construction. Phase 11 says screenshots/copies do not become masters. Phase 03 Noto body/display families are not an explicit wordmark production specification.

Visual review of the Phase 01 V1.3 preview and V1.4 validation board plus Phase 08/08.1, 10/10.1 and 11/11.1 boards found no measured horizontal construction or canonical wordmark source. Board headings and the illustrative “DẤU VIỆT / PARTNER” box are reference labels, not wordmark geometry. Thus wordmark, spacing and clearspace prerequisites cannot be established; no APPROVED_DERIVATIVE_CANDIDATE or APPROVED_DERIVATIVE horizontal logo was created.

Dark/mono visual examples on a reference board do not authorize changing fixed SVG fills. Only icon sprites explicitly use currentColor. Future runtime consumers must validate actual background contrast, size and accessible labeling.

## Current Pass #3 horizontal resolution

Horizontal Logo V1.4.1 is PRODUCTION_LOCKED as a METADATA_ONLY corrective release, parent V1.4. Only the missing title/desc IDs were inserted; the visual baseline is unchanged. V1.4 remains immutable historical evidence. The earlier decision above describes the original Pass #2 input and does not describe the current release.

Source package: `01-Logo-Master-Geometry/Horizontal-Logo-Construction/Dau-Viet-Global-Horizontal-Logo-V1.4.1-PRODUCTION-LOCKED/`. Evidence: `LOCK.json`, `PRODUCTION-VALIDATION.json`, and `MANIFEST.sha256`; repository lock: `docs/brand/locks/horizontal-logo-v1.4.1.md`. Production: `packages/brand-assets/logo/horizontal/dvg-logo-horizontal-primary-{light,dark,mono}-v1.4.1.svg` (three registered files).

Validation: original source 133/133, parent manifest 17/17, corrective manifest 7/7, source/copy byte identity 3/3, geometry identity 3/3, brand tests 20/20, XML references 10/10. The controlled repository inventory covers 194 source artifacts without blanket exclusions or approval of rejected candidates.

Remaining actionable design gaps: exactly seven - Dark Micro, Inverse Mono, Citation, Evidence, Reconstruction, AI Translation, Sensitive. People/Event/Time 16px remain governed by the existing 20px minimum; no new micro artwork or silent fallback was introduced. That Pass #3 checkpoint preceded Dark Micro work. Historical Pass #4.1.1: Dark Micro V1.1 is CANDIDATE_READY_FOR_APPROVAL, pending final human visual approval; it is not resolved or production locked. Other gap states are unchanged.

## Current Pass #4.2 Dark Micro resolution

Dark Micro V1.1 is RESOLVED / PRODUCTION_LOCKED after final human approval on 2026-09-17. Production and distribution preserve the approved candidate bytes. Evidence: `locks/dark-micro-v1.1.md` and the sibling production package LOCK.json, PRODUCTION-VALIDATION.json and MANIFEST.sha256. Approved QA remains at `qa/dark-micro-v1.1/` (PASS 4/4).

Remaining actionable design gaps: exactly six ? Inverse Mono, Citation, Evidence, Reconstruction, AI Translation, Sensitive. All unrelated gaps and governed 16px requirements remain unchanged.

## Pass #5.1 Inverse Mono candidate

Inverse Mono V1.0 is CANDIDATE_READY_FOR_APPROVAL, not RESOLVED or PRODUCTION_LOCKED. Treatment approved 2026-09-18: exact #111111 to #FFFFFF replacement from the existing micro mono source, 16/24px only, on #062A24 and #18463C. Real SVG QA passes all four combinations; final human visual approval is pending. No master inverse scope is authorized. Evidence: `brand-inverse-mono-candidate-pass-05-1.md` and `qa/inverse-mono-v1.0/`. The five Trust Glyph gaps remain unchanged; six actionable gaps remain in total, including this pending candidate.

## Current Pass #5.2 Inverse Mono production lock

Inverse Mono V1.0 is RESOLVED / PRODUCTION_LOCKED after final human visual approval 2026-09-18. Historical candidate and QA are unchanged; production and logo/micro distribution are byte-identical to the approved candidate. White #FFFFFF, MICRO ONLY 16/24px on #062A24 and #18463C. Master/horizontal inverse usage is not authorized. Evidence: `locks/inverse-mono-v1.0.md` and `brand-inverse-mono-production-lock-pass-05-2.md`.

Remaining actionable design gaps: exactly five - Citation, Evidence, Reconstruction, AI Translation, Sensitive. Horizontal Logo, Dark Micro and Inverse Mono are resolved. Existing People/Event/Time 16px policy remains unchanged. Earlier candidate-ready sections are historical checkpoints.

## Current Pass #6.1 Citation candidate

Citation Trust Glyph V1.0 is CANDIDATE_READY_FOR_APPROVAL, not RESOLVED or PRODUCTION_LOCKED. Exact user-approved Reference Brackets + Source Point geometry; standalone accessibility valid; actual candidate SVG QA passes 20/24/32px. 16px NOT_SUPPORTED. Candidate source, construction approval and QA evidence: `brand-citation-candidate-pass-06-1.md` and `qa/citation-v1.0/`. Production resolver remains unchanged and rejects Citation until a separate production integration. Four other actionable gaps remain unchanged: Evidence, Reconstruction, AI Translation, Sensitive. Five total including pending Citation.

## Pass #6.2 production checkpoint

Citation Trust Glyph V1.0: PRODUCTION_LOCKED, final human visual approval APPROVED 2026-09-18. Candidate integrity, candidate-to-production and production-to-brand-icons byte identity, exact geometry/style, accessibility and actual SVG QA 3/3 PASS. Complete Brand suite 61/61 PASS. Citation is RESOLVED. Historical candidate-ready statements above remain audit checkpoints.

Exactly four actionable design gaps remain: Evidence, Reconstruction, AI Translation, Sensitive. None started. Evidence: `locks/citation-trust-glyph-v1.0.md` and `brand-citation-production-lock-pass-06-2.md`.

## Pass #7 Evidence construction audit

Evidence remains CANONICAL_ASSET_GAP. Phase04 JSON `/trust/evidence` contains `document/lens`: semantic shorthand, not deterministic construction or approved asset alias. Evidence-specific geometry/sizes are undefined; no16px micro asset exists. Generic system policy:20px minimum,24px preferred,32px supported. Missing:unambiguous metaphor approval and exact24x24 construction. No artwork/candidate created. Sources232/232 PASS; tests61/61 PASS. See `brand-evidence-resolution-pass-07.md`. Reconstruction,AI Translation,Sensitive unchanged; four actionable gaps remain.


## Pass #7.1 Evidence candidate

Evidence Trust Glyph V1.0 is **CANDIDATE_READY_FOR_APPROVAL**, not RESOLVED or PRODUCTION_LOCKED. The approved 2026-09-18 construction is Document + Inspection Lens with exact 24×24 geometry, 1.75px currentColor stroke, round caps/joins, fill none, four paths plus one circle, and an intentionally open lower-right document contour behind the lens. Actual SVG QA recorded in the candidate validation passes 20/24/32px; 16px is NOT_SUPPORTED. Candidate distribution remains false and final human visual approval is pending. Evidence: `brand-evidence-candidate-pass-07-1.md` and `qa/evidence-v1.0/`.

Exactly four actionable design gaps remain in the registry: Evidence (pending candidate approval), Reconstruction, AI Translation and Sensitive. Earlier Pass #7 CANONICAL_ASSET_GAP text is a historical audit checkpoint.


## Pass #7.2 Evidence production lock

Evidence Trust Glyph V1.0 is **RESOLVED / PRODUCTION_LOCKED** after final human visual approval on 2026-09-20. Candidate, production and canonical distribution SVG bytes are identical (b680cdd3cd1d5b63721adb0033a9c8df85d43d0d3705719c5b19c65e49134739). Exact Document + Inspection Lens geometry is unchanged; QA 20/24/32 remains PASS 3/3; 16px remains NOT_SUPPORTED. Registry integration is complete. Evidence is removed from actionable design gaps.

Exactly three actionable design gaps remain: Reconstruction, AI Translation, Sensitive. Backend/API/Prisma/DB/.env and application code remain unchanged.


## Pass #8 Reconstruction construction audit

Reconstruction remains **CANONICAL_ASSET_GAP**. Phase 04 `layered symbol + disclosure` is semantic shorthand, not deterministic geometry. Exact metaphor/24x24 construction/layer relationship still require explicit approval before a candidate can be created. 20px minimum / 24px preferred / 32px supported is the inherited semantic policy; 16px is not authorized. No asset was invented and no application/backend code was changed. See `brand-reconstruction-resolution-pass-08.md`.


## Reconstruction Construction V1.0 approval

Human construction approval recorded 2026-09-20. Canonical metaphor is **Layered Frame + Offset Trace**. System construction is locked at 24x24, 1.75px currentColor stroke, round caps/joins, fill none; 20/24/32px supported with 24px preferred and 20px minimum; 16px NOT_SUPPORTED. Prohibited semantic collisions are recorded in `docs/brand/locks/reconstruction-trust-glyph-construction-v1.0.md`. Exact SVG coordinates remain the next candidate-construction gate; `glyph-reconstruction` therefore remains CANONICAL_ASSET_GAP until deterministic geometry and QA exist.


## Pass #8.1 Reconstruction candidate

Exact candidate geometry is recorded as three paths: `M5 8.5 V18.5 H15`, `M8.5 5 H18.5 V15`, and `M8.5 8.5 H15 V15 H8.5 Z`. Lifecycle is CANDIDATE; distribution false; structural/accessibility QA PASS. Raster QA is not claimed because this remote GitHub connector cannot execute the Chrome/Pillow QA pipeline. Final human visual approval is pending. See `brand-reconstruction-candidate-pass-08-1.md`.


## Pass #8.2 Reconstruction production lock

Final human visual approval recorded 2026-09-20. Reconstruction V1.0 is PRODUCTION_LOCKED and canonically distributed with unchanged approved geometry. Structural/accessibility QA PASS. Raster QA remains PENDING_EXECUTABLE_RENDER_QA and is not falsely claimed. The canonical design gap is resolved; executable raster QA remains a follow-up validation item. Remaining canonical design gaps: AI Translation and Sensitive.
