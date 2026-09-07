# Dau Viet — Golden Dataset (Phase 10)

Audience: any engineer/agent touching `prisma/golden/*`, `prisma/seed.ts`, or building
Admin/CMS/frontend features against the seeded reference dataset. This document is the contract
for what the Golden Dataset is, how it was built, and how it must be safely extended later — if
code or data disagrees with this doc, treat it as a bug.

## 1. Purpose

A small, source-backed historical corpus that exercises every layer of the backend end-to-end
(entities, facts, sources, citations, media metadata scaffolding, stories, journeys, map,
timeline, multilingual contracts, search, Hoàng Sa/Trường Sa trust handling) **without
fabricating history**. It is a demonstration/reference corpus, not an attempt at a complete
encyclopedia — see section 5's "quality over volume" note.

**Version:** `2026-09-v1` (`GOLDEN_DATASET_VERSION` in `prisma/golden/helpers.ts`). Reviewed/
researched: 2026-09-04 (`GOLDEN_DATASET_REVIEWED_AT`).

## 2. Source policy (spec sections 0/1)

No historical content in this dataset was invented. Every substantive `HistoricalFact` traces to
a real, externally-verifiable `Source` (UNESCO World Heritage Centre, official Vietnamese
government/heritage-management-board pages, Encyclopaedia Britannica, or a peer-reviewed/
official-press publication) — never a blog, SEO/travel-guide page, Wikipedia, or Fandom wiki.
Wikipedia was used only to locate leads during research, never cited as final evidence, per spec
section 1. Full reproducible source-by-source record: `docs/backend/golden-data/
sources-manifest.md`. What was checked-and-omitted (not fabricated to fill a gap):
`docs/backend/golden-data/research-notes.md`.

## 3. What already existed vs. what this phase audited/changed

The prior seed (Phase 01-09) already had the required-core Place list, a small Person/Event/Era/
Dynasty set, and two unpublished, uncited draft `HistoricalFact` rows exercising the trust-layer
schema shape. Phase 10's audit found real quality gaps and fixed them (see
`docs/backend/golden-data/research-notes.md` for the full list):

- Every Vietnamese name/summary used diacritic-stripped ASCII text — not high-quality Vietnamese
  (spec section 23). Restored proper diacritics everywhere, verified this does not change any
  `canonicalSlug` (slugify's transliteration already produced the identical ASCII slug either
  way).
- Every English translation across every prior phase was marked `method: 'HUMAN'` despite being
  AI-drafted with no human review. Reclassified honestly to `AI_ASSISTED` (spec section 25).
- The two pre-existing draft facts had zero citations. Both underlying claims are real and are
  now cited and `PUBLISHED` (`FACT_DOI_DO_1010`, `FACT_DIEN_BIEN_PHU_1954`).
- No Source/Citation/Story/Journey/EditorialSlot content existed at all prior to this phase.

## 4. Dataset scope (spec section 5) — "quality over volume"

| Collection | Count | Target range |
|---|---|---|
| Places | 12 | ~10-12 |
| People | 8 | ~6-8 |
| Events | 8 | ~6-8 |
| Eras | 6 | — |
| Dynasties | 3 | — |
| Themes | 4 | — |
| Sources | 23 | enough to support the facts |
| HistoricalFacts | 28 | ~30-60 ("approximately"; quality prioritized — see research-notes.md) |
| Citations | 30 | one per fact-source pair |
| Stories | 5 | 3-6 |
| Journeys | 3 | 2-4 |
| EditorialSlots | 5 | small number |

Exact counts are asserted by `apps/api/src/common/historical-date/golden-dataset-validation.spec.ts`
("Golden Dataset summary counts") so this table can never silently drift from the real data.

## 5. Citation coverage (spec sections 3/20/47/69)

**28/28 `PUBLISHED` HistoricalFacts (100%) carry at least one `VERIFIED` Citation.** This dataset
seeded zero facts that fell short of that bar rather than publishing an uncited claim — any fact
whose evidence didn't clear the bar during research was simply not included (see
research-notes.md), not seeded as an unpublished placeholder. The coverage check itself is a real,
executable test (`golden-dataset-validation.spec.ts`, "Golden Dataset citation coverage") that
would fail the build if this ever regressed.

The trust workflow is not bypassed to reach this: `prisma/seed.ts`'s `upsertFact`-equivalent logic
replicates `FactsService.setEditorialStatus`'s real publish gate by hand (>=1 citation, all
intended `VERIFIED`, a `FactReview` row recorded, and — for the four `sensitivity: TERRITORIAL`
Hoàng Sa/Trường Sa facts — a `reviewedById` distinct from `createdById`, mirroring the real
separation-of-duties rule for sensitive facts) rather than merely flipping the `editorialStatus`
enum.

