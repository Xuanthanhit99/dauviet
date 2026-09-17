# Brand icons

Canonical Phase 04 semantic sprite (10 symbols), micro sprite (4 symbols), and styles are copied without path edits. `getIconReference(name, size)` returns a shipped sprite filename and exact symbol ID. Resolve the sprite through the frontend asset pipeline, then use an external `<use href="…/semantic.svg#dv-icon-place">` inside an SVG with matching width/height/viewBox. Confirm external sprite rendering in the actual browser/runtime before release. Native apps require platform adapters rather than using browser `<use>` directly.

Use a visible label and/or accessible name for meaningful icons; mark redundant decorative SVGs `aria-hidden="true"`. Keep controls at least 44 CSS px / 44pt / preferably 48dp, independently of glyph size. Preserve `currentColor` with approved semantic colors.

Default 24px; compact 20px; 32px supported. At 16px the resolver selects canonical micro Culture/Source/Story/Journey; Place/Verified/Warning use source-approved semantic glyphs. It rejects People/Event/Time at 16px because their required micro corrections were not supplied.

Citation, Evidence, Reconstruction, AI Translation and Sensitive do not have dedicated supplied symbols. Their integration is blocked; retain explicit disclosure text, never alias them silently to Source/Verified/Warning. The resolver throws for unsupported semantics. Generic OS actions may use platform glyphs.
