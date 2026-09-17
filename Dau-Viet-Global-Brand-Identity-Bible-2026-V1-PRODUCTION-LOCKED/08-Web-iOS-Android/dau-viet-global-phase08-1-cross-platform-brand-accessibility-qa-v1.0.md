# DẤU VIỆT GLOBAL — PHASE 08.1
## Cross-Platform Brand Consistency & Accessibility QA V1.0

### Result
**PASS WITH IMPLEMENTATION RULES — READY FOR PHASE 08 PRODUCTION LOCK**

Phase 08 survives Web, iOS and Android adaptation without redesign. Consistency means invariant identity and semantic meaning, not pixel-for-pixel sameness.

### Platform results
- **Web Desktop — PASS:** locked App Shell remains authoritative; complex maps retain keyboard access and synchronized accessible entity lists.
- **Web Mobile — PASS WITH RULE:** compact identity is valid, but evidence/provenance/state cannot disappear for space. 200% zoom and translated content must reflow.
- **iOS — PASS WITH RULE:** safe areas/Dynamic Island respected; Dynamic Type reflows; controls >=44×44 pt; Reduce Motion maps to Phase 06; SF Symbols only for generic OS actions.
- **Android — PASS WITH RULE:** edge-to-edge insets/cutouts respected; large font reflows; 48×48 dp preferred; Material/system icons only for generic OS actions.

### Cross-platform checks
Logo geometry, semantic color, domain icon vocabulary, map meaning, motion intent and media/provenance remain invariant. Dark mode preserves Phase 02 contrast/state meaning and is not a literal inversion. Portrait/landscape may reflow without changing semantic priority.

### Multilingual checks
VI/EN pass. FR expands/reflows without English-width assumptions. JA uses JP behavior without inherited Latin tracking. KO keeps heading-specific wrapping rules. Simplified and Traditional Chinese retain separate SC/TC production contracts.

### Product contexts
Map passes with accessible alternatives. Story citations/evidence remain immediately available. Journey progress survives reduced motion. Provenance may collapse into compact disclosure UI on mobile but remains retrievable. App icon uses locked Phase 01 geometry and safe area. Launch remains minimal, non-blocking and reduced-motion aware.

### Required production rules for lock
1. One logo geometry across Web, iOS and Android; masks/safe areas/chrome never redraw it.
2. Semantic color, domain icon, map-state, motion and provenance meaning remain invariant across platforms.
3. Mobile compaction never removes evidence, provenance, verification, warning or state retrievability.
4. Web 200% zoom, iOS Dynamic Type and Android large-font scaling reflow; fixed-height clipping is prohibited.
5. System icons are limited to generic OS actions; Dấu Việt domain semantics retain Phase 04 glyphs.
6. Reduced motion removes high-motion behavior rather than merely accelerating it.
7. Dark/light themes preserve Phase 02 contrast/state semantics; literal palette inversion is prohibited.
8. Platform map gestures cannot remove required keyboard/screen-reader/accessible-list alternatives.
9. Locale behavior follows Phase 03; font fallback must not collapse SC/TC/JP/KR distinctions.
10. Launch/splash/brand animation never gates navigation, auth recovery, deep links or essential content.
11. Store screenshots/promotional media obey Phase 07 truth rules; fabricated states/wrong-entity imagery are prohibited.
12. Platform adaptation may change mechanics/density but not locked hierarchy or semantic priority without approved UX change.

### Decision
**Phase 08 is READY FOR PRODUCTION LOCK** with all twelve rules included in the baseline.
