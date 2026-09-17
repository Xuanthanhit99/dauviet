# DẤU VIỆT GLOBAL — Horizontal Logo V1.2
## Optical & Production QA — Candidate B

Date: 2026-09-17

### Decision
**PASS_WITH_REQUIRED_FINALIZATION**

Candidate B V1.1 passes structural production QA against the currently available locked rules, but it is **not yet PRODUCTION_LOCKED**.

### Automated structural checks
- PASS — viewBox_420x96
- PASS — canonical_mask_present
- PASS — canonical_palette_gold
- PASS — canonical_palette_forest
- PASS — canonical_palette_deep_forest
- PASS — primary_wordmark_correct
- PASS — global_qualifier_present
- PASS — tagline_excluded
- PASS — no_gradient
- PASS — no_filter
- PASS — no_raster_image
- PASS — live_text_present

### Canonical geometry
- The Time Trace symbol remains embedded as vector geometry with the canonical Journey negative-space mask.
- No raster image, SVG filter, or gradient was introduced.
- Canonical palette values remain present.
- No approval is granted to redraw, compress, rotate, or replace the symbol.

### Construction QA
- Primary wordmark: `DẤU VIỆT`.
- `GLOBAL` remains a secondary qualifier.
- Tagline is excluded from the primary horizontal master.
- Candidate construction uses a 64-unit canonical symbol with 16-unit outer clearspace and 16-unit symbol-to-wordmark gap.
- These spacing values are **candidate construction tokens**, not inherited Phase 01 canonical geometry.

### Scale QA
- 32px: permitted as a horizontal lockup test, but not recommended as the primary wide-navigation presentation.
- 48px: recommended minimum review size for wide navigation.
- 64px+: preferred for brand-forward placements.
- At 16/24px, use the locked micro/symbol assets rather than the horizontal lockup.

### Light / dark / monochrome
- LIGHT: ready for candidate review.
- DARK: dedicated dark horizontal derivative must be constructed from the supplied canonical dark master; do not recolor this light SVG arbitrarily.
- MONOCHROME: dedicated horizontal mono derivative must be constructed from the supplied canonical mono master; do not recolor this candidate by CSS/filter and call it canonical.

### Typography gate
The current V1.1 SVG still contains live text using the Phase 03 families:
- `DẤU VIỆT`: Noto Serif 600 candidate treatment.
- `GLOBAL`: Noto Sans 600 candidate treatment.

This is acceptable for construction QA, but **not sufficient for a portable canonical production logo**. Before Production Lock:
1. confirm the final optical wordmark treatment;
2. convert the approved wordmark to vector outlines using the exact approved font files/version;
3. preserve a documented editable construction source separately;
4. re-run bounding-box, diacritic, spacing, dark, mono, and small-size QA.

### Optical review
The construction is coherent for Candidate B: primary name dominates, `GLOBAL` is clearly subordinate, and the horizontal form is appropriate for the Phase 08 wide-navigation role.

However, final optical approval remains a human brand decision. The QA process does not silently turn candidate typography or spacing into a locked master.

### Required V1.3 finalization
Produce and validate:
1. Primary Light horizontal SVG — outlined wordmark.
2. Dark horizontal SVG — canonical dark symbol source.
3. Monochrome horizontal SVG — canonical mono symbol source.
4. Construction/source SVG with editable text retained and clearly marked non-distribution.
5. 32/48/64px raster QA renders.
6. Light/dark/mono comparison board.
7. SHA-256 manifest and lifecycle metadata.

### Lifecycle
Current:
`APPROVED_DERIVATIVE_CANDIDATE`

Next, only after explicit design approval + outlined variants QA:
`PRODUCTION_LOCKED`

No backend/API/application integration is part of this QA.
