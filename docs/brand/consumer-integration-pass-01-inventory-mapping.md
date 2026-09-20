# Dấu Việt Global — Consumer Integration Pass #1: Inventory & Mapping

Date: 2026-09-20
Status: **INVENTORY_COMPLETE — IMPLEMENTATION_BLOCKED_BY_MISSING_CONSUMERS / BACKEND_FREEZE_GATE**

## Repository inventory

The current `main` checkout is explicitly a **backend monorepo**. Root `package.json` describes it as `Dau Viet - Living Digital Atlas of Vietnam (backend monorepo)`.

Workspace glob: `apps/*` and `packages/*`.

Verified consumer package inventory:
- `apps/api/package.json`: PRESENT — NestJS API.
- `apps/web/package.json`: NOT PRESENT.
- `apps/mobile/package.json`: NOT PRESENT.
- `apps/admin/package.json`: NOT PRESENT.
- root `turbo.json`: NOT PRESENT.

Therefore there are currently **no actual Web/iOS/Android/Admin consumer surfaces in this repository to inspect or modify**. Pass #1 must not fabricate screen/component inventory.

## Brand package inventory available for future consumers

| Concern | Canonical source | Consumer mapping |
| --- | --- | --- |
| Color / typography / map tokens | `packages/brand-tokens` | Web/Admin CSS/token layer; native mapped tokens later |
| Logos / app identity | `packages/brand-assets` | App shell, navigation, auth/launch, app-icon export pipelines |
| Semantic / trust icons | `packages/brand-icons` | Domain entities, trust/evidence/disclosure UI |
| Motion | `packages/brand-motion` | Interaction/narrative motion + reduced-motion contract |
| Registry/contracts | `packages/brand-contracts` | Version/status resolver and integration gate |
| Media truth | CMS MediaAsset contract | Entity/story/journey media; provenance-aware rendering |

## Planned surface mapping once consumers exist

### Web
KEEP: locked Home V5, Explore Map V3, Destination V4, Place V4, Story Explorer V4, Journey V3, Country V1, Region/Person/Event/Culture V2 and App Shell V4.1 structures.

INTEGRATE: canonical horizontal/master/micro logos; locale typography; semantic/trust glyphs; map tokens; motion/reduced-motion; MediaAsset provenance; evidence/citation/disclosure components.

FIX only when evidence exists: hard-coded brand colors, copied SVGs, unsupported 16px glyph use, generic substitutes for domain/trust icons, fabricated/local media substitution, inaccessible focus/touch targets, missing reduced-motion or provenance state.

### iOS / Android
KEEP: product information architecture and locked responsive/mobile baseline.

INTEGRATE: canonical identity, native token mapping, domain/trust glyph assets, locale fonts, Dynamic Type/font scaling, reduced motion, app-icon derivative pipeline and provenance-aware media.

FIX only from actual implementation evidence; do not infer violations before consumer code exists.

### Admin
INTEGRATE: brand tokens for shell consistency, semantic/trust vocabulary, provenance/media states, editorial evidence/citation/reconstruction/AI-translation/sensitive disclosure states. Admin must preserve operational clarity over decorative branding.

## Size mapping

- master logo: >=32px, preferred >=48px
- horizontal logo V1.4.1: >=48px, preferred >=64px
- micro logo: only registered 16/24 rules
- semantic glyphs: 20px minimum / 24 preferred / 32 supported unless explicit canonical 16px exists
- People/Event/Time: no 16px
- Citation/Evidence/Reconstruction/AI Translation/Sensitive: 20/24/32 only; 16 NOT_SUPPORTED

## Current KEEP / INTEGRATE / FIX result

**KEEP**
- all locked product/UX baselines;
- all production-locked Brand Bible canonical assets/contracts;
- backend-first implementation ownership and freeze sequence.

**INTEGRATE**
- nothing into application code yet: consumer packages are absent.

**FIX**
- no consumer defect can be truthfully recorded yet because there is no Web/Mobile/Admin implementation in the current repository.

## Gate result

Pass #1 inventory is complete for the repository that actually exists.

Consumer implementation remains blocked for two independent reasons:
1. backend freeze evidence is still not verified by the existing entry gate;
2. Web/Mobile/Admin consumer packages are not present in `main`.

The next authorized consumer step is **Pass #2 — Consumer Scaffold / Existing Consumer Attach**, but only after backend freeze handoff. If another repository/worktree contains the consumers, attach that source instead of creating duplicate apps.

No backend/API/Prisma/database/.env or application code changed in this pass.
