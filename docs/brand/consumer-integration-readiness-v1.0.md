# Dấu Việt Global — Consumer Integration Readiness V1.0

Date: 2026-09-20
Status: **READY_FOR_CONSUMER_INTEGRATION**
Scope: Brand-contract readiness only. This does not assert that Web/iOS/Android/Admin integration is already implemented.

## 1. Canonical inputs

Consumers MUST resolve brand inputs from versioned canonical packages, never from screenshots, copied SVGs, candidate folders, or reference boards.

- `packages/brand-tokens` — color, typography, map/spatial tokens
- `packages/brand-assets` — master/micro/horizontal/logo derivatives and app-icon input
- `packages/brand-icons` — semantic, micro and dedicated trust glyphs
- `packages/brand-motion` — canonical motion tokens
- `packages/brand-contracts` — canonical registry and presentation contracts

Registry is the machine-readable integration authority; production lock records provide audit evidence.

## 2. Consumer rules

### Web / Admin
- Use canonical CSS/token exports; no hard-coded substitute brand colors.
- Use horizontal logo V1.4.1 in wide navigation under its locked minimum/preferred size rules.
- Use master/micro assets according to size; never downscale unsupported semantic glyphs to 16px.
- Trust glyphs Citation/Evidence/Reconstruction/AI Translation/Sensitive use canonical files and accessible semantic labels.
- Respect focus-visible, keyboard operation, reduced motion and media provenance contracts.
- Map UI must preserve list/accessibility alternatives and uncertainty semantics.

### iOS
- Canonical identity and semantics remain unchanged; native implementation need not be pixel-identical to web.
- 44pt minimum interaction target; Dynamic Type and Reduce Motion must be validated.
- SF Symbols may be used only for generic OS actions, never as substitutes for Dấu Việt domain/trust glyphs.
- Native icon/export derivatives must be generated from canonical locked inputs, not reconstructed.

### Android
- Canonical identity and semantics remain unchanged.
- 48dp preferred interaction target; font scaling and reduced motion must be validated.
- Material/system icons may be used only for generic actions, never as substitutes for Dấu Việt domain/trust glyphs.
- Edge-to-edge/cutout behavior is consumer QA.

## 3. Size resolver contract

- Master logo: 32px minimum; 48px+ preferred.
- Micro logo: canonical 16/24px rules only.
- Horizontal logo V1.4.1: 48px minimum; 64px+ preferred.
- General semantic glyphs: 20px minimum, 24px preferred, 32px supported unless an approved 16px micro exists.
- People/Event/Time: **16px forbidden**; use 20px minimum.
- Citation/Evidence/Reconstruction/AI Translation/Sensitive: 20/24/32px; 16px NOT_SUPPORTED.
- Existing canonical 16px assets remain permitted only where explicitly registered.

Consumer resolvers MUST fail safely or choose 20px minimum rather than silently scaling an unsupported 16px glyph.

## 4. Theme / contrast contract

- Deep Forest #062A24
- Forest 700 #18463C
- Bronze Gold #D4AF7C
- Warm Sand #EADDC7
- Stone #B6B6B6
- Charcoal #1A1A1A
- White #FFFFFF

Gold CTA: Bronze Gold background + Charcoal foreground.
Deep Forest CTA: Deep Forest background + White foreground.
Color must never be the sole semantic cue.
Dark Micro and Inverse Mono are limited to their locked background/size scopes; do not generalize them into new master/horizontal variants.

## 5. Typography / locale contract

Use the locked Phase 03 locale mapping:
- VI/EN/FR: Noto Serif + Noto Sans
- JA: Noto Serif JP + Noto Sans JP
- KO: Noto Serif KR + Noto Sans KR
- zh-Hans: Noto Serif SC + Noto Sans SC
- zh-Hant: Noto Serif TC + Noto Sans TC

Consumer implementation must validate Vietnamese diacritics, locale fallback, line wrapping, text expansion and native font scaling.

## 6. Motion contract

Use canonical Phase 06 timing and semantics. Reduced-motion mode removes parallax, camera fly, path drawing and large transforms. Meaning must survive with static state/opacity behavior.

## 7. Media / provenance contract

Production media must come from backend/CMS MediaAsset linked to the correct entity/content with valid provenance/rights metadata. Consumers MUST NOT scan local folders to auto-match, randomize imagery, fabricate historical imagery, or present AI/reconstruction media as documentary evidence.

Safe fallback: no-media/map/text/provenance-safe placeholder.

## 8. Trust semantics

Citation, Evidence, Verified, Reconstruction, AI Translation, Warning and Sensitive are distinct semantics. Do not alias one glyph to another. Reconstruction and AI Translation require disclosure semantics; Sensitive requires explicit accessible notice text. Evidence presence does not imply Verified.

## 9. Integration QA gates

A consumer is not BRAND_INTEGRATION_READY until it passes:
1. canonical-path audit — no copied/reconstructed brand masters;
2. registry/version audit — requested asset/version exists and is production-authorized;
3. size audit — unsupported 16px usage rejected;
4. light/dark contrast audit;
5. keyboard/focus/touch-target audit;
6. locale/font-scaling audit;
7. reduced-motion audit;
8. map spatial/accessibility audit where applicable;
9. media/provenance audit;
10. trust-label/disclosure audit;
11. native/PWA export audit where applicable;
12. real-screen visual regression QA.

## 10. Pending validation that does not block integration start

- executable raster QA for Reconstruction / AI Translation / Sensitive;
- complete PWA/favicon/native export sets, generated in real consumer pipelines;
- real social/store screenshots, generated only from actual product UI.

These items must remain visible follow-ups; no PASS may be fabricated.

## 11. Implementation boundary

Brand foundation is ready to integrate. This document does **not** authorize premature frontend scaffolding while product implementation ownership/freeze sequencing says backend comes first. When consumer implementation begins, integrate these contracts without redesigning locked baselines.

No backend/API/Prisma/database/.env or application code is modified by this readiness pass.
