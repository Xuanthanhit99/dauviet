# Brand integration pre-change audit

Date: 2026-09-17. Recorded before production/package changes.

## A. Repository and Git baseline

- Root: `D:/dauviet`; branch: `main`.
- `git status --short`: only `?? Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/`. Preserve this user-supplied untracked directory.
- `apps/api` is the only application. No `apps/web`, `apps/mobile`, `apps/admin`, equivalent frontend, or existing `packages` directory was found.
- Root README describes a backend-only monorepo. pnpm workspace already includes `apps/*` and `packages/*`; new dependency-free asset packages fit without editing workspace configuration or lockfile.
- No applicable AGENTS.md was found. Root commands are backend/infra/database commands, unsuitable for this task.
- Backend/API, Prisma, environments, lockfile, root configuration and existing user files are frozen.

## B. Canonical source

Source: `Dau-Viet-Global-Brand-Identity-Bible-2026-V1-PRODUCTION-LOCKED/`.
README and MANIFEST inspected. All 133 manifest entries match both SHA-256 and byte length. Eleven phase directories exist. README mentions `00 Brand Reference`, but that directory is not supplied; it is not required by MANIFEST.

| Phase | Files | Production foundation |
| --- | ---: | --- |
| 01 | 59 | Geometry V1.3 color/dark/mono SVG; micro V1.3 color and V1.4 mono SVG; V1.4 app icon; V1.4 validation |
| 02 | 12 | Final color CSS V1.1; primitive/semantic JSON V1.0; interaction JSON/CSS V1.0; final validation |
| 03 | 7 | Multilingual typography CSS/JSON V1.0; QA V1.1 |
| 04 | 9 | Semantic sprite (10 symbols), micro sprite (4 symbols), icon CSS, semantic/QA contracts |
| 05 | 7 | Marker CSS, spatial and density/state/accessibility contracts |
| 06 | 7 | Motion CSS, choreography JSON, accessibility/context QA |
| 07 | 7 | Media presentation CSS, provenance and disclosure contracts |
| 08 | 7 | Platform token map, application/accessibility contracts |
| 09 | 6 | Editorial/history visualization and integrity contracts |
| 10 | 6 | External brand and truth/campaign contracts |
| 11 | 6 | Governance, registry and drift-prevention contracts |

The user and source README lock Phases 01–11. Earlier candidate labels inside phase files are preserved as historical metadata, not rewritten. Version precedence selects V1.3 geometry with V1.4 validation over unversioned `master.svg` and V1.1/V1.2 history. PNG boards are evidence, not vector masters.

## C. Existing application assets and consumers

No frontend public/mobile asset directories, design-system packages, application logos, favicon, PWA manifest, fonts, colors, semantic icons, map visuals or motion tokens exist outside the supplied source package. No frontend consumers exist to migrate. Backend strings/assets are outside this audit's implementation scope. No existing file will be deleted or deprecated based on its name.

## D. Drift and gaps

| Classification | Finding | Disposition |
| --- | --- | --- |
| MATCH | Manifest: 133/133 hashes and lengths match | Pin manifest and source inventory |
| MATCH | Workspace supports `packages/*` | Use five dependency-free brand packages |
| STALE | Prior logo revisions and original unversioned master are not the README-selected V1.3 production baseline | No application consumers; retain as source history, do not ship |
| DUPLICATE | Some earlier micro/raster exports share bytes | No application consumers; keep source intact |
| UNREGISTERED | No application registry exists | Register selected canonical sources and checksums |
| IMPLEMENTATION_DRIFT | No frontend exists to consume the foundation | Do not scaffold or redesign applications |
| POTENTIAL_CONFLICT | Older Phase 02 focus token differs from consolidated final CSS | Ship final V1.1 color CSS; avoid importing older color CSS alongside it; keep old JSON as reference only |
| POTENTIAL_CONFLICT | Horizontal lockup required by Phase 08 wide navigation is not supplied | ASSET: stop that integration; do not construct a wordmark |
| POTENTIAL_CONFLICT | Citation, Evidence, Reconstruction, AI Translation and Sensitive have semantic contracts but no dedicated sprite symbols | ASSET: no invented glyph mapping; keep explicit labels; affected icon integration blocked |
| POTENTIAL_CONFLICT | 16px People/Event/Time corrections required by QA are absent from micro sprite | ASSET: use existing canonical glyphs only at 20px+; affected 16px integration blocked |
| POTENTIAL_CONFLICT | No dark micro SVG or complete platform icon exports supplied | ASSET: do not recolor or claim platform readiness |
| BACKEND_DEPENDENCY | Runtime media/entity/provenance adapter cannot be evaluated without a frontend consumer | Preserve source presentation rules; never change or infer API contracts |

Source helper `logo_mask.png` and preview/safe-area/validation boards have no application consumers (UNUSED). They are excluded from production selection; no master or provenance status is inferred. Source inventory records all files, including historical and reference artifacts.

## E. Planned changes

| File / bounded file set | Reason | Phase | Risk | Expected result |
| --- | --- | --- | --- | --- |
| `packages/brand-contracts/brand-registry.json` | Canonical IDs, selected paths, versions, variants and SHA-256 | 01–11 | Low | Machine-readable production selection |
| `packages/brand-contracts/source-inventory.json` and `source-manifest.json` | Preserve full inventory and release integrity baseline | 11 | Low | Detect missing/changed source and retain history |
| `packages/brand-contracts/canonical/*/*.json` | Copy phase specification/QA contracts verbatim | 01–11 | Low | Cross-platform presentation references; not API DTOs |
| `packages/brand-assets/logo/{master,monochrome,micro}/*.svg` | Copy exactly five selected SVGs | 01 | Low | No geometry changes |
| `packages/brand-assets/app-icons/*.png` | Copy supplied V1.4 1024 app-icon derivative | 01,08 | Low | Source-backed icon reference; native exports pending |
| `packages/brand-tokens/canonical/{color,typography,map}.css` and `typography.json` | Consolidated color, locale and map foundation | 02,03,05 | Low | Source-exact shared styles/tokens |
| `packages/brand-tokens/index.css` | Explicit CSS import order | 02,03,05 | Low | One documented entry point |
| `packages/brand-icons/canonical/*` and `index.mjs` | Source-exact sprites/styles and strict symbol resolver | 04 | Low | No unsupported semantic substitutions |
| `packages/brand-motion/canonical/motion.css` | Copy canonical reduced-motion-aware stylesheet | 06 | Low | Shared motion durations/easing |
| Five `packages/brand-*/package.json` and `README.md` files | Dependency-free workspace package exports and usage boundaries | 01–11 | Low | Consumable foundation with no installation scripts |
| `scripts/brand/validate.mjs` and `validate.test.mjs` | Small read-only drift gate and fault-injection checks | 11 | Low | Asset/hash/token drift fails independently of backend |
| `docs/brand/brand-production-integration-report.md` | QA, changes, gaps, handoff | 11 | None | Honest completion status and exact changed-file list |

Sequence after this audit: registry, shared assets/tokens/icons/motion, application availability gates (Web → Mobile → Admin), drift validation, isolated QA, handoff. Missing applications are not created. Required missing assets stop their affected integrations. No frontend release or runtime QA will be claimed.
