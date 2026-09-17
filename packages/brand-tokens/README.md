# Brand tokens

Import `@dauviet/brand-tokens/styles.css` once at the frontend root. It loads consolidated Phase 02 V1.1 color, Phase 03 typography and Phase 05 marker styles. Files in `canonical/` are byte-for-byte copies and are not editable masters.

Use semantic CSS variables: primary CTA `--dv-action-primary` / `--dv-action-primary-fg`; accent CTA `--dv-action-accent` / `--dv-action-accent-fg`; text `--dv-text-primary`; canvas `--dv-bg-canvas`. Gold on white/sand and stone on white are forbidden for normal text. State always needs a label, glyph, shape or boundary in addition to color. Focus selectors require the documented `data-theme="dark"` or `.dv-surface-dark` context on dark surfaces.

Do not load old Phase 02 V1.0 color CSS alongside V1.1. Earlier JSON is a historical specification reference, not an alternative runtime color export. V1.1 consolidates focus and interaction values. Native color adapters must derive from the final CSS with a recorded generator and validation; none is fabricated here without a mobile architecture.

Typography declares Noto families; it does not download or load font binaries. An eventual app must use its actual locale-aware font-loading strategy, verify Vietnamese coverage and font provenance, and test runtime shaping. JA/KO/zh-Hans/zh-Hant retain JP/KR/SC/TC families. Set `lang` correctly. Use `.dv-display` and `.dv-ui` for locale families; the source font shorthand tokens alone reference Latin defaults, so a consumer must apply the locale family after a shorthand. Do not apply Latin tracking to CJK.

`typography.json` contains the locked desktop/mobile hierarchy and weights. The source CSS does not implement responsive mobile type scales; use the application's locked breakpoints with those exact JSON values and verify 200% reflow. No breakpoint is invented in this package.

Map CSS provides dimensions/state hooks, not a complete marker renderer or map engine. States: default, hover, focus, selected, visited, saved, unavailable, featured, cluster. Consumers must preserve bottom-center anchoring, semantic glyphs, selected boundary, visited check, saved bookmark, unavailable reason, cluster count, full accessible names and keyboard/list alternatives. No map API changes are needed or included. Do not use a map utility pointer as the logo.
