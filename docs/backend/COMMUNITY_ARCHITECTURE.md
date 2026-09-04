# Dau Viet - Community: "Chuyen nguoi Viet" (Phase 08)

Audience: any engineer/agent touching `CommunityStory`, `Comment`, `StoryVote`/`CommentVote`,
`Bookmark`, `PlaceVisit`, `Report`, `UserBadge`, or the modules that implement them
(`CommunityService`, `CommentsService`, `BookmarksService`, `ReportsService`, `ModerationService`,
`UsersService`). This document is the contract for how user-generated content coexists with -
and never bypasses - the verified-knowledge layers built in earlier phases. It complements
`docs/backend/TRUST_MODEL.md` (Phase 04, Fact/Source/Citation) and
`docs/backend/EDITORIAL_CONTENT.md` (Phase 06, Story/Journey) rather than replacing either.

## 1. What already existed vs. what Phase 08 added

Most of the Phase 08 data model was already correct from earlier phases and needed no schema
change: `CommunityStoryType` (7 values, exactly as specced), `CommunityVerificationState` (5
stages), `ModerationStatus` (`VISIBLE`/`LIMITED`/`UNDER_REVIEW`/`REMOVED`/`LOCKED`),
`ReportCategory` (9 values, exactly as specced), `ReportStatus`, and the `CommunityStoryPlace`/
`Person`/`Event`/`Era` join tables. What Phase 08 added: `originalLocale`/`editedAt`/
`helpfulCount`/`thenNowComparisonId` on `CommunityStory`; a new `StoryVote` model (the missing
helpful-vote table); `Comment.depth`/`editedAt`; a new `UserBadge`/`BadgeType`; a
`User.visitedPlacesPublic` privacy toggle; real ownership/target-existence/content-safety
validation across `CommunityService`/`CommentsService`/`BookmarksService`/`ReportsService`
(several of which had zero validation before this phase - see section 15); and a new
`ModerationService`/`ModerationController` unifying the moderator-facing surface.

**Deliberately not added**: a dedicated `CommunityStoryLink` model (the existing per-entity join
tables already do this correctly), a `ModerationAction` model (the existing append-only
`AuditLog` already carries actor/action/entityType/entityId/metadata/timestamp - a second,
narrower audit table would just fragment the trail), and a `Profile` model separate from `User`
(display name/avatar/bio already live on `User`; a separate table with a 1:1 relation would be
pure indirection).

## 2. The trust boundary (spec section 2) - the most important invariant in this document

```
HistoricalFact  = verified, trust-controlled historical knowledge (Phase 04)
Story           = editorial narrative, built FROM facts/sources (Phase 06)
CommunityStory  = user-generated content - memories, stories, experiences
Contribution    = material submitted for possible provenance/review (Phase 09)
```

**No code path anywhere lets `CommunityStory` reach `HistoricalFact`, directly or through
popularity/moderation/verification.** Concretely, structurally:

- `CommunityStory` has no relation field to `HistoricalFact`, `Citation`, or `Source` at all
  (regression-tested in `trust-regression.spec.ts` - this was already true from Phase 04/06 and
  remains true).
- `helpfulCount`/`StoryVote` are a popularity signal only - nothing reads them to gate
  `verificationState`, and the vote path (`CommunityService.vote`) never touches
  `verificationState` or `moderationStatus` at all.
- `VERIFIED_CONTRIBUTION` (the highest `CommunityVerificationState`) still does **not** mean
  every historical claim inside the story has become a verified `HistoricalFact` - it means an
  `EDITOR`/`HISTORIAN_REVIEWER`/`ADMIN` judged the story's *provenance* (who wrote it, what
  they attached) credible enough to flag, nothing more. A client must never render
  `VERIFIED_CONTRIBUTION` with the same visual weight as a cited `HistoricalFact`.
- `EditorialSlot` (Phase 06 home curation) cannot reference a `CommunityStory` - its
  `RESOLVABLE_KINDS` allow-list is `[STORY, JOURNEY, PLACE]` only, unchanged by this phase and
  regression-tested directly against the source list, not just the schema (a popular community
  story cannot be curated onto the homepage as if it were an editorial `Story` through type
  confusion).
- Promoting community material into `Story` is a deliberate, separate, manual act - an editor
  writes a new `Story` (optionally informed by a `CommunityStory`), never a status flip.

