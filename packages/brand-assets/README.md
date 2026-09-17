# Brand assets

Source-exact Time Trace V3 Geometry V1.3, validated by V1.4. Registry: `../brand-contracts/brand-registry.json`. All copies retain the supplied bytes, including SVG masks, paths and monochrome ink. The Brand Bible remains the immutable source, not these distribution copies.

Use `logo/micro` at 16/24px, master at 32px or above (preferred at 48px+). Mono is supplied for light surfaces only. Dark master has its own registered source. No dark micro is supplied: stop that usage pending an approved asset. Horizontal light/dark/mono V1.4.1 is now registered in `logo/horizontal/`; use at 48px minimum in wide navigation, preferably 64px+. Compact layouts retain the existing symbol-only size policy. Do not recolor with filters or redraw missing variants.

Serve SVG as an external image with a useful accessible name (empty alt only when adjacent brand text makes it decorative). External SVG isolates the source IDs/masks; injecting multiple raw SVGs inline can collide on `title`, `desc` and mask IDs. Do not edit the master to work around integration issues.

The V1.4 1024px PNG is an existing app-icon derivative. It is not a new master or a complete native export set. Native masks, safe areas and platform export QA remain pending an actual mobile app. No ICO/PWA manifest, social artwork, store screenshots or responsive wordmark is invented. Favicon integrations should resolve the registered micro mark at 16/24px and master at 32px.

Run `node scripts/brand/validate.mjs` from the repository root before release. No source/history assets were removed or overwritten.

Horizontal V1.4.1 is a metadata-only corrective release: title/desc IDs repair accessibility references while all render-affecting bytes remain identical to the preserved V1.4 parent. Use only the three registered primary SVGs; the parent and editable construction remain reference-only for distribution. See `../../docs/brand/locks/horizontal-logo-v1.4.1.md`.
