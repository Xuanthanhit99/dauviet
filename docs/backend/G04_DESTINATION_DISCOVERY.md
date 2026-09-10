# Dau Viet - Destination Discovery (G04)

Global Phase G04, Global Backend V2 Extension. Status: **COMPLETE**. Backend V1, G01 (Global
Geography), G02 (Provider + Licensing), and G03 (Global Historical Knowledge Extension) are
separate, already-locked programs - this document is the G04 contract; do not read it as
reopening or amending any of them. See `docs/backend/BACKEND_HANDOFF.md` for the full V1 API
contract, `docs/backend/GLOBAL_GEOGRAPHY.md` for G01, `docs/backend/PROVIDER_LICENSING.md` for
G02, and this repo's G03 migration/seed comments for G03.

## 1. What this is

The backend foundation of **DISCOVER** in the locked product principle (`DISCOVER -> UNDERSTAND
-> PLAN -> BOOK -> TRAVEL TOGETHER -> REMEMBER -> SHARE`). G04 makes the existing G01
`Destination` entity useful enough for a future frontend to answer "why should I explore this
destination, what can I understand there, and what historically/culturally meaningful things are
connected to it?" - without yet answering "what hotel should I book?" (that is G05+).

## 2. Destination definition / boundary (non-negotiable, unchanged from G01/G00)

`Destination` remains the single, existing G01 entity - **not replaced, not duplicated**. Every
model in this phase is additive and hangs off it. The locked distinctions all still hold:
`Destination != Place != Country/Region/City != Territory != Story != Journey != ExternalProvider
!= HistoricalFact`. See `GLOBAL_GEOGRAPHY.md` section 2 for the original `Destination != Place`
rationale (still the single most important one) and section 16 for why `Destination` has no
relation to `Territory` at all (confirmed unchanged by this phase - `Territory` still has no
`countryId`/`regionId`/`cityId`/`destinationId` column of any kind).

`Destination.type: DestinationType` (G01) already covers the discovery-shape classification this
phase needed - `CITY_AREA`, `NEIGHBORHOOD`, `HISTORIC_DISTRICT`, `HERITAGE_AREA`, `ISLAND`,
`ARCHIPELAGO`, `NATURAL_AREA`, `NATIONAL_PARK`, `COAST`, `BAY`, `TOURISM_AREA`, `OTHER` - so no new
enum was introduced.

## 3. Destination <-> Place (the core G04 relation)

`DestinationPlace` (destinationId, placeId, `role: DestinationPlaceRole`, sortOrder, isFeatured,
editorialNote) is a real many-to-many join table - never a `Place.destinationId` single FK, since
a Place may legitimately be relevant to more than one Destination (a temple belonging to both a
neighborhood Destination and a broader city Destination). `role` is `CORE | LANDMARK | HISTORICAL
| CULTURAL | NATURAL | CONTEXTUAL` (default `CONTEXTUAL`).

**Trust boundary (critical, unchanged from the brief):** a `DestinationPlace` row means "this
Place is editorially associated with this Destination." It does **not** mean the Destination
historically governed the Place, that the Destination existed when the Place's history occurred,
or that every `HistoricalFact` about the Place is a fact about the Destination. No
`HistoricalFact`/`Citation`/`Source` row is implied or required by this relation.

**Cross-country validation** (`DestinationsService.setPlaces`): a Place whose own G03
`currentCountryId` is explicitly set and differs from the Destination's `countryId` is rejected
(`DESTINATION_PLACE_COUNTRY_MISMATCH`). A Place with `currentCountryId = null` (most V1 Places -
G03 never backfilled every row) is **allowed** - fail-safe means never blocking on the *absence*
of geography data, only rejecting on a genuine, positive mismatch. This is a real FK-backed check,
never fuzzy name matching.

## 4. Theme, Story, Journey, Event composition

- `DestinationTheme` reuses the existing V1 `Theme` domain as-is (no duplicate taxonomy, no
  per-destination boolean columns).
- `DestinationStory`/`DestinationJourney` are small, explicit, sortOrder-carrying join tables -
  added because the existing `Story`/`Journey` -> `Place` relations alone cannot express
  deterministic Destination-level curation/ordering without an arbitrary, non-deterministic graph
  traversal. A Story is never duplicated into `Destination` content - only linked.
- `DestinationEvent` (destinationId, eventId, sortOrder, role) curates a Destination's "How X
  Became X" turning points. Added only because no existing relation (including G03's
  `EventCountry`, which links an Event to an entire country, not one Destination) can express
  "these specific N events, in this order, are this Destination's editorial turning points."

