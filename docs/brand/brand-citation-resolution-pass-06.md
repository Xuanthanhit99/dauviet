# CODEX PASS #6 — CITATION TRUST GLYPH RESOLUTION

Audit date: 2026-09-18. STATUS: BLOCKED for canonical asset resolution; audit complete. DECISION: CANONICAL_ASSET_GAP. No artwork was created.

## Repository recovery and scope

Entry `git status --short` and `git diff --stat` were inspected before investigation. Existing work included ten tracked modified files (348 insertions, 24 deletions), untracked inverse candidate/production packages, QA, copied production SVG, validators, locks and reports from preceding passes. All were preserved. This audit changes no pre-existing file and creates only this report. No reset, restore, clean, stash, revert, commit or push was used.

Latest gap matrix was read in full. Horizontal V1.4.1, Dark Micro V1.1 and Inverse Mono V1.0 are resolved. Citation, Evidence, Reconstruction, AI Translation and Sensitive remain actionable. The historical checkpoints in the matrix do not supersede the latest Pass #5.2 state.

Searches covered repository filenames and contents for citation/citations/cite, source citation, source, evidence, footnote, reference/reference mark, bibliography, trust glyph/icon/primitive, provenance and source badge. Generated dependencies/build directories, Git internals and environment files were excluded. Broad search found 318 matching text files; targeted inspection separated brand evidence, documentation/contracts and unrelated backend implementation matches. No dedicated Citation SVG, symbol ID, approved alias, design-source file or precise construction document was found. Searches for Design System/Component Library/Trust Primitive filenames found no separate supplied component-library artifact. Phase 04 explicitly refers to those locked product components but supplies no Citation component geometry. This absence is a limitation of available repository evidence, not a claim about documents outside the repository.

## Evidence catalogue

For the following exact relative references, **B** means absolute root `D:/dauviet/Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/`; repository-relative references mean `D:/dauviet/`.

