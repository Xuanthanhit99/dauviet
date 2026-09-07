# Golden Dataset — Sources Manifest (Phase 10)

Reproducible record of every external source used to author Golden Dataset content in Phase 10.
The authoritative machine-readable copy is `prisma/golden/sources.ts` (`GOLDEN_SOURCES`) — this
file exists so a human reviewer can audit trust tier and coverage without reading TypeScript.
Research performed 2026-09-04. No blog, SEO/travel-guide site, Wikipedia, or Fandom wiki page was
used as final evidence for any fact — those were, at most, used to locate leads, per policy
(spec section 1/66). Wikipedia/Fandom appear in this session's search-tool transcripts but never
as a cited `Source` row.

## Trust tiers used

- **Tier A (`credibilityLevel: PRIMARY`)** — UNESCO World Heritage Centre official list entries;
  official Vietnamese government/heritage-management-board pages (`*.gov.vn`, `*.chinhphu.vn`,
  official relic-site portals); Vietnam's Ministry of Foreign Affairs own stated position.
- **Tier A/B (`credibilityLevel: SECONDARY`)** — Encyclopaedia Britannica; a peer-reviewed naval-
  history journal article (Naval War College Review); official state-affiliated newspapers
  (Nhân Dân, Quân đội nhân dân, Vietnam News Agency/VietnamPlus).

## Source list

