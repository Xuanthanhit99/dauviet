# CODEX PASS #5.1 - INVERSE MONO V1.0 CANDIDATE

STATUS: PASS. Date: 2026-09-18. Final human visual approval remains PENDING_FINAL_VISUAL_APPROVAL.

## Approval and lineage

Pass #5 identified three missing decisions: inverse fill, permitted backgrounds, and master/micro size scope. The user's Pass #5.1 instruction explicitly approves Inverse Mono Treatment V1.0 on 2026-09-18: #111111 to #FFFFFF, MICRO ONLY at 16px and 24px, exclusively on Deep Forest #062A24 and Forest 700 #18463C. Treatment approval is not final human approval of candidate appearance.

Canonical source: `Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/01-Logo-Master-Geometry/dau-viet-global-time-trace-v3-micro-v1.4-mono.svg`.

SOURCE INTEGRITY: PASS against the original Brand Bible and controlled repository manifests. Source SHA-256: `ca59b22908a2a245c5f66cf1b5f20df1575fa01ce1b0c30742e1beba4c785abf`. All prior source artifacts remain unchanged; no source was repaired or regenerated.

Candidate: `Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/01-Logo-Master-Geometry/Dau-Viet-Global-Inverse-Mono-V1.0-CANDIDATE/dvg-inverse-mono-v1.0.svg`.

Candidate SHA-256: `4c8d3e0be650f5e5ac67c70e44b11fd6101e5bffcab81712aa57686abdd5cb64`. Lifecycle CANDIDATE; status CANDIDATE_READY_FOR_APPROVAL; production distribution false. No PRODUCTION-LOCK.md was created.

## Deterministic derivation and geometry

Exactly four occurrences of visible fill #111111 were replaced with #FFFFFF in the original bytes. No formatter, optimizer, design application or AI generation was used. MICRO_GEOMETRY_IDENTITY: PASS. Candidate equality to this exact replacement proves preservation of viewBox 0 0 32 32, all six paths (four visible, two mask), every path d, the full micro-cut mask, Journey, Reveal/aperture, mask stroke width 2.1 and round cap/join, transforms, clipping behavior, proportions, spacing, structure and rendering order.

Metadata changes: NONE. Existing meaningful title/desc and role/aria attributes remain byte-identical. The historical source title says Micro Mark V1.4 Monochrome; the candidate package metadata and QA labels identify Inverse Mono V1.0. No accessibility normalization was necessary.

Normalized geometry/content fingerprint: `b15e6eb4bffbeeb6498d552542b2bc2752fb8fbe0ebe5d5995bc2a859c1c9fed` for both source and candidate, normalizing only authorized visible fills.

## Colors, contrast and accessibility