| Document | Exact evidence location and conclusion |
| --- | --- |
| B `04-Iconography/dau-viet-global-phase04-iconography-semantic-system-v1.0.json` | `grammar`, `entities.source`, `trust`, `accessibility`; Citation is explicitly “source marker + accessible label”, separate from Source and Evidence |
| Matching Phase 04 `.md` | Core grammar, Domain semantics, Trust & provenance, Accessibility, Compatibility with locked product design; semantic grammar does not authorize component redesign |
| B `04-Iconography/dau-viet-global-phase04-1-icon-optical-context-qa-v1.0.md` and `.json` | Size decision / size_matrix, micro corrections, Context QA and Production decision; Citation is absent from supplied geometry/individual QA matrix |
| B `04-Iconography/dau-viet-global-phase04-iconography-v1.0.css` | `.dv-icon`, compact/utility/button and focus-visible rules; actual inherited currentColor, none fill, 1.75 default and 2 compact |
| B `04-Iconography/dau-viet-global-phase04-semantic-icon-sprite-v1.0.svg` | Ten symbols; Source, Story, Verified and Warning are present; Citation is absent |
| B `04-Iconography/dau-viet-global-phase04-1-micro-icon-sprite-v1.0.svg` | Four micro symbols: Culture, Source, Story, Journey; Citation absent |
| Phase 04 and 04.1 matching `.png` boards | Visually inspected original images: Phase 04 Citation card is a text label, not measured geometry; Phase 04.1 has ten icon rows and no Citation row |
| B `03-Multilingual-Typography/dau-viet-global-phase03-typography-qa-v1.1.md:19` | Source/citation metadata wraps/reflows rather than shrinking below Caption 12/18 |
| B `06-Motion-Identity/dau-viet-global-phase06-motion-identity-interaction-v1.0.md:30` and Phase 06.1 `.md:13` | Story citations/evidence never delayed behind animation |
| B `07-Real-Media-Provenance/dau-viet-global-phase07-real-media-provenance-v1.0.md` | Provenance contract and Accessibility: supplied source/rights/classification; nearby evidence captions/provenance; frontend must not infer missing provenance |
| B `07-Real-Media-Provenance/dau-viet-global-phase07-1-media-truth-disclosure-context-qa-v1.0.md:16` | Story Explorer keeps evidence identity, source and citations available |
| B `08-Web-iOS-Android/dau-viet-global-phase08-brand-application-web-ios-android-v1.0.md:20,23,25` | Native target sizes and generic-system-action boundary; platform icons cannot replace domain semantics |
| B `08-Web-iOS-Android/dau-viet-global-phase08-1-cross-platform-brand-accessibility-qa-v1.0.md:22,26,29` | Story citations/evidence immediately available; provenance retrievable on mobile; shared semantic vocabulary; system icons limited to generic actions |
| B `09-Editorial-Visualization/dau-viet-global-phase09-editorial-graphics-historical-storytelling-v1.0.md` | Story first/evidence available; source required for charts; explicit uncertainty; evidence on demand without removing retrievability |
| B `11-Governance-Handoff/dau-viet-global-phase11-1-governance-drift-prevention-handoff-qa-v1.0.md` | Canonical resolution/release gates, semantic preservation, owner review for additions, no frontend provenance inference |
| `docs/backend/TRUST_MODEL.md`, sections 1, 3, 4, 5 | Source is bibliographic/provenance record; Citation links Fact to Source with locators and verification state; citation existence does not imply verification |
| `docs/backend/EDITORIAL_CONTENT.md`, sections 4–5 | source_reference/quote blocks, StoryFact and StoryCitation contracts; inline `[1]` display text does not define a canonical glyph |
| `docs/backend/HISTORICAL_DOMAIN.md`, entity distinctions and publication rules | HistoricalFact is an atomic sourced claim, distinct from Story prose |
| `packages/brand-icons/README.md`, `index.mjs`, `canonical/semantic.svg`, `canonical/micro.svg` and canonical CSS | Current shipped geometry, size resolver, accessible-name/decorative guidance, explicit blocked Citation integration |
| `packages/brand-contracts/brand-registry.json` | Sprite lifecycle/distribution and `glyph-citation` CANONICAL_ASSET_GAP, no canonical symbol or approved alias |
| `packages/brand-contracts/source-inventory.json`, `source-manifest.json`; B `MANIFEST.json` | Controlled source selections, checksums and artifact accounting |
| `docs/brand/brand-asset-gap-matrix.md`, prior integration reports and `docs/brand/locks/` | Citation already recorded missing; logo locks concern distinct assets and do not authorize glyph geometry |

## Source integrity and plausible assets

SOURCE INTEGRITY: PASS. All 221 controlled source entries passed SHA-256 and byte-length verification; the canonical validator separately passed original manifest 133/133 and distribution/registry reconciliation. No checksum failure was repaired. Canonical sprite distribution copies are source-byte-identical. The two reference PNG boards are among the manifest-verified sources.

PRIMARY CANONICAL CITATION SVG: NONE. Primary semantic document is B `04-Iconography/dau-viet-global-phase04-iconography-semantic-system-v1.0.json`, `trust.citation`.

The related Source symbols are plausible search leads but not Citation assets. Story's book contour, Verified's bounded check and Warning's triangle are likewise not permitted substitutes. All actual sprite symbols are inventoried in the appendix to make absence of Citation explicit. No third-party quote/link/book icon is eligible merely because its appearance might seem suitable.

## Semantic definition and distinctions

Brand semantic, exactly: **source marker + accessible label**. Domain contract: a Citation connects an atomic HistoricalFact to a bibliographic/provenance Source, carrying page/volume/chapter/excerpt context and a separate verification state. Citation existence alone is not a trust verdict: UNVERIFIED, VERIFIED, REJECTED and DISPUTED remain distinct. The documentation does not universally define the glyph as a citation-count badge, an open-citations button or a specific reference-locator action. Those UI-role details are not inferred from the data model.

