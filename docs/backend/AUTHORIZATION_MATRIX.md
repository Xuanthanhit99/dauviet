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
| Aliases | `POST /aliases`, `DELETE /aliases/:id` | `EDITOR`, `HISTORIAN_REVIEWER`, `ADMIN` (spec G01: also covers `COUNTRY`/`REGION`/`CITY`/`DESTINATION` entityTypes, additive) |
| Themes | `POST /themes`, `POST/DELETE /themes/:id/events/:eventId` | `EDITOR`, `ADMIN` |
| Countries (G01) | `POST /countries`, `PATCH /countries/:id`, `.../translations/:locale`, `.../status` | `EDITOR`, `ADMIN` |
| Regions (G01) | `POST /regions`, `PATCH /regions/:id`, `.../translations/:locale`, `.../status` | `EDITOR`, `ADMIN` |
| Cities (G01) | `POST /cities`, `PATCH /cities/:id`, `.../translations/:locale`, `.../status` | `EDITOR`, `ADMIN` |
| Destinations (G01/G04) | `POST /destinations`, `PATCH /destinations/:id`, `.../translations/:locale`, `.../status`, `.../places`, `.../themes`, `.../stories`, `.../journeys`, `.../events` | `EDITOR`, `ADMIN` |
| Destination Collections (G04) | `POST /destination-collections`, `PATCH /destination-collections/:id/translations/:locale`, `.../status`, `.../members` | `EDITOR`, `ADMIN` |
| Providers (G02) | every `/admin/providers/**`, `/admin/provider-integrations/**`, `/admin/provider-licenses/**` route (create, update, status, capabilities, integrations, licenses, rights, data-policy, evidence, attribution-rules, activate/enable/revoke capability, check-access) | `ADMIN` only - deliberately no `EDITOR` carve-out (spec G02 section 23: provider configuration affects commercial agreements/legal rights/external secrets/monetization, a stricter boundary than ordinary content editing; `HISTORIAN_REVIEWER`/`MODERATOR`/`USER` have no provider authority at all) |
| Accommodations (G05) | `POST /accommodations`, `PATCH /accommodations/:id`, `.../translations/:locale`, `.../status`, `.../destinations`, `POST /accommodations/provider-references`, `PATCH /accommodations/provider-references/:id/map` | `EDITOR`, `ADMIN` (same tier as Destinations - discovery/geography-shaped content, not G02's own provider-configuration boundary above) |
| Cuisines (G05) | `POST /cuisines`, `PATCH /cuisines/:id/translations/:locale`, `.../status` | `EDITOR`, `ADMIN` |
| Dishes (G05) | `POST /dishes`, `PATCH /dishes/:id/translations/:locale`, `.../status`, `.../cuisines`, `.../destinations` | `EDITOR`, `ADMIN` |
| Restaurants (G05) | `POST /restaurants`, `PATCH /restaurants/:id/translations/:locale`, `.../status`, `.../cuisines`, `.../dishes`, `.../destinations`, `POST /restaurants/provider-references`, `PATCH /restaurants/provider-references/:id/map` | `EDITOR`, `ADMIN` |
| Attractions (G05) | `POST /attractions`, `PATCH /attractions/:id/translations/:locale`, `.../status`, `.../destinations` | `EDITOR`, `ADMIN` |
| Activities (G05) | `POST /activities`, `PATCH /activities/:id/translations/:locale`, `.../status`, `.../destinations`, `POST /activities/provider-references`, `PATCH /activities/provider-references/:id/map` | `EDITOR`, `ADMIN` |
| Admin/Cost Assumptions (G06) | every `/admin/cost-assumptions/**` route (create, list, detail, update, status) | `ADMIN` only - deliberately no `EDITOR` carve-out, same tier as Providers above (spec: a mistake here silently skews every owner's cost estimate, not just one piece of editorial copy - `HISTORIAN_REVIEWER`/`MODERATOR`/`EDITOR`/`USER` have no authority here at all) |
| Knowledge Ingestion - sources/policy/jobs (G06.5) | every `/admin/ingestion/sources/**`, `/admin/ingestion/jobs/**`, `/admin/ingestion/runs/**` route | `ADMIN` only - deliberately no `EDITOR` carve-out, same tier as Providers/Cost Assumptions above (this configures rate limits, licensing classification, and which external systems get called - `HISTORIAN_REVIEWER`/`MODERATOR`/`EDITOR`/`CONTRIBUTOR`/`USER` have no authority here; live-proven: `USER`/`CONTRIBUTOR` tokens get `403` on every route in this group) |
| Knowledge Ingestion - candidate review (G06.5) | every `/admin/ingestion/candidates/**` route (list, detail, diff, approve, reject, merge) | `EDITOR`, `HISTORIAN_REVIEWER`, `ADMIN` - never `CONTRIBUTOR`/`USER` (candidates are pre-publication). Self-approval is additionally forbidden in service code for `PERSON`/`EVENT`/`HISTORICAL_FACT` candidate types when the approving actor is also who triggered the originating ingestion run, mirroring the `HistoricalFact` separation-of-duties rule below (`IngestionCandidatesService.approve`) |
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
| Contributions | `GET/PATCH /contributions/mine/:id`, `POST /contributions/mine/:id/withdraw` | owner only (Phase 09 fix - `GET /contributions/:id` previously had no ownership check at all; see `CONTRIBUTION_ARCHITECTURE.md` section 2/10) |
| Contributions | `POST /contributions/:id/provenance-sources` | owner (while editable) or `EDITOR`/`HISTORIAN_REVIEWER`/`ADMIN` (Phase 09) |
| Admin Contributions | `GET/POST/PATCH admin/contributions/**` (queue, detail, `reviews`, `rights-review`, `provenance-confidence`, `sensitivity`) | `EDITOR`, `HISTORIAN_REVIEWER`, `ADMIN` (Phase 09, self-review always refused in-service regardless of role - see below) |
| Admin Contributions | `POST admin/contributions/:id/catalogue/{source,document,media}` | `HISTORIAN_REVIEWER`, `ADMIN` only (Phase 09 - a stricter gate than ordinary review, same tier as `PATCH /sources/:id/archive`; never `MODERATOR`, never a plain `EDITOR`) |
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
| Admin/Audit | `GET /admin/audit` | `ADMIN`, `MODERATOR`, `HISTORIAN_REVIEWER` |
| Admin/Search projection (G11) | `GET /admin/search/projection/status`, `POST /admin/search/projection/drain`, `POST /admin/search/projection/rebuild` | `ADMIN` only - operational (counts, queue depth, timings, latency metrics without any query text); none of them returns or searches unpublished content, and no `includeUnpublished` flag exists anywhere |
| Admin/Affiliate (G10) | `GET /admin/affiliate/conversions`, `GET /admin/affiliate/summary`, `POST /admin/affiliate/conversions/ingest` | `ADMIN` only - commercial conversion/revenue reporting and evidence ingestion, no `EDITOR`/`HISTORIAN_REVIEWER`/`MODERATOR` carve-out, same tier as Providers/Cost Assumptions/Knowledge Ingestion above |

Every route not listed above that still requires `@ApiBearerAuth()` (e.g. `GET /auth/sessions`, `POST /comments`, `POST /bookmarks`, `POST /places/:slug/visits`, `POST /community/stories`, `PATCH/DELETE /community/stories/:id`, `POST/DELETE /community/stories/:id/vote`, `PATCH /comments/:id`, `POST /comments/:id/vote`, `POST /reports`) requires only a valid session - any authenticated role (suspended/disabled accounts are already rejected at the `JwtStrategy` layer before reaching any controller - see `docs/backend/COMMUNITY_ARCHITECTURE.md` section 15). Every route not listed and marked `@Public()` (all `GET` list/detail endpoints for Places/People/Events/Eras/Dynasties/Territories/Stories/Journeys/Sources/Community, `/map/features`, `/timeline`, `/search`, `/health`, and, as of G01, Countries/Regions/Cities/Destinations - `GET /countries`, `.../:slug`, `.../:slug/regions`, `.../:slug/cities`, `.../:slug/destinations`, `GET /regions`, `.../:slug`, `GET /cities`, `.../:slug`, `.../:slug/destinations`, `GET /destinations`, `.../:slug`, `.../:slug/related` (G04), `GET /destination-collections`,
`.../:slug` (G04), and, as of G05, `GET /accommodations`, `.../:slug`, `.../:slug/offers`, `GET
/cuisines`, `.../:slug`, `GET /dishes`, `.../:slug`, `GET /restaurants`, `.../:slug`,
`.../:slug/operational-snapshot`, `GET /attractions`, `.../:slug`, `GET /activities`, `.../:slug`,
`.../:slug/offers`) requires no authentication at all.

## Owner/capability-scoped authorization (G06, extended by G07 — a pattern distinct from role-based `@Roles()`)

Every `/v1/trips/**` route (`Trip` create/list/get/update/archive, destinations, transport-legs, day
items, reorder, estimates, members, invitations, leave/transfer-ownership, activity) carries **no
`@Roles()` decorator at all** - not missing from this matrix by oversight, it is structurally a
different authorization model than every other row above. Trip is private (spec G07 section 1: a
Trip is never made public by membership) - any authenticated `USER` may create and manage their own
Trips, and authorization is enforced entirely in service code, not by platform role.

**G06 baseline**: single-owner, `TripsService.getOwnedOrThrow` compared `Trip.ownerId` to the
caller directly.

**G07 extension** (`docs/backend/G07_PRE_IMPLEMENTATION_REPORT.md` section 8/10): `Trip.ownerId`
remains the sole ownership authority - the owner is deliberately **not** materialized as a
`TripMember` row, so there is still exactly one ownership truth, never two rows that could
disagree. `getOwnedOrThrow` is now a thin wrapper around the new `TripAuthorizationService`, which
resolves an effective role (`OWNER` virtual, or the caller's `TripMember.role` - `EDITOR`/`VIEWER`,
or no relationship at all) and checks it against a fixed capability matrix
(`VIEW_TRIP`/`EDIT_TRIP`/`GENERATE_ESTIMATE`/`MANAGE_MEMBERS`/`MANAGE_INVITATIONS`/
`TRANSFER_OWNERSHIP`/`ARCHIVE_TRIP`) transcribed verbatim from the G07 brief's own permission table:

| Capability | OWNER | EDITOR | VIEWER |
|---|---|---|---|
| VIEW_TRIP | yes | yes | yes |
| EDIT_TRIP (itinerary/destinations/days/items/transport/metadata) | yes | yes | no |
| GENERATE_ESTIMATE | yes | yes | no (may still view existing estimates via VIEW_TRIP) |
| MANAGE_MEMBERS (role change/remove) | yes | no | no |
| MANAGE_INVITATIONS (create/list/revoke) | yes | no | no |
| TRANSFER_OWNERSHIP | yes | no | no |
| ARCHIVE_TRIP | yes | no | no |

Existence is never hidden: a Trip that does not exist at all gets `404 TRIP_NOT_FOUND`; a Trip that
exists but the caller has no sufficient relationship to (unrelated user, or a member whose role
lacks the needed capability) gets `403 TRIP_PERMISSION_DENIED` - the **same** code either way, so
the response itself never reveals "you have some relationship to this trip, just not enough" versus
"you have none at all." This exact indistinguishability is a deliberate continuation of this
codebase's established `Comment`/`Contribution`/G06-Trip 404-then-403 convention (see
`G06_PRE_IMPLEMENTATION_REPORT.md` section 1.6/4.2 for the original precedent trace). **No platform
role, including `ADMIN`, is given implicit read/write access to another user's private Trip** - this
remains a deliberate decision in G07 exactly as it was in G06 (`TripAuthorizationService.authorize`
performs no platform-role check of any kind, only trip-scoped role resolution).

**Self-service exception**: `POST /v1/trips/:id/leave` requires no capability at all (any accepted
`EDITOR`/`VIEWER` may always leave their own membership) - but the trip's owner is explicitly
blocked from calling it (`403 TRIP_OWNER_CANNOT_LEAVE`) since they must transfer ownership first
(spec section 29). Self-promotion and self-removal-as-owner are both structurally impossible, not
merely blocked by an extra check: `MANAGE_MEMBERS`-gated routes can never resolve a `TripMember` row
for the owner, because the owner never has one.

## G08 extension: location consent is a SEPARATE axis from trip authorization

`/v1/trips/:id/location-sharing/**` and `/v1/trips/:id/location(s)` reuse `TripAuthorizationService`
for exactly one thing - the `VIEW_TRIP` membership gate (owner/EDITOR/VIEWER alike, unrelated/
pending-invite users get the same `403 TRIP_PERMISSION_DENIED` as everywhere else in this table) -
but **no new capability was added to the matrix above** (docs/backend/
G08_PRE_IMPLEMENTATION_REPORT.md section 3): location consent is deliberately never
governance-gated. TRIP MEMBERSHIP != LOCATION CONSENT means membership only ever proves "you are
allowed to know this trip's location-sharing state exists"; it never proves "you may act on
someone else's consent."

| Action | Who may perform it | Enforced by |
|---|---|---|
| Start/stop MY OWN sharing | any accepted participant (OWNER/EDITOR/VIEWER), self only | `TripLocationSharingService` - no route accepts a target member id at all |
| Update MY OWN location | any accepted participant with an ACTIVE, unexpired session, self only | `TripLocationsService.update` - `userId` always comes from the JWT, never the body |
| Read own status (`.../me`) | any accepted participant, self only | `VIEW_TRIP` gate + always resolves the caller's own row |
| Read all participants' currently-shareable locations | any accepted participant (OWNER/EDITOR/VIEWER alike) | `VIEW_TRIP` gate; identical read access regardless of role - **OWNER has no elevated read/override authority over another member's consent or location** (spec section 10/68, live-proven in `trip-location.e2e-spec.ts`'s "owner privacy boundary" block) |

No platform role (including `ADMIN`) and no trip role (including `OWNER`) can force-start another
member's sharing, read a STOPPED/EXPIRED coordinate, or cancel another member's privacy choice in
order to expose their location. The owner can only cause sharing to terminate *indirectly*, through
legitimate governance already covered above (`MANAGE_MEMBERS` remove, or `ARCHIVE_TRIP`) - both of
which the G08 integration extends to also delete the affected latest-location row(s) in the very
same transaction.

## G09 extension: expenses/settlements reuse VIEW_TRIP/EDIT_TRIP, no new capability

`/v1/trips/:id/expenses/**`, `/v1/trips/:id/settlement-suggestions`, and `/v1/trips/:id/settlements`
reuse the SAME two capabilities every other Trip sub-resource already uses (docs/backend/
G09_PRE_IMPLEMENTATION_REPORT.md section 14) - **no new `TripCapability` was added**:

| Action | Capability | Notes |
|---|---|---|
| List/read expenses, detail, summary, suggestions, settlements-list | `VIEW_TRIP` | owner/EDITOR/VIEWER alike - VIEWER may read every financial view, same as every other read |
| Create/edit/delete an expense | `EDIT_TRIP` | same tier as itinerary edits - EDITOR has the "same financial mutation permissions as EDIT_TRIP" per the brief's own baseline table |
| Record a settlement | `EDIT_TRIP` | treated as one more financial mutation, not an OWNER-exclusive governance action |

Every mutation ALSO re-validates the actor's authority a second time, **inside** the transaction
(`lockTripAndAssertMutable`, `trip-financial-guard.util.ts`) - a pre-transaction
`TripAuthorizationService.authorize` call alone cannot close the member-removal-vs-create/role-
downgrade-vs-mutation/archive-vs-mutation races (spec sections 36-38), since that call reads state
*before* the transaction that might invalidate it. This is real-PostgreSQL-proven in
`trip-expense.e2e-spec.ts`'s race-test block, including the follow-up assertion that the block is
*permanent*, not just won-this-one-race.

Trip membership itself carries no financial authority beyond the two capabilities above - there is
no `TripCapability.MANAGE_FINANCES` or equivalent, and OWNER holds no special financial power a
current EDITOR does not also hold (unlike G07's MANAGE_MEMBERS/ARCHIVE_TRIP, which remain
OWNER-exclusive as before, untouched by G09).

## G10 extension: click/redirect is public-or-anonymous, commercial reporting is ADMIN-only, trip role grants neither

`POST /affiliate/clicks` and `GET /affiliate/r/:token` are `@Public()`, guarded only by
`OptionalJwtAuthGuard` (docs/backend/G10_PRE_IMPLEMENTATION_REPORT.md section 8) - a caller
identity is captured on the click when a valid JWT is present, but authentication is never
required to follow a redirect (spec section 6). `/admin/affiliate/**` (table above) is `ADMIN`
only - **no new `TripCapability` was added, and no existing one applies here**: a click's optional
`tripId` is checked SOLELY via the pre-existing `VIEW_TRIP` gate (`TripAuthorizationService`,
reused unchanged) to confirm the caller has a real relationship to that trip before it is attached
as tracking context - it grants no commercial authority whatsoever.

| Action | Who may perform it | Enforced by |
|---|---|---|
| Create a click / follow a redirect | anyone, authenticated or not | `@Public()` + `OptionalJwtAuthGuard`; a `tripId` on the click additionally requires the caller to be a current accepted participant (`VIEW_TRIP`) of that trip |
| List/summarize conversions, ingest conversion evidence | `ADMIN` only | `@Roles(Role.ADMIN)` on every `/admin/affiliate/**` route - live-proven: a trip OWNER/EDITOR/VIEWER token, even for a trip the click itself references, gets the same `403` as an unrelated `USER` (spec section 49, `affiliate.e2e-spec.ts`'s authorization-matrix block) |

TRIP ROLE != COMMERCIAL REPORTING ACCESS, the converse of G09's rule: holding any role (including
OWNER) on the trip a click happens to reference proves nothing about the right to read/ingest that
provider's commission data - the two are governed by completely separate gates (`VIEW_TRIP` for the
click's trip-context check; `Role.ADMIN` for every commercial-reporting route), and neither gate
can satisfy the other.

## G11 extension: public search and map are read-only projections with a structural privacy boundary

`GET /v1/search`, `GET /v1/search/suggestions` and `GET /v1/map/features` are `@Public()` (no authentication, no
identity captured, no per-user search history). The boundary is structural, not a request-time filter:

| Concern | Enforced by |
|---|---|
| Only public/published content is searchable | `search-projection.loaders.ts` is an explicit allowlist of public tables and per-kind eligibility rules; a non-public entity has NO `SearchDocument` (unpublish deletes it, so there is no ghost result). Unit-tested to read no Trip*/Affiliate*/Ingestion*/Provider*/Expense*/Location tables |
| Private domains cannot be enumerated or guessed | Trip, TripMember, TripInvitation, TripLocationSharing, TripMemberLocation (G07/G08), TripExpense/TripSettlement (G09), AffiliateSession/Click/Conversion (G10) and IngestionCandidate (G06.5) have no projection kind; `types=TRIP...` / `kinds=TRIP_MEMBER_LOCATION` are `400`; live-proven with guessed ids and known private rows (`search-map.e2e-spec.ts`) |
| No unpublished/admin flags on public routes | `forbidNonWhitelisted` rejects `includeUnpublished`, `status`, `sort`, `orderBy` with `400` |
| Provider data is not canonical knowledge | provider entities (G05) are not projected at all; the map never reads them |
| Community content is never verified knowledge | `trustClass = COMMUNITY`, ranked after non-community results of the same tier; only `VISIBLE/LIMITED/LOCKED` stories, titles only |
| Commercial signals are not ranking inputs | the projection has no affiliate/commission/click/conversion column (asserted against `information_schema`); search/map never create an `AffiliateClick` |
| Abuse resistance | search is throttled (default 60/min/IP, `SEARCH_RATE_LIMIT_MAX`), limits on `q`/`types`/`limit`/filters, all values bound parameters, tsquery built from sanitized tokens, no user-controlled ORDER BY |

No new `TripCapability` and no new platform role were added.

## G12 certification: every route classified, enforced by an automated test

G12 adds no route and no role. `apps/api/test/g12-certification.e2e-spec.ts` now derives the class of
every runtime route from its real guard metadata and fails if the result drifts from
`docs/backend/g12-evidence/route-inventory.json`: 363 operations = 91 PUBLIC, 37 AUTHENTICATED,
35 TRIP_CAPABILITY (`/trips/:id/**`, `/trip-invitations/**`, authorized in-service), 199 ADMIN
(any `@Roles()` without `USER` — staff and admin roles), 1 PROVIDER_CALLBACK
(`GET /auth/google/callback`), 0 INTERNAL. Live sweeps prove anonymous → 401 on every non-public
route and a plain USER → 403 on every role-gated route; a trip-role holder has no admin, commercial,
search-admin or audit access. IDOR: unrelated users, pending invitees and removed members get
`403 TRIP_PERMISSION_DENIED` on every trip route with known ids; sub-resource ids of one trip are
`404` through another trip's path.

Behavioural changes in G12 (no new capability):
- `GET /v1/affiliate/r/:token` re-evaluates the G02 gate on every redirect, so a token issued before a
  provider disable / license revocation is refused on its next use (was: honoured for its TTL).
- `POST /v1/trips/:id/transfer-ownership` locks the target TripMember row before the Trip row (the
  order `remove`/`updateRole`/`leave` and G09 already use) — authorization unchanged, deadlock removed.
- `GET /v1/media/:id` was always `@Public()`; its OpenAPI entry no longer claims bearer auth.
- Known P3: `POST /v1/trips/:id/leave` checks the version before membership, so a non-member gets 409
  (stale version) or 404 (not a member) — self-scoped, no mutation, but it reveals the trip's version
  counter. Left unchanged because an accepted G07 unit test asserts this order.

## Separation of duties (spec Phase 02 section 20)

Two rules are enforced in *service* code, not just route-level `@Roles()`, because they depend on runtime data (who created vs. who is approving), which a static decorator cannot express:

1. **`HistoricalFact` publication** (`FactsService.setEditorialStatus`, unit-tested in `facts.service.spec.ts`): a fact with `sensitivity != NORMAL` cannot be moved to `PUBLISHED` by the same user who created it, even if that user holds `HISTORIAN_REVIEWER` or `ADMIN`. A different `HISTORIAN_REVIEWER`/`ADMIN` must approve it. A non-sensitive fact still requires >=1 `VERIFIED` citation to publish, but has no creator/reviewer separation requirement.
2. **`CommunityStory` verification state** (`CommunityService`, unit-tested in `community.service.spec.ts`): the story's own author can only move it through `PERSONAL_MEMORY -> COMMUNITY_SUBMISSION -> SOURCE_ATTACHED` (`PATCH .../verification-state`, no role required beyond being the author). Reaching `UNDER_REVIEW` or `VERIFIED_CONTRIBUTION` requires the *separate*, role-gated `PATCH .../review-verification-state` endpoint (`HISTORIAN_REVIEWER`/`EDITOR`/`ADMIN`) - an author calling the author-only endpoint with a review-only state is rejected outright, regardless of their own roles.
3. **`HistoricalFact` FACT_REVIEW completion and retraction** (Phase 04, `FactsService.setEditorialStatus`, unit-tested): moving a fact from `FACT_REVIEW` to `EDITORIAL_REVIEW` requires `HISTORIAN_REVIEWER`/`ADMIN` regardless of who created it (this is the historical-accuracy checkpoint itself). Moving a `PUBLISHED` fact to `RETRACTED` requires `HISTORIAN_REVIEWER`/`ADMIN` and a documented `notes` reason - never a bare `CONTRIBUTOR`/`EDITOR` action, and never silent.
4. **`Story` SOURCE_CHECK completion** (Phase 06, `StoriesService.setEditorialStatus`, unit-tested in `stories.service.spec.ts`): moving a Story from `SOURCE_CHECK` to `EDITORIAL_REVIEW` requires `HISTORIAN_REVIEWER`/`ADMIN` *only when the Story links at least one `HistoricalFact`* (`StoryFact`) - a Story making no factual claims can be moved through review by any `EDITOR`. Publication itself additionally refuses (regardless of role) if any linked Fact is not `PUBLISHED` (`STORY_FACT_NOT_PUBLISHABLE`) - see `docs/backend/EDITORIAL_CONTENT.md` section 6.
5. **`CommunityStory`/`Comment` moderation and review, extended (Phase 08)**: `CommunityService.setReviewVerificationState` and `CommunityService.setModerationStatus` both refuse when `actorId === story.authorId`, and `CommentsService.moderate` refuses when `actorId === comment.authorId` - regardless of the actor's roles (unit-tested in `community.service.spec.ts`/`comments.service.spec.ts`). Holding `HISTORIAN_REVIEWER`/`EDITOR`/`MODERATOR`/`ADMIN` never overrides being an interested party in your *own* submission - the same principle as rule 1 above, extended from Fact review to community review/moderation. The new unified `POST /admin/moderation/actions` entrypoint (section below) delegates to these same two methods, so it inherits this refusal automatically rather than needing its own copy of the check.
6. **`Contribution` review/rights-review/cataloguing (Phase 09)**: every reviewer/admin method on `ContributionsService` (`submitReview`, `setRightsReview`, `setProvenanceConfidence`, `setSensitivity`, `catalogueSource`, `catalogueDocument`, `catalogueMedia`) refuses when `actorId === contribution.contributorId` (`CONTRIBUTION_SELF_REVIEW_FORBIDDEN`), regardless of role - unit-tested in `contributions.service.spec.ts`. Completing `HISTORICAL_REVIEW -> ACCEPTED` additionally requires `HISTORIAN_REVIEWER`/`ADMIN` specifically (the historical-accuracy checkpoint, mirroring rule 3 above), and every catalogue action requires `HISTORIAN_REVIEWER`/`ADMIN` and `rightsReviewState = APPROVED_FOR_CATALOGUE` - a plain `EDITOR` can triage/provenance-review but never promote material into the trust layer. See `docs/backend/CONTRIBUTION_ARCHITECTURE.md` section 16.
7. **`IngestionCandidate` approval for sensitive types (G06.5)**: `IngestionCandidatesService.approve` refuses (`INGESTION_CANDIDATE_SELF_APPROVAL_FORBIDDEN`) when the approving actor is the same user who triggered the `IngestionRun` that produced a `PERSON`/`EVENT`/`HISTORICAL_FACT` candidate, regardless of role - mirrors rule 1's `HistoricalFact` separation-of-duties rule, extended to the ingestion pipeline's equivalent case. `PLACE`/`MEDIA`/`COUNTRY`/`REGION`/`CITY`/`DESTINATION` candidates carry no such restriction (same tier as ordinary geography/place content editing).

## Privilege-escalation prevention (spec Phase 02 section 21)

- **No request DTO anywhere accepts a `roles` or `status` field for self-registration.** `RegisterDto` has exactly `email`/`password`/`displayName`; every new account is hardcoded server-side to `roles: [Role.USER]` (`AuthService.register`). There is no mass-assignment path from client JSON to elevated privilege.
- **`PATCH /admin/users/:id/roles` and `PATCH /admin/users/:id/status` both refuse `id === caller.id`** (`UsersService.setRoles`/`setStatus`, unit-tested) - an admin cannot use these endpoints to change their own roles or suspend/disable themselves, closing off both an accidental-lockout footgun and a scenario where a compromised admin session tries to entrench itself by stripping other admins while leaving itself untouched through a self-referential call. (Removing *another* admin's `ADMIN` role is still possible by design - that is ordinary admin-to-admin account management, not self-escalation.)
- Suspending or disabling a user (`UsersService.setStatus`) immediately calls `AuthService.revokeAllSessions`, so the change is not just a flag some other request might not notice for up to 15 minutes - see `docs/backend/AUTH.md` section 3.

## Regenerating this table

```bash
grep -rn "@Roles(" apps/api/src/modules --include=*.controller.ts -A1
```

If this table and that command's output ever disagree, the command is right and this file needs updating.
