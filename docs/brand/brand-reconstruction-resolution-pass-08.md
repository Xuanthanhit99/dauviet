# Brand Reconstruction Resolution — Pass #8

Date: 2026-09-20

## Result

**STATUS: PASS — AUDIT COMPLETE**

**DECISION: CANONICAL_ASSET_GAP**

Reconstruction Trust Glyph remains an unresolved canonical asset gap. No candidate or production asset is created in this audit.

## Source-derived semantic contract

Phase 04 defines Reconstruction as:

- trust/provenance semantic: `layered symbol + disclosure`
- explicit accessible semantics required
- disclosure text is mandatory whenever reconstructed/transformed material could be mistaken for documentary evidence
- color-only and motion-only meaning are prohibited
- Time Trace logo cannot be reused as a generic UI glyph

The phrase `layered symbol + disclosure` is classified as **SEMANTIC_SHORTHAND**. It does not define exact geometry, coordinates, layering order, or a canonical asset alias.

## System grammar

- canonical grid: 24x24
- default stroke: 1.75px
- caps/joins: round
- monochrome-first
- semantic/domain glyphs prefer 20–24px
- interactive controls: 44x44 CSS px
- essential graphics: >=3:1 contrast
- non-obvious standalone icon buttons require accessible names

No Reconstruction-specific 16px micro geometry is supplied. Until explicitly approved otherwise, 16px is **NOT_SUPPORTED** and the canonical semantic minimum is 20px, with 24px preferred and 32px eligible for identical geometry.

## Semantic separation

Reconstruction must remain distinct from:

- Evidence: supporting historical material/document/artifact; its presence does not imply verification.
- Citation: claim-to-source reference relationship.
- Source: bibliographic/provenance record.
- Verified: verification state.
- AI Translation: language transformation plus disclosure.
- Warning/Sensitive: caution/content-notice semantics.

A Reconstruction glyph must not imply that reconstructed content is documentary evidence, verified fact, or original source material.

## Missing canonical decisions

The repository does not currently provide enough deterministic information to construct a canonical Reconstruction glyph without inventing brand geometry.

Required before candidate construction:

1. final metaphor for the layered symbol;
2. exact 24x24 geometry and primitive/path coordinates;
3. explicit layer relationship/offset;
4. confirmation of 20/24/32px size policy and 16px NOT_SUPPORTED;
5. final human construction approval.

## Freeze

No backend/API/Prisma/database/.env, Web/Mobile/Admin, locked logo, Citation or Evidence asset is changed by this audit.

## Gap state

`glyph-reconstruction = CANONICAL_ASSET_GAP`

Evidence remains RESOLVED. AI Translation and Sensitive remain CANONICAL_ASSET_GAP.

## Next gate

**WAIT_FOR_RECONSTRUCTION_CONSTRUCTION_APPROVAL**

Recommended construction direction for a separate approval gate: a neutral **Layered Frame + Offset Trace** metaphor, using two overlapping open rectangular/archival planes with no checkmark, sparkle, AI star, document-lens, citation brackets, warning triangle, or shield. This recommendation is not canonical until explicitly approved.