| Relationship | Supported distinction |
| --- | --- |
| Source ↔ Citation | Source is the document/evidence or bibliographic/provenance record; Citation is the claim-to-source relationship/marker with a label. No approved Source-symbol alias exists. |
| Citation ↔ Evidence | Phase 04 lists separate trust semantics: Citation “source marker + accessible label”; Evidence “document/lens”. Evidence remains available in product contexts, but a complete formal UI boundary/action contract between these two glyphs is not supplied. They must not be silently merged. |
| Citation ↔ Verified | Citation may exist unreviewed; Verified conveys review/verification, with a separate bounded-check glyph. |
| Citation ↔ Warning | Warning has triangle/exclamation + text semantics, not a source relationship. |
| Citation ↔ Sensitive | Sensitive is shield/notice + text, not citation presence or verification. |
| Citation ↔ Reconstruction | Reconstruction is layered symbol + disclosure; transformed/illustrative material must not be mistaken for documentary evidence. |
| Citation ↔ AI Translation | Language indicator + disclosure is a separate transformation/language semantic. |

These comparisons document boundaries only; no other trust glyph was designed or started.

## Product/component contexts

- HistoricalFact → Citation → Source is explicitly documented in TRUST_MODEL. Publication requires a verified citation, but that does not make every Citation glyph a Verified badge.
- StoryFact identifies published facts supporting a narrative. StoryCitation supplies editorial context, quotation placement, locator/quoteNote; it never replaces a Fact's citation or marks a fact verified (`EDITORIAL_CONTENT`, section 5).
- `source_reference` blocks support inline `[1]`-style markers with editor-supplied labels; quote blocks may carry citationId (section 4). This is an editorial content contract, not measured glyph paths, superscript geometry or an approved symbol alias.
- Phase 04 calls out Map, Story Explorer, Journey, Connection and Evidence/Trust components. Phase 04.1 specifically supports Story/Source/Trust semantics at 20–24px. These are conceptual integration contexts, not proof Citation has shipped geometry.
- Phase 07/08 keep citations and evidence retrievable in Story Explorer and compact mobile disclosure; Phase 06 prohibits delaying them behind animation. Phase 09 preserves sources and evidence access in editorial visualizations.
- No inspected locked specification precisely assigns a Citation glyph to a named source drawer, fact panel, count badge, tooltip or open-citations control. No new UI is inferred.

## Geometry, sizes and stroke

GEOMETRY: UNDEFINED for Citation. General style is defined, but no exact Citation coordinates, path sequence, topology, bounding box/keyline, optical correction or approved asset alias exists. Phase 04's labeled card and generic “source marker” wording cannot select among document, quote, link, bracket or other constructions. A fails because no Citation asset has explicit geometry/lifecycle/distribution; B fails because the style grammar leaves visual decisions open.

Canonical grammar: 24×24; 1.75px default optical stroke; round caps and joins; monochrome-first. Phase 04.1 permits compact 2px at 20px and CSS includes `.dv-icon--compact`; no Citation-specific 2px exception or new compact path is supplied. This general permission does not establish a finished Citation variant.

Canonical size policy: 20px minimum semantic, 24px preferred/default, 32px canonical scaling without decorative additions. These are intended system sizes, not a claim of Citation-specific raster QA. CITATION 16PX: NOT_SUPPORTED in current distribution: no explicit Citation micro exists and the resolver rejects Citation at every size. No automatic 16px derivation is allowed. The general size policy is already decided; a separate new 20px design rule is not added as an unnecessary blocker.

## Color/state and accessibility

Existing sprite/CSS contract is fill none, stroke currentColor, approved Phase 02 semantic colors, monochrome-first. No Citation-specific fixed neutral hex, Forest/Bronze Gold mapping, verification-state tint, hover fill or selected/active fill is defined. The map selected outline/scale rule is a map-state contract, not a Citation fill rule. The user summary's selected/active-only fill language does not supply missing Citation state construction; no new fill behavior is inferred.