## 3. CommunityStory model (spec section 3/4)

`CommunityStoryType`: `MEMORY` / `LOCAL_STORY` / `TRAVEL_EXPERIENCE` / `THEN_AND_NOW` /
`DOCUMENT_CONTRIBUTION` / `FAMILY_HISTORY` / `PHOTO_STORY` - unchanged from the pre-Phase-08
schema, already the exact set the spec asks for. No generic "post" type was added.

`CommunityStory` fields (see `prisma/schema.prisma`): `canonicalSlug`, `type`, `authorId`
(server-assigned, never client-supplied - section 4 below), `heroMediaId`, **`originalLocale`**
(new - section 5), `verificationState`/`moderationStatus` (sections 6/9), a simplified point
`eventDate*` (no BETWEEN-range needed for a personal memory, still never fabricates a
month/day), **`helpfulCount`** (new, denormalized - section 8), **`thenNowComparisonId`** (new
- section 10), **`editedAt`** (new - section 5 below), `createdAt`/`updatedAt`.
`commentCount` is deliberately **not** a stored column - `CommunityService.findBySlug` computes
it live via `comment.count()` (Comment has no direct FK relation to CommunityStory to attach a
Prisma `_count` to, since Comment uses the generic `targetType`+`targetId` pattern) - cheap
enough at this scale, and never goes stale the way a denormalized counter could.

## 4. Server-controlled authorship & posting policy (spec section 12)

`CommunityService.create` takes the authenticated actor from `@CurrentUser()`, never from the
request body - `CreateCommunityStoryDto` has no `authorId` field to even accidentally trust
(unit-tested: `authorId` in the created row always matches the JWT-derived actor, never a
request field). Posting requires: authentication (global `JwtAuthGuard`), an active account
(see section 15 - `JwtStrategy` already rejects `SUSPENDED`/`DISABLED`/`DELETED` accounts at
the auth layer, before any controller runs), and passes rate limiting (`@Throttle({ limit: 5,
ttl: 60_000 })` on `POST /community/stories`). **Email verification is not required to post** -
this codebase's registration flow does not currently gate any write action on
`emailVerifiedAt`, and Phase 08 does not introduce a new gate here; if product policy later
requires it, the check belongs in `CommunityService.create` next to the account-status check.

## 5. Original language & edits (spec section 5/13)

`originalLocale` is set once, at creation, from the locale of the canonical translation the
author actually submitted (`dto.translations.find(vi) ?? dto.translations[0]`) - it is never
silently overwritten by a later translation or edit. `CommunityStoryTranslation.method`
(`ORIGINAL`/`HUMAN`/`AI_ASSISTED`) and `.status` follow the same translation-table pattern as
every other entity (`docs/backend/HISTORICAL_DOMAIN.md` section 6); an AI-assisted translation
is disclosed via `method`, never presented as the author's own wording, and - per spec section
6 - is **never required** for a story to be posted or to stay visible.

**Editing** (`PATCH /community/stories/:id`, author or `EDITOR`+): stamps `editedAt`, revalidates
content safety, and re-checks `heroMediaId` ownership if changed. `UpdateCommunityStoryDto` has
no `verificationState`/`moderationStatus` field at all - there is no code path by which an edit
request body could touch either, structurally, not just by convention (unit-tested by passing
a `verificationState` field through the DTO type-cast and asserting the resulting Prisma
`update` call never contains it). Phase 08 deliberately does **not** auto-revert a `VISIBLE`
story to `UNDER_REVIEW` on every edit - this codebase's community moderation is reactive
(report-driven, section 9 below) rather than proactive pre-review, so re-review-on-edit would
be inconsistent with how every other moderation transition already works here. This is a
documented policy choice, revisit if product needs change.

## 6. Verification state (spec section 10)

`CommunityVerificationState`: `PERSONAL_MEMORY -> COMMUNITY_SUBMISSION -> SOURCE_ATTACHED ->
UNDER_REVIEW -> VERIFIED_CONTRIBUTION`. The author can move their own story through the first
three (`PATCH .../verification-state`, no role required) - `CommunityService.
setAuthorVerificationState` refuses any state outside that set, even for the author. Only
`UNDER_REVIEW`/`VERIFIED_CONTRIBUTION` require the separate, role-gated `PATCH
.../review-verification-state` (`HISTORIAN_REVIEWER`/`EDITOR`/`ADMIN`) - and, new in Phase 08,
**that endpoint refuses the story's own author even if they hold one of those roles**
(`CommunityService.setReviewVerificationState`, unit-tested) - the same separation-of-duties
principle Fact review already enforces (`TRUST_MODEL.md` section 7), extended here because an
editor reviewing their own personal memory is exactly the same conflict of interest.

