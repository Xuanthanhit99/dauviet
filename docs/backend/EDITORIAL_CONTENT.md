# Dau Viet - Editorial Content (Phase 06)

Audience: any engineer/agent touching `Story`, `Journey`, `EditorialSlot`, or the modules
that reference them (`StoriesService`, `JourneysService`, `EditorialService`). This document
is the contract for how verified knowledge becomes a published narrative or route - if code
disagrees with this doc, treat it as a bug. It complements `docs/backend/TRUST_MODEL.md`
(Phase 04, the Fact/Source/Citation trust chain) and `docs/backend/MEDIA_ARCHITECTURE.md`
(Phase 05, media lifecycle/rights) rather than replacing either.

## 1. Story vs HistoricalFact vs CommunityStory (spec section 2)

```
HistoricalFact  = an atomic, sourced, editorially-gated claim (Phase 03/04)
Story           = an editorial narrative BUILT FROM facts/sources/entities
Journey         = a curated exploration route through places/context
CommunityStory  = user-generated, never automatically editorial (Phase 01/04)
```

**A Story is never a side door around the Fact trust gate.** An editor cannot place an
unsupported factual claim into a Story and have the system treat it as verified history -
`StoriesService.setEditorialStatus`'s publication validator refuses to publish a Story that
links a `HistoricalFact` which is not itself `PUBLISHED` (see section 6). A `StoryCitation`
(section 5) is a *separate* concept from a Fact's `Citation` and never substitutes for it -
citing a source in a Story's context/quotation layer does not make an unrelated factual claim
"verified."

**Community content is never promoted to Story automatically**, regardless of popularity -
structurally, `CommunityStory` has no relation to `Story` at all (verified in
`schema-graph.spec.ts`/`trust-regression.spec.ts`). Promoting community material into
editorial content is a manual, auditable act: an editor writes a new `Story` (optionally
informed by a `Contribution`/`CommunityStory`), never a status flip that silently converts one
into the other.

## 2. Story model

`Story` (see `prisma/schema.prisma`): `canonicalSlug`, `type` (`StoryType`), `heroMediaId`,
`authorId` (internal, never public - see section 12), `byline` (public-facing, may be a team
name), `featured`/`priority` (curation - section 11), `editorialStatus`
(`StoryEditorialStatus`, section 4), `scheduledAt`/`publishedAt`/`archivedAt`,
`lastReviewedById`/`lastReviewedAt`, `version` (optimistic concurrency, section 10).

`StoryType` (`FEATURE`/`HISTORICAL_EXPLAINER`/`PLACE_STORY`/`PERSON_STORY`/`EVENT_STORY`/
`ARCHIVE_STORY`/`THEN_AND_NOW`/`CULTURAL_STORY`/`EDITORIAL`/`OTHER`) is a small, non-Vietnam-
specific classification - "Sea & Islands" content (section 13) is ordinary `PLACE_STORY`/
`FEATURE` curation via normal entity links and `EditorialSlot`s, never a dedicated type or
special-cased code path (verified in `trust-regression.spec.ts`).

## 3. Story translations

`StoryTranslation` (`locale`, `title`, `subtitle`, `summary`, `content`, `seoTitle`,
`seoDescription`, `status`, `method`, `reviewedById`/`reviewedAt`) follows the same
translation-table pattern as every other entity (`docs/backend/HISTORICAL_DOMAIN.md` section
6) - Vietnamese is canonical, `resolveTranslation` provides the same fallback contract
(`requestedLocale`/`resolvedLocale`/`fallbackApplied`), and `@@unique([storyId, locale])` +
`@@unique([locale, slug])` mean a Story can have distinct `vi`/`en` slugs while a slug can
never collide with another Story's translation *in the same locale* (unit-tested in
`schema-graph.spec.ts`).

**AI-assisted translations never silently become published** (spec section 50): the
publication validator refuses to publish a Story whose canonical translation has
`method: AI_ASSISTED` unless its `status` is `HUMAN_REVIEWED` or `PUBLISHED` - an
AI-drafted English translation sitting at `status: DRAFT` blocks the whole Story from
publishing, not just that locale.

## 4. Story body format (spec section 6/7)

**A structured, server-validated block array (`Json`) - never raw/trusted HTML.**
`apps/api/src/modules/stories/story-body.util.ts` defines the closed set of allowed blocks:

```ts
type StoryBlock =
  | { type: 'heading'; level: 2 | 3 | 4; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'quote'; text: string; attribution?: string; citationId?: string }
  | { type: 'image'; mediaAssetId: string; caption?: string }
  | { type: 'source_reference'; citationId: string; label?: string }
  | { type: 'entity_reference'; entityKind: 'PLACE'|'PERSON'|'EVENT'|'ERA'|'TERRITORY'; entityId: string; text?: string }
  | { type: 'callout'; style: 'info'|'warning'|'disclosure'; text: string }
  | { type: 'audio'; mediaAssetId: string; caption?: string }
```

`validateStoryBody(input)` rejects anything not shaped like one of these - including any
`html`/`script`/`iframe`/`embed`-typed block a client might send. **This is why no HTML
sanitizer dependency was added**: the server can enumerate every allowed shape instead of
trying to sanitize an open-ended one. This is *not* sanitized Markdown - both platforms (web,
native) render their own block components from the same JSON, so there is exactly one
content contract for both, and no HTML-rendering step exists server-side to get wrong.

Codex contract: fetch `StoryTranslation.content` as `StoryBlock[]`, switch on `type`, render
each block with the client's own components. `image`/`audio` blocks reference a
`MediaAsset.id` - resolve via `GET /media/:id` as usual (Phase 05 access-policy rules apply
unchanged). `source_reference` blocks are the mechanism for inline `[1]`-style markers -
`label` is editor-supplied display text; numbering is not auto-generated by the backend in
this phase (deferred - trivial to add client-side by enumerating `source_reference` blocks in
document order, or server-side later if needed).

## 5. Story entity/fact/citation links

`StoryPlace`/`StoryPerson`/`StoryEvent` each carry a `role: StoryLinkRole`
(`PRIMARY_SUBJECT`/`RELATED`/`MENTIONED`/`LOCATION`/`CONTEXT`, spec section 8/9) - a client
never has to guess a Story's central subject from insertion order. Each is `@@unique` on
`(storyId, entityId)` - duplicate links are DB-rejected (P2002 -> 409 via the existing global
filter, same pattern as every other join table in this codebase).

`StoryFact` (new, spec section 10) is the explicit editorial-provenance layer - which
`HistoricalFact` rows a Story's narrative is built on. It never duplicates the fact's
statement text, just the relation, and a Story is not required to back every sentence with a
Fact. **Any Fact a Story does link as support must be `PUBLISHED` for the Story itself to
publish** - `StoriesService`'s publication validator checks every `StoryFact` and refuses
(`STORY_FACT_NOT_PUBLISHABLE`) if any linked fact isn't `PUBLISHED`. This is the concrete
enforcement of section 2's "never a side door."

`StoryCitation` (existing, extended with `locator`/`quoteNote` for context/quotation
placement, spec section 11/12) is for editorial context/broader interpretation/quotation -
**distinct from and never a replacement for** a `HistoricalFact`'s `Citation`. Attaching a
`StoryCitation` never marks any fact as verified; it only requires the referenced `Citation`
to exist and (checked at publish time) its `Source` to not be archived
(`STORY_SOURCE_RESTRICTED`). Quotation-length/copyright limits reuse the Phase 04 `Citation`
policy (`docs/backend/TRUST_MODEL.md` section 9) - `StoryCitation` does not carry its own
excerpt field, so a Story cannot embed unlimited quoted text outside that existing model.

## 6. Story publication workflow (spec section 17-20)

```
DRAFT -> SOURCE_CHECK -> EDITORIAL_REVIEW -> READY -> {PUBLISHED, SCHEDULED} -> ARCHIVED
```

`StoryEditorialStatus` is a dedicated enum (not the shared `PublicationStatus` every other
entity uses) because Story needs two stages `PublicationStatus` cannot express: `SOURCE_CHECK`
(does the narrative's factual support actually exist?) and `SCHEDULED` (spec section 23). It
deliberately mirrors `FactEditorialStatus`'s stage vocabulary (`DRAFT`/`SOURCE_CHECK`/
`EDITORIAL_REVIEW`/`READY`/`PUBLISHED`) rather than inventing an unrelated one.
`FORWARD_TRANSITIONS` in `StoriesService` is the single source of truth for legal moves;
`DRAFT -> PUBLISHED` is never permitted.

**Separation of duties (spec section 20):** completing `SOURCE_CHECK -> EDITORIAL_REVIEW`
requires `HISTORIAN_REVIEWER`/`ADMIN` **only when the Story has at least one `StoryFact`
link** - i.e., only for Stories that make historically substantive claims backed by Facts. A
Story with no linked Facts (e.g. a practical visit-planning piece) can be moved through review
by any `EDITOR`. This is a deliberate, narrower gate than Fact's own sensitivity-based
separation of duties (`TRUST_MODEL.md` section 7) - it is keyed on "does this Story cite
Facts" rather than a sensitivity field Story does not have.