Phase 04 requires explicit accessible semantics and Citation specifically requires an accessible label. Non-obvious standalone icon buttons need an accessible name. Repository icon guidance says meaningful icons use visible labels and/or accessible names; redundant decorative SVGs use aria-hidden=true. Thus decorative versus semantic exposure depends on context and redundancy; no Citation-specific exact accessible string or tooltip text is locked.

Web controls target at least 44×44 CSS px; essential graphics >=3:1; color and motion cannot be sole cues. Focus inherits Phase 02. Actual canonical CSS uses a 3px focus-visible outline, 3px offset, --dv-focus-light or --dv-focus-dark by surface. Source/citation metadata reflows instead of shrinking below Caption 12/18. No source sprite symbol supplies its own title/desc/role/aria label: these hidden sprite definitions depend on the consuming SVG/control for accessibility. That is a sprite contract, not a broken standalone Citation SVG.

## Cross-platform and lifecycle

Phase 08 requires shared Phase 04 semantic vocabulary across Web, iOS and Android; generic OS action glyphs may use platform libraries. Citation's trust semantic is not classified as a generic OS action. No evidence permits replacing it with SF Symbols, Material Icons, Lucide or another library. Web external-use sprites require actual runtime QA; native adapters are needed. Targets are 44 CSS px on Web, 44pt on iOS and preferably 48dp on Android, independently of visual glyph size.

Phase 04 source documentation says PRODUCTION CANDIDATE; Phase 04.1 says PASS WITH MICRO-ICON RULES / READY FOR PHASE 04 PRODUCTION LOCK. Current registry explicitly marks the two supplied sprites PRODUCTION_LOCKED. That lifecycle applies to their enumerated symbols, not to absent Citation geometry. Citation itself remains CANONICAL_ASSET_GAP, without candidate, production asset, versioned geometry, approved alias or distribution path.

## Decision and minimum missing decisions

DECISION: CANONICAL_ASSET_GAP. Citation gap remains unchanged, never RESOLVED.

Minimum human design decisions:

1. Approve the actual Citation source-marker visual construction/metaphor, explicitly distinct from Source, Evidence and Verified (or supply an explicit approved semantic alias; none exists now).
2. Supply exact canonical 24×24 vector construction/geometry under the existing Phase 04 style and 20/24/32 size policy, including any intended optical exception rather than leaving coordinates to inference.

No new grid, default stroke, cap/join, generic contrast/target policy or 16px design is requested. A specific interactive action/label would additionally need its component contract before UI implementation, but this audit does not invent that UI or treat it as permission to redesign the glyph.

NEXT: obtain approved Citation construction evidence for these missing decisions, then rerun the canonical/deterministic gate. Retain explicit text labels and blocked glyph resolution meanwhile. Do not create artwork or start Evidence.

## Tests, gap state and file operations

- Complete brand suite: `node --test scripts/brand/validate.test.mjs scripts/brand/validate-inverse-mono.test.mjs` — 46/46 PASS, zero failures.
- `node scripts/brand/validate.mjs` — PASS; original source 133/133; canonical copies, registry, inventory and manifests pass.
- Direct source integrity: 221/221 SHA-256 and lengths PASS.
- `scripts/brand/validate-svg.ps1 -SelfTest` — self-tests PASS; production XML/references 12/12 PASS; inverse historical candidate 1/1 PASS.
- No tests added or changed: this audit introduces no executable contract or geometry.

Five actionable gaps remain overall. Other four: Evidence, Reconstruction, AI Translation, Sensitive. Matrix already records Citation CANONICAL_ASSET_GAP correctly, so it needs no edit.

FILES CREATED: `docs/brand/brand-citation-resolution-pass-06.md`.

FILES MODIFIED: NONE. FILES COPIED: NONE. Artwork created: NONE.

BACKEND/API/PRISMA/DB/.ENV: UNCHANGED. Repository-wide search and selected product/domain documentation/contracts were read only, as requested. No environment files were opened; no services/database/API commands ran. Web/Mobile/Admin, sprites, logo locks, parent/candidate/production assets, QA, registry and manifests were not modified. Prior uncommitted work is preserved. No work on other Trust Glyphs was started.

