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
| Dynasties | `POST /dynasties` | `EDITOR`, `ADMIN` |
| Territories | `POST /territories` | `EDITOR`, `HISTORIAN_REVIEWER`, `ADMIN` |
| Facts | every `/facts/**` route (create, link, editorial-status) | `CONTRIBUTOR`, `EDITOR`, `HISTORIAN_REVIEWER`, `ADMIN` (module-level guard; see separation-of-duties note for the extra in-service check on publishing) |
| Sources | `POST /sources` | `CONTRIBUTOR`, `EDITOR`, `HISTORIAN_REVIEWER`, `ADMIN` |
| Sources | `POST /sources/:id/documents` | `EDITOR`, `HISTORIAN_REVIEWER`, `ADMIN` |
| Citations | `POST /citations` | `CONTRIBUTOR`, `EDITOR`, `HISTORIAN_REVIEWER`, `ADMIN` |
| Citations | `PATCH /citations/:id/verify`, `PATCH /citations/:id/dispute` | `HISTORIAN_REVIEWER`, `ADMIN` only |
| Media | `POST /media/uploads`, `POST /media` | `CONTRIBUTOR`, `EDITOR`, `HISTORIAN_REVIEWER`, `ADMIN` |
| Media | `POST /media/attach` | `EDITOR`, `HISTORIAN_REVIEWER`, `ADMIN` |
| Stories | `POST /stories` and all link/status sub-routes | `EDITOR`, `ADMIN` |
| Journeys | `POST /journeys` and stop/status sub-routes | `EDITOR`, `ADMIN` |
| Comments | `PATCH /comments/:id/moderate` | `MODERATOR`, `ADMIN` |
| Reports | `GET /reports/admin`, `PATCH /reports/:id/resolve` | `MODERATOR`, `ADMIN` |
| Community | `PATCH /community/stories/:id/review-verification-state` | `HISTORIAN_REVIEWER`, `EDITOR`, `ADMIN` (never the story's own author via this route - see below) |
| Community | `PATCH /community/stories/:id/moderation-status` | `MODERATOR`, `ADMIN` |
| Contributions | `GET /contributions`, `PATCH /contributions/:id/advance` | `EDITOR`, `HISTORIAN_REVIEWER`, `ADMIN` |
| Admin/Audit | `GET /admin/audit` | `ADMIN`, `MODERATOR`, `HISTORIAN_REVIEWER` |

Every route not listed above that still requires `@ApiBearerAuth()` (e.g. `GET /auth/sessions`, `POST /comments`, `POST /bookmarks`, `POST /places/:slug/visits`) requires only a valid session - any authenticated role. Every route not listed and marked `@Public()` (all `GET` list/detail endpoints for Places/People/Events/Eras/Dynasties/Territories/Stories/Journeys/Sources/Community, `/map/features`, `/timeline`, `/search`, `/health`) requires no authentication at all.

## Separation of duties (spec Phase 02 section 20)

Two rules are enforced in *service* code, not just route-level `@Roles()`, because they depend on runtime data (who created vs. who is approving), which a static decorator cannot express:

1. **`HistoricalFact` publication** (`FactsService.setEditorialStatus`, unit-tested in `facts.service.spec.ts`): a fact with `sensitivity != NORMAL` cannot be moved to `PUBLISHED` by the same user who created it, even if that user holds `HISTORIAN_REVIEWER` or `ADMIN`. A different `HISTORIAN_REVIEWER`/`ADMIN` must approve it. A non-sensitive fact still requires >=1 `VERIFIED` citation to publish, but has no creator/reviewer separation requirement.
2. **`CommunityStory` verification state** (`CommunityService`, unit-tested in `community.service.spec.ts`): the story's own author can only move it through `PERSONAL_MEMORY -> COMMUNITY_SUBMISSION -> SOURCE_ATTACHED` (`PATCH .../verification-state`, no role required beyond being the author). Reaching `UNDER_REVIEW` or `VERIFIED_CONTRIBUTION` requires the *separate*, role-gated `PATCH .../review-verification-state` endpoint (`HISTORIAN_REVIEWER`/`EDITOR`/`ADMIN`) - an author calling the author-only endpoint with a review-only state is rejected outright, regardless of their own roles.

## Privilege-escalation prevention (spec Phase 02 section 21)

- **No request DTO anywhere accepts a `roles` or `status` field for self-registration.** `RegisterDto` has exactly `email`/`password`/`displayName`; every new account is hardcoded server-side to `roles: [Role.USER]` (`AuthService.register`). There is no mass-assignment path from client JSON to elevated privilege.
- **`PATCH /admin/users/:id/roles` and `PATCH /admin/users/:id/status` both refuse `id === caller.id`** (`UsersService.setRoles`/`setStatus`, unit-tested) - an admin cannot use these endpoints to change their own roles or suspend/disable themselves, closing off both an accidental-lockout footgun and a scenario where a compromised admin session tries to entrench itself by stripping other admins while leaving itself untouched through a self-referential call. (Removing *another* admin's `ADMIN` role is still possible by design - that is ordinary admin-to-admin account management, not self-escalation.)
- Suspending or disabling a user (`UsersService.setStatus`) immediately calls `AuthService.revokeAllSessions`, so the change is not just a flag some other request might not notice for up to 15 minutes - see `docs/backend/AUTH.md` section 3.

## Regenerating this table

```bash
grep -rn "@Roles(" apps/api/src/modules --include=*.controller.ts -A1
```

If this table and that command's output ever disagree, the command is right and this file needs updating.