**Publication validator** (`StoriesService.validateForPublication`, spec section 18/19) -
purely structural checks, never automated historical-truth verification:

1. A canonical translation exists with a non-empty title (`STORY_TRANSLATION_REQUIRED`).
2. If AI-assisted, it is `HUMAN_REVIEWED`/`PUBLISHED` (`STORY_TRANSLATION_REQUIRED`).
3. Hero media, if set, is `READY` and `PUBLIC` (`STORY_MEDIA_NOT_READY`).
4. Every inline `image`/`audio` block in every translation's body references a `READY`
   MediaAsset (`STORY_MEDIA_NOT_READY`).
5. Every `StoryFact`-linked Fact is `PUBLISHED` (`STORY_FACT_NOT_PUBLISHABLE`).
6. No `StoryCitation` references an archived `Source` (`STORY_SOURCE_RESTRICTED`).

**Scheduling (spec section 23):** `READY -> SCHEDULED` requires a future `scheduledAt` and
still runs the same publication validator when the *actual* `SCHEDULED -> PUBLISHED` move
happens. **No automatic execution exists** - there is no cron/worker that flips a Story from
`SCHEDULED` to `PUBLISHED` when `scheduledAt` arrives; that transition must be called
explicitly (by an editor, or by a future scheduler job). This is documented as deferred, not
silently claimed to work - classify automatic scheduled publishing as `UNVERIFIED_LIVE_DB`/
not implemented, matching the same honesty pattern as Phase 05's orphan-cleanup job.

## 7. Story revision & audit (spec section 21/22/58/59)

Reuses the generic `Revision` model (Phase 04 precedent, same as `FactsService`/Phase 04's
`Revision` usage) rather than a typed `StoryRevision` table - a JSON snapshot of the full
Story (translations, links, citations, media selection, workflow state) tagged with a
`changeNote`, written on every `create`/`setEditorialStatus` call. `AuditService.log` records
every mutation (`story.created`, `story.linked.*`, `story.heroMedia.set`,
`story.featured.changed`, `story.editorialStatus.*`). Archiving (`ARCHIVED`) never hard-
deletes - translations, links, citations, revisions, and audit history are all untouched;
only public discovery (`findBySlug`/`list`) excludes non-`PUBLISHED` Stories.

## 8. Story media (spec section 14-16)

Hero media is explicit (`heroMediaId`, never inferred from "first attached asset" - spec
section 15) and validated at publication time (section 6 above), not at assignment time (an
editor may pick media still processing). Inline media lives in the structured body (section
4). Gallery media reuses the existing generic `EntityMedia` mechanism
(`StoriesService.getMedia`, same pattern as `PlacesService.getMedia`) - no new model.

**Media is never flattened to a bare `{url}`** (spec section 16): the public/preview DTO's
`mediaDisplay` helper always includes `type`, `isHistorical`, `isAiGenerated`, `aiDisclosure`,
`accessPolicy`, `status` - a client can render "Anh luu tru" (archival photo) vs. "Minh hoa
phuc dung" (reconstruction) directly from the Story response, without a second lookup, and
`aiDisclosure` survives serialization unconditionally.

## 9. Journey model (spec section 24-34)

`Journey`: `canonicalSlug`, `durationMinutes`, `distanceMeters`, `difficulty`, `region`,
`routeGeometry` (`Unsupported("geometry(LineString, 4326)")`, PostGIS, unchanged from Phase
01) with a new `routeGeometrySource` (free text, e.g. `MANUAL`/`ROUTING_ENGINE`/`EDITORIAL` -
spec section 30) so a client never presents an editorial guess as an actual road route. **No
route geometry is fabricated in this phase** - the public contract works from ordered stop
points alone (section 10 below); `routeGeometry` remains an optional future addition with its
provenance always attached when present. `editorialStatus` stays on the shared
`PublicationStatus` (unlike Story) - a Journey does not need a `SOURCE_CHECK` stage since it
does not itself assert factual claims (it points at Places/Stories/Events that already carry
their own trust status).

## 10. Journey stops & map contract (spec section 26-29)

`JourneyStop`: `journeyId`, `placeId`, `order`, `stopTitle` (display override), `notes`
(free-text, uploader-locale only - see below), `recommendedDurationMinutes`, optional
`storyId`/`eventId` pointers (spec section 31 - "why this stop matters," never a place to
restate a factual claim).