GIT COMMIT: NOT CREATED. GIT PUSH: NOT PERFORMED.

## Appendix: inspected source asset inventory

The following generated inventory records existing file attributes only; it creates no artwork or glyph geometry.

### dau-viet-global-phase04-semantic-icon-sprite-v1.0.svg

- Source absolute path: `D:/dauviet/Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/04-Iconography/dau-viet-global-phase04-semantic-icon-sprite-v1.0.svg`.
- Distribution absolute path: `D:/dauviet/packages/brand-icons/canonical/semantic.svg`; filename `semantic.svg`.
- Family: Phase 04 icon-sprite. Version: 1.0. Lifecycle: PRODUCTION_LOCKED in current registry.
- Registry asset ID: `dvg-icon-sprite-phase04-semantic-icon-sprite-v1.0`. Platform scope: web, ios, android, admin; locale all.
- SHA-256 (both copies): `dc458b53543dbd4ae914323ef4eb5f6937c771cb1942724926381e288491ca3f`; bytes 2276. Original Bible manifest and controlled manifest/inventory match; selected distribution path matches registry.
- Root: SVG hidden with style display:none; no root viewBox or width/height. Symbols each define their own viewBox; no explicit width/height on symbols.
- All symbols: fill none, stroke currentColor, round caps and joins. No masks, clip paths, transforms, title, desc, role or aria attributes. Consumers supply names/decorative handling and dimensions.

| Symbol / semantic | viewBox | Stroke width | Paths | Circles | Rect/polyline/polygon/line/ellipse/use | Intended sizes / usage |
| --- | --- | --- | --- | --- | --- | --- |
| `dv-icon-place` | 0 0 24 24 | 1.75 | 2 | 0 | 0 / 0 / 0 / 0 / 0 / 0 | 16/20/24/32px; its named semantic only |
| `dv-icon-people` | 0 0 24 24 | 1.75 | 1 | 1 | 0 / 0 / 0 / 0 / 0 / 0 | 20/24/32px; 16px uses separate micro if supplied; its named semantic only |
| `dv-icon-event` | 0 0 24 24 | 1.75 | 1 | 1 | 0 / 0 / 0 / 0 / 0 / 0 | 20/24/32px; 16px uses separate micro if supplied; its named semantic only |
| `dv-icon-culture` | 0 0 24 24 | 1.75 | 1 | 0 | 0 / 0 / 0 / 0 / 0 / 0 | 20/24/32px; 16px uses separate micro if supplied; its named semantic only |
| `dv-icon-time` | 0 0 24 24 | 1.75 | 1 | 1 | 0 / 0 / 0 / 0 / 0 / 0 | 20/24/32px; 16px uses separate micro if supplied; its named semantic only |
| `dv-icon-source` | 0 0 24 24 | 1.75 | 1 | 0 | 0 / 0 / 0 / 0 / 0 / 0 | 20/24/32px; 16px uses separate micro if supplied; its named semantic only |
| `dv-icon-story` | 0 0 24 24 | 1.75 | 1 | 0 | 0 / 0 / 0 / 0 / 0 / 0 | 20/24/32px; 16px uses separate micro if supplied; its named semantic only |
| `dv-icon-journey` | 0 0 24 24 | 1.75 | 1 | 2 | 0 / 0 / 0 / 0 / 0 / 0 | 20/24/32px; 16px uses separate micro if supplied; its named semantic only |
| `dv-icon-verified` | 0 0 24 24 | 1.75 | 1 | 1 | 0 / 0 / 0 / 0 / 0 / 0 | 16/20/24/32px; its named semantic only |
| `dv-icon-warning` | 0 0 24 24 | 1.75 | 1 | 0 | 0 / 0 / 0 / 0 / 0 / 0 | 16/20/24/32px; its named semantic only |

No symbol above is Citation. Source is a domain document/evidence record; Source micro is its explicit simplified 16px variant. Story is narrative, Verified is a bounded check, Warning is warning text/triangle. None supplies an approved Citation alias.

