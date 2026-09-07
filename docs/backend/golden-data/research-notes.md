# Golden Dataset — Research Notes (Phase 10)

Documents what was checked, what was deliberately omitted, and why — so a future reviewer never
mistakes an omission for an oversight. Research performed 2026-09-04.

## Pre-existing data audited and corrected

- **Vietnamese text had no diacritics anywhere** (e.g. `"Hoang thanh Thang Long"` instead of
  `"Hoàng thành Thăng Long"`) across every Place/Person/Event/Era/Dynasty/Theme in the prior
  seed. This is not high-quality Vietnamese (spec section 23) — it read as a placeholder
  simplification from an earlier phase. Restored proper diacritics for every entity in this
  phase. Verified first, directly (`node -e` with the `slugify` package actually used by the
  seed), that this produces byte-identical `canonicalSlug` values either way — so no URL/route
  stability was broken by the change.
- **English translations across every earlier phase's seed data were marked
  `method: 'HUMAN'`** despite being AI-drafted with no human review — an honesty gap relative to
  spec section 25's rule ("do not mark AI-assisted text HUMAN_REVIEWED unless actual human review
  occurred"). Every English translation written or re-touched in this phase (Place/Person/Event/
  Era/Dynasty/HistoricalFact/Story/Journey) is now honestly `method: AI_ASSISTED`, `status:
  AI_ASSISTED` — drafted by Claude as implementation assistance, not reviewed by a human editor.
  Vietnamese stays `method: ORIGINAL` (the canonical/source-language text; this describes
  translation directionality, not authorship-without-AI, consistent with how every prior phase
  already used this field).
- **The two `HistoricalFact` rows seeded in Phase 03/04 (`seed-fact-doi-do-1010`,
  `seed-fact-dbp-1954`) had zero citations and sat in DRAFT.** Both claims are real and now carry
  a genuine `Source`/verified `Citation` and are `PUBLISHED` (`FACT_DOI_DO_1010`,
  `FACT_DIEN_BIEN_PHU_1954`) — the underlying `id`s changed to the new Golden Dataset key
  convention; the old ids are not preserved as aliases since no production data referenced them
  yet (no live database has ever run this seed — see BACKEND_FREEZE_REPORT.md).

## Facts considered but omitted (evidence did not clear the bar)

- **Cổ Loa's founding year (traditionally ~257 BCE).** The system's historical-date model
  (`apps/api/src/common/historical-date`) has no BCE/negative-year handling anywhere in its
  codebase or tests. Rather than introduce an unverified, never-exercised date-representation
  edge case, `FACT_CO_LOA_CAPITAL` keeps `date: UNKNOWN` and states the claim (An Dương Vương's
  Âu Lạc capital) without a fabricated Gregorian year, `certainty: TRADITIONAL_ACCOUNT`.
- **Cu Chi Tunnels' original construction/expansion dates and total tunnel length.** Every source
  found for these specific figures was a travel/tour-guide blog (yourvietnamtravel.com,
  joyjourneys.com.vn, oxalisadventure.com, etc.) — explicitly excluded by spec section 1. Only the
  one claim independently corroborated by an official government heritage-database source
  (`dsvh.gov.vn`) plus two independent state-media outlets (VietnamNet, VietnamPlus) was kept: the
  2015 Special National Relic designation (`FACT_CU_CHI_RELIC_STATUS`).
- **Lý Công Uẩn's exact birth/death precision beyond year, and Gia Long's exact
  birth/death day.** A specific day-level claim surfaced only in a single lower-tier source
  (a stock-photo caption for Gia Long; general consensus pages for Lý Công Uẩn) with no
  independent Tier A/B corroboration found in the time available. Both stay at `YEAR` precision.
- **Minh Mạng's exact reign-start day (14 February 1820) and birth/death days.** Found in a
  search synthesis that mixed Wikipedia into the same paragraph as Britannica without a clean
  attribution split; not confidently separable from the excluded source in the time available.
  Kept at `YEAR` precision for the person record; the one `FACT_MINH_MANG_REIGN` claim is
  deliberately phrased at year-level ("reigning 1820-1841").
- **Hội An's specific "international trading port, 15th-19th century" framing.** The UNESCO list
  entry snippet retrieved did not include enough of the actual criteria/description text to
  independently confirm specific century bounds beyond the inscription date itself; only the
  inscription-date fact was kept (`FACT_HOI_AN_UNESCO`).
- **A precise geolocation/coordinate for any specific Hoàng Sa/Trường Sa feature.** Both stay a
  single representative point for the entire archipelago (documented explicitly in
  `PlaceSeedSpec.coordinateNote`) — spec section 11/12 explicitly forbids implying survey-grade
  precision or fabricating a boundary/polygon for either.
- **Any additional Hoàng Sa/Trường Sa "current control" narrative detail beyond what
  `FACT_HS_PARACELS_1974_BATTLE` and `FACT_HS_TS_CURRENT_ADMINISTRATION` already state** (e.g. the
  precise current count/list of Vietnamese-occupied Spratly features, or a 2025 Trường Sa
  administrative-unit reclassification claim that surfaced only in an English Wikipedia article) —
  omitted for insufficient independent Tier A/B corroboration in the time available for this
  phase. Flagged here for a future review pass, not silently dropped.

## Facts count vs. the spec's 30-60 target range

28 `HistoricalFact` rows were seeded (see `docs/backend/GOLDEN_DATASET.md`), at the low end of the
30-60 range the spec describes as "approximately." Spec section 5 explicitly prioritizes "quality
over volume," and every fact above cleared a real Tier A/A-B source; several plausible additional
facts (Hội An's trading-port centuries, several people's exact-day precision, Cổ Loa's founding
year) were deliberately left out rather than padded with weaker sourcing. This is treated as a
correct outcome, not a shortfall — documented explicitly here so a reviewer doesn't read it as an
oversight.

## Correction workflow after this phase

Per spec section 53/54: this seed is a one-time bootstrap, not a perpetual overwrite mechanism.
Every top-level write in `prisma/seed.ts` is an `upsert` keyed on a stable natural identifier
(`canonicalSlug` for entities, a literal custom `id` for `Source`/`HistoricalFact`/`Citation`/
`FactReview`) with an **empty `update: {}`** — re-running the seed against a database that already
has these rows is a safe no-op on the fields already set; it never overwrites a live editor's
subsequent correction. If a Golden fact/translation needs correcting after go-live, the correct
path is the normal editorial API (`PATCH`/review endpoints), not re-running this script with
different literal values — re-running with changed source data would NOT update the existing row
(the `update: {}` is intentionally inert), so a real correction requires an explicit migration
script or manual `UPDATE`, never a silent seed re-run.