**Certainty distribution:** `CONFIRMED` 13, `HIGH_CONFIDENCE` 14, `TRADITIONAL_ACCOUNT` 1
(Cổ Loa's legendary founding). No fact is marked `CONFIRMED` merely for convenience — see spec
section 19 and the per-fact reasoning in `prisma/golden/facts.ts`'s comments.

## 6. Seed architecture (spec section 44)

Domain-separated, pure (no Prisma calls) TypeScript modules under `prisma/golden/`:

```
prisma/golden/
  helpers.ts    - HistoricalDateSeed helpers, slug(), GOLDEN_DATASET_VERSION
  places.ts     - GOLDEN_PLACES
  people.ts     - GOLDEN_PEOPLE
  events.ts     - GOLDEN_EVENTS
  eras.ts       - GOLDEN_ERAS, GOLDEN_DYNASTIES
  themes.ts     - GOLDEN_THEMES
  sources.ts    - GOLDEN_SOURCES (stable SRC_* keys)
  facts.ts      - GOLDEN_FACTS (stable FACT_* keys, citations, links)
  stories.ts    - GOLDEN_STORIES
  journeys.ts   - GOLDEN_JOURNEYS
  editorial.ts  - GOLDEN_EDITORIAL_SLOTS
  index.ts      - barrel re-export
```

`prisma/golden-dataset.ts` is kept as a thin re-export of `GOLDEN_PLACES`/`PlaceSeedSpec` from
`prisma/golden/places.ts` — per `docs/backend/HISTORICAL_DOMAIN.md`'s existing claim that this
file path is "the single source of truth," its import path never changed, so nothing that already
pointed at it (`golden-dataset.spec.ts`, this doc) needed to change.

`prisma/seed.ts` orchestrates the actual database writes, in dependency order (spec section 46):
Eras/Dynasties/Themes -> Places -> People -> Events (+ era/place/person/theme links) -> Sources ->
HistoricalFacts (+ entity links + Citations + FactReview) -> Stories (+ entity/fact/citation links)
-> Journeys (+ stops) -> EditorialSlots. Every stable `key` in the pure data files is resolved to
a real database id via an in-memory `Map` built as each stage completes — a later stage can
reference an earlier stage's rows by key without knowing a generated cuid in advance.

## 7. Idempotency & production-seed safety (spec sections 45/54)

Every top-level write is `prisma.<model>.upsert(...)` keyed on a stable natural identifier
(`canonicalSlug` for Place/Person/Event/Era/Dynasty/Story/Journey; `slug` for Theme; a literal
custom string `id` — the same stable key used throughout this dataset — for `Source`/
`HistoricalFact`/`Citation`/`FactReview`) with an **empty `update: {}`**. Running the seed twice
never duplicates a row, and — just as importantly — never silently overwrites a row a real editor
has since corrected through the normal API (spec section 54: "production seed cannot casually
overwrite editor-managed content"). This is verified statically (not by actually re-running a live
seed, which no environment in this project has ever had available) by
`golden-dataset-validation.spec.ts`'s "Golden Dataset idempotency" check, which greps
`prisma/seed.ts` for a bare `.create(` call on any top-level model and fails the build if one is
ever introduced.

**No fake production Contribution or CommunityStory rows are seeded** (spec sections 59/60) —
statically asserted by the same validation suite. Both remain legitimately empty at launch; their
own phases' unit-test fixtures are the only place synthetic instances of either exist.

## 8. Trust boundary — Stories/Journeys are not exempt

Every `GOLDEN_STORIES` entry's `factKeys` were checked against `GOLDEN_FACTS` at seed time — the
seed script throws (refuses to run) if a Story ever references a fact this same run does not mark
`PUBLISHED`, mirroring `StoriesService`'s real `STORY_FACT_NOT_PUBLISHABLE` guard. Every Story body
(Vietnamese and English) is validated at seed time by the **actual, real, production**
`validateStoryBody` function from `apps/api/src/modules/stories/story-body.util.ts` (imported
directly in `golden-dataset-validation.spec.ts`, not reimplemented) — a genuinely closed block
schema, never raw HTML. No Story/Journey in this dataset references any hero or inline media (no
`MediaAsset` rows exist yet in this phase), so the media-readiness half of the real publication
validator is vacuously satisfied rather than skipped; every Journey stop references a real,
`PUBLISHED` Golden Place, and every Journey has >=1 stop (the real zero-stop publication block is
never hit). See `docs/backend/CONTRIBUTION_ARCHITECTURE.md`/`EDITORIAL_CONTENT.md` for the
underlying validators this dataset was checked against.

## 9. Hoàng Sa / Trường Sa handling (spec sections 12/13/57/58)

Both remain seeded only as real `ARCHIPELAGO` `Place` rows with a single representative point
coordinate (explicitly documented as non-survey-grade, non-boundary — see `coordinateNote` on
each `PlaceSeedSpec`) and an English alias — **no territorial claim, boundary, or
`TerritoryGeometry` was added**, statically regression-tested in both
`trust-regression.spec.ts` and the new `golden-dataset-validation.spec.ts`.

The dossier itself lives entirely in four individually-cited `HistoricalFact` rows
(`sensitivity: TERRITORIAL`), each deliberately scoped and neutrally framed as a distinct category
rather than one collapsed statement (spec section 12):

1. `FACT_HS_TS_HISTORICAL_DOCUMENTS` — historical cartographic documents **as cited by Vietnam's
   own official MOFA position** (attributed as a stated position, not an independent legal
   adjudication).
2. `FACT_HS_PARACELS_1974_BATTLE` — a neutral, well-documented military-history event (the 19
   January 1974 naval engagement), sourced to a peer-reviewed naval-history journal article.
3. `FACT_TS_MULTIPLE_CLAIMANTS` — a neutral encyclopedic fact that multiple parties (Vietnam,
   China, Taiwan, and in part Malaysia/Philippines/Brunei) claim the Spratlys, sourced to
   Britannica.
4. `FACT_HS_TS_CURRENT_ADMINISTRATION` — Vietnam's own domestic administrative organization
   (Hoàng Sa under Đà Nẵng, Trường Sa under Khánh Hòa, since 1982), explicitly labeled as Vietnam's
   own administrative arrangement, **not** an internationally settled sovereignty determination.
   `reviewedAt`/`reviewedById` on the fact (and on all four of these facts) serve as the "last
   reviewed" marker spec section 13 asks for — current-context content is never treated as
   timeless.

One editorial Story (`STORY_HOANG_SA_TRUONG_SA_DOSSIER`, "Dấu Việt trên biển") presents this
dossier with an explicit in-body `callout` disclosing that it reports sourced positions/events,
not an independent legal conclusion, and that the content is periodically reviewed. No fabricated
geopolitical prose was added anywhere in this phase.

## 10. Media & rights (spec sections 39-43)

No media binaries were seeded in this phase — no `MediaAsset`, no `SourceDocument`. Every `Source`
here is metadata-only (title/author/organization/URL/etc.), which is explicitly valid per spec
section 40/42 ("acceptable to create Source/Media metadata without bundling the actual binary...
`METADATA_ONLY` is valid... do not point to dead fake URLs"). Every URL in
`prisma/golden/sources.ts` is a real, externally reachable page as of the 2026-09-04 research
pass (not re-verified at seed-execution time — see section 11). No archival photo, reconstruction,
or scanned document was fabricated to fill a visual gap.

## 11. Offline reproducibility (spec section 63)

`prisma/seed.ts` makes **zero** network calls. All research (web search, source verification) was
a development-time activity performed once, whose results are hard-coded into
`prisma/golden/*.ts`; the seed script itself only ever talks to the local Prisma-configured
database. Re-running the seed in an offline CI environment works identically to running it online.

## 12. Update workflow after initial bootstrap (spec sections 53/54)

This seed is a **bootstrap/reference dataset, not a perpetual overwrite mechanism**. Once a
Golden entity/fact has been edited by a real editor through the normal API, re-running
`prisma/seed.ts` must never silently revert that edit — and structurally does not, because every
upsert's `update: {}` clause is empty (a matching existing row is left completely untouched; only
a first-time insert populates the fields). A genuine historical-content **correction** to already-
seeded data (e.g. a source turns out to be wrong) requires either the normal editorial review
workflow (`PATCH`/review endpoints, same as any other content) or a new, explicit one-off
migration script that documents the specific correction and its own new source — never a silent
change to a literal value inside `prisma/golden/*.ts` followed by a seed re-run, since that
re-run would not even take effect against an already-seeded row.

## 13. Live verification status

`PASS_STATIC` / `PASS_UNIT` / `PASS_GOLDEN_DATA_VALIDATION` for everything described above —
schema unchanged (no migration needed this phase), `tsc`/build/lint clean, and the full
`golden-dataset-validation.spec.ts` suite (35 tests) passes entirely against the pure
`prisma/golden/*.ts` data structures, with no live database anywhere in this project.
**`UNVERIFIED_LIVE_DB`**: `prisma/seed.ts` has never actually been executed against a real
PostgreSQL/PostGIS instance in this environment — see `docs/backend/BACKEND_FREEZE_REPORT.md`'s
running "Why infra is blocked" section, unchanged since Phase 01. The idempotency/upsert
correctness described in sections 6-7 is verified by static source inspection (a grep guard) and
by every entity's Prisma `upsert` shape being identical to the pattern the previous seed already
used successfully in code review across nine prior phases — not by an actual double-run against a
live database.