### dau-viet-global-phase04-1-micro-icon-sprite-v1.0.svg

- Source absolute path: `D:/dauviet/Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/04-Iconography/dau-viet-global-phase04-1-micro-icon-sprite-v1.0.svg`.
- Distribution absolute path: `D:/dauviet/packages/brand-icons/canonical/micro.svg`; filename `micro.svg`.
- Family: Phase 04 icon-sprite. Version: 1.0. Lifecycle: PRODUCTION_LOCKED in current registry.
- Registry asset ID: `dvg-icon-sprite-phase04-1-micro-icon-sprite-v1.0`. Platform scope: web, ios, android, admin; locale all.
- SHA-256 (both copies): `52cbc0ae14efdfb46f6cfbaefad54503d7b4b4cf04987e2e6aec1478ce70d2c6`; bytes 955. Original Bible manifest and controlled manifest/inventory match; selected distribution path matches registry.
- Root: SVG hidden with style display:none; no root viewBox or width/height. Symbols each define their own viewBox; no explicit width/height on symbols.
- All symbols: fill none, stroke currentColor, round caps and joins. No masks, clip paths, transforms, title, desc, role or aria attributes. Consumers supply names/decorative handling and dimensions.

| Symbol / semantic | viewBox | Stroke width | Paths | Circles | Rect/polyline/polygon/line/ellipse/use | Intended sizes / usage |
| --- | --- | --- | --- | --- | --- | --- |
| `dv-icon-culture-micro` | 0 0 24 24 | 2 | 1 | 0 | 0 / 0 / 0 / 0 / 0 / 0 | 16px explicit micro; its named semantic only |
| `dv-icon-source-micro` | 0 0 24 24 | 2 | 1 | 0 | 0 / 0 / 0 / 0 / 0 / 0 | 16px explicit micro; its named semantic only |
| `dv-icon-story-micro` | 0 0 24 24 | 2 | 1 | 0 | 0 / 0 / 0 / 0 / 0 / 0 | 16px explicit micro; its named semantic only |
| `dv-icon-journey-micro` | 0 0 24 24 | 2 | 1 | 2 | 0 / 0 / 0 / 0 / 0 / 0 | 16px explicit micro; its named semantic only |

No symbol above is Citation. Source is a domain document/evidence record; Source micro is its explicit simplified 16px variant. Story is narrative, Verified is a bounded check, Warning is warning text/triangle. None supplies an approved Citation alias.

### Reference board: dau-viet-global-phase04-iconography-semantic-system-v1.0.png

Absolute path: `D:/dauviet/Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/04-Iconography/dau-viet-global-phase04-iconography-semantic-system-v1.0.png`. Family Phase 04 reference/QA board, version 1.0; not a canonical Citation glyph. Raster dimensions 1700x1100. SVG viewBox, stroke/fill, linecap/join, paths/shapes, masks/clips/transforms and SVG accessibility metadata: NOT_APPLICABLE. Manifest SHA-256: `2b318aa62e69796f4eda7700f0757df0743405135aaa25d73f6db580285501bc`. No Citation distribution role is registered. The first board names Citation without its construction; the second has no Citation QA row. No geometry may be inferred or traced from these boards.

### Reference board: dau-viet-global-phase04-1-icon-optical-context-qa-v1.0.png

Absolute path: `D:/dauviet/Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/04-Iconography/dau-viet-global-phase04-1-icon-optical-context-qa-v1.0.png`. Family Phase 04 reference/QA board, version 1.0; not a canonical Citation glyph. Raster dimensions 1900x1500. SVG viewBox, stroke/fill, linecap/join, paths/shapes, masks/clips/transforms and SVG accessibility metadata: NOT_APPLICABLE. Manifest SHA-256: `aec189691011d137beae525764e70b70af63f30eafa1e3d5a9c9dde4956cc4b0`. No Citation distribution role is registered. The first board names Citation without its construction; the second has no Citation QA row. No geometry may be inferred or traced from these boards.
