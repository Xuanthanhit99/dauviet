# Dấu Việt — Destination Watch Visual QA V1.5

Design reference only. UX APPROVED; Desktop A + Mobile B selected; Mobile Visual LOCK PENDING.
All 5 PNG files are independent 390x844 design references, NOT verified real travel photos or real events.
Do not import into apps/web/public, media storage, production or seed scripts.

## Findings and next corrections
1. Missing icon glyphs: replace font-dependent symbols in the design renderer with verified vector icons (Lucide SVG); inspect all five 390x844 renders.
2. Hero: replace illustrative graphics with authentic, correctly identified licensed travel photographs after CP-01 rights/provenance approval. Record photographer, source URL, license, attribution, modifications, exact place.
3. Typography: check 14px minimum secondary body where appropriate, legible contrast; avoid 10-12px critical labels.
4. Touch targets: >=44x44 CSS px in implementation; screenshot alone cannot prove hitbox.
5. Safe-area: check fixed bottom navigation, scroll bottom padding, keyboard and screen-reader behavior in runtime.
6. Notifications remain clearly DEMO until verified event sources are connected.

## File hashes (SHA-256)
- `01_mobile_follow_390x844.png` — e0e5f46c11e7c76ec12c7419cb61d776d71aae674ef594ef82ed4096098f742d
- `02_mobile_preferences_390x844.png` — 3e5a8400619e3dfad519d1bb6d20427de6f2e999ee9c0233940eb9cd4fb68079
- `03_mobile_notifications_390x844.png` — d1e949bf92b67132cbb0a27a234b4f1972a76899a00d7481d890d3dad2e90a07
- `04_mobile_event_detail_390x844.png` — 0a65b2d7e45645aa33ddae5f8d7e042834bb375d1bd1101c6f4f25af2ea70335
- `05_mobile_event_detail_scroll_390x844.png` — 46fd0998734f73cec1a9930e86a463208432ed8ae485c3bc7cad55bfea763961