**`VERIFIED_CONTRIBUTION` is provenance credibility, not historical truth** (repeated from
section 2 because it is the single most important sentence in this document): it means a
reviewer judged the story's sourcing/attachments credible, never that every sentence in the
story has passed the Fact/Citation trust chain.

## 7. Content format & safety (spec section 7/59-61)

Plain text/light markdown, **not** a structured block CMS like Story's `story-body.util.ts` -
Community content doesn't need `entity_reference`/`callout`-style rich blocks. No
`sanitize-html`/`DOMPurify` dependency was added; instead
`apps/api/src/common/util/content-safety.util.ts`'s `assertSafeUserContent(text)` **rejects**
(does not attempt to sanitize) any HTML-tag-shaped substring outright - a closed-format
philosophy identical to Story's block allow-list (`EDITORIAL_CONTENT.md` section 4), applied to
an open-ended text field instead of a JSON block array. This protects every client (Web,
native, and any future consumer) identically, since "React escapes output" is a Web-only
property. The same function also caps link count (default 5, spec section 60) to blunt casual
link-spam without an opaque content-scoring system. Applied to: `CommunityStory` title/content
(both directions - create and update), `Comment` body (create and edit). Length limits are
explicit `class-validator` `@MaxLength` decorators, visible in Swagger: story title 200,
story content 20,000, comment body 4,000 (unchanged from pre-Phase-08), report notes 2,000,
moderation reason 2,000.

## 8. Entity links, media, and Then & Now (spec section 8/16-18)

**Entity links** (`CommunityStoryPlace`/`Person`/`Event`/`Era`): `CommunityService.linkPlace`
etc. now (a) require the caller to be the story's author or hold `EDITOR`+ (previously
**unchecked** - any authenticated user could link *any* story to *any* entity; this was a real
authorization gap closed in this phase), and (b) validate the target entity actually exists
before creating the join row (previously a bad id would hit the database FK constraint and
surface as an unhandled 500, not a clean domain error). Linking never asserts or implies the
story's content about that entity is historically accurate - "Ky uc cua ba toi o Ha Noi" linking
to the Ha Noi `Place` says only "this memory concerns this place," exactly as spec section 8
frames it.

**Media**: reuses the entire Phase 05 pipeline unchanged - no second upload system.
`heroMediaId` ownership is checked via the existing `MediaService.assertOwnedByOrPrivileged`
(same guard `Contributions`/`ThenNow` already use) before a story can reference it, both on
create and on update. An ordinary `USER` cannot self-declare their own upload
`PUBLIC_DOMAIN`/institutionally-reviewed rights - that remains `EDITOR`+-only via `PATCH
/media/:id/rights`, unchanged from Phase 05.

**Then & Now**: a `CommunityStory` of type `THEN_AND_NOW` may set `thenNowComparisonId`,
validated to (a) only be set when `type = THEN_AND_NOW`, and (b) reference a
`ThenNowComparison` the caller created (or `EDITOR`+). No before/after media model was
duplicated - `ThenNowComparison` (Phase 05) already carries its own `publicationStatus`/
`moderationStatus`; a community-submitted comparison being `VISIBLE` is not the same as being
editorially `PUBLISHED`, identical to the CommunityStory-vs-Story distinction throughout this
document.

## 9. Moderation statuses & the public-visibility policy (spec section 39)

```
VISIBLE       - normal public display
LIMITED       - reduced/conditional visibility (still shown; a client may treat differently)
UNDER_REVIEW  - flagged for moderator investigation
REMOVED       - not publicly visible
LOCKED        - visible according to policy, but closed to new interaction
```

