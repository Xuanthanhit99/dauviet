# DẤU VIỆT GLOBAL — PHASE 03
## Multilingual Typography System V1.0

### Status
**PRODUCTION CANDIDATE**

### Typography direction
Dấu Việt Global uses a two-voice system:
- **Editorial / narrative voice:** Noto Serif for Vietnamese, English and French; locale-matched Noto Serif CJK where appropriate.
- **Product / utility voice:** Noto Sans for Vietnamese, English and French; locale-matched Noto Sans for Japanese, Korean, Simplified Chinese and Traditional Chinese.

The intent is not to make every script visually identical. The system preserves each writing system's natural proportions while maintaining hierarchy, weight and rhythm across locales.

### Production hierarchy
| Token | Desktop | Mobile | Weight | Role |
|---|---:|---:|---:|---|
| Display XL | 64/68 | 42/46 | 600 | Cinematic hero |
| Display LG | 48/54 | 36/42 | 600 | Destination/Story title |
| H1 | 40/48 | 32/40 | 600 | Page title |
| H2 | 32/40 | 28/36 | 600 | Major section |
| H3 | 24/32 | 22/30 | 600 | Subsection |
| Body LG | 18/30 | 18/29 | 400 | Editorial lead |
| Body | 16/26 | 16/26 | 400 | Primary reading/UI copy |
| Body SM | 14/22 | 14/22 | 400 | Secondary metadata |
| Label | 14/20 | 14/20 | 600 | Controls |
| Caption | 12/18 | 12/18 | 500 | Captions/source metadata |

### Locale contracts
- **Vietnamese:** preserve full diacritics; no default hyphenation; avoid excessive uppercase/tracking.
- **English:** editorial hyphenation may be enabled for narrow long-form columns.
- **French:** locale-aware punctuation and hyphenation; do not normalize French spacing into English rules.
- **Japanese:** locale-specific JP family; no inherited negative Latin tracking; strict locale-aware line breaking.
- **Korean:** KR family; headings may use `word-break: keep-all`; body remains naturally wrappable.
- **Simplified Chinese:** SC family; strict locale-aware line breaking.
- **Traditional Chinese:** TC family; never substitute SC as the intended production face.

### Accessibility / readability
- Primary reading copy defaults to 16 px or larger.
- Long-form Latin editorial measure targets roughly 45–75 characters.
- Layout must survive 200% text zoom.
- Thin/light weights are prohibited for body text and essential UI.
- Do not communicate hierarchy through font family alone: size, weight, spacing and semantic HTML must also carry hierarchy.
- Correct `lang` metadata is mandatory because shaping, line breaking, pronunciation and fallback behavior depend on locale.
- CJK must not inherit Latin negative tracking.

### Loading strategy
Subset/load by locale. Do not ship every CJK family to every user. Vietnamese/English V1 should load Latin/Vietnamese assets; JP/KR/SC/TC font assets are loaded only for those locales. Use `font-display: swap` or an equivalent platform strategy and metric-compatible fallbacks where practical.

### Decision
This is the Phase 03 production candidate. Before lock, run Typography QA V1.1 using real Vietnamese/English samples plus representative FR/ZH/KO/JA strings at desktop/mobile widths.
