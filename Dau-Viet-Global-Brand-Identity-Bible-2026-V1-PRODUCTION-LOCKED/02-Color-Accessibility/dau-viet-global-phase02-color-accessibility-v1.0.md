# DẤU VIỆT GLOBAL — PHASE 02
## Color & Accessibility System V1.0

### Status
**PRODUCTION CANDIDATE — ACCESSIBILITY VALIDATED**

Phase 02 preserves the locked Production Master palette direction and assigns accessibility-safe semantic roles. It does not redesign the Phase 01 logo.

### Locked core palette
| Token | Hex | Production role |
|---|---|---|
| Deep Forest 950 | `#062A24` | Primary brand, inverse surfaces, primary CTA |
| Forest 700 | `#18463C` | Secondary brand, focus on light surfaces |
| Bronze Gold 500 | `#D4AF7C` | Accent, highlight, accent CTA background |
| Warm Sand 100 | `#EADDC7` | Editorial/subtle surface, inverse soft text |
| Stone 400 | `#B6B6B6` | Borders/dividers; not normal text on white |
| Charcoal 950 | `#1A1A1A` | Primary text |
| White | `#FFFFFF` | Canvas and inverse text |

### Contrast validation
- **Primary text / light:** `#1A1A1A` on `#FFFFFF` = **17.40:1** — PASS AAA
- **Primary text / sand:** `#1A1A1A` on `#EADDC7` = **12.98:1** — PASS AAA
- **Inverse text / forest:** `#FFFFFF` on `#062A24` = **15.39:1** — PASS AAA
- **Sand text / forest:** `#EADDC7` on `#062A24` = **11.48:1** — PASS AAA
- **Gold accent / forest:** `#D4AF7C` on `#062A24` = **7.49:1** — PASS AAA
- **Gold CTA + charcoal text:** `#1A1A1A` on `#D4AF7C` = **8.47:1** — PASS AAA
- **White text / forest700:** `#FFFFFF` on `#18463C` = **10.61:1** — PASS AAA
- **Gold text / white — prohibited:** `#D4AF7C` on `#FFFFFF` = **2.05:1** — FAIL
- **Gold text / sand — prohibited:** `#D4AF7C` on `#EADDC7` = **1.53:1** — FAIL
- **Stone text / white — prohibited:** `#B6B6B6` on `#FFFFFF` = **2.03:1** — FAIL

### Production accessibility rules
- Normal body/UI text must meet **WCAG AA 4.5:1** or better.
- Large text and essential UI graphics must meet **3:1** or better.
- Editorial reading surfaces should target **AAA 7:1** where practical.
- Bronze Gold is an **accent**, not a default light-background text color.
- Do not use Gold on White, Gold on Warm Sand, or Stone on White for normal text.
- Gold CTA uses **Charcoal text**, not white text.
- Deep Forest CTA uses **White text**.
- State, error, success, selected, visited, map categories, and charts may never rely on color alone; pair color with text, icon, pattern, shape, or other non-color cue.
- Focus indicators must remain visible on both light and dark surfaces.
- Logo application keeps the Phase 01 rule: negative-space Reveal remains structural; glow/metallic/texture are optional treatments only.

### Semantic pairings
- Light editorial page: White/Sand surface + Charcoal text.
- Dark cinematic page: Deep Forest surface + White or Warm Sand text.
- Primary action: Deep Forest + White (**15.39:1**).
- Accent action: Bronze Gold + Charcoal (**8.47:1**).
- Gold on Deep Forest is allowed for display/accent (**7.49:1**).
- White on Forest 700 is allowed (**10.61:1**).

### Decision
The six-color production direction is retained. Accessibility is achieved primarily through **semantic role constraints**, rather than changing the locked brand colors.