**Two DB-enforced integrity constraints** (spec section 26/27), not just application checks:
`@@unique([journeyId, placeId])` (no duplicate Place on one Journey) and
`@@unique([journeyId, order])` (deterministic, collision-free ordering - upgraded from a
plain index in Phase 05 to an actual uniqueness constraint in Phase 06).
`JourneysService.addStop` pre-checks both with a clear domain error
(`JOURNEY_DUPLICATE_STOP`/`JOURNEY_INVALID_STOP_ORDER`) before hitting the DB constraint.

**Reorder (`PATCH /journeys/:id/stops/reorder`)** takes every stop id in its new order and
writes in two phases so the unique-order constraint is never transiently violated: phase 1
moves every affected stop to a unique negative placeholder order; phase 2 sets each to its
real final order. At every step, no two rows ever contend for the same `order` value - this
is the standard safe pattern for reordering under a uniqueness constraint, unit-tested in
`journeys.service.spec.ts`.

**Map contract (spec section 29):** the public Journey DTO's `stops[]` includes each stop's
real `Place` coordinates (via the same `ST_X`/`ST_Y` raw-SQL pattern `PlacesService` already
uses) - ordered points, never a fabricated route line. If `routeGeometrySource` is absent,
clients should render a simple ordered-point path themselves rather than assuming a real road
route exists.

**Why no `JourneyStopTranslation` (spec section 28):** `stopTitle`/`notes` remain flat,
uploader/editor-locale-only fields rather than gaining a full translation table. Nothing in
this codebase yet needs per-locale stop narrative distinct from the Journey's own
`description`, and a stop-level translation table with no consumer would be exactly the
premature complexity spec section 28 (and section 22 of `MEDIA_ARCHITECTURE.md`'s identical
reasoning for `MediaAssetTranslation`) warns against. Revisit if/when localized per-stop
narrative is actually needed.

## 11. Journey publication & revision (spec section 33/34)

`JourneysService.validateForPublication`: translations exist; at least one stop exists
(`JOURNEY_STOP_REQUIRED`); every stop's `Place` is itself `PUBLISHED` (a public Journey never
routes through a hidden/draft Place); hero media, if set, is `READY` + `PUBLIC`
(`JOURNEY_MEDIA_NOT_READY`). Revisions/audit follow the identical pattern to Story (section 7)
via the same `Revision` model (now also `journeyId`-taggable) - stop add/remove/reorder, hero
changes, and every workflow transition are snapshotted.

## 12. Content ownership & byline (spec section 47/48)

`authorId` is an internal `User` pointer (never returned by any public endpoint - the public/
preview DTO omits it entirely) used for authorship *attribution accounting*, distinct from a
`Citation`'s `Source.author` (a historical book's author - an unrelated concept). `byline` is
the optional public-facing credit line (e.g. "Ban bien tap Dau Viet" or a named contributor) -
settable independently of `authorId`, and it is what a client renders, never a private email
or internal user id.

## 13. Featured content & home curation (spec section 35-37)

**No `isFeatured` column was scattered across every content table.** `Story.featured`/
`priority` exist directly on `Story` (it is the one entity type this phase's brief asks for
homepage-style featuring on), but the general cross-content curation problem (multiple
content kinds in named home sections) is solved once, centrally, via `EditorialSlot`:

```
EditorialSlot { slotKey, order, entityKind (STORY|JOURNEY|PLACE), entityId, startsAt?, endsAt? }
```

Deliberately **not** a CMS layout builder - one row is one piece of content in one named slot
at one position. `GET /v1/editorial/home` (public) groups active slots (`startsAt`/`endsAt`
window, both optional) by `slotKey` and **re-resolves each entity's own publication status at
read time** - a stale slot pointing at a since-unpublished Story/Journey/Place is silently
skipped, never leaked (unit-tested in `editorial.service.spec.ts`). Example slot keys (just
data, not an enum - new slots need no migration): `HOME_FEATURED_STORY`, `HOME_JOURNEY`,
`HOME_SEA_ISLANDS`, `HOME_THEN_NOW`. "Sea & Islands" curation (spec section 56) is exactly
this: an `EditorialSlot` row pointing at ordinary `PLACE`/`STORY` entities (e.g. Hoang Sa,
Truong Sa, and Stories linked to them) - no special code path, verified structurally in
`trust-regression.spec.ts`.

## 14. Related content queries (spec section 42/43)

