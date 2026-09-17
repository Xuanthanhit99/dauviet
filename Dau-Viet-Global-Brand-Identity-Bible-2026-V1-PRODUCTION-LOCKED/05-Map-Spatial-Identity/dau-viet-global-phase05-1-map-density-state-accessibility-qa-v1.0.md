# DẤU VIỆT GLOBAL — PHASE 05.1
## Map Density, State & Accessibility QA V1.0

### Result
**PASS WITH IMPLEMENTATION RULES — READY FOR PHASE 05 PRODUCTION LOCK**

The Phase 05 spatial system holds across the four zoom contexts. No semantic redesign is required. The remaining rules are implementation constraints for density, contrast, accessibility and historical uncertainty.

### Density QA
- **World / Country:** PASS. Use clusters plus featured editorial destinations only.
- **Region / Destination:** PASS. Mix clusters with high-importance entities.
- **City / Place:** PASS WITH RULE. Individual markers are appropriate, but label visibility must be priority-gated and collision-managed.
- **Site Detail:** PASS. Individual markers, labels and spatial overlays are appropriate.

### State QA
- Hover: subtle scale/elevation only.
- Focus: retain the Production-Locked Phase 02 `focus-visible` system.
- Selected: roughly **1.12–1.18×** scale plus stronger boundary/halo while keeping the semantic glyph.
- Visited: check/stamp plus accessible state.
- Saved: bookmark plus accessible state.
- Unavailable: neutral treatment plus an explanation/reason.
- Featured: size/editorial hierarchy, never gold-only meaning.

### Label & collision QA
Map labels are limited to two lines, selected markers prefer a full label, and collision handling belongs to the map engine. Visual truncation may be used only if the full accessible name remains available. Phase 03 typography must never be shrunk ad hoc to force a label to fit.

### Cluster QA
Clusters require numeric counts. The 36 / 44 / 52 px bands remain valid. In dense overlaps, the product must use zoom, spiderfy or an accessible list rather than leaving unreadable stacked clusters.

### Historical uncertainty QA
Verified extents may use solid boundaries. Uncertain or inferred historical extents require **dashed/uncertainty treatment + explicit label or legend**. Opacity alone is prohibited because it does not communicate uncertainty reliably.

### Light / dark / monochrome
- Light map: PASS.
- Dark map: PASS WITH RULE — markers may require a keyline/halo so essential boundaries keep approximately **3:1** contrast against the actual basemap.
- Monochrome: PASS. Category and state remain glyph/shape/state based.

### Accessibility
- Visual marker size never replaces the minimum **44×44 CSS px** interactive target.
- Interactive markers and clusters must be keyboard accessible.
- Accessible names should expose **entity type + entity name + state**, e.g. `Place: Imperial Citadel of Thăng Long — visited`.
- Reduced-motion preferences disable non-essential marker/cluster transitions.
- When direct map keyboard order becomes spatially impractical, expose a synchronized accessible entity list rather than forcing an arbitrary tab path across the map.
- Color-only meaning remains prohibited.

### Required implementation rules for lock
1. City/Place labels are priority- and collision-managed; never display every label simultaneously.
2. Dark/busy basemaps use a contrast keyline/halo when needed for >=3:1 essential marker boundary contrast.
3. Dense clusters resolve through zoom, spiderfy or an accessible list.
4. Unavailable markers expose an explanatory reason.
5. Historical uncertainty is explicit and never opacity-only.
6. Complex maps provide a synchronized accessible entity list when direct spatial keyboard navigation would be confusing.

### Decision
Phase 05 is **READY FOR PRODUCTION LOCK** with these six implementation rules included in the locked baseline.