Public composition (`DestinationsService.findBySlug`) filters every linked Story/Journey/Event to
`PUBLISHED` only at **read time** (never at link time - an EDITOR may curate a draft Story ahead of
its own publish date, matching the existing `EditorialService.getHome` convention of re-verifying
publication status on every read rather than trusting a stale link).

## 5. Editorial collections

`DestinationCollection` (+ `DestinationCollectionTranslation`, `DestinationCollectionMember`) was
introduced **only** because the existing `EditorialSlot` (V1 Phase 06) has no slug, no
translations, and no publication status of its own - it is a positional homepage slot, not a
browsable page, and cannot represent something like "Ancient Capitals" with its own title/summary.
Not personalized - every collection is a single, shared, editorially curated page. Optional
`countryId` scope (nullable - a collection may be country-specific or cross-country).

## 6. Discovery-editorial translation fields

`DestinationTranslation` gained `tagline`/`whyVisit` (both nullable, per-locale, following the
exact same translation-row pattern every other field on this table already uses - never
`taglineVi`/`taglineEn` columns). Deliberately non-operational: no live price/hours/availability
field exists anywhere in this phase. `Destination.heroMediaId` (nullable FK to `MediaAsset`) reuses
the exact same rights/access-policy/status-gated resolution every other `heroMediaId` relation in
this schema already has (`Place`, `Person`, `HistoricalEvent`, `Story`, `Journey`,
`CommunityStory`) - `DestinationsService` resolves it through the real `MediaService.
findPublicById`, never a raw stored URL, so a non-`READY`/non-`PUBLIC` asset is never leaked.

## 7. Discovery ranking (deterministic, documented)

**List ordering**: `importance DESC, canonicalSlug ASC, id ASC`. `importance` is the existing G01
editorial-priority field (`Destination.importance`, already present, already used for ordering
before this phase) - no redundant/fabricated score column was added on top of it. The
`canonicalSlug ASC, id ASC` tie-break makes ordering byte-identical across repeated identical
queries, including deliberate ties (unit-tested).

