# Dau Viet - Authorization Matrix

Generated from the actual `@Roles(...)` decorators in `apps/api/src/modules/**/*.controller.ts` (not aspirational - grepped directly from the code, see the command at the bottom to regenerate/verify). Enforcement mechanism: `RolesGuard` (global, `apps/api/src/common/guards/roles.guard.ts`), reading roles from the database-backed user object `JwtStrategy` attaches to every request - **never** from client-supplied data, and never bypassable by hiding a button in a frontend. Endpoints with no `@Roles()` decorator require only authentication (any logged-in user); endpoints marked `@Public()` require neither.

## Role definitions

| Role | Intended holder |
|---|---|
| `USER` | Every registered account, by default. Normal profile/community actions. |
| `CONTRIBUTOR` | A `USER` trusted to submit historical material/citations for review. Not self-assignable - granted by an `ADMIN`. |
| `EDITOR` | Manages historical entities (Place/Person/Event/Era/Dynasty) and editorial content (Story/Journey) through their publication workflow. |
| `HISTORIAN_REVIEWER` | Verifies citations and approves sensitive `HistoricalFact`s. Distinct from `EDITOR` specifically so historical-accuracy review and general content editing are separated (see "Separation of duties" below). |
| `MODERATOR` | Community moderation: comments, reports, community-story visibility. |
| `ADMIN` | Full system administration: role/status management, everything every other role can do. |

A `User.roles` is a Postgres array (`Role[]`) - one account can hold several roles at once (e.g. an `EDITOR` who is also a `HISTORIAN_REVIEWER`). `RolesGuard` allows a request through if the caller holds **any one** of the roles listed on the route.

## Endpoint -> required role(s)