`GET /places/:slug/stories`, `GET /people/:slug/stories`, `GET /events/:slug/stories`, and
`GET /places/:slug/journeys` each resolve the entity's id from its slug (existing
publication-filtered lookup) and delegate to `StoriesService.listForEntity`/
`JourneysService.listForPlace` - one query each, `PUBLISHED` only, no N+1, and no full-Story-
list-then-filter-client-side path exists.

## 15. AI boundary (spec section 52)

No runtime LLM dependency exists anywhere in the Story/Journey request path (public or
admin) - `TranslationMethod.AI_ASSISTED` and `MediaAsset.isAiGenerated`/`aiDisclosure` are
*disclosure fields an editor sets*, never something the backend computes by calling a model
at request time. AI cannot autonomously publish (the publication validator's `AI_ASSISTED` +
`HUMAN_REVIEWED` check in section 6 exists specifically to prevent this), invent Facts/
Citations (no code path creates either without an authenticated human actor and, for Facts,
the full Phase 04 trust workflow), or mark a translation reviewed (`reviewedById`/`reviewedAt`
are set only by the explicit review action, not by translation creation).

## 16. Optimistic concurrency (spec section 60)

Both `Story` and `Journey` carry a `version: Int` column, incremented on every
`setEditorialStatus` call. `SetStoryEditorialStatusDto`/`SetJourneyEditorialStatusDto` accept
an optional `expectedVersion` - when provided and it does not match the current version, the
request is rejected (`STORY_VERSION_CONFLICT`/`JOURNEY_VERSION_CONFLICT`) rather than silently
overwriting a concurrent editor's change. This is deliberately a simple optimistic check, not
collaborative real-time editing - an editor who hits a conflict reloads and retries.

## 17. Error codes (spec section 66)

`apps/api/src/modules/stories/editorial-error-codes.ts` (`EDITORIAL_ERROR_CODES`), following
the `AUTH_ERROR_CODES`/`TRUST_ERROR_CODES`/`MEDIA_ERROR_CODES` pattern:
`STORY_INVALID_TRANSITION`, `STORY_PUBLICATION_REQUIREMENTS_NOT_MET`,
`STORY_TRANSLATION_REQUIRED`, `STORY_MEDIA_NOT_READY`, `STORY_FACT_NOT_PUBLISHABLE`,
`STORY_SOURCE_RESTRICTED`, `STORY_REVIEW_REQUIRED`, `STORY_VERSION_CONFLICT`,
`JOURNEY_INVALID_TRANSITION`, `JOURNEY_STOP_REQUIRED`, `JOURNEY_DUPLICATE_STOP`,
`JOURNEY_INVALID_STOP_ORDER`, `JOURNEY_MEDIA_NOT_READY`, `JOURNEY_VERSION_CONFLICT`.

## 18. Admin preview (spec section 46)

`GET /admin/stories/:id/preview` and `GET /admin/journeys/:id/preview` (both `EDITOR`+,
Story's additionally allows `HISTORIAN_REVIEWER`) - a literal `/admin/*` path matching the
existing `/admin/audit`/`/admin/users` convention, never a secret query parameter on the
public route. Returns the full DTO regardless of `editorialStatus`; the public
`GET /stories/:slug`/`GET /journeys/:slug` routes remain `PUBLISHED`-only exactly as before.

## 19. Performance (spec section 64)

List/related-content queries use targeted `include`s and cap results (`take: 20-100`), never
a full fact/source/citation graph on a list endpoint - detail endpoints (`findBySlug`) are
the only ones that resolve the full link graph. The map-contract coordinate lookup in
`JourneysService.toPublicDto` does one small raw-SQL query per stop (matching
`PlacesService`'s existing single-place pattern) rather than attempting an unverified
multi-id `ANY(...)` array query - acceptable for a Journey's typically-small stop count;
revisit with a batched query if a Journey with very many stops becomes common.

## 20. Not implemented in this phase (be explicit, not hidden)

- Automatic scheduled publishing execution (section 6) - data model only.
- Route geometry generation (section 9) - ordered stop points only.
- `JourneyStopTranslation` (section 10) - flat fields, documented reasoning.
- Auto-generated inline citation numbering (section 4) - `source_reference.label` is editor-
  supplied; client or a future phase can auto-number from block order.
- Redis/CDN caching (spec section 65 of the brief) - DTOs are structured to be cacheable
  later (stable shape, explicit `editorialStatus`/`publishedAt` for invalidation signals) but
  no caching is wired up; Redis remains live-unverified regardless.
