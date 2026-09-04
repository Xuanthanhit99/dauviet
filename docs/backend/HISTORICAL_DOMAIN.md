# Dau Viet - Historical Domain (Phase 03)

Audience: any engineer/agent touching `Place`, `Person`, `HistoricalEvent`, `HistoricalEra`,
`Dynasty`, `Territory`, `HistoricalFact`, aliases, or translations, and anyone building
Map/Timeline/Search/Stories/Journeys against them. This document is the contract for the
core historical knowledge graph - if code disagrees with this doc, treat it as a bug.

## 1. Entity boundaries (do not collapse these)

| Entity | Is | Is not |
|---|---|---|
| `Place` | A physical location with historical/cultural significance | A generic "location" or a modern administrative unit |
| `Person` | A historical individual | An "author" (that's `User`/`Story.authorId`) |
| `HistoricalEvent` | A dated occurrence | A `Story` (editorial narrative) or a `CommunityStory` (personal memory) |
| `HistoricalEra` | A named historical period, hierarchical | A `Dynasty` - an era can span multiple dynasties or vice versa |
| `Dynasty` | A ruling house, with founder/capital/people | An `Era` - do not force every `HistoricalEvent` into exactly one dynasty |
| `Territory` | Historical geography with a validity window and interpretive geometry | A modern `Place`/province; never encodes modern legal/administrative assumptions |
| `HistoricalFact` | An atomic, sourced, editorially-gated claim | A `Story` paragraph - facts require citations to publish, stories don't |

Relationship graph (all via explicit join tables, never a polymorphic FK for these):

```
Place <-> Event (EventPlace)          Person <-> Event (EventPerson)
Person <-> Dynasty (PersonDynasty)    Event -> Era (HistoricalEvent.eraId)
Event -> Territory (HistoricalEvent.territoryId)
Fact <-> {Place,Person,Event,Era,Territory} (FactPlace/FactPerson/FactEvent/FactEra/FactTerritory)
```

Every one of the join tables above has a `@@unique` constraint on its two foreign keys -
the same (fact, place) pair, for example, cannot be linked twice (spec section 24, tested
in `schema-graph.spec.ts`).

## 2. Historical date model (spec section 3 - CRITICAL)

**The database never fabricates a day/month for a date coarser than DAY precision.**
`1288` is stored as `{ year: 1288, month: null, day: null, precision: YEAR }` - never as
`1288-01-01`. This is enforced by `buildHistoricalDateColumns`/`buildHistoricalPeriodColumns`
in `apps/api/src/common/historical-date/historical-date.util.ts`, which every entity
service goes through; DTOs never accept a raw ISO date string for a historical field.

### Two independent axes

- **`DatePrecision`** - granularity of what's known: `DAY`, `MONTH`, `YEAR`, `DECADE`,
  `CENTURY`, `UNKNOWN`.
- **`DateQualifier`** - certainty/shape of the claim: `EXACT`, `CIRCA`, `BEFORE`, `AFTER`,
  `BETWEEN`, `UNCERTAIN`, `TRADITIONAL`.

These are orthogonal: a YEAR-precision date can be `EXACT` (a specific known year),
`CIRCA` (approximately that year), or `TRADITIONAL` (a legendary/oral-history date). Never
conflate "coarse precision" with "low confidence" - they are different facts about the data.

### Two shapes: point values and periods

- **Point value** (one moment, possibly a `BETWEEN` range): `HistoricalEvent.date*`,
  `HistoricalFact.date*`, `Person.birth*`/`Person.death*`. Columns: `{prefix}Year/Month/Day`,
  `{prefix}Precision`, `{prefix}Qualifier`, `{prefix}EndYear/Month/Day` (only meaningful
  when qualifier is `BETWEEN`), `{prefix}Label` (editor display override),
  `{prefix}SortStart`/`{prefix}SortEnd` (internal only, see below).
- **Period** (a start and an end, each independently qualified): `HistoricalEra`,
  `Dynasty`, `Territory` validity. Columns: `start{Year,Month,Day,Precision,Qualifier}`,
  `end{Year,Month,Day,Precision,Qualifier}`, `dateLabel`, `sortStart`/`sortEnd`. **An era/
  dynasty/territory with no `end*` values at all means "still ongoing / no recorded end" -
  this is distinct from `endPrecision = UNKNOWN`, which means "it ended, we just don't know
  when."** Do not conflate the two.

`CommunityStory.eventDate*` and `MediaAsset.capture*` use a simplified point shape
(`year/month/day/precision` only, no qualifier/`BETWEEN`/sort columns) - a personal memory
or a photo caption does not need the full apparatus, but it still never fabricates a day/month.

### Internal sort columns - read this before touching timeline/map queries

`sortStart`/`sortEnd` (and the point-value equivalents) are **DateTime columns computed
purely so Postgres can `ORDER BY`/range-filter uncertain dates deterministically.** They
are never returned by any API response as "the date." Computation rules
(`historical-date.util.ts`):

- `EXACT`/`CIRCA`/`UNCERTAIN`/`TRADITIONAL`: sort window = the full span implied by
  precision (e.g. YEAR -> Jan 1-Dec 31 of that year; DECADE -> the 10-year span;
  CENTURY -> the 100-year span, 1-indexed so 1288 falls in "the 13th century" = 1201-1300).
- `BEFORE`: sort window is `[sentinel far-past, the anchor's upper bound]`.
- `AFTER`: sort window is `[the anchor's lower bound, sentinel far-future]`.
- `BETWEEN`: sort window is `[start's lower bound, rangeEnd's upper bound]`.
- An open-ended period (no `end*` recorded) sorts as if it extends to the far-future
  sentinel, so it still matches "what was valid in year X" queries correctly.
- `UNKNOWN` precision -> `sortStart`/`sortEnd` are both `null`. **Timeline sorting treats a
  `null` sort key as sorting last, never first** - an unknown date is not "the beginning of
  time" (see `TimelineService`).

The far-past/far-future sentinels are `9999-12-31`/`-6000-01-01` UTC - intentionally
implausible technical fences, not historical claims.

### API contract

Every date-bearing API response embeds a `HistoricalDateResponse`:

```json
{ "year": 1288, "month": null, "day": null, "precision": "YEAR", "qualifier": "EXACT", "rangeEnd": null, "display": "1288" }
```

`display` is generated by `formatHistoricalDate(value, locale)` - the **single** place
that owns locale-aware date formatting (vi/en today, falls back to en for anything else).
Do not hand-format dates in a controller or on the frontend from raw year/month/day - call
through this response shape. An editor-authored `label` (e.g. a lunar-calendar rendering)
always overrides the generated `display` string.

A period entity (`Era`/`Dynasty`/`Territory`) returns a `HistoricalPeriodResponse`:
`{ start: HistoricalDateResponse, end: HistoricalDateResponse | null, display }`.

### What is intentionally NOT built here

Ancient calendar conversion (lunar calendar, era-name dating, etc.) is out of scope for
Phase 03 per the brief - `calendar` is implicitly Gregorian everywhere. If/when lunar-date
support is needed, add it as an additional qualifier/field rather than repurposing
`DateQualifier`.

## 3. Place

`Place.type` is a closed enum (`PlaceType`) - hierarchy/classification is never encoded in
free text. `parentPlaceId` is a real self-relation, not a text field. `currentAdminRegion`
is a plain string today (no dedicated modern-Province model exists yet) - if Map/Near-Me
work in a later phase needs reliable modern administrative geometry, that is a new model,
not an overload of `Place`.

Geometry: `location` (Point) and `geometry` (general) are `Unsupported("geometry(...,
4326)")` - EPSG:4326 (WGS84 lon/lat) is the project-wide SRID standard. All reads/writes go
through raw parameterized SQL in `PlacesService` - never string-interpolate a coordinate or
GeoJSON blob into a query.

### Hoang Sa / Truong Sa

Both are seeded as real `Place` rows with `type = ARCHIPELAGO`, real (public, uncontested)
approximate coordinates, and an English alias (`Paracel Islands`/`Spratly Islands`) - **not**
hard-coded frontend map labels, and no territorial claim or boundary geometry is asserted
anywhere in this codebase. `prisma/golden-dataset.ts` is the single source of truth for
this data (`prisma/seed.ts` and `golden-dataset.spec.ts` both read from it, so the two can't
silently drift). `golden-dataset.spec.ts` fails the build if either entry is ever removed,
retyped away from `ARCHIPELAGO`, or stripped of its alias - treat a failure there as a hard
stop, not something to work around.

If real historical/administrative territorial data is ever added for these (or any
disputed area), it must go through `Territory` + `TerritoryGeometryRevision` with a real
source and `HISTORIAN_REVIEWER`/`ADMIN` sign-off (see section 6) - never fabricated from
model memory.

## 4. Person

Birth/death are independent point-value date slots (see section 2) - a person can have a
known death date and a completely unknown birth date, and that is represented as
`birthPrecision = UNKNOWN`, not as an arbitrary early date.

## 5a. Event classification / themes (spec section 11)

`HistoricalEvent` does not carry a single rigid theme enum - an event can be both `MILITARY`
and `TERRITORIAL` (e.g. the 1288 Bach Dang victory). `Theme` is a catalog table (`slug` +
`ThemeCategory`) with its own localized `ThemeTranslation`, linked to events via the M2M
`EventTheme` join (`@@unique([eventId, themeId])` - the same event/theme pair cannot be
linked twice). `ThemeCategory` (`POLITICAL`/`MILITARY`/`CULTURAL`/`DIPLOMATIC`/`RELIGIOUS`/
`ECONOMIC`/`SOCIAL`/`SCIENTIFIC`/`TERRITORIAL`/`HERITAGE`/`OTHER`) is the bounded top-level
filter bucket; specific themes are ordinary catalog rows that can grow without a schema
migration. `GET /themes?category=` lists them publicly; `POST /themes` and
`POST|DELETE /themes/:id/events/:eventId` are `EDITOR`/`ADMIN`. This is deliberately not the
generic `EntityMedia`/SEO-tag system - themes are the historical classification axis, kept
separate per spec section 11's explicit instruction.

## 5. Aliases (spec sections 9, 19, 24)

One shared table, `EntityAlias` (`entityType` + `entityId`, validated in
`AliasesService.assertEntityExists` against the real target table - there is no DB-level
FK, by design, per the "lower-integrity cross-cutting attachment" exception documented in
`BACKEND_HANDOFF.md`). `AliasType` distinguishes `BIRTH_NAME`/`REGNAL_NAME`/`TEMPLE_NAME`/
`TITLE`/`EPITHET` (mainly for `Person`) from `ALTERNATE_NAME`/`HISTORICAL_NAME`/
`ROMANIZATION`/`TRANSLITERATION`/`ALTERNATE_SPELLING`/`ABBREVIATION` (mainly for
`Place`/`Event`) plus `OTHER`.

Deduplication: `@@unique([entityType, entityId, locale, alias])`. `locale` is `NOT NULL`
with a default of `""` (locale-agnostic) specifically because Postgres treats `NULL` as
distinct from `NULL` in unique indexes - a nullable `locale` column would have silently let
duplicate locale-agnostic aliases through. `AliasesService.create` translates the resulting
`P2002` unique-constraint violation into a `409 Conflict`, not a raw 500.

An alias never creates a second `Person`/`Place`/etc. row - "Quang Trung" and "Nguyen Hue"
are one `Person` with two `EntityAlias` rows, never two people.

## 6. Translations, canonical slugs, and locale fallback

Every browsable entity has a `*Translation` table keyed `(entityId, locale)` (unique) with
its own per-locale `slug` (unique within `(locale, slug)`). The entity itself has a stable
`canonicalSlug` derived once from the Vietnamese name at creation and never changed - it is
the internal identity, not necessarily what's shown in every locale's URL.

Fallback order (`resolveTranslation` in `common/translation/resolve-translation.util.ts`,
used by every entity service): requested locale -> `vi` (canonical) -> any remaining
translation -> `null`. Every response includes
`meta: { requestedLocale, resolvedLocale, fallbackApplied }` - **a client must check
`fallbackApplied` before presenting content as being in the language it asked for.** Never
silently present a Vietnamese fallback as if it were the requested English translation.

## 7. Publication & editorial state

`PublicationStatus` (`DRAFT`/`IN_REVIEW`/`PUBLISHED`/`ARCHIVED`) gates every public read
path server-side - `PlacesService.findBySlug`/`EventsService.findBySlug`/etc. all throw
`NotFoundException` for anything but `PUBLISHED` unless an explicit `includeUnpublished`
flag is passed (admin paths only, role-gated at the controller via `@Roles`). This is never
left to frontend filtering (tested in `places.service.spec.ts`/`events.service.spec.ts`).

`HistoricalFact` has its own, stricter `FactEditorialStatus` workflow (`DRAFT` ->
`SOURCE_CHECK` -> `FACT_REVIEW` -> `EDITORIAL_REVIEW` -> `READY` -> `PUBLISHED`, plus a
Phase 04 `RETRACTED` branch off `PUBLISHED`) enforced in `FactsService.setEditorialStatus` -
a fact cannot reach `PUBLISHED` without a `VERIFIED` citation, and a `sensitivity != NORMAL`
fact requires a `HISTORIAN_REVIEWER`/`ADMIN` who is not its own creator (separation of
duties). This predates Phase 03 and is unchanged by it. Full trust-layer contract, including
review history (`FactReview`), retraction, and `Source`/`Citation`/`SourceDocument` policy:
**`docs/backend/TRUST_MODEL.md`** (Phase 04).

`Territory.geometryStatus` is a separate `PublicationStatus` from the territory row's own
translations - see section 9.

## 8. Era hierarchy (spec section 14)

`HistoricalEra.parentEraId` is a self-relation. `ErasService` walks the full ancestor chain
before accepting a `parentEraId` on create or via `PATCH /eras/:id/parent`
(`ErasService.assertNoCycle`) and rejects both direct self-parenting and any deeper cycle.
Tested in `eras.service.spec.ts` (self-parent, a 3-level A->B->C cycle, and a valid
re-parent).

## 9. Territory vs Place, and geometry provenance (spec sections 16-17)

`Territory` is historical geography (`KINGDOM`/`PROTECTORATE`/`HISTORICAL_PROVINCE`/
`DISPUTED_ZONE`/`ADMINISTRATIVE_BOUNDARY`/`OTHER`), explicitly separate from `Place`. It
never encodes modern legal/administrative names or assumptions - a `Territory` represents
what a source says was true for a given historical window (`start*`/`end*`, section 2),
not a present-day claim.

Historical boundary polygons are interpretive and revisable. `TerritoryGeometryRevision`
keeps every prior version (`territoryId + version`, unique) - `TerritoriesService.setGeometry`
**appends** a new revision row before bumping the live `Territory.geometry` column; it never
overwrites a version in place. Editing geometry resets `geometryStatus` back to `DRAFT` -
publishing a reviewed shape is a separate, explicit
`PATCH /territories/:id/geometry-status` call gated to `HISTORIAN_REVIEWER`/`ADMIN`.
`MapService.getFeatures` only ever returns territory geometry where
`geometryStatus = 'PUBLISHED'` - sensitive/unreviewed shapes cannot leak through the
generic bbox endpoint (spec section 33).

**No historical territory geometry is seeded.** The Golden Dataset seeds zero `Territory`
rows with real boundary polygons - fabricating one from model memory is exactly what this
phase is not allowed to do.

## 10. Deletion & archive policy (spec section 25)

Historical entities are never hard-deleted once they can carry references (facts,
citations, stories, comments, contributions). `PublicationStatus.ARCHIVED` is the
soft-delete state - it behaves like `DRAFT` on every public read path (not returned) but
preserves the row, its translations, and every relation for provenance and for admin/
audit access. Only `EntityAlias` rows and `TerritoryGeometryRevision` rows (append-only by
design) support direct deletion (`AliasesService.delete`) - because removing a wrong alias
or an admin correcting a genuinely bad entry does not destroy historical provenance the way
deleting a `Person` or `HistoricalEvent` would.

## 11. Search & Timeline compatibility

`SearchService` already queries `EntityAlias.alias` via `pg_trgm` similarity alongside each
entity's translations (unchanged by Phase 03) - the alias-type expansion in section 5 does
not require search changes, it just makes more alias rows meaningful to store.
`TimelineService` was updated to sort on `dateSortStart`/`sortStart` (section 2) instead of
the old flat `dateStart` column, with the null-sorts-last rule documented above.

## 12. Testing without a live database

Every claim in this document that could be tested without Postgres has an automated test:
`historical-date.util.spec.ts` (date model), `schema-graph.spec.ts` (static DMMF checks -
join-table uniqueness, relation shape, translation uniqueness), `golden-dataset.spec.ts`
(Hoang Sa/Truong Sa + required-core place list, reading the actual seed data module),
`eras.service.spec.ts` (cycle prevention), `aliases.service.spec.ts` (dedup + entity
validation), `places.service.spec.ts`/`events.service.spec.ts` (publication filtering,
translation fallback reporting). PostGIS-dependent behavior (bbox intersection, SRID
handling at the database level) remains `UNVERIFIED_LIVE_POSTGIS` - reviewed by inspection
only, per `BACKEND_FREEZE_REPORT.md`.