**The Phase 08 policy** (`apps/api/src/common/moderation/public-visible-statuses.util.ts`,
`PUBLIC_VISIBLE_STATUSES = [VISIBLE, LIMITED, LOCKED]`): a story/comment stays reachable through
an ordinary public read (list and detail) at exactly these three statuses. `UNDER_REVIEW` gets
the **same public treatment as `REMOVED`** - withheld from public reads entirely - until a
moderator resolves it either back to `VISIBLE` or on to `REMOVED`. This is a deliberate,
documented choice, not an oversight: it errs toward protecting whoever a report concerns over
the reported content's continued visibility while the report is open, and it avoids showing
readers a confusing "is this trustworthy" intermediate state. Applied consistently across
`CommunityService.findBySlug`/`.list`, `PlacesService.getCommunityStories`,
`CommentsService.assertTargetAvailable`, `SearchService.searchCommunityStories`, and
`BookmarksService`'s community-story target check - one policy, one shared constant, not
five slightly different WHERE clauses.

**Comments use tombstoning, not exclusion, for `REMOVED`/`UNDER_REVIEW`** - see section 11.

## 10. Helpful votes (spec section 22/23)

`StoryVote` (new model): existence of a `(storyId, userId)` row **is** the helpful vote - unlike
`CommentVote`'s `+1/-1` palette, there is no value to flip, only create/delete.
`POST /community/stories/:id/vote` and `DELETE .../vote` are both **idempotent** (voting twice
is a no-op, not a toggle-off; un-voting when you hadn't voted is a no-op) - matches spec section
22's "toggle/remove" more predictably than a single toggle endpoint would for a client that
doesn't track local vote state. **Self-voting is disallowed** (`VOTE_SELF_NOT_ALLOWED`) - an
author cannot inflate their own story's `helpfulCount`. A story that is not currently
public-visible (section 9) cannot receive a new vote (`VOTE_TARGET_NOT_AVAILABLE`).
`helpfulCount` is a denormalized column updated in the same `$transaction` as the `StoryVote`
row - the `@@unique([storyId, userId])` constraint is the actual source of truth for "has this
user voted," so a concurrent double-click race still cannot double-count (spec section 64):
the second `create` call would violate the unique constraint and surface as a `409` via the
existing global P2002 handler, not a duplicate row.

## 11. Comments & threading (spec section 29-36)

**Supported targets** (`COMMENTABLE_TYPES` in `comments.service.ts`): `PLACE`, `PERSON`,
`EVENT`, `STORY`, `COMMUNITY_STORY`, `JOURNEY`, `SOURCE` - exactly the "at minimum" list plus
the optional `SOURCE` (which already had its own `GET /sources/:id/comments` route from an
earlier phase). Every other `EntityKind` (`FACT`, `ERA`, `DYNASTY`, `TERRITORY`,
`CONTRIBUTION`, `MEDIA_ASSET`, `COMMENT`) is rejected outright (`COMMENT_TARGET_NOT_AVAILABLE`)
- **`CommentsService.create` never trusted a client-supplied `targetType`+`targetId` before
this phase** (it only checked a reply's parent belonged to the same target, never that the
target itself existed or was published) - this was a real gap, now closed: `Place`/`Person`/
`HistoricalEvent` must be `PUBLISHED`, `Story`/`Journey` must have `editorialStatus =
PUBLISHED`, `CommunityStory` must be public-visible (section 9), `Source` just needs to exist.

**Depth** (`Comment.depth`, new column): 0-indexed, `MAX_DEPTH = 2` allows three visual nesting
levels. A reply's depth is `parent.depth + 1`, computed and rejected (`COMMENT_MAX_DEPTH`)
*before* the write - no recursive ancestry walk needed, one extra read. `CommentsService.list`
mirrors this on the read side: its nested Prisma `include` is built exactly `MAX_DEPTH` levels
deep (a small loop building `{ replies: { include: { replies: { include: {...} } } } }`), which
is bounded and provably matches what `create` can ever produce - never an unbounded recursive
fetch (spec section 32).

**Locking**: a `CommunityStory` at `moderationStatus = LOCKED` rejects any *new top-level*
comment (`COMMENT_THREAD_LOCKED`) but remains fully readable - existing comments and their
replies are untouched. Independently, an individual `Comment.status = LOCKED` blocks only
*new replies to that one comment* without affecting its siblings or the rest of the thread -
two independent, narrower-than-the-whole-page lock granularities, both enforced server-side
(never relying on a disabled frontend button, spec section 43).

**Tombstoning, not deletion** (spec section 34 - the concrete fix for "replies must not
disappear because the parent was removed"): `CommentsService.list` no longer filters comments
out of the query by status at all - every comment in a thread is fetched, then
`toPublicComment()` redacts `body`/`author` to `null` for any comment whose status is `REMOVED`
or `UNDER_REVIEW`, while its `replies` array is still populated and walked normally. The
frontend renders its own "[Binh luan da bi xoa]" copy from `body: null` - no Vietnamese UI
string is baked into the API response (same principle as section 13's disclaimer guidance).
`CommentsService.remove` (author self-delete) and `.moderate` (moderator action) both just set
`status`; neither ever deletes a row or touches a child comment.

**Votes** (`CommentVote`, unchanged model): self-voting is now disallowed
(`VOTE_SELF_NOT_ALLOWED` - previously unchecked), and a `REMOVED`/`UNDER_REVIEW` comment cannot
receive a new vote (`VOTE_TARGET_NOT_AVAILABLE`). `+1/-1` scoring, the `@@unique([commentId,
userId])` constraint, and the `$transaction`-wrapped score adjustment are all unchanged from the
pre-Phase-08 implementation, which already got this part right.

## 12. Bookmarks & visits (spec section 24/25)

**Bookmarks**: `BookmarksService.add` previously created a row for *any* `targetType`+
`targetId` with zero validation - a client could bookmark a nonexistent id, or a type never
meant to be bookmarkable. Now restricted to exactly the spec's four types (`PLACE`, `STORY`,
`JOURNEY`, `COMMUNITY_STORY`, `BOOKMARKABLE_TYPES` in `bookmarks.service.ts`), each resolved
against its real table before the bookmark is written (`BOOKMARK_INVALID_TARGET` otherwise); a
`CommunityStory` target must also currently be public-visible (section 9). **Bookmarks have no
public-read path at all** - `GET /bookmarks` is authenticated and always scoped to the caller's
own `userId`; there is no route, public or otherwise, that lists another user's bookmarks. This
is why bookmarks needed no privacy *toggle* the way visited places did (section 13) - they are
structurally private already.

**Visits** (`PlaceVisit`, unchanged model): `PlacesService.recordVisit` already validated the
target `Place` is real and `PUBLISHED` (Phase 03/06) and never required GPS proof - a visit is
a personal record (`note` is free text), not a claim of historical evidence. Phase 08 adds
`GET /users/me/visited-places` (always the caller's own full list, regardless of their privacy
toggle) and the opt-in public exposure described next.

## 13. Profiles & privacy (spec section 26/27/61-66)

`GET /profiles/:id` (public) returns: `displayName`, `avatarMediaId`, `createdAt`,
`communityStories` (title/slug/type, public-visible ones only, capped at 20), `contributionCount`
(a live `Contribution.count`), `helpfulReceived` (a live `SUM(helpfulCount)` aggregate over the
user's own public-visible stories - never a value the user can set themselves), `badges`
(section 14), and `visitedPlaces` (**only present when `User.visitedPlacesPublic = true`**,
otherwise `null` and the underlying query is never even run). **Never included, anywhere in this
response**: `email`, `status`, `roles`, sessions, moderation notes, precise
location/coordinates beyond the `Place` the user marked visited (which is not "precise GPS" -
see section 12). `PATCH /users/me` accepts a new optional `visitedPlacesPublic: boolean` field
to flip the toggle; it defaults to `false` (private) for every account.

`GET /users/me` (private, the caller's own view) can safely include more - `email`, `roles`,
`status`, `emailVerifiedAt` - since it is scoped to the authenticated caller's own record,
identical in spirit to the existing Phase 02 `me`-vs-`publicProfile` split.

## 14. Badges (spec section 28)

`UserBadge` (new model) + `BadgeType` enum (`MEMORY_KEEPER`/`EXPLORER`/`ARCHIVIST`/
`STORYTELLER`/`RESEARCHER` - the five named in the brief; Vietnamese display labels belong to
the frontend, not the database, same "structured state, not baked-in UI copy" principle as
section 6). **No code path lets a user grant their own badge** - the only writes to this table
are `UsersService.grantBadge`/`revokeBadge`, both behind `POST/DELETE /admin/users/:id/badges`
(`ADMIN` only). No XP, levels, streaks, or gambling-style mechanics exist anywhere in this
schema - a badge is a flat, timestamped, optionally-reasoned grant, `@@unique([userId, type])`
so the same badge can't be double-granted.

## 15. Suspended/disabled users & rate limiting (spec section 56/57/58)

**Section 56 needed no new per-service check**: `JwtStrategy.validate` (Phase 02, unchanged)
already rejects any request from a `SUSPENDED`/`DISABLED`/`DELETED` account at the
authentication layer, before the request reaches any controller. Every community write path in
this phase (`CommunityService.create`, `CommentsService.create`, `.vote`, `ReportsService.file`,
`BookmarksService.add`) is behind the global `JwtAuthGuard`, so a suspended user is already
turned away before any of this phase's new code runs - one enforcement point, not five
duplicated ones.

**Per-action rate limits** (`@Throttle({ limit, ttl: 60_000 })`, `@nestjs/throttler`, the same
mechanism Phase 02 uses for auth endpoints), distinct from the app-wide default bucket:
CommunityStory creation 5/min, comment creation 20/min, comment votes 60/min, story votes
30/min, report filing 10/min. These are starting values tuned for "a real person posting," not
measured production traffic - revisit with real usage data.

**Spam foundation** (section 58, deliberately minimal - no AI moderation): rate limiting above,
a duplicate-open-report guard (section 16), a link-count cap (section 7), and the existing
`Report` system for anything the structural checks don't catch. No content-length-based or
frequency-based auto-hiding was added beyond what's described here - a legitimate user
repeating a real historical name/place is never penalized by construction, since nothing here
inspects word frequency.

## 16. Reports & the moderation queue (spec section 37/38/47/48)

**Reportable targets**: `COMMUNITY_STORY`, `COMMENT`, `STORY`, `MEDIA_ASSET`
(`REPORTABLE_TYPES` in `reports.service.ts`) - each validated to exist before a report is filed
(`REPORT_TARGET_NOT_FOUND`, previously unchecked). **Duplicate-report guard**: a reporter cannot
file a second report against the same `(targetType, targetId, category)` while an earlier one
from them is still `OPEN`/`IN_REVIEW` (`REPORT_DUPLICATE`) - but *can* re-report after the
earlier one is resolved, since a new instance of the same problem is a legitimate report, not
abuse. Reporter identity is only ever visible to `MODERATOR`/`ADMIN` (`GET /reports/admin`,
`GET /admin/moderation/queue`) - never on any public target detail response.

**`GET /admin/moderation/queue`** (`ModerationService.queue`, thin wrapper over
`ReportsService.queue`): filters by `status`/`targetType`/`category`/date range, `MODERATOR`+
only. **`GET /admin/moderation/:targetType/:targetId`** (`ModerationService.detail`): the
target's full content, every report filed against it, the last 50 prior moderation actions
(queried from `AuditLog`, filtered to moderation-specific `action` values), and the author's
*safe* subset (`id`/`displayName`/`status`/`roles` - status/roles included because a moderator
needs to know if the account is already suspended, but never `email`/password/sessions).
**`POST /admin/moderation/actions`** (`{targetType, targetId, action, reason}`,
`ModerationService.action`): a single verb set (`REMOVE`/`RESTORE`/`LIMIT`/`LOCK`/`UNLOCK`/
`MARK_UNDER_REVIEW`) mapped to the same `ModerationStatus` values the individual `PATCH
.../moderation-status` endpoints already accept, and **delegates to those same underlying
service methods** rather than reimplementing them - so it automatically inherits their
self-moderation refusal (section 6) and audit logging, and both surfaces (the granular PATCH
endpoints from earlier phases, and this new unified one) can never drift out of sync with each
other's guarantees.

**Moderation actions are audited, never silent** (spec section 40): every
`setModerationStatus`/`moderate`/`setReviewVerificationState`/`withdraw` call writes an
`AuditLog` row (actor, action, target, metadata including an optional `reason`) - reusing the
existing append-only `AuditLog` model rather than introducing a second, narrower
`ModerationAction` table (see section 1's "deliberately not added").

**Copyright/personal-information reports** (spec section 45/46) use the same generic path -
`COPYRIGHT`/`PERSONAL_INFORMATION` are ordinary `ReportCategory` values with no special
processing pipeline of their own in this phase. A moderator resolving either can `LIMIT`/
`REMOVE` the target through the same actions above; nothing here cascades a hard delete of the
underlying `MediaAsset`/translations, preserving evidence for any follow-up (spec section 45's
"do not destroy evidence through cascade deletion" - `setModerationStatus` only ever writes the
`moderationStatus` column).

## 17. Search integration (spec section 49/50)

`SearchService.searchCommunityStories` (Phase 07) already typed community results distinctly
(`entityType: 'COMMUNITY_STORY'`) and already gave them a negative importance bonus so they can
never outrank a major historical entity at equal textual similarity
(`DISCOVERY_ARCHITECTURE.md` section 3). Phase 08's only change: its moderation-status filter
now matches `PUBLIC_VISIBLE_STATUSES` exactly (section 9) instead of `VISIBLE` alone -
`REMOVED` and `UNDER_REVIEW` never surface in search results, `LIMITED`/`LOCKED` do (consistent
with them remaining publicly readable everywhere else).

## 18. Hoang Sa / Truong Sa (spec section 79)

A `CommunityStory` links to Hoang Sa/Truong Sa exactly the way it links to any other `Place` -
through the ordinary `CommunityStoryPlace` join table, with no dedicated code path, no
automatic verification bump, and no field on that join table capable of expressing a
territorial/legal claim (regression-tested in `trust-regression.spec.ts`). Community
memories/comments about either archipelago are, and remain, ordinary user-generated content
subject to exactly the same trust/moderation rules as a memory about any other place -
commenting on or writing a community story about Hoang Sa never changes the canonical `Place`
row, never creates a `Territory` (still none seeded, per Phase 04/07's own regressions), and
never bypasses review to become a `HistoricalFact`.

## 19. Error codes (spec section 70)

`apps/api/src/common/errors/community-error-codes.ts` (`COMMUNITY_ERROR_CODES`), following the
`AUTH_ERROR_CODES`/`TRUST_ERROR_CODES`/`MEDIA_ERROR_CODES`/`EDITORIAL_ERROR_CODES`/
`DISCOVERY_ERROR_CODES` pattern - spans the community/comments/bookmarks/reports/moderation
modules the same way `DISCOVERY_ERROR_CODES` spans map/timeline/search/nearby:
`COMMUNITY_STORY_NOT_FOUND`, `COMMUNITY_STORY_NOT_EDITABLE`, `COMMUNITY_STORY_LOCKED`,
`COMMUNITY_MEDIA_NOT_OWNED`, `COMMUNITY_INVALID_ENTITY_LINK`, `COMMUNITY_UNSAFE_CONTENT`,
`COMMENT_NOT_FOUND`, `COMMENT_NOT_EDITABLE`, `COMMENT_MAX_DEPTH`,
`COMMENT_TARGET_NOT_AVAILABLE`, `COMMENT_THREAD_LOCKED`, `VOTE_SELF_NOT_ALLOWED`,
`VOTE_TARGET_NOT_AVAILABLE`, `REPORT_DUPLICATE`, `REPORT_TARGET_NOT_FOUND`,
`MODERATION_FORBIDDEN`, `BOOKMARK_INVALID_TARGET`.

## 20. Not implemented in this phase (be explicit, not hidden)

- **Email-verification-required-to-post** (section 4) - not currently gated anywhere in this
  codebase; documented as the seam to add it in if product policy requires it later.
- **A `RELEVANT` community sort** (spec section 21, explicitly "potentially later") - only
  `NEW`/`HELPFUL` exist, both fully transparent orderings (`createdAt desc` / `helpfulCount
  desc`), matching the brief's preference for transparent sorting over opaque engagement
  ranking.
- **Per-word/frequency spam heuristics** - deliberately out of scope (section 15/58).
- **Redis/CDN caching** for any community read path - same "documented as deferred, not
  silently claimed to work" pattern as `EDITORIAL_CONTENT.md` section 20 and
  `DISCOVERY_ARCHITECTURE.md` section 6.
- **Live database/concurrency verification** - every guarantee above (unique-constraint races,
  transaction atomicity, real Postgres enum/FK behavior) is `PASS_UNIT` via mocked Prisma, not
  exercised against a live database in this build session (see
  `docs/backend/BACKEND_FREEZE_REPORT.md`).