| Key | Title | Organization | Type | Year | URL | Tier | Supports |
|---|---|---|---|---|---|---|---|
| `SRC_UNESCO_THANG_LONG` | Central Sector of the Imperial Citadel of Thang Long - Hanoi | UNESCO World Heritage Centre | UNESCO_RECORD | 2010 | https://whc.unesco.org/en/list/1328 | PRIMARY | `FACT_THANG_LONG_UNESCO` |
| `SRC_UNESCO_HUE` | Complex of Hue Monuments | UNESCO World Heritage Centre | UNESCO_RECORD | 1993 | https://whc.unesco.org/en/list/678 | PRIMARY | `FACT_HUE_UNESCO`, `FACT_HUE_CAPITAL_PERIOD` |
| `SRC_UNESCO_MY_SON` | My Son Sanctuary | UNESCO World Heritage Centre | UNESCO_RECORD | 1999 | https://whc.unesco.org/en/list/949 | PRIMARY | `FACT_MY_SON_UNESCO`, `FACT_MY_SON_CHAMPA_PERIOD` |
| `SRC_UNESCO_HOI_AN` | Hoi An Ancient Town | UNESCO World Heritage Centre | UNESCO_RECORD | 1999 | https://whc.unesco.org/en/list/948 | PRIMARY | `FACT_HOI_AN_UNESCO` |
| `SRC_GOV_CO_LOA` | Co Loa Special National Relic | Co Loa Special National Relic Management Board | GOVERNMENT_DOCUMENT | — | https://thanhcoloa.vn/en/co-loa-special-national-relic-recognized-as-tourist-attraction | PRIMARY | `FACT_CO_LOA_CAPITAL`, `FACT_CO_LOA_RELIC_STATUS` |
| `SRC_GOV_HOA_LU` | Hoa Lu Ancient Capital | Ninh Binh Provincial Dept. of Tourism | GOVERNMENT_DOCUMENT | — | https://sodulich.ninhbinh.gov.vn/en/news-events/hoa-lu-ancient-capital-1478.html | PRIMARY | `FACT_HOA_LU_CAPITAL` |
| `SRC_GOV_DOC_LAP` | History of Independence Palace | Independence Palace Relic Management Board | GOVERNMENT_DOCUMENT | — | https://dinhdoclap.gov.vn/en/history-of-the-independent-palace/ | PRIMARY | `FACT_DOC_LAP_RELIC_STATUS`, `FACT_30_THANG_4_1975` |
| `SRC_GOV_CU_CHI` | Di tich lich su Dia dao Cu Chi | Dept. of Cultural Heritage (Ministry of Culture, Sports & Tourism) | GOVERNMENT_DOCUMENT | — | https://dsvh.gov.vn/di-tich-lich-su-dia-dao-cu-chi-1490 | PRIMARY | `FACT_CU_CHI_RELIC_STATUS` |
| `SRC_MOFA_VN_HOANG_SA_TRUONG_SA` | Vietnam has full legal basis to assert sovereignty over Hoang Sa | Ministry of Foreign Affairs of Vietnam | GOVERNMENT_DOCUMENT | — | https://mofa.gov.vn/web/ministry-of-foreign-affairs/detail/chi-tiet/vietnam-has-full-legal-basis-to-assert-sovereignty-over-hoang-sa-52-82.html | PRIMARY | `FACT_HS_TS_HISTORICAL_DOCUMENTS` |
| `SRC_GOV_THANG_LONG_EDICT` | The royal edict on the transfer of the capital of Thang Long in the year 1010 | Vietnam Government Portal (chinhphu.vn) | GOVERNMENT_DOCUMENT | — | https://thanglong.chinhphu.vn/english/the-royal-edict-on-the-transfer-of-the-capital-of-thang-long-in-the-year-1010-110109.htm | PRIMARY | `FACT_DOI_DO_1010` |
| `SRC_BRITANNICA_SPRATLY` | Spratly Islands | Encyclopaedia Britannica | WEBSITE | — | https://www.britannica.com/place/Spratly-Islands | SECONDARY | `FACT_TS_MULTIPLE_CLAIMANTS` |
| `SRC_NAVALHISTORY_PARACELS_1974` | The 1974 Paracels Sea Battle: A Campaign Appraisal | Naval War College Review (Toshi Yoshihara, 2016) | WEBSITE | 2016 | see `sources.ts` (andrewerickson.com-hosted PDF of the journal article) | SECONDARY | `FACT_HS_PARACELS_1974_BATTLE` |
| `SRC_NHANDAN_VAN_MIEU` | Van Mieu - Quoc Tu Giam: An eternal symbol of a thousand-year-old civilisation | Nhân Dân (Communist Party of Vietnam newspaper) | NEWSPAPER | — | https://special.nhandan.vn/van-mieu-en/index.html | SECONDARY | `FACT_VAN_MIEU_FOUNDING`, `FACT_QUOC_TU_GIAM_FOUNDING` |
| `SRC_VNA_HS_TS_ADMIN` | Hoang Sa - sacred part of Vietnam's territory | Vietnam News Agency / VietnamPlus | GOVERNMENT_DOCUMENT | — | https://en.vietnamplus.vn/hoang-sa-sacred-part-of-vietnams-territory-post276491.vnp | SECONDARY | `FACT_HS_TS_CURRENT_ADMINISTRATION` |
| `SRC_BRITANNICA_TRAN_HUNG_DAO` | Tran Hung Dao | Encyclopaedia Britannica | WEBSITE | — | https://www.britannica.com/biography/Tran-Hung-Dao | SECONDARY | `FACT_BACH_DANG_1288` |
| `SRC_BRITANNICA_LE_LOI` | Le Loi | Encyclopaedia Britannica | WEBSITE | — | https://www.britannica.com/biography/Le-Loi | SECONDARY | `FACT_LAM_SON_UPRISING`, `FACT_LE_LOI_FOUNDING` |
| `SRC_BRITANNICA_QUANG_TRUNG` | Quang Trung | Encyclopaedia Britannica | WEBSITE | — | https://www.britannica.com/biography/Quang-Trung | SECONDARY | `FACT_NGOC_HOI_DONG_DA`, `FACT_QUANG_TRUNG_DEATH` |
| `SRC_QDND_NGOC_HOI_DONG_DA` | Chien thang Dong Da - Thang Long dau Xuan Ky Dau (1789) | Quân đội nhân dân (Vietnam People's Army newspaper) | NEWSPAPER | — | https://www.qdnd.vn/quoc-phong-an-ninh/nghe-thuat-quan-su-vn/chien-thang-dong-da-thang-long-dau-xuan-ky-dau-1789-764936 | SECONDARY | `FACT_NGOC_HOI_DONG_DA` (lunar/Gregorian date conversion) |
| `SRC_BRITANNICA_GIA_LONG` | Gia Long | Encyclopaedia Britannica | WEBSITE | — | https://www.britannica.com/biography/Gia-Long | SECONDARY | `FACT_NGUYEN_FOUNDING` |
| `SRC_BRITANNICA_MINH_MANG` | Minh Mang | Encyclopaedia Britannica | WEBSITE | — | https://www.britannica.com/biography/Minh-Mang | SECONDARY | `FACT_MINH_MANG_REIGN` |
| `SRC_BRITANNICA_HO_CHI_MINH` | Ho Chi Minh | Encyclopaedia Britannica | WEBSITE | — | https://www.britannica.com/biography/Ho-Chi-Minh | SECONDARY | `FACT_TUYEN_NGON_1945` |
| `SRC_BRITANNICA_VO_NGUYEN_GIAP` | Vo Nguyen Giap | Encyclopaedia Britannica | WEBSITE | — | https://www.britannica.com/biography/Vo-Nguyen-Giap | SECONDARY | `FACT_DIEN_BIEN_PHU_1954` |
| `SRC_BRITANNICA_DIEN_BIEN_PHU` | Battle of Dien Bien Phu | Encyclopaedia Britannica | WEBSITE | — | https://www.britannica.com/event/Battle-of-Dien-Bien-Phu | SECONDARY | `FACT_DIEN_BIEN_PHU_1954` |

23 sources total (see `prisma/golden/sources.ts` for the exact, machine-readable copy of every
field, including `notes` giving the precise fact each source's language supports).

## Copyright note

No copyrighted book/scan content was downloaded or seeded. Every `GOVERNMENT_DOCUMENT`/
`UNESCO_RECORD`/`WEBSITE`/`NEWSPAPER` source here is a public web page cited by URL; no
`SourceDocument` (digitized scan) was created in this phase (spec section 42 — deferred, no
legally-clear scan/access-policy metadata exists yet for any of these).

## Access date

All URLs were verified reachable/consistent via web search on 2026-09-04 (the date recorded as
`GOLDEN_DATASET_REVIEWED_AT` in `prisma/golden/helpers.ts`). Live reachability was not
re-verified at seed-execution time (no network calls are made by `prisma/seed.ts` itself — see
docs/backend/GOLDEN_DATASET.md "Offline reproducibility").
