# DẤU VIỆT GLOBAL — Horizontal Logo V1.3.1
## Wordmark Outline + Final Distribution QA

**Decision:** `FINAL_DISTRIBUTION_QA_PASS_AWAITING_HUMAN_APPROVAL`

### Completed
- `DẤU VIỆT` outlined from `NotoSerif-SemiBold.ttf`.
- `GLOBAL` outlined from `NotoSans-SemiBold.ttf`.
- Vietnamese diacritic glyphs resolved directly from the font cmap; no substitute glyph was used.
- Light, Dark and Monochrome distribution candidates contain vector paths instead of live `<text>`.
- Editable live-text construction source is retained separately and is not a distribution master.
- Canonical Time Trace Journey/Reveal mask remains present in all three variants.
- PNG QA renders produced at 32 / 48 / 64 px for all three variants.

### Wordmark measured bounds (SVG user units)
- DẤU VIỆT: `(96.992, 18.713, 243.436, 55.045)`
- GLOBAL: `(98.649, 61.025, 156.52, 69.11)`

### Structural QA
```json
{
  "light": {
    "no_live_text": true,
    "wordmark_outline_group": true,
    "canonical_journey_mask": true,
    "no_raster": true,
    "no_gradient": true,
    "no_filter": true,
    "correct_name_aria": true
  },
  "dark": {
    "no_live_text": true,
    "wordmark_outline_group": true,
    "canonical_journey_mask": true,
    "no_raster": true,
    "no_gradient": true,
    "no_filter": true,
    "correct_name_aria": true
  },
  "mono": {
    "no_live_text": true,
    "wordmark_outline_group": true,
    "canonical_journey_mask": true,
    "no_raster": true,
    "no_gradient": true,
    "no_filter": true,
    "correct_name_aria": true
  }
}
```

### Production status
This package has passed machine-verifiable final-distribution checks, but it is **not automatically PRODUCTION_LOCKED**.
Final visual approval remains required for optical balance, wordmark personality, qualifier scale/tracking, and the 32/48/64 px renders.

If visually approved, the next lifecycle action is:
`APPROVED_DERIVATIVE_CANDIDATE → PRODUCTION_LOCKED`

After that, Codex may register the locked assets into the brand asset package/registry/manifest without touching backend/API/Prisma/database/.env.
