# DẤU VIỆT GLOBAL — PHASE 04.1
## Icon Optical & Context QA V1.0

### Result
**PASS WITH MICRO-ICON RULES — READY FOR PHASE 04 PRODUCTION LOCK**

The 24×24 semantic grammar remains valid. The only production correction is that some domain glyphs are too detailed when rasterized at 16 px and therefore require explicit micro variants rather than shrinking the canonical geometry unchanged.

### Size decision
- **16 px:** utility/micro territory. Verified and Warning pass as canonical; Place is acceptable. People/Event/Time require compact optical adjustments. Culture/Source/Story/Journey require simplified micro variants.
- **20 px:** minimum canonical semantic size. Compact 2 px optical stroke is allowed.
- **24 px:** preferred/default semantic size and Phase 04 master context.
- **32 px:** canonical geometry scales cleanly. Do not add decorative details merely because more space is available.

### Required 16 px micro corrections
- **Culture:** reduce double woven structure to a simpler single interlock/wave.
- **Source:** remove secondary document-line details and preserve the document silhouette.
- **Story:** simplify to a clean open-book contour; avoid fragile micro spine detail.
- **Journey:** use two enlarged nodes plus one route stroke.
- **People:** enlarge head/body separation slightly.
- **Event:** keep four cardinal ticks and reduce ray length.
- **Time:** simplify/shorten hand detail.

### Context QA
- **Light/Dark:** PASS using `currentColor` plus locked Phase 02 semantic colors.
- **Monochrome:** PASS. Required semantics remain shape-based.
- **Map density:** PASS WITH RULES. Inner semantic glyphs should normally be 20–24 px. 16 px is not the primary category-recognition size.
- **Story Explorer:** PASS at 20–24 px for Story/Source/Trust semantics.
- **Journey:** PASS WITH RULES; canonical Journey mark begins at 20 px, with a dedicated 16 px micro variant.
- **Evidence/Trust:** Verified and Warning remain legible at 16 px, but labels/disclosure remain mandatory where the meaning is not universally obvious.
- **Mobile touch:** PASS SPEC. Visual icon size is independent of the minimum **44×44 CSS px** target.

### Production decision
Phase 04 can proceed to **PRODUCTION LOCK** provided the 16 px micro-icon rules are included in the locked system. This is an optical refinement, not a redesign of the semantic vocabulary.