| Module | Route | Required role(s) |
|---|---|---|
| Users | `PATCH /admin/users/:id/roles` | `ADMIN` (and never the admin's own id - see below) |
| Users | `PATCH /admin/users/:id/status` | `ADMIN` (and never the admin's own id) |
| Places | `POST /places`, `PATCH /places/:id` | `EDITOR`, `ADMIN` |
| Places | `PATCH /places/:id/publication-status` | `EDITOR`, `HISTORIAN_REVIEWER`, `ADMIN` |
| People | `POST /people` | `EDITOR`, `ADMIN` |
| People | `PATCH /people/:id/publication-status` | `EDITOR`, `HISTORIAN_REVIEWER`, `ADMIN` |
| Events | `POST /events` | `EDITOR`, `ADMIN` |
| Events | `PATCH /events/:id/publication-status` | `EDITOR`, `HISTORIAN_REVIEWER`, `ADMIN` |
| Eras | `POST /eras` | `EDITOR`, `ADMIN` |
| Eras | `PATCH /eras/:id/parent` | `EDITOR`, `ADMIN` (cycle-checked in service - see `docs/backend/HISTORICAL_DOMAIN.md` section 8) |
| Dynasties | `POST /dynasties` | `EDITOR`, `ADMIN` |
| Territories | `POST /territories` | `EDITOR`, `HISTORIAN_REVIEWER`, `ADMIN` |
| Territories | `PATCH /territories/:id/geometry` | `EDITOR`, `HISTORIAN_REVIEWER`, `ADMIN` (appends a `TerritoryGeometryRevision`, resets `geometryStatus` to `DRAFT`) |
| Territories | `PATCH /territories/:id/geometry-status` | `HISTORIAN_REVIEWER`, `ADMIN` only (publishing reviewed geometry is intentionally a stricter gate than editing it) |
| Aliases | `POST /aliases`, `DELETE /aliases/:id` | `EDITOR`, `HISTORIAN_REVIEWER`, `ADMIN` |
| Themes | `POST /themes`, `POST/DELETE /themes/:id/events/:eventId` | `EDITOR`, `ADMIN` |
| Facts | every `/facts/**` route (create, link, editorial-status) | `CONTRIBUTOR`, `EDITOR`, `HISTORIAN_REVIEWER`, `ADMIN` (module-level guard; see separation-of-duties note for the extra in-service checks on publishing, completing FACT_REVIEW, and retracting) |
| Sources | `POST /sources` | `CONTRIBUTOR`, `EDITOR`, `HISTORIAN_REVIEWER`, `ADMIN` |
| Sources | `POST /sources/:id/documents` | `EDITOR`, `HISTORIAN_REVIEWER`, `ADMIN` |
| Sources | `GET /sources/:id/documents/:documentId` (Phase 04) | any authenticated user for `PUBLIC`/`PREVIEW_ONLY`; `EDITOR`/`HISTORIAN_REVIEWER`/`ADMIN` for `METADATA_ONLY`/`RESTRICTED` (in-service check, not a route-level `@Roles()`, since it depends on the document's own `accessPolicy`) |
| Sources | `PATCH /sources/:id/archive` (Phase 04) | `HISTORIAN_REVIEWER`, `ADMIN` only |
| Citations | `POST /citations` | `CONTRIBUTOR`, `EDITOR`, `HISTORIAN_REVIEWER`, `ADMIN` |
| Citations | `PATCH /citations/:id/verify`, `PATCH /citations/:id/dispute`, `PATCH /citations/:id/reject` (Phase 04) | `HISTORIAN_REVIEWER`, `ADMIN` only |
| Media | `POST /media/uploads`, `POST /media/uploads/:id/confirm` (Phase 05, replaces the old `POST /media`) | `CONTRIBUTOR`, `EDITOR`, `HISTORIAN_REVIEWER`, `ADMIN` (confirm additionally requires the caller to own the asset, checked in-service, unless they hold `EDITOR`+) |
| Media | `POST /media/attach` | `EDITOR`, `HISTORIAN_REVIEWER`, `ADMIN` |
| Media | `PATCH /media/:id/rights`, `PATCH /media/:id/translations/:locale`, `PATCH /media/:id/access-policy`, `PATCH /media/:id/archive` (Phase 05) | `EDITOR`, `HISTORIAN_REVIEWER`, `ADMIN` - never the uploader alone, even for their own upload (spec section 46: no self-declared `PUBLIC_DOMAIN`) |
| Media | `PATCH /media/:id/quarantine` (Phase 05) | `MODERATOR`, `ADMIN` |
| Media | `POST /media/admin/cleanup-expired-uploads` (Phase 05) | `ADMIN` only |
| Contributions | `POST /contributions` | any authenticated user; every `mediaAssetIds` entry must be owned by the caller or the caller must hold `EDITOR`+ (Phase 05 fix - previously unchecked, see `MEDIA_ARCHITECTURE.md` section 11) |
| Then & Now | `GET /then-now` (Phase 05) | public |
| Then & Now | `POST /then-now` (Phase 05) | any authenticated user; `beforeMediaId`/`afterMediaId` ownership enforced the same way as Contributions |
| Then & Now | `PATCH /then-now/:id/publication-status` (Phase 05) | `EDITOR`, `HISTORIAN_REVIEWER`, `ADMIN` |
| Then & Now | `PATCH /then-now/:id/moderation-status` (Phase 05) | `MODERATOR`, `ADMIN` |
| Stories | `POST /stories`, `.../places`, `.../people`, `.../events`, `.../hero-media`, `.../featured` | `EDITOR`, `ADMIN` |
| Stories | `POST /stories/:id/facts`, `.../citations` (Phase 06) | `EDITOR`, `HISTORIAN_REVIEWER`, `ADMIN` |
| Stories | `PATCH /stories/:id/editorial-status` (Phase 06) | `EDITOR`, `HISTORIAN_REVIEWER`, `ADMIN` (module-level guard; completing `SOURCE_CHECK -> EDITORIAL_REVIEW` additionally requires `HISTORIAN_REVIEWER`/`ADMIN` in-service, but only when the Story links >=1 `HistoricalFact` - see separation-of-duties note below) |
| Admin/Stories | `GET /admin/stories/:id/preview`, `.../media` (Phase 06) | `EDITOR`, `HISTORIAN_REVIEWER`, `ADMIN` |
| Journeys | `POST /journeys`, `.../stops`, `DELETE .../stops/:stopId`, `PATCH .../stops/reorder`, `.../hero-media`, `.../schedule`, `.../editorial-status` | `EDITOR`, `ADMIN` |
| Admin/Journeys | `GET /admin/journeys/:id/preview` (Phase 06) | `EDITOR`, `ADMIN` |
| Editorial | `POST /editorial/slots`, `DELETE /editorial/slots/:id` (Phase 06) | `EDITOR`, `ADMIN` |
| Comments | `PATCH /comments/:id/moderate` | `MODERATOR`, `ADMIN` (in-service: never the comment's own author, even if they hold the role - see below) |
| Reports | `GET /reports/admin`, `PATCH /reports/:id/resolve` | `MODERATOR`, `ADMIN` |
| Community | `PATCH /community/stories/:id/review-verification-state` | `HISTORIAN_REVIEWER`, `EDITOR`, `ADMIN` (never the story's own author via this route - see below) |
| Community | `PATCH /community/stories/:id/moderation-status` | `MODERATOR`, `ADMIN` (in-service: never the story's own author, even if they hold the role) |
| Users | `POST /admin/users/:id/badges`, `DELETE /admin/users/:id/badges/:type` (Phase 08) | `ADMIN` only - badges are rule/editorial-based, never self-awarded (spec section 28) |
| Moderation | `GET /admin/moderation/queue`, `GET /admin/moderation/:targetType/:targetId`, `POST /admin/moderation/actions` (Phase 08) | `MODERATOR`, `ADMIN` - a unified, audited entrypoint that delegates to the existing `CommunityService`/`CommentsService` setters (spec section 40/47/48/69), never publicly reachable |
| Contributions | `GET /contributions`, `PATCH /contributions/:id/advance` | `EDITOR`, `HISTORIAN_REVIEWER`, `ADMIN` |
| Admin/Audit | `GET /admin/audit` | `ADMIN`, `MODERATOR`, `HISTORIAN_REVIEWER` |

Every route not listed above that still requires `@ApiBearerAuth()` (e.g. `GET /auth/sessions`, `POST /comments`, `POST /bookmarks`, `POST /places/:slug/visits`, `POST /community/stories`, `PATCH/DELETE /community/stories/:id`, `POST/DELETE /community/stories/:id/vote`, `PATCH /comments/:id`, `POST /comments/:id/vote`, `POST /reports`) requires only a valid session - any authenticated role (suspended/disabled accounts are already rejected at the `JwtStrategy` layer before reaching any controller - see `docs/backend/COMMUNITY_ARCHITECTURE.md` section 15). Every route not listed and marked `@Public()` (all `GET` list/detail endpoints for Places/People/Events/Eras/Dynasties/Territories/Stories/Journeys/Sources/Community, `/map/features`, `/timeline`, `/search`, `/health`) requires no authentication at all.

## Separation of duties (spec Phase 02 section 20)

Two rules are enforced in *service* code, not just route-level `@Roles()`, because they depend on runtime data (who created vs. who is approving), which a static decorator cannot express:

1. **`HistoricalFact` publication** (`FactsService.setEditorialStatus`, unit-tested in `facts.service.spec.ts`): a fact with `sensitivity != NORMAL` cannot be moved to `PUBLISHED` by the same user who created it, even if that user holds `HISTORIAN_REVIEWER` or `ADMIN`. A different `HISTORIAN_REVIEWER`/`ADMIN` must approve it. A non-sensitive fact still requires >=1 `VERIFIED` citation to publish, but has no creator/reviewer separation requirement.
2. **`CommunityStory` verification state** (`CommunityService`, unit-tested in `community.service.spec.ts`): the story's own author can only move it through `PERSONAL_MEMORY -> COMMUNITY_SUBMISSION -> SOURCE_ATTACHED` (`PATCH .../verification-state`, no role required beyond being the author). Reaching `UNDER_REVIEW` or `VERIFIED_CONTRIBUTION` requires the *separate*, role-gated `PATCH .../review-verification-state` endpoint (`HISTORIAN_REVIEWER`/`EDITOR`/`ADMIN`) - an author calling the author-only endpoint with a review-only state is rejected outright, regardless of their own roles.
3. **`HistoricalFact` FACT_REVIEW completion and retraction** (Phase 04, `FactsService.setEditorialStatus`, unit-tested): moving a fact from `FACT_REVIEW` to `EDITORIAL_REVIEW` requires `HISTORIAN_REVIEWER`/`ADMIN` regardless of who created it (this is the historical-accuracy checkpoint itself). Moving a `PUBLISHED` fact to `RETRACTED` requires `HISTORIAN_REVIEWER`/`ADMIN` and a documented `notes` reason - never a bare `CONTRIBUTOR`/`EDITOR` action, and never silent.
4. **`Story` SOURCE_CHECK completion** (Phase 06, `StoriesService.setEditorialStatus`, unit-tested in `stories.service.spec.ts`): moving a Story from `SOURCE_CHECK` to `EDITORIAL_REVIEW` requires `HISTORIAN_REVIEWER`/`ADMIN` *only when the Story links at least one `HistoricalFact`* (`StoryFact`) - a Story making no factual claims can be moved through review by any `EDITOR`. Publication itself additionally refuses (regardless of role) if any linked Fact is not `PUBLISHED` (`STORY_FACT_NOT_PUBLISHABLE`) - see `docs/backend/EDITORIAL_CONTENT.md` section 6.
5. **`CommunityStory`/`Comment` moderation and review, extended (Phase 08)**: `CommunityService.setReviewVerificationState` and `CommunityService.setModerationStatus` both refuse when `actorId === story.authorId`, and `CommentsService.moderate` refuses when `actorId === comment.authorId` - regardless of the actor's roles (unit-tested in `community.service.spec.ts`/`comments.service.spec.ts`). Holding `HISTORIAN_REVIEWER`/`EDITOR`/`MODERATOR`/`ADMIN` never overrides being an interested party in your *own* submission - the same principle as rule 1 above, extended from Fact review to community review/moderation. The new unified `POST /admin/moderation/actions` entrypoint (section below) delegates to these same two methods, so it inherits this refusal automatically rather than needing its own copy of the check.

## Privilege-escalation prevention (spec Phase 02 section 21)

- **No request DTO anywhere accepts a `roles` or `status` field for self-registration.** `RegisterDto` has exactly `email`/`password`/`displayName`; every new account is hardcoded server-side to `roles: [Role.USER]` (`AuthService.register`). There is no mass-assignment path from client JSON to elevated privilege.
- **`PATCH /admin/users/:id/roles` and `PATCH /admin/users/:id/status` both refuse `id === caller.id`** (`UsersService.setRoles`/`setStatus`, unit-tested) - an admin cannot use these endpoints to change their own roles or suspend/disable themselves, closing off both an accidental-lockout footgun and a scenario where a compromised admin session tries to entrench itself by stripping other admins while leaving itself untouched through a self-referential call. (Removing *another* admin's `ADMIN` role is still possible by design - that is ordinary admin-to-admin account management, not self-escalation.)
- Suspending or disabling a user (`UsersService.setStatus`) immediately calls `AuthService.revokeAllSessions`, so the change is not just a flag some other request might not notice for up to 15 minutes - see `docs/backend/AUTH.md` section 3.

## Regenerating this table

```bash
grep -rn "@Roles(" apps/api/src/modules --include=*.controller.ts -A1
```

If this table and that command's output ever disagree, the command is right and this file needs updating.
