# Dau Viet - Backend Handoff

Audience: the frontend engineer(s)/agent (Codex) building web, mobile (Expo), and Admin/CMS UI against this API. This document is the contract - if something here is wrong or incomplete, treat it as a backend bug, not something to work around in the frontend.

## 1. Environment

**Prerequisites:** Node >=20, pnpm, Docker (Docker Compose).

```bash
pnpm install
cp .env.example .env
pnpm infra:up               # docker compose: postgres+postgis, redis, minio, mailhog
pnpm db:migrate:deploy       # applies prisma/migrations/*
pnpm db:generate
pnpm db:seed                 # golden dataset + dev accounts
pnpm api:dev                 # NestJS on :3000, prefix /v1, Swagger at /docs
```

Env vars are documented in `/.env.example` (copied to `apps/api` implicitly - the API reads the same variables via `@nestjs/config`). Key ones: `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` (min 32 chars, validated at boot), `S3_*` (MinIO locally), `SMTP_*` (Mailhog locally), `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (optional - Google auth degrades gracefully without them, see section 7).

Migrations live in `prisma/migrations/`. The first (`20260903000000_init`) is the full schema DDL generated offline via `prisma migrate diff` (this repo's sandbox could not reach a live Postgres - see the freeze report). The second (`20260903000001_search_and_spatial_indexes`) adds hand-written PostGIS GiST indexes and pg_trgm GIN indexes that Prisma cannot express natively. Both are ordinary migrations - `prisma migrate deploy` applies them normally against a real database.

## 2. Architecture

**Module inventory** (`apps/api/src/modules/*`): `auth`, `users`, `places`, `people`, `events`, `eras`, `dynasties`, `territories`, `facts`, `sources`, `citations`, `media`, `stories`, `journeys`, `map`, `timeline`, `search`, `comments`, `bookmarks`, `reports`, `community`, `contributions`, `audit`, `mailer`. Each is a self-contained Nest module (service + controller + DTOs) - there is no god-module.

**Database:** PostgreSQL + PostGIS, one schema, Prisma as the query layer. Full model list in `prisma/schema.prisma` (extensively commented with the reasoning for each design choice). Key points a frontend engineer needs:

- **Translations, not `nameVi`/`nameEn` columns.** Every browsable entity (`Place`, `Person`, `HistoricalEvent`, `HistoricalEra`, `Dynasty`, `Territory`, `HistoricalFact`, `Story`, `Journey`, `CommunityStory`) has a `*Translation` table keyed by `(entityId, locale)`. The entity itself has a stable `canonicalSlug` (derived from the Vietnamese name at creation, used in URLs, never changes) plus a `PublicationStatus`/`FactEditorialStatus`. Translations have their own `slug` per locale, `status` (`DRAFT`/`AI_ASSISTED`/`HUMAN_REVIEWED`/`PUBLISHED`) and `method` (`ORIGINAL`/`HUMAN`/`AI_ASSISTED`).
- **High-integrity joins are real tables**, not polymorphic columns: `FactPlace`/`FactPerson`/`FactEvent`/`FactEra`/`FactTerritory`, `EventPlace`/`EventPerson`, `PersonDynasty`, `StoryPlace`/`StoryPerson`/`StoryEvent`/`StoryCitation`, `CommunityStoryPlace`/`Person`/`Event`/`Era`, `JourneyStop`.
- **Lower-integrity, cross-cutting attachments use a validated `entityType + entityId` pattern** (an `EntityKind` enum): `Comment`, `Bookmark`, `Report`, `EntityMedia` (gallery attachments), `EntityAlias`. This is the explicit exception the spec allows for non-critical relations - application code validates `entityType`, there is no DB-level FK.
- **Historical dates are never a single `DateTime`.** Every dated entity carries `dateStart`/`dateEnd`/`datePrecision` (`EXACT`/`MONTH`/`YEAR`/`APPROXIMATE_YEAR`/`RANGE`/`UNKNOWN`)/`dateLabel`. The API always returns all four - never assume `dateStart` alone is meaningful without checking `datePrecision`.
- **Trust layer:** `HistoricalFact` -> `Citation` -> `Source`. A fact cannot reach `FactEditorialStatus.PUBLISHED` without at least one `Citation` with `verificationState = VERIFIED` (enforced in `FactsService.setEditorialStatus`, unit-tested). A fact with `sensitivity != NORMAL` additionally requires the approving user to hold `HISTORIAN_REVIEWER`/`ADMIN` and to **not** be the fact's own creator (separation of duties, also unit-tested).
- **Roles are a Postgres native array on `User.roles`** (`Role[]`), not a join table. Enforced server-side by a global `RolesGuard` + `@Roles(...)` decorator - a hidden frontend button is never the only protection. Full role-by-endpoint table: `docs/backend/AUTHORIZATION_MATRIX.md`.
- **PostGIS columns** (`Place.location` Point, `Place.geometry`, `Territory.geometry`, `Journey.routeGeometry`) are `Unsupported()` in Prisma - all reads/writes for these go through raw parameterized SQL in the relevant service (`PlacesService.setLocation`, `TerritoriesService.setGeometry`, `MapService.getFeatures`).

## 3. API

- Swagger/OpenAPI: `GET /docs` (also `GET /docs-json` for the raw spec) once the API is running.
- All routes are under `/v1`.
- **Response envelope:** every successful response is `{ success: true, data: <payload>, meta?: {...} }`. Every error is `{ success: false, error: { code, message, details? }, path, timestamp }` (see `AllExceptionsFilter`). Codes: `VALIDATION_ERROR` (400), `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409), `RATE_LIMITED` (429), `INTERNAL_ERROR` (500).
- **Auth:** Bearer JWT access token (short-lived, `JWT_ACCESS_TTL`, default 15m, payload is just `{sub, sid}` - re-validated against the DB session/status on every request) + opaque refresh token (`JWT_REFRESH_TTL`, default 30d, single-use/rotated on every `/auth/refresh` call with reuse detection, stored hashed server-side as a `Session` row so devices can be listed/revoked individually). Every endpoint requires auth by default (`JwtAuthGuard` is global) - endpoints marked `@Public()` in the controller are the exception; check the endpoint inventory below. **Full write-up, including the web-cookie vs. mobile-token-body contract and CSRF: `docs/backend/AUTH.md`.**
- **Pagination:** cursor-based (`?cursor=&limit=`) for feeds/comments/lists that can grow unbounded, returning `{ items, nextCursor, hasMore }`. Small bounded admin lists may just return an array.
- **Locale:** `?locale=vi|en` (default `vi`, the canonical language). Every translated response includes `meta: { requestedLocale, resolvedLocale, fallbackApplied }` - **always check `fallbackApplied`** before presenting a translation as being in the language the user asked for. Fallback order: requested locale -> `vi` -> any available translation -> `null`.

### Endpoint inventory (all under `/v1`, `@Public()` noted)

| Area | Endpoints |
|---|---|
| Auth | `POST auth/register` (public), `POST auth/login` (public), `POST auth/refresh` (public), `POST auth/logout` (public), `POST auth/email-verification/resend` (public), `POST auth/verify-email` (public), `POST auth/request-password-reset` (public), `POST auth/reset-password` (public), `POST auth/change-password`, `GET auth/sessions`, `DELETE auth/sessions/:id`, `POST auth/sessions/revoke-all`, `GET auth/google` (public), `GET auth/google/callback` (public, UNVERIFIED_EXTERNAL_CREDENTIAL - see AUTH.md) |
| Users | `GET users/me`, `PATCH users/me`, `GET profiles/:id` (public, safe subset only), `PATCH admin/users/:id/roles` (ADMIN, never own id), `PATCH admin/users/:id/status` (ADMIN, never own id, revokes sessions on suspend/disable) |
| Places | `GET places` (public), `GET places/:slug` (public), `GET places/:slug/timeline` (public), `GET places/:slug/sources` (public), `GET places/:slug/media` (public), `GET places/:slug/community` (public), `GET places/:slug/comments` (public), `POST places/:slug/visits`, `POST places` (EDITOR+), `PATCH places/:id` (EDITOR+), `PATCH places/:id/publication-status` (EDITOR/HISTORIAN_REVIEWER/ADMIN) |
| People | `GET people` (public), `GET people/:slug` (public), `GET people/:slug/comments` (public), `POST people` (EDITOR+), `PATCH people/:id/publication-status` |
| Events | `GET events` (public), `GET events/:slug` (public), `GET events/:slug/comments` (public), `POST events` (EDITOR+), `PATCH events/:id/publication-status` |
| Eras | `GET eras` (public), `GET eras/:slug` (public), `POST eras` (EDITOR+) |
| Dynasties | `GET dynasties` (public), `GET dynasties/:slug` (public), `POST dynasties` (EDITOR+) |
| Territories | `GET territories` (public), `GET territories/:slug` (public), `POST territories` (EDITOR/HISTORIAN_REVIEWER/ADMIN) |
| Facts (editorial only, no public read API - facts surface via place/event `sources`/timeline projections) | `GET facts`, `GET facts/:id`, `POST facts`, `POST facts/:id/{places,people,events,eras,territories}/:entityId`, `PATCH facts/:id/editorial-status` (all CONTRIBUTOR+) |
| Sources | `GET sources` (public), `GET sources/:id` (public, documents redacted per `accessPolicy`), `GET sources/:id/comments` (public), `POST sources` (CONTRIBUTOR+), `POST sources/:id/documents` (EDITOR+) |
| Citations | `POST citations` (CONTRIBUTOR+), `PATCH citations/:id/verify` (HISTORIAN_REVIEWER/ADMIN), `PATCH citations/:id/dispute` (HISTORIAN_REVIEWER/ADMIN) |
| Media | `GET media/:id` (public), `POST media/uploads` (presigned URL, CONTRIBUTOR+), `POST media` (register after upload, CONTRIBUTOR+), `POST media/attach` (EDITOR+) |
| Stories | `GET stories` (public), `GET stories/:slug` (public), `GET stories/:slug/comments` (public), `POST stories` + link/status endpoints (EDITOR+) |
| Journeys | `GET journeys` (public), `GET journeys/:slug` (public), `GET journeys/:slug/comments` (public), `POST journeys` + stops/status endpoints (EDITOR+) |
| Map | `GET map/features` (public, GeoJSON) |
| Timeline | `GET timeline` (public) |
| Search | `GET search` (public) |
| Comments | `POST comments`, `POST comments/:id/vote`, `DELETE comments/:id`, `PATCH comments/:id/moderate` (MODERATOR/ADMIN) |
| Bookmarks | `GET/POST/DELETE bookmarks` |
| Reports | `POST reports`, `GET reports/admin` (MODERATOR/ADMIN), `PATCH reports/:id/resolve` (MODERATOR/ADMIN) |
| Community | `GET community/stories` (public), `GET community/stories/:slug` (public), `GET .../comments` (public), `POST community/stories` + link endpoints, `PATCH .../verification-state` (author, restricted to pre-review states), `PATCH .../review-verification-state` (EDITOR/HISTORIAN_REVIEWER/ADMIN only), `PATCH .../moderation-status` (MODERATOR/ADMIN) |
| Contributions | `POST contributions`, `GET contributions/mine`, `GET contributions/:id`, `GET contributions` (EDITOR/HISTORIAN_REVIEWER/ADMIN), `PATCH contributions/:id/advance` (EDITOR/HISTORIAN_REVIEWER/ADMIN) |
| Admin | `GET admin/audit` (ADMIN/MODERATOR/HISTORIAN_REVIEWER) |
| Health | `GET health` (public) |

## 4. Map

`GET /v1/map/features?bbox=minLng,minLat,maxLng,maxLat&year=&types=&zoom=&locale=` returns a GeoJSON `FeatureCollection`. `bbox` is required (the endpoint refuses to return an unscoped dump of every place). Two feature sources are merged:

- Published `Place` points intersecting the bbox (`properties: { entityType: 'PLACE', id, slug, placeType, historicalImportance, name }`), capped at 500, ordered by `historicalImportance`.
- If `year` is supplied, `Territory` polygons intersecting the bbox whose `validFrom`/`validTo` cover that year (`properties: { entityType: 'TERRITORY', ... }`). **No Territory geometry is seeded in the golden dataset** - the model and query path are implemented and tested, but no historical boundary polygons were fabricated (see section 9).

`types` filters Place results to a comma-separated list of `PlaceType` values.

## 5. Timeline

`GET /v1/timeline?from=&to=&eraId=&placeId=&personId=&minImportance=&locale=` returns a flat array mixing `{ kind: 'ERA', ... }` and `{ kind: 'EVENT', ... }` items, each carrying `dateStart`/`dateEnd`/`datePrecision`/`dateLabel` - never assume a bare year integer.

## 6. Search

`GET /v1/search?q=&types=&locale=` - PostgreSQL-native (`pg_trgm` similarity), no external search cluster for V1 (spec-mandated). Searches `Place`, `Person`, `HistoricalEvent`, `HistoricalEra`, `Story`, `Journey`, `Source`, `CommunityStory` translations plus `EntityAlias` (so "Hue" matches "Hue" via the alias attached to the Place whose canonical Vietnamese name is "Co do Hue"). Ranking = trigram similarity + a small importance bonus for Place/Event, with a deliberate small penalty for `CommunityStory` so community content cannot outrank major historical entities on relevance alone. The per-entity-type query method in `SearchService` is the seam an OpenSearch/Elasticsearch replacement slots into later without touching controllers or DTOs.

## 7. Auth details

Full architecture: **`docs/backend/AUTH.md`**. Summary: Argon2id password hashing (not bcrypt - switched in Phase 02), normalized-email dedup, opaque single-use refresh tokens with rotation + reuse detection (a replayed already-used refresh token revokes every session on the account), session-bound access tokens (revoking a session invalidates its access tokens immediately, not just at their natural expiry), and one auth contract that serves both web (`X-Client-Platform: web` -> httpOnly refresh cookie + CSRF double-submit cookie) and mobile/API clients (token-in-JSON-body, the default). Google OAuth2 (`passport-google-oauth20`) and password auth share the same `AuthIdentity` table keyed by `(userId, provider)`, so a Google login on an email that already has a password account links to the same `User`. Google auth is optional at boot (no crash without credentials) but **was never exercised against a real Google app in this build** - treat it as `UNVERIFIED_EXTERNAL_CREDENTIAL` until manually verified.

## 8. Community

`CommunityStory` is a separate knowledge layer from `Story`/`HistoricalFact` by design. Its `verificationState` has two independently-gated halves: an author can move their own story through `PERSONAL_MEMORY -> COMMUNITY_SUBMISSION -> SOURCE_ATTACHED` via `PATCH /community/stories/:id/verification-state`, but **only** `EDITOR`/`HISTORIAN_REVIEWER`/`ADMIN` can set `UNDER_REVIEW` or `VERIFIED_CONTRIBUTION`, via the separate `PATCH .../review-verification-state` endpoint (unit-tested: an author calling the wrong endpoint gets a 403, never a silent auto-verify).

Comments/votes/bookmarks/reports are generic (`EntityKind` + id) and shared across every content type listed in section 31 of the spec (Place, Person, Event, Story, CommunityStory, Journey, Source).

## 9. Media

Upload flow: `POST /media/uploads` (role-gated) returns a presigned S3/MinIO PUT URL + `storageKey`; the client PUTs the file directly to that URL; then `POST /media` registers the `MediaAsset` row with metadata. `accessPolicy` (`PUBLIC`/`PREVIEW_ONLY`/`METADATA_ONLY`/`RESTRICTED`) gates whether `GET /media/:id` / `GET /sources/:id` returns a usable URL or redacted metadata. AI-generated/reconstructed media (`isAiGenerated: true`) is rejected by the API unless `aiDisclosure` is also provided - it can never masquerade as archival material. A BullMQ `media-processing` queue and worker exist as the extension point for thumbnail/derivative generation, but no actual image-processing pipeline is implemented (see Known limitations).

## 10. Admin

There is no separate "Admin API" module - every entity module exposes the role-gated mutation endpoints an Admin/CMS UI needs directly (create/publish/moderate/review), all listed in the endpoint inventory above and enforced by the same global `RolesGuard`. `GET /admin/audit?entityType=&entityId=` exposes the append-only audit trail (every fact/citation/moderation/role change is logged via `AuditService`, which has no update/delete method).

## 11. Test accounts (seed, `DevPassword123!` for all - dev/local only, never use in production)

`admin@dauviet.vn` (ADMIN), `editor@dauviet.vn` (EDITOR), `historian@dauviet.vn` (HISTORIAN_REVIEWER), `moderator@dauviet.vn` (MODERATOR), `contributor@dauviet.vn` (CONTRIBUTOR), `user@dauviet.vn` (USER).

## 12. Golden Dataset (`prisma/seed.ts`)

**Entities seeded and PUBLISHED:** 12 Places (Hoang Thanh Thang Long, Van Mieu, Co Loa, Hoa Lu, Co do Hue, My Son, Hoi An, Dien Bien Phu, Dia dao Cu Chi, Dinh Doc Lap, Hoang Sa, Truong Sa - the last two as real `ARCHIPELAGO` Place rows with approximate real-world coordinates, not hard-coded map labels), 8 People, 8 Events, 6 Eras, 3 Dynasties, cross-links between them (EventPlace/EventPerson/PersonDynasty), a few `EntityAlias` rows for cross-language search (e.g. "Hue"/"Hoi An" romanizations), and one editorial `Story` (a welcome/product page, not a historical claim).

**What is verified vs. draft:** every seeded entity's `summary` field is a short, uncontroversial, widely-known descriptor (name/role/dates) - the kind of line that would appear in a gazetteer, not a contestable claim. The `description` (long-form narrative) field is deliberately left empty for every entity - **no historical narrative was generated from model memory and stored as fact.** Two `HistoricalFact` rows are seeded to exercise the trust-layer schema end-to-end (linked to the 1010 capital move and the 1954 Dien Bien Phu victory) but both are left in `DRAFT` editorial status with **zero citations** - they cannot reach `PUBLISHED` until a real editor attaches and verifies a real `Source`/`Citation`. No Territory geometry, no Source/Citation records, and no `description` narrative were fabricated anywhere in this seed.

## 13. Known limitations (be explicit, not hidden)

- **No live database validation in this build session.** Docker Desktop could not start in this sandbox (WSL2 unresponsive - see the freeze report for the exact error). The schema was validated via `prisma validate`/`prisma format`/`prisma migrate diff` (offline SQL generation) and the Prisma Client generates cleanly, but no migration, seed, or query has actually been run against a live Postgres+PostGIS instance. **Run `pnpm infra:up && pnpm db:migrate:deploy && pnpm db:seed` and re-verify before relying on this in production.**
- Unit tests cover the trust-layer integrity rules (fact publish gate, citation existence, community verification separation, locale fallback) and, as of Phase 02, the full auth/session/RBAC layer (password hashing, generic-failure login, refresh rotation + reuse detection, session revocation scoping, email-verification/password-reset token lifecycle, account-suspension enforcement, privilege-escalation prevention) - all with mocked Prisma, 62/62 passing without a database. Integration/e2e tests (`apps/api/test/health.e2e-spec.ts`) require a live database and were not executed here.
- **Google OAuth is `UNVERIFIED_EXTERNAL_CREDENTIAL`** - implemented, but never exercised against a real Google Cloud OAuth app (no credentials configured, no live network validation possible in this sandbox). No native-app (deep-link) Google flow exists, only the browser-redirect one. See `docs/backend/AUTH.md` section 11.
- No thumbnail/derivative image-processing pipeline - `MediaProcessor` (BullMQ) is a documented no-op extension point.
- No Territory geometry seeded (no fabricated historical boundaries).
- `packages/domain`, `packages/api-client`, `packages/types`, `packages/validation`, `packages/i18n`, `packages/config` from the target monorepo tree were not created - Swagger/OpenAPI (`/docs-json`) is the authoritative contract for frontend codegen instead of hand-maintained shared packages. Generate a typed client from it (e.g. `openapi-typescript` or `orval`) rather than depending on Prisma types directly.
- `apps/web`, `apps/mobile`, `apps/admin` are intentionally not scaffolded - that is Codex's frontend scope per the master directive.
- Email delivery (verification/password reset) uses Mailhog in dev (`http://localhost:8025`) - no production SMTP/provider is wired up.
- Rate limiting (`ThrottlerGuard`) is now actually applied globally (Phase 01 had it configured but never wired to `APP_GUARD` - fixed in Phase 02) with tighter per-route overrides on register/login/refresh/verification-resend/password-reset/change-password (see `docs/backend/AUTH.md` section 12). It tracks by IP only, not per-account - acceptable for v1 but worth revisiting if shared-IP/NAT traffic causes false positives.
- Production `CORS_ORIGINS` must be set explicitly to the real web/admin origins before launch - the current default (empty -> reflects request Origin) is a development convenience that must not ship as-is, especially now that cookie-mode auth uses `credentials: true`.
- Argon2id's native binding (`argon2` npm package) was confirmed working in this sandbox (`argon2.hash`/`argon2.verify` round-trip tested directly via `node -e`), but the full app was never booted against a live DB to confirm end-to-end - see the live-verification caveat above.
