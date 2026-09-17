# DẤU VIỆT GLOBAL — PHASE 02.1
## Interaction & State Colors V1.0

### Decision
**PRODUCTION CANDIDATE — PASS WITH SEMANTIC RULES**

This phase extends the locked Phase 02 palette. It does not alter the logo or core brand palette.

### Interaction states
- Primary action: Deep Forest family + White text.
- Accent action: Bronze Gold family + Charcoal text.
- Focus: explicit visible ring; never remove `:focus-visible`.
- Disabled: neutralized surface + readable text; disabled state must also be conveyed semantically.
- Selected: surface + border + state/shape cue.
- Visited: subdued heritage accent + explicit visited glyph/text; never gold/brown alone.

### Functional states
- **Success**: `#286044` on `#E3EFE8` — contrast **6.24:1**.
- **Warning**: `#704B16` on `#F6E8C8` — contrast **6.39:1**.
- **Error**: `#8A3430` on `#F6E1DE` — contrast **6.40:1**.
- **Info**: `#315B6D` on `#E1EDF1` — contrast **6.17:1**.

### Domain rules
**Map**
- Entity categories require shape/icon/label differentiation in addition to color.
- Selected marker uses outline/scale/state, not merely a different hue.
- Visited marker requires an explicit visited cue.
- Clusters always show numeric count.

**Story Explorer**
- Current/completed scenes use position, indicator, and semantic state.
- Evidence/source availability uses an evidence/source icon and accessible label.
- Warnings use icon + text, never amber alone.

**Journey**
- Planned, visited, saved, and unavailable each require a non-color cue.
- Unavailable content must explain the reason where relevant.

### Accessibility contract
- Normal text: WCAG AA >= 4.5:1.
- Large text / essential UI graphics: >= 3:1.
- Focus indicators must remain visible on light and dark surfaces.
- Color must never be the sole carrier of meaning.
- States must remain understandable without blur, glow, transparency, animation, or metallic treatment.

### Contrast validation
- `primary.default`: **15.39:1** — PASS AA
- `primary.hover`: **13.44:1** — PASS AA
- `primary.pressed`: **17.59:1** — PASS AA
- `primary.focus`: **15.39:1** — PASS AA
- `primary.disabled`: **3.73:1** — FAIL AA
- `accent.default`: **8.47:1** — PASS AA
- `accent.hover`: **7.39:1** — PASS AA
- `accent.pressed`: **6.35:1** — PASS AA
- `accent.focus`: **8.47:1** — PASS AA
- `accent.disabled`: **3.92:1** — FAIL AA
- `functional.success`: **6.24:1** — PASS AA
- `functional.warning`: **6.39:1** — PASS AA
- `functional.error`: **6.4:1** — PASS AA
- `functional.info`: **6.17:1** — PASS AA
- `selection.selected`: **12.33:1** — PASS AA