**Deferred, documented extension point**: a completeness/verified-knowledge-depth-weighted
composite score (as the original brief sketched: `editorialPriority + completeness +
verifiedKnowledgeDepth + curatedFeatureWeight`) was deliberately *not* folded into the primary,
paginated list ordering in this phase - doing so correctly would require either an expensive
per-request aggregate over every candidate row before pagination, or a precomputed/denormalized
score column with its own invalidation lifecycle, neither of which this phase's Golden-Dataset-
scale evidence justifies yet (spec section 29: "prefer query-time composition first unless
performance evidence requires denormalization"). Per-destination completeness signals
(`placeCount`, `storyCount`) **are** already surfaced transparently in both the list and detail
responses today, so a future phase can fold them into ranking with zero schema change.

**Related destinations** (`DestinationsService.getRelated`, `GET /destinations/:slug/related`):
deliberately **computed at query time, never a persisted relation table**. The brief explicitly
warns that a persisted `HISTORICALLY_CONNECTED`-style relation is itself a historical claim
requiring its own trust model (spec section 35) - computing from already-safe signals avoids that
risk entirely while staying fully deterministic and explainable:

```
score = sharedThemeCount * 100 + (sameCity ? 40 : 0) + (sameRegion ? 20 : 0) + importance
tie-break: canonicalSlug ASC, id ASC
```

Candidates are restricted to the same country as the source Destination (fail-safe: never proposes
a cross-country pairing without an explicit editorial decision), `PUBLISHED` only, excludes self,
bounded to 6 results. Every result's `relatedComponents` breaks the score down
(`sharedThemeCount`/`sameCity`/`sameRegion`) for explainability, per spec section 93.

No fake commercial/popularity signal exists anywhere in this ranking: no rating, review count,
price, booking popularity, sponsored rank, or community vote count is read by either the list
ordering or the related-destination score.

## 8. Public API

All under `/v1`, existing global error envelope/pagination/locale conventions.

- `GET /v1/destinations?country=&region=&city=&type=&theme=&page=&pageSize=` (public) - lightweight
  summary list (`id, slug, type, name, tagline, importance, placeCount, storyCount`), offset
  pagination (existing G01 convention, unchanged).
- `GET /v1/destinations/:slug?locale=` (public) - full bounded composition: geography, resolved
  translation (incl. tagline/whyVisit), heroMedia (policy-gated), themes, places (up to 30,
  ordered), stories (up to 10, published only), journeys (up to 10, published only), historical
  turning points (up to 12, published only, display-formatted date only - no chronology internals),
  related destinations (up to 6).
- `GET /v1/destinations/:slug/related?locale=` (public) - the related-destination list alone.
- `POST /v1/destinations`, `PATCH /v1/destinations/:id`, `.../translations/:locale`, `.../status`
  (G01, unchanged) - `EDITOR`/`ADMIN`.
- `PATCH /v1/destinations/:id/places`, `.../themes`, `.../stories`, `.../journeys`, `.../events`
  (G04, new) - `EDITOR`/`ADMIN`, each a "replace style" transactional mutation (section 9).
- `GET /v1/destination-collections`, `.../:slug` (public); `POST /v1/destination-collections`,
  `.../translations/:locale`, `.../status`, `.../members` (`EDITOR`/`ADMIN`).

## 9. Transactions, RBAC, audit

Every `Destination.set*`/`DestinationCollection.setMembers` mutation follows the exact same
"replace style" pattern (spec section 42): delete the full existing relation set, recreate the
supplied one, write the audit row through the **same** transaction client - all inside one
`prisma.$transaction(...)`, mirroring the post-G03/Phase-12.1 `AuditService.log(entry, db?)`
convention exactly. A real PostgreSQL rollback probe (`apps/api/test/destination-composition.
e2e-spec.ts`) proves a forced mid-transaction failure leaves zero partial `DestinationPlace` rows
and zero orphaned "success" audit rows - not a mocked transaction, a real Postgres one. RBAC is
`EDITOR`/`ADMIN` for every mutation (matches the existing G01 Destination tier - no
`HISTORIAN_REVIEWER`-only gate, since discovery/geography content carries no historical-trust
chain the way `HistoricalFact` does).

## 10. Publication / privacy

Public reads filter `status: PUBLISHED` (`Destination`, `DestinationCollection`) and re-verify
each linked Story/Journey/Event/Place's own publication status at read time - a stale link to a
since-unpublished entity is silently skipped, never leaked (same convention as
`EditorialService.getHome`). No `createdById`, audit metadata, internal score-internals-as-secret,
draft/moderation notes, `chronologyStart`/`chronologyEnd`, or legacy `sortStart`/`sortEnd` appear
in any public G04 response - verified live.

## 11. A real pre-existing G01 defect found and fixed by this phase's live QA

`GET /v1/destinations`'s own documented filter query params (`country`/`region`/`city`/`type`)
were silently rejected with `VALIDATION_ERROR: "property country should not exist"` the first time
this phase actually exercised them live. Root cause: the controller bound **both** a whole-object
`@Query() query: OffsetPaginationQuery` (global `ValidationPipe` with `whitelist: true` +
`forbidNonWhitelisted: true`) **and** separate `@Query('country')`-style individual params over the
exact same underlying `req.query` object - the whole-object binding's whitelist validation runs
regardless of the individual params declared alongside it, so any filter key not declared on
`OffsetPaginationQuery` failed the whole request. This had never been caught because no prior
phase's live QA exercised `GET /v1/destinations` with a filter query string (only the bare list and
`:slug` routes were verified - see `docs/backend/LIVE_QA_REPORT.md`'s G01 section). **Fixed** with
one combined `ListDestinationsQueryDto` (pagination + every filter field, one binding, one
validated shape) - the same convention `ListCommunityStoriesQueryDto` already established
elsewhere in this codebase. A permanent e2e regression test now asserts every documented filter
key is accepted without `VALIDATION_ERROR`.

## 12. Media, research, and provenance

No image was scraped, hotlinked, auto-matched from a public folder, or AI-generated as documentary
evidence in this phase - `Destination.heroMediaId` is wired but zero Golden Dataset Destination was
given one (no rights-cleared imagery was sourced this phase; this is an honest gap, not a hidden
one). All editorial `tagline`/`whyVisit` copy in the Golden Dataset is original synthesis grounded
in already-cited V1/G03 content (the 1010 capital-move fact and its Story for Hanoi Old Quarter;
the G03 Kyoto/Heian-kyō 794 founding event for Gion) - no long-form travel-guide prose was copied,
and no historical claim was asserted beyond what the linked, already-sourced content supports.

## 13. Known deferred items / G05+ boundaries

Explicitly out of scope for G04 (see the original brief's "strict out of scope" section) and not
touched: hotel/restaurant/activity inventory or booking, any provider integration, affiliate/
monetization tracking, `Trip`/itinerary/cost engine, location sharing, expense settlement, AI
itinerary generation, and any redesign of `/v1/search` or `/v1/map/features` (both remain G11
scope - `Destination` is not yet integrated into either, matching the brief's explicit instruction
not to redesign global search/map in this phase). The completeness-weighted composite ranking
score described in section 7 above is a documented, not-yet-built extension point for a future
phase, not a silent omission.
