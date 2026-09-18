# CODEX PASS #6.1 - CITATION V1.0 CANDIDATE

STATUS: PASS. Construction: Citation Trust Glyph Construction V1.0. Construction approval: APPROVED 2026-09-18 by explicit user Pass #6.1 instruction. Final human visual approval: PENDING_FINAL_VISUAL_APPROVAL.

## Audit blocker and approved construction

Pass #6 found Citation semantic/style evidence but no canonical geometry. The new user instruction supplies exact coordinates, resolving the construction blocker for a candidate only. Semantic: source marker + accessible label; Citation connects a claim/HistoricalFact to a Source with locator/context. Metaphor: Reference Brackets + Source Point. It is distinct from Source, Evidence and Verified; no alias or substitute document/lens/checkmark/link/book/quote/typographic symbol was introduced.

Approved left path: `M8 6 H6.5 C5.67 6 5 6.67 5 7.5 V16.5 C5 17.33 5.67 18 6.5 18 H8`.

Approved right path: `M16 6 H17.5 C18.33 6 19 6.67 19 7.5 V16.5 C19 17.33 18.33 18 17.5 18 H16`.

Approved circle: cx=12, cy=12, r=1.5. No path merge, circle conversion, optimization, coordinate normalization, spacing change, centering adjustment or optical redraw. User multiline path commands are serialized in their original order with single-space separators; numeric values and commands are unchanged.

## Candidate package and lifecycle

Package: `Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/04-Iconography/Dau-Viet-Global-Citation-Trust-Glyph-V1.0-CANDIDATE`.

SVG: `Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/04-Iconography/Dau-Viet-Global-Citation-Trust-Glyph-V1.0-CANDIDATE/dvg-trust-citation-v1.0.svg`.

SHA-256: `db8d2a65ff86be3eb565af66dfa7da1fffb5806ebd8931b84b99002ef9ab9ad9`.

Package includes SVG, CANDIDATE.json, VALIDATION.json, MANIFEST.sha256 and README.md. Lifecycle CANDIDATE; status CANDIDATE_READY_FOR_APPROVAL; distribution false; humanVisualApproval PENDING_FINAL_VISUAL_APPROVAL. No PRODUCTION-LOCK.md, production icon copy, sprite addition or second registry was created.

## Integrity, geometry and style

Pre-edit source integrity: 221/221 SHA-256 and byte lengths PASS. Existing canonical validator passed before changes. Three relevant locked evidence files (Phase 04 semantic grammar, Phase 04.1 QA and Phase 02 final tokens) are pinned in CANDIDATE.json. Current controlled manifest contains 226 artifacts after adding five candidate files; all verify. Existing source assets were not repaired or modified.

CITATION GEOMETRY IDENTITY: PASS. Independent validator constants enforce exact left/right path strings and circle attributes, path count 2, circle count 1, no unexpected elements/attributes. Geometry fingerprint: `8a00ede16e6f11c089ce5fc901a705a03fa3ec63ace42a1557a6c08c4ebacfa2`. XML validation separately proves well-formedness and valid internal references.

Grid/viewBox: 24x24 / 0 0 24 24. Stroke width: 1.75. Linecap: round. Linejoin: round. Fill: none. Stroke: currentColor. Flat vector: PASS. No raster, gradient, filter, shadow, mask, clipPath, transform, font, live text, external resource or style-dependent geometry. SVG equality/skeleton checks reject any added shapes or paint overrides.

20px minimum, 24px preferred, 32px supported: one SVG, one viewBox, identical geometry at all sizes. 16px NOT_SUPPORTED; no micro file, 16px QA, optical variant or production registration. Existing getIconReference rejects Citation at all sizes while production distribution is pending.

## Accessibility

Standalone SVG role=img, title id=citation-title, desc id=citation-desc, aria-labelledby references both IDs. BROKEN REFERENCES: 0. Non-rendering title/description describe Citation without introducing product behavior. Product consumers may hide redundant decorative instances when adjacent accessible text supplies the same meaning; meaningful standalone controls require accessible names. Existing target, contrast and focus rules remain authoritative, with no UI behavior encoded into geometry.

## Actual SVG QA

QA: `D:/dauviet/docs/brand/qa/citation-v1.0/`.

Google Chrome headless rendered the actual candidate inline in three isolated iframe documents. Each data-HTML iframe contains exact candidate bytes and applies existing Phase 02 Charcoal #1A1A1A on White #FFFFFF through the wrapper's color/background. These are controlled neutral/light QA settings only, not new Citation color tokens or a restricted production palette. SVG itself contains only currentColor and fill none. Isolated frames avoid repeated title/desc IDs in one document and allow currentColor inheritance without changing the candidate.

Renderer: --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size=600,220 --virtual-time-budget=2000, isolated temporary Chrome profile. Native crops originate at (40,40), (220,40), (400,40) with dimensions 20, 24, 32. pixel-inspection.png contains 6x NEAREST enlargement of those exact crops. Crop bytes and enlarged panel bytes were checked independently; all native pixels are grayscale mixtures of the neutral foreground and background. No AI image or manually recreated mark was used.

| Supported size | Brackets | Source point | Negative space / stroke / silhouette | Result |
| --- | --- | --- | --- | --- |
| 20px | Readable, balanced, unclipped | Visible and centered; separate from brackets | Preserved; coherent and stable | PASS |
| 24px | Readable, balanced, unclipped | Visible and centered; separate from brackets | Preserved; coherent and stable | PASS |
| 32px | Readable, balanced, unclipped | Visible and centered; separate from brackets | Preserved; coherent and stable | PASS |