SOURCE VISIBLE COLOR COUNT: 1 (#111111). CANDIDATE VISIBLE COLOR COUNT: 1 (#FFFFFF). UNAUTHORIZED COLOR MAPPINGS: 0. All four visible paths have White fill, no visible stroke. Original mask white/black/none paints control coverage and are not visible brand colors. No Warm Sand, Bronze Gold, Forest or second visible ink is present. No new mask, geometry, opacity, blend mode, CSS filter, gradient, glow, shadow, raster or effect was introduced.

Contrast was recalculated from `primitive.white`, `primitive.forest_950`, and `primitive.forest_700` in `Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/02-Color-Accessibility/dau-viet-global-color-system-final-validation-v1.1.json` using sRGB linearization and relative luminance (0.2126 R + 0.7152 G + 0.0722 B), then (Lmax+0.05)/(Lmin+0.05):

| Pair | Calculated ratio | Result |
| --- | --- | --- |
| #FFFFFF / #062A24 | 15.39133217892321:1 | PASS |
| #FFFFFF / #18463C | 10.60525473276517:1 | PASS |

Both exceed the recorded graphical QA threshold 3:1. These calculations do not authorize any additional surface. White, Warm Sand, Stone, uncontrolled photos/video, unknown/dynamic backgrounds and surfaces without validated contrast remain outside scope.

SVG ACCESSIBILITY: PASS. Valid XML, role=img, title id=title, desc id=desc, aria-labelledby="title desc"; all label and mask references resolve uniquely. BROKEN REFERENCES: 0. No live text, image, filter, linearGradient or radialGradient. The existing XML validator separately checks this candidate without adding it to production distribution.

## Real SVG QA and pixel inspection

Local Google Chrome headless rendered `render-input.html`, which embeds four exact candidate SVG byte streams as data URIs. Renderer flags: --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size=560,500 --virtual-time-budget=2000. An isolated temporary Chrome profile was used. `render-board.png` is the actual 560x500 screenshot. Pillow cropped native 16/24px evidence at (40,40), (320,40), (40,240), (320,240). `pixel-inspection-6x.png` uses NEAREST resampling of those exact native crops. Pixel-byte equality of crops and enlarged panels was checked independently. Every raster pixel also lies on the background-to-White antialiasing line within channel quantization tolerance.

| Actual-size render | Technical visual review |
| --- | --- |
| 16px / #062A24 | PASS |
| 16px / #18463C | PASS |
| 24px / #062A24 | PASS |
| 24px / #18463C | PASS |

REAL SVG QA: PASS 4/4. Both native-size screenshot and 6x nearest-neighbor board were visually inspected. Silhouette is recognizable; Journey and Reveal/aperture remain discernible; no clipping, path collapse or disappearing geometry observed. At 16px the aperture is necessarily represented by few pixels; enlarged pixelation is diagnostic, not a reason to redraw. White-only rendering remains distinct from Dark Micro's Warm Sand plus Bronze Gold. These are technical QA findings, not a claim of final human visual approval.

QA directory: `D:/dauviet/docs/brand/qa/inverse-mono-v1.0/`. All seven artifacts are hashed in VALIDATION.json, and the four candidate payload files are hashed in MANIFEST.sha256. No AI image, recreated mark, source change or expanded QA surface was used.

## Registry, gap matrix and validation

The existing architecture tracks candidates through gap.candidateFile, source inventory and manifests, not registry.assets. Only dark-monochrome moves to CANDIDATE_READY_FOR_APPROVAL, referencing CANDIDATE.json and VALIDATION.json. Candidate metadata records logo / inverse-mono / micro, 1.0, CANDIDATE, distribution false and pending human approval. Five new source-package artifacts extend the controlled manifest from 210 to 215 entries; all existing manifest/inventory entries are retained unchanged and in their original order. The original Brand Bible manifest is unchanged. No candidate SVG is copied into packages/brand-assets. All 40 production registry asset records remain identical.

The gap matrix reflects candidate readiness, never RESOLVED or PRODUCTION_LOCKED. No 32/48/64 inverse master or horizontal inverse was created. Master inverse requires a separate audit and design decision. Citation, Evidence, Reconstruction, AI Translation and Sensitive records are unchanged: five other actionable gaps, six total including the pending inverse candidate.

New inverse validator verifies pinned source integrity, lifecycle, scope, exact color replacement, visible colors, geometry/content proof, accessibility, restrictions, contrast recalculation, all four distinct render combinations, native PNG sizes, exact embedded SVG bytes, QA artifact hashes, package manifest and no premature production promotion/distribution. The main validator collects this QA evidence and keeps its production rules intact. Existing tests only change the two inverse gap-state expectations to the newly authorized candidate state; unrelated gap, production, checksum and historical negative assertions are retained.

Tests/checks:

- `node --test scripts/brand/validate.test.mjs scripts/brand/validate-inverse-mono.test.mjs`: 40/40 PASS, zero failures (32 existing + 8 new).
- `node scripts/brand/validate.mjs`: PASS, original source checksums 133/133, canonical copies/registry/inventory/manifests and drift checks.
- `scripts/brand/validate-svg.ps1 -SelfTest`: 1 valid / 10 invalid self-tests PASS; production SVG XML/references 11/11 PASS; inverse candidate 1/1 PASS.
- PNG crop / 6x NEAREST identity and white-only antialiasing checks: PASS 4/4.

## Exact files changed in Pass #5.1

Created:

- `Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/01-Logo-Master-Geometry/Dau-Viet-Global-Inverse-Mono-V1.0-CANDIDATE/CANDIDATE.json`
- `Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/01-Logo-Master-Geometry/Dau-Viet-Global-Inverse-Mono-V1.0-CANDIDATE/MANIFEST.sha256`
- `Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/01-Logo-Master-Geometry/Dau-Viet-Global-Inverse-Mono-V1.0-CANDIDATE/README.md`
- `Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/01-Logo-Master-Geometry/Dau-Viet-Global-Inverse-Mono-V1.0-CANDIDATE/VALIDATION.json`
- `Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/01-Logo-Master-Geometry/Dau-Viet-Global-Inverse-Mono-V1.0-CANDIDATE/dvg-inverse-mono-v1.0.svg`
- `docs/brand/brand-inverse-mono-candidate-pass-05-1.md`
- `docs/brand/qa/inverse-mono-v1.0/inverse-mono-16px-062a24.png`
- `docs/brand/qa/inverse-mono-v1.0/inverse-mono-16px-18463c.png`
- `docs/brand/qa/inverse-mono-v1.0/inverse-mono-24px-062a24.png`
- `docs/brand/qa/inverse-mono-v1.0/inverse-mono-24px-18463c.png`
- `docs/brand/qa/inverse-mono-v1.0/pixel-inspection-6x.png`
- `docs/brand/qa/inverse-mono-v1.0/render-board.png`
- `docs/brand/qa/inverse-mono-v1.0/render-input.html`
- `scripts/brand/validate-inverse-mono.mjs`
- `scripts/brand/validate-inverse-mono.test.mjs`

Modified:

- `docs/brand/brand-asset-gap-matrix.md`
- `packages/brand-contracts/brand-registry.json`
- `packages/brand-contracts/source-inventory.json`
- `packages/brand-contracts/source-manifest.json`
- `scripts/brand/validate-svg.ps1`
- `scripts/brand/validate.mjs`
- `scripts/brand/validate.test.mjs`

## Frozen-area verification and approval gate

Entry state preserved: five modified Pass #4.2 files and two untracked reports from Pass #4.2/#5. No reset, restore, clean, stash or revert was used. Pre-edit hash checkpoint: `%TEMP%/dvg-pass051-before.json`. Comparing all pre-existing Brand Bible files, brand packages, brand scripts and docs confirms exactly the seven allowed modified files above; all other pre-existing hashes match. All production asset records and unrelated registry gaps compare equal to entry state. Frozen sources, Horizontal V1.4/V1.4.1, Dark Micro V1.0/V1.1, prior QA and reports remain byte-identical.

All repository writes are confined to the new candidate package, new inverse QA, brand documentation, controlled source metadata and brand validators/tests. Backend/API/NestJS/Prisma/migrations/database/PostgreSQL/PostGIS/Redis/BullMQ/OpenAPI/API contracts/auth/.env: UNCHANGED. No environment files were opened. No Web/Mobile/Admin edits. No Trust Glyph work. Temporary checkpoint and isolated renderer profile are outside the repo; no repository runtime dependencies were added.

GIT COMMIT: NOT CREATED. GIT PUSH: NOT PERFORMED.

NEXT: WAIT_FOR_FINAL_HUMAN_VISUAL_APPROVAL. Do not production lock or start Trust Glyphs.
