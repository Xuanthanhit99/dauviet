# DẤU VIỆT GLOBAL — PHASE 03
## Typography QA V1.1

### Result
**PASS WITH IMPLEMENTATION RULES — READY FOR PHASE 03 PRODUCTION LOCK**

Representative Vietnamese and English content plus French, Simplified Chinese, Traditional Chinese, Japanese and Korean stress samples were checked against the Phase 03 V1.0 hierarchy and component-width contracts.

### QA decisions
- Vietnamese diacritics: PASS.
- English/Vietnamese hero wrapping: PASS; hero titles are not required to remain one line.
- French expansion: PASS with responsive wrapping; do not design fixed English-width controls.
- Japanese/Chinese: CJK must not inherit Latin negative tracking.
- Korean: `word-break: keep-all` is permitted for headings where suitable, not as a blanket body rule.
- Simplified and Traditional Chinese retain separate SC/TC production family contracts.
- Primary reading copy remains 16/26 minimum token.
- 200% text zoom requires reflow; fixed-height translated text containers are prohibited.
- Map labels use a 1–2 line density-aware contract or accessible truncation; never reduce font size ad hoc.
- Source/citation metadata wraps/reflows instead of shrinking below Caption 12/18.

### Component stress contracts
- `vi / hero` — measured 922 px vs 720 px contract — **PASS_WRAP**
- `vi / map_label` — measured 168 px vs 260 px contract — **PASS**
- `vi / metadata` — measured 264 px vs 420 px contract — **PASS**
- `en / hero` — measured 706 px vs 720 px contract — **PASS_SINGLE**
- `en / map_label` — measured 203 px vs 260 px contract — **PASS**
- `en / metadata` — measured 322 px vs 420 px contract — **PASS**
- `fr / hero` — measured 909 px vs 720 px contract — **PASS_WRAP**
- `fr / map_label` — measured 193 px vs 260 px contract — **PASS**
- `fr / metadata` — measured 339 px vs 420 px contract — **PASS**
- `zh-Hans / hero` — measured 252 px vs 720 px contract — **PASS_SINGLE**
- `zh-Hans / map_label` — measured 34 px vs 260 px contract — **PASS**
- `zh-Hans / metadata` — measured 179 px vs 420 px contract — **PASS**
- `zh-Hant / hero` — measured 252 px vs 720 px contract — **PASS_SINGLE**
- `zh-Hant / map_label` — measured 34 px vs 260 px contract — **PASS**
- `zh-Hant / metadata` — measured 179 px vs 420 px contract — **PASS**
- `ja / hero` — measured 353 px vs 720 px contract — **PASS_SINGLE**
- `ja / map_label` — measured 50 px vs 260 px contract — **PASS**
- `ja / metadata` — measured 179 px vs 420 px contract — **PASS**
- `ko / hero` — measured 457 px vs 720 px contract — **PASS_SINGLE**
- `ko / map_label` — measured 37 px vs 260 px contract — **PASS**
- `ko / metadata` — measured 210 px vs 420 px contract — **PASS**

### Implementation caveat
These raster/layout tests validate the design-system contracts. Native browser, iOS and Android shaping/font-loading QA must still be run during implementation using the actual font files and rendering engines. A runtime bug should trigger implementation remediation first, not typography redesign, unless the locked system itself is proven functionally invalid.

### Production decision
Phase 03 V1.0 + Typography QA V1.1 are sufficient for **Phase 03 Production Lock**.