REAL SVG QA: PASS 3/3. Actual-size render board and nearest-neighbor board were visually inspected. The small outlined circle reads as a compact point at small sizes; its exact approved circle and stroke are retained. Enlargement pixelation is diagnostic, not a failure or reason to redraw. These are technical QA results, not final human visual approval.

All six QA artifacts are hashed in VALIDATION.json. Validator checks native PNG dimensions, three distinct passing combinations, exact iframe candidate content and artifact hashes. MANIFEST.sha256 protects four package payloads.

## Registry and gap matrix

Existing candidate architecture is preserved: registry gap.candidateFile and evidence entries point to the candidate metadata; source inventory marks all five candidate artifacts non-distributing with no selected production paths. Existing 41 production assets and sourcePackages records remain identical. No changes to brand-icons sprite, resolver or assets.

Only glyph-citation advances to CANDIDATE_READY_FOR_APPROVAL, never RESOLVED/PRODUCTION_LOCKED. Four other actionable gaps remain untouched: Evidence, Reconstruction, AI Translation, Sensitive. Five total actionable gaps still include pending Citation. Horizontal, Dark Micro and Inverse Mono remain resolved. Gap matrix references this candidate and 3/3 QA.

## Validator and tests

New validate-citation.mjs checks exact construction, style, accessibility/skeleton, source evidence, lifecycle, distribution false, sizes/preferred/minimum/16px exclusion, QA and complete manifest. Main validator includes the candidate and QA. XML script validates candidate separately from production records.

Seven new tests cover integration/existence, geometry/style mutations, lifecycle/size/semantic violations, accessibility/forbidden structures, actual SVG QA provenance and size, premature promotion/distribution, source evidence and manifest drift. All previous 46 tests remain; only the two existing cross-gap expectations change Citation from CANONICAL_ASSET_GAP to the now-authorized CANDIDATE_READY_FOR_APPROVAL. Inverse/other production behavior and assertions remain intact.

- Complete suite: `node --test scripts/brand/validate.test.mjs scripts/brand/validate-inverse-mono.test.mjs scripts/brand/validate-citation.test.mjs` - 53/53 PASS, zero failures.
- `node scripts/brand/validate.mjs` - PASS; original source 133/133, canonical/registry/inventory and manifests pass.
- Direct controlled source hash/length audit: 226/226 PASS.
- `scripts/brand/validate-svg.ps1 -SelfTest` - 1 valid / 10 invalid cases PASS; production XML/references 12/12 PASS; inverse candidate 1/1 PASS; Citation candidate 1/1 PASS.
- Native crop and 6x nearest-neighbor panel identity: PASS 3/3.

## Exact files created

- `Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/04-Iconography/Dau-Viet-Global-Citation-Trust-Glyph-V1.0-CANDIDATE/CANDIDATE.json`
- `Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/04-Iconography/Dau-Viet-Global-Citation-Trust-Glyph-V1.0-CANDIDATE/MANIFEST.sha256`
- `Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/04-Iconography/Dau-Viet-Global-Citation-Trust-Glyph-V1.0-CANDIDATE/README.md`
- `Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/04-Iconography/Dau-Viet-Global-Citation-Trust-Glyph-V1.0-CANDIDATE/VALIDATION.json`
- `Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/04-Iconography/Dau-Viet-Global-Citation-Trust-Glyph-V1.0-CANDIDATE/dvg-trust-citation-v1.0.svg`
- `docs/brand/brand-citation-candidate-pass-06-1.md`
- `docs/brand/qa/citation-v1.0/citation-20px.png`
- `docs/brand/qa/citation-v1.0/citation-24px.png`
- `docs/brand/qa/citation-v1.0/citation-32px.png`
- `docs/brand/qa/citation-v1.0/pixel-inspection.png`
- `docs/brand/qa/citation-v1.0/render-board.png`
- `docs/brand/qa/citation-v1.0/render-input.html`
- `scripts/brand/validate-citation.mjs`
- `scripts/brand/validate-citation.test.mjs`

## Exact files modified in Pass #6.1

- `docs/brand/brand-asset-gap-matrix.md`
- `packages/brand-contracts/brand-registry.json`
- `packages/brand-contracts/source-inventory.json`
- `packages/brand-contracts/source-manifest.json`
- `scripts/brand/validate-inverse-mono.test.mjs`
- `scripts/brand/validate-svg.ps1`
- `scripts/brand/validate.mjs`
- `scripts/brand/validate.test.mjs`

Files copied into production: NONE.

## Frozen-area verification and approval gate

Entry git status/diff and Pass #6 report were read before changes; all existing valid uncommitted work was preserved. Pre-edit hash checkpoint: `%TEMP%/dvg-pass061-before.json`; entry registry: `%TEMP%/dvg-pass061-registry-before.json`. Final comparison found exactly the eight allowed modified files above; all other pre-existing source, package, script, documentation and QA bytes match. Registry production assets/sourcePackages and unrelated gaps compare equal to entry state. The inverse test file changes only a Citation gap-state expectation, not inverse code, geometry, metadata, locks or QA.

Backend/API/NestJS/Prisma/migrations/database/PostgreSQL/PostGIS/Redis/BullMQ/OpenAPI/API contracts/auth/.env: UNCHANGED. No environment files were opened or backend commands run. No Web/Mobile/Admin edits. Horizontal Logo, Dark Micro, Inverse Mono and Time Trace assets remain unchanged. No reset, restore, clean, stash, revert, commit or push. No other Trust Glyph work started. Temporary checkpoint/isolated renderer profile are outside the repository; no runtime dependencies added.

NEXT: WAIT_FOR_FINAL_HUMAN_VISUAL_APPROVAL. Do not production lock. Do not start Evidence.
