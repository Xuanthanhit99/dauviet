# DẤU VIỆT GLOBAL — PHASE 08
## Brand Application System: Web + iOS + Android V1.0

### Status
**PRODUCTION CANDIDATE**

Phase 08 is the integration layer for Production-Locked Phases 01–07. It does not redesign the locked Home, Explore, Destination, Place, Story, Journey or application-shell baselines. Its purpose is to make the same Dấu Việt identity survive Web, iOS and Android without forcing the three platforms to look mechanically identical.

### Shared brand contract
All platforms share the Time Trace identity, Phase 02 semantic colors, Phase 03 multilingual hierarchy, Phase 04 domain icon vocabulary, Phase 05 spatial identity, Phase 06 motion intent and Phase 07 media/provenance rules.

Consistency means **same meaning and identity**, not pixel-for-pixel sameness.

### Web
Use the horizontal master logo in wide navigation and compact/symbol variants when space is constrained. The locked Global Navigation + App Shell remains authoritative. Locale-aware font loading follows Phase 03; CJK families are loaded only for relevant locales. Complex map views retain keyboard access plus a synchronized accessible entity list. Responsive media comes from backend/CMS provenance. Favicon/PWA assets use the locked Phase 01 production marks.

### iOS
Native navigation may adapt presentation while preserving product hierarchy. Branded surfaces respect safe areas, notch/Dynamic Island and device geometry. Compact/symbol logo variants are preferred in tight chrome; the logo geometry is never redrawn.

Dynamic Type is mandatory. Phase 03 hierarchy must survive accessibility text sizes through reflow rather than fixed-height clipping. Interactive controls target at least **44×44 pt**. Reduce Motion maps directly to Phase 06 reduced-motion behavior. SF Symbols are appropriate for generic OS actions, but they do not replace Dấu Việt domain glyphs such as Story, Journey, Culture or Evidence.

### Android
Edge-to-edge layouts respect status/navigation bars and display cutouts. Compact identity is used in constrained app chrome without redrawing the mark. Font scaling is supported and semantic hierarchy survives large text. Use **48×48 dp** as the preferred Material-compatible interactive target while preserving the locked accessibility intent.

Material/system icons may serve generic OS actions, not replace Dấu Việt domain semantics. System animation/reduced-motion preferences map to the Phase 06 contract where available. Provenance remains visible/retrievable exactly as on other platforms.

### Responsive brand application
Desktop may use more editorial whitespace and brand presence. Tablet compresses whitespace while preserving hierarchy. Mobile prioritizes content and utility, uses compact identity and never removes provenance/state cues merely to save space. Portrait/landscape changes layout, not semantic priority.

### App icon and launch
The app icon uses the Production-Locked Phase 01 symbol and safe-area geometry; platform masks are applied around it, not by redrawing it. Launch/splash is a minimal brand moment and never a long cinematic gate. Store imagery must obey Phase 07: truthful product presentation, real/provenance-safe media and no fabricated screenshots.

### What may adapt by platform
Native safe-area/inset handling, navigation presentation, text rendering/accessibility scaling, generic OS action icons, platform-native sheets/dialogs and optional native haptics may adapt when product semantics remain intact.

### What may not adapt
Do not create separate logo geometry, semantic color meanings or domain-icon vocabularies per platform. Do not hide provenance on mobile, ignore reduced motion, reorder locked product hierarchy merely to imitate platform trends, or use misleading store/media assets.

### Implementation principle
Build shared design tokens and domain semantics first, then platform adapters. The adapter may change **presentation mechanics**, never the meaning contract.

### Next validation
Run **Phase 08.1 — Cross-Platform Brand Consistency & Accessibility QA** across Web desktop/mobile, iOS, Android, dark/light, large text, reduced motion, multilingual locales, Map, Story, Journey, provenance and app-icon/launch contexts before Production Lock.
