# CODEX PASS #4.2 ? DARK MICRO PRODUCTION LOCK

STATUS: PASS

Verified 2026-09-18. Final human visual approval: APPROVED 2026-09-17, supplied explicitly in the user request. Asset: Dark Micro V1.1. Lifecycle: PRODUCTION_LOCKED.

## Starting state and completed work

The working tree was clean at entry. The production package, distribution SVG, repository lock, canonical registry, source inventory and source manifest were already present in the checked-in starting state. They were verified and retained, not regenerated or overwritten. The initial full brand run was 26/29: three tests still expected the pre-approval candidate state, two micro assets, and seven gaps. Those assertions now enforce the approved production state, three micro assets and exactly six gaps. Three production integration tests were added, including negative cases for missing/altered bytes, unauthorized classification, approval, mappings, proof, manifest and resolution evidence. Existing historical candidate lifecycle and negative SVG/QA tests remain active.

## Lineage, production and identity

Geometry parent: Time Trace V3 Micro V1.3, `dau-viet-global-time-trace-v3-micro-v1.3.svg`. V1.0 failed evidence is preserved. V1.1 candidate and historical pending-approval metadata remain immutable approval evidence; subsequent human approval is recorded outside the SVG in production metadata.

Approved candidate: `Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/01-Logo-Master-Geometry/Dau-Viet-Global-Dark-Micro-V1.1-CANDIDATE/dvg-dark-micro-v1.1.svg`.

Production package: `Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/01-Logo-Master-Geometry/Dau-Viet-Global-Dark-Micro-V1.1-PRODUCTION-LOCKED`.

Distribution: `packages/brand-assets/logo/micro/dvg-dark-micro-v1.1.svg`.

SHA256 for candidate, production source and distribution: `0733fcea85b2d32362b04f00f8fd0a700cac56abebea3e1411b7f1f9aa5e6b1d`.

Candidate ? production BYTE IDENTITY: PASS. Production ? brand-assets BYTE IDENTITY: PASS. Geometry identity: PASS, exact source replacement equality preserves all non-authorized bytes, paths, masks, metadata and Bronze Gold #D4AF7C. Geometry changed: NO. Paths changed: NO. Colors changed from source: YES, approved mappings only. Visual candidate changed after approval: NO.

Authorized mappings: #062A24 ? #EADDC7 and #18463C ? #EADDC7. No unauthorized mappings. Use only at 16px and 24px on Deep Forest #062A24 and Forest 700 #18463C. Dark Micro is distinct from master, horizontal, light micro, Inverse Mono and generic monochrome assets.

## Registry, manifests and lock

Existing single registry: `packages/brand-contracts/brand-registry.json`. Asset ID `dvg-logo-dark-micro-v1.1`: logo / micro / dark, version 1.1, PRODUCTION_LOCKED, distribution true, exclusive CANONICAL_DARK_MICRO role, correct treatment, geometry parent, sizes and permitted backgrounds. Registry has 40 assets. Source inventory and repository manifest reconcile all selected paths and source checksums.

Production package files (all pre-existing and retained):

- LOCK.json
- PRODUCTION-LOCK.md
- PRODUCTION-VALIDATION.json
- MANIFEST.sha256
- README.md
- dvg-dark-micro-v1.1.svg

MANIFEST.sha256 validates all five payload files; its own checksum is pinned by the registry source-package record. Repository lock: `docs/brand/locks/dark-micro-v1.1.md`; it records approval, treatment and prohibitions on geometry changes, new mappings, effects, uncontrolled image backgrounds and silent redesign.

## Validator, QA and tests

The production validator now independently includes candidate lineage validation and rejects contradictory approval/proof fields. Checks cover existence, lifecycle, both byte identities, exact geometry and color transformations, Bronze Gold, accessibility and references, prohibited live text/raster/filter/gradient elements, retained four-case real SVG QA and artifact hashes, background metadata and 16/24px classification. No AI images or replacement renders were produced.

- `node --test scripts/brand/validate.test.mjs`: 32/32 PASS, 0 failures.
- `node scripts/brand/validate.mjs`: PASS; original source checksums 133/133, canonical distribution, registry, inventory and package manifests pass.
- `scripts/brand/validate-svg.ps1 -SelfTest`: 1 valid / 10 invalid self-test cases PASS; SVG XML/reference checks 11/11 PASS.
- Real SVG QA retained at `docs/brand/qa/dark-micro-v1.1/`: PASS 4/4 (16px and 24px, each on #062A24 and #18463C). Artifact hashes, native pixel sizes and embedded SVG identity verified.

## Gap resolution

Dark Micro: RESOLVED, evidence Dark Micro V1.1 / PRODUCTION_LOCKED / 2026-09-17. Gap matrix and consumer READMEs now match the existing approved registry. Unrelated gaps unchanged. Exactly six actionable design gaps remain:

1. Inverse Mono
2. Citation
3. Evidence
4. Reconstruction
5. AI Translation
6. Sensitive

## Exact files changed in this run

Created:

- `docs/brand/brand-dark-micro-production-lock-pass-04-2.md`

Modified:

- `docs/brand/brand-asset-gap-matrix.md`
- `packages/brand-assets/README.md`
- `packages/brand-contracts/README.md`
- `scripts/brand/validate-dark-micro.mjs`
- `scripts/brand/validate.test.mjs`

Copied: NONE. Both required SVG copies already existed and were verified byte-for-byte; no redundant copy or overwrite was performed.

## Frozen-area verification

Entry git status was clean. Final changed-path allowlist contains only the five brand documentation/validator files above and this report. No backend/API/NestJS/Prisma/migrations/database/PostgreSQL/PostGIS/Redis/BullMQ/OpenAPI/contracts/auth/.env writes or commands were performed. Environment files were not opened. Web/Mobile/Admin were not scaffolded or modified. Horizontal V1.4/V1.4.1, candidate packages, QA evidence, source production package and distribution SVG remain unchanged in Git; integrity validators also verify their recorded hashes. No unrelated registry gaps changed.

GIT COMMIT: NOT CREATED. GIT PUSH: NOT PERFORMED.

NEXT RECOMMENDED GAP: Inverse Mono. Not started in this run; Trust Glyphs not started.
