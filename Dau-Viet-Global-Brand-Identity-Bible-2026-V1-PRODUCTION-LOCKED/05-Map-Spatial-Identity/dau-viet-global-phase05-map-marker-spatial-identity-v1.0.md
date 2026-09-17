# DẤU VIỆT GLOBAL — PHASE 05
## Map Marker & Spatial Identity System V1.0

### Status
**PRODUCTION CANDIDATE**

This phase translates the Production-Locked Phase 04 semantic vocabulary into spatial behavior for Explore Map, Destination/Place maps, Journey routes, Event landscapes and Then & Now experiences. It does not create a second logo system.

### Marker hierarchy
- **24 px Compact:** dense map situations; uses Phase 04 micro glyph where required.
- **32 px Default:** standard individual entity marker; inner semantic glyph is normally 20 px.
- **40 px Featured:** selected editorial/featured entity, without relying on gold alone.
- Interactive target remains **44×44 CSS px minimum** regardless of visual marker size.
- Point markers anchor at bottom-center. Inner glyph stays clear of the lower pointer/anchor zone.

### Semantic marker family
The same restrained spatial container is combined with distinct Phase 04 glyphs for **Place, Story, Journey, Event and Culture**. This keeps the map visually coherent while preserving entity semantics. The pointer is a map utility container only and must never become the Dấu Việt logo.

### State system
Default retains container + semantic glyph. Hover may add subtle scale/elevation. Focus uses the Production-Locked Phase 02 focus system. Selected scales roughly **1.12–1.18×** and gains stronger boundary/halo while keeping the semantic glyph. Visited adds check/stamp plus accessible state. Saved adds bookmark plus accessible state. Unavailable uses neutral treatment plus explanation. Featured uses size/editorial hierarchy, not gold-only semantics.

### Clusters
Clusters always show a **numeric count**. Suggested visual bands are 36 / 44 / 52 px. Cluster color can support layer recognition but never replaces the count. Expansion may zoom, spiderfy or expose a list depending on density and platform.

### Zoom / progressive disclosure
- **World/Country:** clusters and featured editorial destinations only.
- **Region/Destination:** clusters plus high-importance destinations/places.
- **City/Place:** individual semantic markers.
- **Site detail:** individual markers, labels and spatial overlays as needed.

This prevents Explore Map from becoming a marker carpet and preserves the editorial discovery hierarchy.

### Labels
Labels appear according to zoom and importance, not on every marker. Selected markers should prefer a full label. Labels use at most two lines; collision is handled by the map engine. Never shrink the Production-Locked Phase 03 typography ad hoc to force a map label to fit. Accessible full names remain available when visual truncation is required.

### Routes, areas and historical uncertainty
Journey uses route/path plus directional or progress cues, with semantic stop markers. Historical extents use polygons plus labels/legend. **Uncertain historical locations must not look as certain as verified coordinates**: use dashed/uncertainty treatment plus explicit text/legend. Opacity alone is insufficient. Then & Now spatial states require explicit Then/Now labels or controls.

### Accessibility
Essential marker/glyph boundaries target >=3:1 where applicable. Color-only semantics are prohibited. Interactive markers are keyboard focusable and expose an accessible name containing **entity type + entity name + state**. Selection and cluster transitions respect reduced motion.

### Next validation
Run **Phase 05.1 — Map Density, State & Accessibility QA** using world/country, destination/city and site-detail simulations; validate clusters, collisions, selected/visited states, historical uncertainty, dark/light maps and mobile touch targets before Production Lock.
