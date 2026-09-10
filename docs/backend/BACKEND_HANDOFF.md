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

Env vars are documented in `/.env.example` (root) and `apps/api/.env.example` (a pointer to the root file). Key ones: `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` (min 32 chars, validated at boot), `S3_*` (MinIO locally), `SMTP_*` (Mailhog locally), `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (optional - Google auth degrades gracefully without them, see section 7).

### 1a. Environment variable resolution (post-G03 operational hardening)

**Two separate `.env` files exist in this repo and they are consulted by two different process boundaries - never conflate them:**

- **Repository-root `.env`** (`/.env`) - read by the **Prisma CLI only** (`prisma migrate`/`prisma generate`/`prisma db seed`, i.e. the `pnpm db:*` scripts in the root `package.json`), always invoked with the repo root as the working directory. This is also where any *other* project's tooling on the same machine keeps its own root `.env` - never assume this file's `DATABASE_URL`/`REDIS_URL` point at this project's own database.
- **`apps/api/.env`** - read by the **compiled/dev API process itself** (`pnpm api:dev`, `nest start`, `node dist/main.js`, and the OpenAPI generation script). This is the only `.env` file the running server ever consults.

**Why this distinction is load-bearing (real G03 live-QA defect, now closed):** `@prisma/client`'s own generated runtime does its own `.env` auto-discovery, resolved relative to the directory `prisma/schema.prisma` lives in - the **repository root** - as an import-time side effect the moment `PrismaModule` is imported. Because `AppModule` imports `PrismaModule` *before* the `@Module({ imports: [ConfigModule.forRoot(...), ...] })` decorator itself runs (which is what triggers `ConfigModule`'s own, separate, cwd-relative `.env` load), Prisma's root-`.env` read would win the race and silently set `DATABASE_URL`/`REDIS_URL` from the **wrong** file before `apps/api/.env` ever got a chance - neither loader overwrites an already-set `process.env` value, so whichever runs first wins for the life of the process. In one real session this pointed a real server boot at an unrelated project's Postgres instance with the wrong credentials.

**The fix:** `apps/api/src/config/load-env.ts` is imported as the literal first line of every API entrypoint (`main.ts`, `generate-openapi.ts`) - before `AppModule` or anything that transitively imports `@prisma/client`. It reads **only** `apps/api/.env` and applies each value to `process.env` **without ever overwriting a key that is already set**. This gives one deterministic precedence contract, highest priority first:

1. **A value already present in `process.env` when the Node process starts** - a real shell export, a Docker/Compose `environment:` entry, or a production/CI-injected secret. **Always authoritative, never overwritten by any file.**
2. **`apps/api/.env`**, applied by `load-env.ts`, for whichever keys step 1 didn't already supply.
3. Nothing else. The repository-root `.env` is never read by the running server (only by the Prisma CLI, a different process, as described above).

This holds identically in every context: local `pnpm api:dev`/`node dist/main.js` (steps 1-2 as above, `apps/api/.env` copied from `apps/api/.env.example` → root `.env.example` per the setup command in section 1), Docker/Compose or any real container (nothing ever sets step-1 variables via a file inside the image - `environment:`/secret injection is step 1 and wins outright, matching the pre-existing, unchanged behavior of "an already-set var is never replaced"), and the Jest unit suite (`test-env-setup.ts`'s existing `setDefault(...)` pattern is the same one-way, non-overriding contract, just with safe fake defaults - unchanged by this hardening). `load-env.ts` never logs any variable's value, only (via its own unit tests) which *keys* it set.

Migrations live in `prisma/migrations/`. The first (`20260903000000_init`) is the full schema DDL generated offline via `prisma migrate diff` (this repo's sandbox could not reach a live Postgres - see the freeze report). The second (`20260903000001_search_and_spatial_indexes`) adds hand-written PostGIS GiST indexes and pg_trgm GIN indexes that Prisma cannot express natively. Both are ordinary migrations - `prisma migrate deploy` applies them normally against a real database.

## 2. Architecture

**Module inventory** (`apps/api/src/modules/*`): `auth`, `users`, `places`, `people`, `events`, `eras`, `dynasties`, `territories`, `facts`, `sources`, `citations`, `media`, `then-now`, `editorial`, `stories`, `journeys`, `map`, `timeline`, `search`, `comments`, `bookmarks`, `reports`, `community`, `contributions`, `aliases`, `audit`, `mailer`. Each is a self-contained Nest module (service + controller + DTOs) - there is no god-module. `apps/api/src/common/historical-date/` is a shared (non-module) utility library - the historical date value type, validation, sort-bound computation, and locale-aware display formatting used by every dated entity's service.

**Database:** PostgreSQL + PostGIS, one schema, Prisma as the query layer. Full model list in `prisma/schema.prisma` (extensively commented with the reasoning for each design choice). Key points a frontend engineer needs:

- **Translations, not `nameVi`/`nameEn` columns.** Every browsable entity (`Place`, `Person`, `HistoricalEvent`, `HistoricalEra`, `Dynasty`, `Territory`, `HistoricalFact`, `Story`, `Journey`, `CommunityStory`) has a `*Translation` table keyed by `(entityId, locale)`. The entity itself has a stable `canonicalSlug` (derived from the Vietnamese name at creation, used in URLs, never changes) plus a `PublicationStatus`/`FactEditorialStatus`. Translations have their own `slug` per locale, `status` (`DRAFT`/`AI_ASSISTED`/`HUMAN_REVIEWED`/`PUBLISHED`) and `method` (`ORIGINAL`/`HUMAN`/`AI_ASSISTED`).
- **High-integrity joins are real tables**, not polymorphic columns: `FactPlace`/`FactPerson`/`FactEvent`/`FactEra`/`FactTerritory`, `EventPlace`/`EventPerson`, `PersonDynasty`, `StoryPlace`/`StoryPerson`/`StoryEvent`/`StoryCitation`, `CommunityStoryPlace`/`Person`/`Event`/`Era`, `JourneyStop`.
- **Lower-integrity, cross-cutting attachments use a validated `entityType + entityId` pattern** (an `EntityKind` enum): `Comment`, `Bookmark`, `Report`, `EntityMedia` (gallery attachments), `EntityAlias`. This is the explicit exception the spec allows for non-critical relations - application code validates `entityType`, there is no DB-level FK.
- **Historical dates are never a single `DateTime`, and never fabricate a day/month.** As of Phase 03, every dated entity stores explicit `year`/`month`/`day` (nullable, only what's actually known) plus an independent `precision` (`DAY`/`MONTH`/`YEAR`/`DECADE`/`CENTURY`/`UNKNOWN`) and `qualifier` (`EXACT`/`CIRCA`/`BEFORE`/`AFTER`/`BETWEEN`/`UNCERTAIN`/`TRADITIONAL`). `Era`/`Dynasty`/`Territory` have independently-qualified `start`/`end` periods; `Event`/`Fact`/`Person.birth`/`Person.death` are single point values. The API never returns raw year/month/day alone - every date-bearing field is a `HistoricalDateResponse` (`{ year, month, day, precision, qualifier, rangeEnd, display }`) or, for periods, a `HistoricalPeriodResponse` (`{ start, end, display }`). Full contract: **`docs/backend/HISTORICAL_DOMAIN.md`**.
- **Trust layer:** `HistoricalFact` -> `Citation` -> `Source`. A fact cannot reach `FactEditorialStatus.PUBLISHED` without at least one `Citation` with `verificationState = VERIFIED` (enforced in `FactsService.setEditorialStatus`, unit-tested). A fact with `sensitivity != NORMAL` additionally requires the approving user to hold `HISTORIAN_REVIEWER`/`ADMIN` and to **not** be the fact's own creator (separation of duties, also unit-tested). **Phase 04** added: full per-stage review history (`FactReview`, `GET /facts/:id/reviews` - not just a single `reviewedById` pointer), a `RETRACTED` editorial status (a documented, reviewer-only way to pull a published fact from public output without deleting it), a `REJECTED` citation state (distinct from `DISPUTED` - "reviewed and found wrong" vs. "source may be fine, historians disagree"), `Source` archive/deactivate (`PATCH /sources/:id/archive`, blocked while a published fact still cites it), and machine-readable trust error codes. Full write-up: **`docs/backend/TRUST_MODEL.md`**.
- **Roles are a Postgres native array on `User.roles`** (`Role[]`), not a join table. Enforced server-side by a global `RolesGuard` + `@Roles(...)` decorator - a hidden frontend button is never the only protection. Full role-by-endpoint table: `docs/backend/AUTHORIZATION_MATRIX.md`.
- **PostGIS columns** (`Place.location` Point, `Place.geometry`, `Territory.geometry`, `Journey.routeGeometry`) are `Unsupported()` in Prisma, SRID 4326 (EPSG:4326/WGS84) everywhere - all reads/writes for these go through raw parameterized SQL in the relevant service (`PlacesService.setLocation`, `TerritoriesService.setGeometry`, `MapService.getFeatures`).
- **Territory geometry is versioned, never overwritten in place** (Phase 03): `TerritoriesService.setGeometry` appends a `TerritoryGeometryRevision` row before bumping the live shape, and resets `Territory.geometryStatus` to `DRAFT` - a separate `PATCH /territories/:id/geometry-status` (HISTORIAN_REVIEWER/ADMIN) is required to publish it. `MapService`'s bbox/year endpoint only ever returns `geometryStatus = 'PUBLISHED'` territory shapes.
- **Aliases** (`EntityAlias`, `entityType` + `entityId`, validated against the real target row in `AliasesService`) are shared across Place/Person/Event/Era/Dynasty/Territory - `GET/POST/DELETE /aliases` (Phase 03). `AliasType` now distinguishes `BIRTH_NAME`/`REGNAL_NAME`/`TEMPLE_NAME`/`TITLE`/`EPITHET` (Person) from `ALTERNATE_NAME`/`HISTORICAL_NAME`/`ROMANIZATION`/`TRANSLITERATION`/`ALTERNATE_SPELLING`/`ABBREVIATION` (Place/Event). Duplicate `(entityType, entityId, locale, alias)` is rejected with `409`.
- **Era hierarchy is cycle-checked server-side** (Phase 03): `PATCH /eras/:id/parent` walks the full ancestor chain and rejects any re-parent that would create a cycle, including deeper ones, not just direct self-parenting.

## 3. API contract (formal, Phase 11)

### 3.1 Base URL / versioning (spec section 3)

Every route is served under a single global prefix, `/v1` (`API_PREFIX` env var, default `v1` -
see `apps/api/src/main.ts`'s `app.setGlobalPrefix(apiPrefix)`). There is no per-resource version
suffix and no `Accept`-header versioning - `/v1` is the entire API surface today. A future breaking
version would be introduced as a new global prefix (`/v2`) running alongside `/v1`, never an
in-place breaking change to an existing route - no such change exists yet.

**Compatibility policy:** within `/v1`, a field is never removed or repurposed to mean something
different without a corresponding update to this document and `docs/backend/openapi.json` in the
same change - if a live response disagrees with either, treat the document as stale and report
it, don't silently code around the live behavior. Additive changes (a new optional field, a new
enum member, a new endpoint) do not bump the version. A frontend client should tolerate unknown
additional response fields (never do strict/exact object-shape validation against a response) so
additive backend changes never break it.

Swagger/OpenAPI UI:
`GET /docs` (interactive) and `GET /docs-json` (raw document) once the API is running against a
live database. A machine-generated, always-current copy of the same document, generated **without**
a live database, is committed at **`docs/backend/openapi.json`** - see section 3.9.

### 3.2 Success response envelope (spec section 7)

Every successful response (2xx) is wrapped identically by a global `ResponseInterceptor`
(`apps/api/src/common/interceptors/response.interceptor.ts`) - no endpoint invents its own shape:

```json
{ "success": true, "data": <payload>, "meta"?: { "...": "locale/pagination metadata, see below" } }
```

`data` is whatever the controller returns (an object, an array, `{ items, nextCursor, hasMore }`
for cursor-paginated lists, etc. - see section 3.4). `meta` is only present when a controller
attaches request-scoped metadata (most commonly the locale-resolution object, section 6.2, or
Map's `{ truncated, limit, minImportance }`, section 4).

### 3.3 Error contract (spec section 8/9)

Every error, from anywhere (a thrown `HttpException`, a Prisma error, or an unexpected exception),
is normalized identically by a global `AllExceptionsFilter`
(`apps/api/src/common/filters/http-exception.filter.ts`) - **no endpoint's error shape is
special-cased**:

```json
{
  "success": false,
  "error": { "code": "COMMENT_MAX_DEPTH", "message": "Maximum comment depth exceeded.", "details": {} },
  "path": "/v1/comments",
  "timestamp": "2026-09-04T12:00:00.000Z",
  "requestId": "V1StGXR8_Z5jdHi6B-myT"
}
```

- **`code`** is a stable, machine-readable string. Every domain module defines its own
  `*_ERROR_CODES` registry (85 codes across 7 registries as of Phase 11 - see section 3.3.1);
  when no domain code applies, a generic per-HTTP-status code is used instead: `VALIDATION_ERROR`
  (400), `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409),
  `UNPROCESSABLE` (422), `RATE_LIMITED` (429), `INTERNAL_ERROR` (500). **Never build UI logic
  against `message` text** (it may be reworded) - always switch on `code`.
- **`message`** is a safe, human-readable string - never a stack trace, never raw database error
  text (a `Prisma.PrismaClientKnownRequestError` is mapped to `CONFLICT`/`NOT_FOUND`/
  `DATABASE_ERROR` with a generic message, never the raw Postgres error).
- **`details`** is optional and shape-varies by error kind - for a validation error (see 3.3.2) it
  is the `class-validator` constraint-message array; for a domain error it is whatever
  contextual object the throwing code attached (e.g. `SOURCE_IN_USE` includes nothing extra today;
  some codes include IDs). Treat it as "extra context for logging/debugging," not a stable schema
  in itself.
- **`requestId`** (Phase 11 addition - `RequestIdMiddleware`,
  `apps/api/src/common/middleware/request-id.middleware.ts`) is a short opaque per-request
  correlation id, generated fresh per request (or echoed back if the caller/a proxy already sent
  one via the `X-Request-Id` header). It is **also** returned as the `X-Request-Id` response
  header on every response, success or error - hand it to backend support/QA to correlate a
  specific failed request with server logs. Not a large observability system - just this one id.
- Stack traces are never serialized to the client in any environment (logged server-side only via
  `Logger.error`, see `AllExceptionsFilter`).

#### 3.3.1 Domain error code inventory

| Registry (file) | Domain | Code count (Phase 11) |
|---|---|---|
| `modules/auth/auth-error-codes.ts` | AUTH | 15 |
| `common/errors/trust-error-codes.ts` | TRUST (Fact/Citation/Source) | 9 |
| `modules/media/media-error-codes.ts` | MEDIA | 5 |
| `modules/stories/editorial-error-codes.ts` | EDITORIAL (Story/Journey) | 14 |
| `common/errors/discovery-error-codes.ts` | DISCOVERY (Map/Timeline/Search/Nearby) | 13 |
| `common/errors/community-error-codes.ts` | COMMUNITY (CommunityStory/Comment/Vote/Report/Bookmark/Moderation) | 17 |
| `common/errors/contribution-error-codes.ts` | CONTRIBUTION | 12 |

85 codes total, **verified globally unique** and never colliding with a generic per-status code
(`apps/api/src/common/errors/error-codes.spec.ts`, run on every `pnpm test`) - a duplicate `code`
string across two registries, or a domain code shadowing e.g. `NOT_FOUND`, fails the build. See
each linked architecture doc (`TRUST_MODEL.md`, `MEDIA_ARCHITECTURE.md`, `EDITORIAL_CONTENT.md`,
`DISCOVERY_ARCHITECTURE.md`, `COMMUNITY_ARCHITECTURE.md`, `CONTRIBUTION_ARCHITECTURE.md`,
`AUTH.md`) for what each specific code means and when it fires.

#### 3.3.2 Validation error contract (spec section 10)

Every request DTO is validated by one global `ValidationPipe`
(`whitelist: true, forbidNonWhitelisted: true, transform: true` - `apps/api/src/main.ts`) -
**there is exactly one validation error shape in this API**, never a route-specific format. An
invalid/missing field produces HTTP 400 with `code: "VALIDATION_ERROR"` and `details` as an array
of per-field constraint messages, e.g.:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "email must be an email, password must be longer than or equal to 8 characters",
    "details": ["email must be an email", "password must be longer than or equal to 8 characters"]
  },
  "path": "/v1/auth/register",
  "timestamp": "..."
}
```

`whitelist`/`forbidNonWhitelisted` mean an unrecognized field in the request body is itself a
400 (not silently dropped or ignored) - never send extra fields "just in case." Frontend
field-level error mapping: each `details[]` string is `class-validator`'s own message, which
begins with the property name (`"email must be..."`) - split on the first space to get the field
name if you need per-field inline errors, or match against the property names in the request DTO
(documented per-endpoint in Swagger/`openapi.json`).

### 3.4 Pagination contract (spec section 11/12/89 test #29)

Two documented styles, chosen per resource, never mixed undocumented within the same resource
class:

- **Cursor pagination** (`CursorPaginationQuery`, `apps/api/src/common/dto/pagination.dto.ts`) -
  used for anything that can grow unbounded: `CommunityStory` list, Comments, and any other feed.
  Query params: `?cursor=&limit=`. `limit` defaults to 20, **server-enforced maximum 100**
  (`@Max(100)` - a request for `limit=500` is rejected as a validation error, not silently capped).
  Response shape: `{ items: [...], nextCursor: string | null, hasMore: boolean }`. `cursor` is an
  opaque id (currently the last item's real id) - never construct one client-side, always pass
  back exactly what `nextCursor` gave you.
- **Offset pagination** (`OffsetPaginationQuery`) - used only for small, inherently-bounded
  admin/reference lists (e.g. the Contribution admin queue). Query params: `?page=&pageSize=`.
  `page` defaults to 1, `pageSize` defaults to 20, **server-enforced maximum 100**. Response shape:
  `{ items, total, page, pageSize }` (the Contribution admin queue's exact shape - see section 11).
- A handful of small, inherently-bounded lists (Eras, Dynasties, Themes, the Editorial home slots)
  return a plain array with no pagination wrapper at all - safe because the underlying table is
  curated/small by design, not because pagination was forgotten.

### 3.5 Sort contract (spec section 13)

Every sortable list takes an explicit, enum-validated `sort` parameter - **never a raw database
column name**. An unrecognized value is rejected as a validation error (`VALIDATION_ERROR`, 400),
never silently coerced to a default order (a real gap fixed in Phase 11 - see
`ListCommunityStoriesQueryDto`, `apps/api/src/modules/community/dto/community-story.dto.ts`):

| Resource | Supported `sort` values | Default |
|---|---|---|
| `GET /community/stories` | `NEW`, `HELPFUL` | `NEW` (most recent first) |
| `GET /search` | not client-controlled - server-computed relevance ranking (trigram similarity + importance + exact-match bonus, section 6) | n/a |

Comments have no client-selectable sort (always chronological within their thread, per depth -
see section 8.4).

### 3.6 Filter contract (spec section 14)

Every filter parameter across every list endpoint is a typed, `class-validator`-checked DTO field
(never a raw untyped string forwarded into a query) - an invalid enum value (e.g.
`?type=NOT_A_REAL_TYPE`) is rejected as a `VALIDATION_ERROR`. Representative examples: `PlaceType`
(`GET /places?type=`), `CommunityStoryType`/`sort`/`placeId` (`GET /community/stories`),
`SourceType` (`GET /sources?sourceType=`), `types=` as a comma-separated `PlaceType` list
(`GET /map/features`), `types=` as a comma-separated search-entity-type list (`GET /search`).
Each endpoint's exact filter set is documented per-operation in `docs/backend/openapi.json` -
check there for anything not called out explicitly in this document.

### 3.7 Locale contract (spec section 15-18)

Canonical language: **`vi`** (Vietnamese). V1 supported locales: **`vi`, `en`**. The
architecture (a `*Translation` table per entity, keyed by `(entityId, locale)`, never
`nameVi`/`nameEn` columns) is ready for additional locales with no schema change - adding one is
adding translation rows, not a migration.

- **How locale is supplied:** the `@Locale()` param decorator (`apps/api/src/common/decorators/
  locale.decorator.ts`) reads `?locale=` query param first. There is no `Accept-Language` header
  support and no route-based locale prefix (`/en/places/...` does not exist) - locale is always an
  explicit query parameter.
- **Precedence (exact, matches implementation):** explicit `?locale=` query param -> default
  `vi` if omitted or unrecognized. There is no secondary "browser-accepted-locale" signal today.
- **Fallback (deterministic, `resolveTranslation`, `apps/api/src/common/translation/
  resolve-translation.util.ts`):** exact requested-locale match, else the canonical `vi`
  translation, else any remaining translation, else `null` (the entity has no translation at all -
  extremely rare, would only occur for a mid-migration/incomplete row). **Never a different,
  unlabeled locale silently substituted** - every translated response's `meta` includes
  `{ requestedLocale, resolvedLocale, fallbackApplied: boolean }`. **Always check
  `fallbackApplied`** before presenting content as being in the language the user asked for; if
  `true`, `resolvedLocale` tells you which language you actually got.
- **Translation provenance metadata** (spec section 18) - every translation row carries `status`
  (`DRAFT`/`AI_ASSISTED`/`HUMAN_REVIEWED`/`PUBLISHED`) and `method`
  (`ORIGINAL`/`HUMAN`/`AI_ASSISTED`), not currently echoed in every public response body by
  default (most public read paths return only the resolved text) - if a surface needs to disclose
  "this translation is AI-assisted, not yet human-reviewed" (e.g. a Story), fetch the admin/detail
  view or check `docs/backend/openapi.json` for which operations do include it. **Internal
  reviewer notes are never part of translation metadata** - there is no such field to leak.

### 3.8 Contract enums (spec section 81)

Codex must never `import { X } from '@prisma/client'` in frontend code - every enum a frontend
needs is already fully documented, with every member, in the generated **`docs/backend/
openapi.json`** (`components.schemas` for every DTO that carries one, e.g. `PlaceType`,
`DatePrecision`, `DateQualifier`, `FactCertainty`, `SourceType`, `MediaAssetStatus`,
`AccessPolicy`, `StoryType`, `CommunityStoryType`, `CommunityVerificationState`,
`ModerationStatus`, `ReportCategory`, `ContributionStatus`, `ContributionType`,
`TranslationStatus`, `TranslationMethod`, `Role`). Generate a typed frontend client from that
document (`openapi-typescript`/`orval`/similar) rather than hand-copying enum member lists, so a
future added enum value is never silently missed.

### 3.9 OpenAPI artifact (spec section 77/78)

**`docs/backend/openapi.json`** is generated directly from the real, running `AppModule` - every
real controller, every real `@Api*` decorator - **never hand-written**. Generate/refresh it with:

```bash
pnpm --filter @dauviet/api openapi:generate
```

This requires **no live Postgres/Redis/S3** - it boots the full Nest DI graph with
`SKIP_DB_CONNECT=true` (read only by `PrismaService.onModuleInit`, see `.env.example` - never set
this for a real server boot) and writes the document without ever calling `.listen()`. A
regression suite, `apps/api/src/openapi-contract.spec.ts` (run on every `pnpm test`), re-generates
the same document in-process and asserts the on-disk copy matches exactly (no drift), plus asserts
every critical route (Map, Timeline, Search, Auth, Media, Story, Journey, Community, Contribution,
Admin-contribution-catalogue, Moderation) is present with the expected `/v1` prefix and auth
requirement.

### Endpoint inventory (all under `/v1`, `@Public()` noted)

| Area | Endpoints |
|---|---|
| Auth | `POST auth/register` (public), `POST auth/login` (public), `POST auth/refresh` (public), `POST auth/logout` (public), `POST auth/email-verification/resend` (public), `POST auth/verify-email` (public), `POST auth/request-password-reset` (public), `POST auth/reset-password` (public), `POST auth/change-password`, `GET auth/sessions`, `DELETE auth/sessions/:id`, `POST auth/sessions/revoke-all`, `GET auth/google` (public), `GET auth/google/callback` (public, UNVERIFIED_EXTERNAL_CREDENTIAL - see AUTH.md) |
| Users | `GET users/me`, `PATCH users/me`, `GET profiles/:id` (public, safe subset only), `PATCH admin/users/:id/roles` (ADMIN, never own id), `PATCH admin/users/:id/status` (ADMIN, never own id, revokes sessions on suspend/disable) |
| Places | `GET places` (public), `GET places/:slug` (public), `GET places/:slug/timeline` (public), `GET places/:slug/sources` (public), `GET places/:slug/media` (public), `GET places/:slug/community` (public), `GET places/:slug/comments` (public), `POST places/:slug/visits`, `POST places` (EDITOR+), `PATCH places/:id` (EDITOR+), `PATCH places/:id/publication-status` (EDITOR/HISTORIAN_REVIEWER/ADMIN) |
| People | `GET people` (public), `GET people/:slug` (public), `GET people/:slug/timeline` (public, Phase 07), `GET people/:slug/comments` (public), `GET people/:slug/sources` (public, Phase 04), `POST people` (EDITOR+), `PATCH people/:id/publication-status` |
| Events | `GET events` (public), `GET events/:slug` (public), `GET events/:slug/comments` (public), `GET events/:slug/sources` (public, Phase 04), `POST events` (EDITOR+), `PATCH events/:id/publication-status` |
| Themes | `GET themes?category=` (public), `POST themes` (EDITOR+), `POST/DELETE themes/:id/events/:eventId` (EDITOR+) |
| Eras | `GET eras` (public), `GET eras/:slug` (public), `POST eras` (EDITOR+), `PATCH eras/:id/parent` (EDITOR+, cycle-checked) |
| Dynasties | `GET dynasties` (public), `GET dynasties/:slug` (public), `POST dynasties` (EDITOR+) |
| Territories | `GET territories` (public), `GET territories/:slug` (public), `POST territories` (EDITOR/HISTORIAN_REVIEWER/ADMIN), `PATCH territories/:id/geometry` (EDITOR/HISTORIAN_REVIEWER/ADMIN, appends a geometry revision), `PATCH territories/:id/geometry-status` (HISTORIAN_REVIEWER/ADMIN) |
| Aliases | `GET aliases?entityType=&entityId=` (public), `POST aliases` (EDITOR/HISTORIAN_REVIEWER/ADMIN), `DELETE aliases/:id` (EDITOR/HISTORIAN_REVIEWER/ADMIN) |
| Facts (editorial only, no public read API - facts surface via place/person/event `sources`/timeline projections) | `GET facts`, `GET facts/:id`, `GET facts/:id/reviews` (Phase 04, full FactReview history), `POST facts`, `POST facts/:id/{places,people,events,eras,territories}/:entityId`, `PATCH facts/:id/editorial-status` (all CONTRIBUTOR+; `RETRACTED` target additionally requires HISTORIAN_REVIEWER/ADMIN + a `notes` reason, enforced in-service) |
| Sources | `GET sources` (public, excludes archived), `GET sources/:id` (public, documents redacted per `accessPolicy`), `GET sources/:id/comments` (public), `GET sources/:id/documents/:documentId` (Phase 04, authenticated; METADATA_ONLY/RESTRICTED additionally requires EDITOR/HISTORIAN_REVIEWER/ADMIN), `POST sources` (CONTRIBUTOR+, rejects a duplicate ISBN/ISSN), `POST sources/:id/documents` (EDITOR+), `PATCH sources/:id/archive` (Phase 04, HISTORIAN_REVIEWER/ADMIN, blocked while cited by a published fact) |
| Citations | `POST citations` (CONTRIBUTOR+, refuses to cite an archived source), `PATCH citations/:id/verify` (HISTORIAN_REVIEWER/ADMIN, refuses to re-verify), `PATCH citations/:id/dispute` (HISTORIAN_REVIEWER/ADMIN), `PATCH citations/:id/reject` (Phase 04, HISTORIAN_REVIEWER/ADMIN) |
| Media | `GET media/:id` (public, READY only), `POST media/uploads` (presigned URL, creates a PENDING_UPLOAD row, CONTRIBUTOR+), `POST media/uploads/:id/confirm` (Phase 05, verifies the object landed in storage, owner or EDITOR+), `POST media/attach` (EDITOR+), `PATCH media/:id/rights`\|`/translations/:locale`\|`/access-policy`\|`/archive` (Phase 05, EDITOR+), `PATCH media/:id/quarantine` (Phase 05, MODERATOR+), `POST media/admin/cleanup-expired-uploads` (Phase 05, ADMIN) |
| Then & Now | `GET then-now?placeId=` (public), `POST then-now` (Phase 05, any authenticated user, media-ownership enforced), `PATCH then-now/:id/publication-status` (EDITOR+), `PATCH then-now/:id/moderation-status` (MODERATOR+) |
| Stories | `GET stories` (public, filters: type/placeId/personId/eventId), `GET stories/:slug` (public), `GET stories/:slug/comments` (public), `POST stories` + `.../places`\|`people`\|`events`\|`hero-media`\|`featured` (EDITOR+), `.../facts`\|`citations` (Phase 06, EDITOR/HISTORIAN_REVIEWER/ADMIN), `PATCH stories/:id/editorial-status` (Phase 06, richer StoryEditorialStatus workflow) |
| Admin Stories | `GET admin/stories/:id/preview`\|`.../media` (Phase 06, EDITOR/HISTORIAN_REVIEWER/ADMIN) |
| Journeys | `GET journeys` (public), `GET journeys/:slug` (public, includes ordered stops with real Place coordinates), `GET journeys/:slug/comments` (public), `POST journeys` + `.../stops`, `DELETE .../stops/:stopId`, `PATCH .../stops/reorder`\|`hero-media`\|`schedule`\|`editorial-status` (EDITOR+) |
| Admin Journeys | `GET admin/journeys/:id/preview` (Phase 06, EDITOR+) |
| Related content | `GET places/:slug/stories`\|`journeys`, `GET people/:slug/stories`, `GET events/:slug/stories` (Phase 06, public) |
| Editorial curation | `GET editorial/home` (Phase 06, public, grouped by slot key), `POST editorial/slots`, `DELETE editorial/slots/:id` (EDITOR+) |
| Map | `GET map/features` (public, GeoJSON, Phase 07: now includes EVENT features + theme/eraId filters + zoom-based density) |
| Timeline | `GET timeline` (public, Phase 07: `fromYear`/`toYear` overlap semantics, theme filter) |
| Search | `GET search` (public, Phase 07: unaccent-normalized, alias-aware, exact-match ranking), `GET search/suggestions` (public, Phase 07) |
| Nearby | `GET places/nearby` (public, Phase 07, PostGIS radius query, stateless) |
| Comments | `POST comments` (Phase 08: validates target exists/is public, max depth 3, thread-lock aware), `PATCH comments/:id` (Phase 08, author-only edit), `POST comments/:id/vote` (Phase 08: self-vote rejected), `DELETE comments/:id`, `PATCH comments/:id/moderate` (MODERATOR/ADMIN, Phase 08: never the comment's own author) |
| Bookmarks | `GET/POST/DELETE bookmarks` (Phase 08: target existence + allow-listed type validated - PLACE/STORY/JOURNEY/COMMUNITY_STORY only) |
| Reports | `POST reports` (Phase 08: target validated, duplicate-open-report rejected), `GET reports/admin?status=&targetType=&category=` (MODERATOR/ADMIN), `PATCH reports/:id/resolve` (MODERATOR/ADMIN) |
| Community | `GET community/stories?type=&placeId=&sort=` (public, Phase 08: NEW/HELPFUL sort + placeId filter), `GET community/stories/mine` (Phase 08, own stories at every status), `GET community/stories/:slug` (public), `GET .../comments` (public), `POST community/stories` (Phase 08: heroMedia/thenNowComparison ownership, content-safety, rate-limited), `PATCH .../:id` (Phase 08, author/EDITOR+ edit), `DELETE .../:id` (Phase 08, author self-withdraw), `POST/DELETE .../:id/vote` (Phase 08, idempotent helpful vote, self-vote rejected), `POST .../:id/{places,people,events,eras}` (Phase 08: ownership + target-existence now enforced, previously unchecked), `PATCH .../verification-state` (author, restricted to pre-review states), `PATCH .../review-verification-state` (EDITOR/HISTORIAN_REVIEWER/ADMIN, Phase 08: never the story's own author), `PATCH .../moderation-status` (MODERATOR/ADMIN, Phase 08: never the story's own author) |
| Moderation | `GET admin/moderation/queue?status=&targetType=&category=&from=&to=`, `GET admin/moderation/:targetType/:targetId`, `POST admin/moderation/actions` (Phase 08, all MODERATOR/ADMIN - a unified entrypoint over the existing per-domain setters) |
| Contributions | `POST contributions`, `GET contributions/mine`, `GET contributions/mine/:id`, `PATCH contributions/mine/:id` (SUBMITTED or awaiting-info only), `POST contributions/mine/:id/withdraw`, `POST contributions/:id/provenance-sources` (owner while editable, or any reviewer) |
| Admin Contributions (Phase 09) | `GET admin/contributions?status=&type=&sensitivity=&submitterId=&reviewerId=&correctionTargetType=&from=&to=&page=&pageSize=`, `GET admin/contributions/:id` (full detail incl. review history), `POST admin/contributions/:id/reviews` (the one transition entrypoint - `decision: APPROVE\|REJECT\|REQUEST_INFO\|RETURN_TO_PREVIOUS_STAGE`, versioned), `PATCH admin/contributions/:id/rights-review`\|`/provenance-confidence`\|`/sensitivity` (all EDITOR/HISTORIAN_REVIEWER/ADMIN, never the contribution's own author), `POST admin/contributions/:id/catalogue/source`\|`/document`\|`/media` (HISTORIAN_REVIEWER/ADMIN only, idempotent, requires `rightsReviewState=APPROVED_FOR_CATALOGUE`) |
| Admin | `GET admin/audit` (ADMIN/MODERATOR/HISTORIAN_REVIEWER), `POST/DELETE admin/users/:id/badges` (ADMIN, Phase 08, rule-based badge grant/revoke) |
| Users (Phase 08) | `GET users/me/visited-places` (private, caller's own full list) |
| Health | `GET health` (public) |

## 4. Map

`GET /v1/map/features?bbox=minLng,minLat,maxLng,maxLat&year=&types=&zoom=&theme=&eraId=&locale=` returns a GeoJSON `FeatureCollection`. `bbox` is required (the endpoint refuses to return an unscoped dump of every place) and strictly validated - a malformed or SQL-injection-shaped value is rejected before any query runs. Three feature sources are merged:

- Published `Place` points intersecting the bbox (`properties: { entityType: 'PLACE', id, slug, placeType, historicalImportance, name, locale, actualLocale, fallbackUsed }`), capped at 500 (100 at national zoom), ordered by `historicalImportance`.
- If `year` is supplied, `Territory` polygons intersecting the bbox whose `sortStart`/`sortEnd` cover that year (`properties: { entityType: 'TERRITORY', ... }`), `geometryStatus = 'PUBLISHED'` only. **No Territory geometry is seeded in the golden dataset** - the model and query path are implemented and tested, but no historical boundary polygons were fabricated (see section 12).
- **(Phase 07)** Published `HistoricalEvent`s joined through `EventPlace` to a resolvable `Place` point (`properties: { entityType: 'EVENT', id, slug, importance, placeId, title, ... }`), optionally filtered by `theme` (slug, via `EventTheme`), `eraId`, and `year` (overlap semantics, matching Timeline below).

`zoom` (0-22) drives density (Phase 07): at national zoom (`<=6`) only `historicalImportance`/`importance` `>=7` features are returned; regional (`<=10`) `>=4`; city/street, everything published. This applies uniformly to every Place/Event - there is no id-based special case, including for Hoang Sa/Truong Sa (both carry a real `historicalImportance` of 9 in the golden dataset). `types` filters Place/Event results to a comma-separated list of `PlaceType` values. Response includes `meta: { truncated, limit, minImportance }`. Full contract: **`docs/backend/DISCOVERY_ARCHITECTURE.md`**.

## 5. Timeline

`GET /v1/timeline?fromYear=&toYear=&eraId=&placeId=&personId=&theme=&minImportance=&limit=&locale=` returns `{ items: [...] }` mixing `{ kind: 'ERA', ... }` and `{ kind: 'EVENT', ... }` items, each carrying a `date: HistoricalDateResponse` (section 2 of `docs/backend/HISTORICAL_DOMAIN.md`) - never assume a bare year integer. Sorting uses the internal `sortStart`/`dateSortStart` columns; an item with a wholly `UNKNOWN` date sorts last, not first. **`fromYear`/`toYear` use overlap semantics, not containment (Phase 07 fix)** - an event spanning 1250-1310 matches `fromYear=1200&toYear=1300` because its span overlaps the window, even though its end falls outside it; a range over 6000 years is rejected (`TIMELINE_RANGE_TOO_LARGE`). Full contract, including why this replaced a real containment-semantics bug: **`docs/backend/DISCOVERY_ARCHITECTURE.md`**.

## 6. Search

`GET /v1/search?q=&types=&locale=` and `GET /v1/search/suggestions?q=&locale=` (Phase 07) - PostgreSQL-native (`pg_trgm` + `unaccent` similarity), no external search cluster for V1 (spec-mandated, justified by data scale - see `DISCOVERY_ARCHITECTURE.md` section 3). Searches `Place`, `Person`, `HistoricalEvent`, `HistoricalEra`, `Story`, `Journey`, `Source`, `CommunityStory` translations plus `EntityAlias` (so "Hue" matches "Hue" via the alias attached to the Place whose canonical Vietnamese name is "Co do Hue"), with every comparison normalized through an `IMMUTABLE` `immutable_unaccent(lower(...))` wrapper (Phase 07) so diacritic/case differences never block a match. Ranking = trigram similarity + a small importance bonus for Place/Event + a large exact-match bonus, with a deliberate small penalty for `CommunityStory` so community content cannot outrank major historical entities on relevance alone. Each result reports `matchedOn: 'name'|'alias'` and the usual locale-fallback `meta`. The per-entity-type query method in `SearchService` is the seam an OpenSearch/Elasticsearch replacement slots into later without touching controllers or DTOs. Full contract: **`docs/backend/DISCOVERY_ARCHITECTURE.md`**.

## 6a. Nearby (Phase 07)

`GET /v1/places/nearby?lat=&lng=&radius=&types=&limit=&locale=` (public, registered before `places/:slug` to avoid a routing collision) - stateless PostGIS radius query ("explore around me"). `lat`/`lng` are request parameters only, never persisted. `radius` defaults to 5,000m, capped at 50,000m; distance is always meters (`ST_Distance`/`ST_DWithin` cast to `::geography`, never raw degrees). Only `PUBLISHED` places with a location are eligible. Full contract: **`docs/backend/DISCOVERY_ARCHITECTURE.md`**.

## 7. Auth contract (formal, Phase 11 - full architecture: `docs/backend/AUTH.md`)

One backend auth implementation serves two distinct client contracts, selected by the
`X-Client-Platform` request header (`web` vs. anything else/absent). **Do not assume mobile can
reuse browser cookie behavior, and do not assume web should manage tokens manually** - follow
whichever subsection below matches your client.

### 7.1 Shared mechanics (both contracts)

- Bearer JWT **access token**: short-lived (`JWT_ACCESS_TTL`, default 15m), payload is only
  `{ sub: userId, sid: sessionId }` - never roles/email (every request re-checks the DB for
  current roles/status via `JwtStrategy`, so a role change or suspension takes effect on the
  *next* request, not at token expiry).
- Opaque **refresh token**: single-use, rotated on every `/auth/refresh` call, stored server-side
  only as a hash (`Session.refreshTokenHash`) - the plaintext token itself is never persisted or
  logged. Presenting an already-used (rotated-away) refresh token is treated as a theft signal and
  revokes **every** session on the account, not just the one presenting it.
- Password hashing: Argon2id (not bcrypt). A fixed dummy hash is checked on a nonexistent-email
  login attempt so failed lookups and failed password checks take the same amount of time
  (no account-enumeration timing side-channel).
- Every endpoint requires authentication by default (`JwtAuthGuard` is a global guard) - a route
  must be explicitly marked `@Public()` to skip it. Check the endpoint inventory (section 3) or
  `docs/backend/openapi.json`'s `security` field per operation if unsure.

### 7.2 Web contract (`X-Client-Platform: web`)

- `POST /auth/login`/`POST /auth/refresh` set the refresh token as an **httpOnly cookie**
  (`dv_refresh`) - never returned in the JSON body for this platform, so it is inaccessible to
  page JavaScript (XSS-resistant by construction).
- A companion **non-httpOnly CSRF cookie** (`dv_csrf`) is set alongside it. Every subsequent
  mutating cookie-mode request (`/auth/refresh`, `/auth/logout`) must echo that cookie's value
  back in the `X-CSRF-Token` request header (double-submit pattern) - a mismatch or missing
  header is rejected (`AUTH_CSRF_INVALID`). Read the current value from `document.cookie` (it is
  intentionally *not* httpOnly, precisely so client JS can read it for this purpose) - never
  invent or cache your own value.
- `/auth/refresh`/`/auth/logout` in cookie mode take **no body** - the refresh token comes from
  the cookie automatically.
- CORS: `credentials: true` is required on every cross-origin fetch (`fetch(url, { credentials:
  'include' })`) for cookies to be sent/received at all. `CORS_ORIGINS` must list your exact web
  origin in production (see section 22).
- SSR-safe public reads: every `@Public()` GET endpoint (Places/People/Events/Stories/Journeys/
  Map/Timeline/Search/Sources/Community list+detail, etc.) needs no cookie/token at all and is
  safe to call from a server-rendering context with no user session.

### 7.3 Mobile / API contract (any other `X-Client-Platform`, or header absent)

- `POST /auth/login`/`POST /auth/refresh` return **both tokens in the JSON response body**
  (`{ accessToken, refreshToken, expiresIn, refreshExpiresAt, sessionId, user }`) - no cookies are
  set. Store both in secure device storage (iOS Keychain / Android Keystore-backed storage, e.g.
  `expo-secure-store` for an Expo app) - never `AsyncStorage`/plain device storage for the refresh
  token.
- `/auth/refresh`/`/auth/logout` take the refresh token explicitly in the request body
  (`{ refreshToken }`) - no CSRF header applies to this mode (there is no cookie to forge).
- No native/deep-link Google sign-in flow exists (see 7.6) - only the browser-redirect flow,
  which is web-shaped and not directly usable from a native mobile screen without an in-app
  browser/WebView bridge Codex would need to build and verify itself.
- Device/session bookkeeping (`GET /auth/sessions`) reports `platform` per session so a
  "manage devices" screen can label entries correctly (`ios`/`android`/`web`/`other`).

### 7.4 Auth endpoint inventory (request/response shapes)

| Endpoint | Auth | Notes |
|---|---|---|
| `POST /auth/register` | public | `{ email, password, displayName }` -> `{ id, email, displayName }`. Always assigns `Role.USER` - roles can never be set from this body. |
| `POST /auth/login` | public | `{ email, password }` (+ `X-Client-Platform` header) -> web: sets cookies, body has `{ user }`; mobile: body has `{ user, accessToken, refreshToken, expiresIn, refreshExpiresAt, sessionId }`. |
| `POST /auth/refresh` | public | See 7.2/7.3 for body/cookie shape. Returns a fresh token pair. |
| `POST /auth/logout` | public | Revokes the presented session. Returns `{ loggedOut: true }`. |
| `POST /auth/email-verification/resend` | public | `{ email }` -> generic success regardless of whether the email exists (no account-enumeration). |
| `POST /auth/verify-email` | public | `{ token }` (from the verification email link). |
| `POST /auth/request-password-reset` | public | `{ email }` -> always generic success. |
| `POST /auth/reset-password` | public | `{ token, newPassword }`. |
| `POST /auth/change-password` | bearer | `{ currentPassword, newPassword }` - revokes every other session, keeps the current one. |
| `GET /auth/sessions` | bearer | `Session[]` (see 7.5 for the safe field list). |
| `DELETE /auth/sessions/:id` | bearer | Revokes one of the caller's own sessions (never another user's, even for an ADMIN, through this route). |
| `POST /auth/sessions/revoke-all` | bearer | Revokes every session on the account, including the current one (an immediate full logout everywhere). |
| `GET /auth/google` / `GET /auth/google/callback` | public | Browser-redirect OAuth2 only - see 7.6. |

### 7.5 Session fields safe for UI (spec section 28)

`GET /auth/sessions` returns exactly: `id`, `platform`, `userAgent`, `deviceLabel`, `ip`,
`createdAt`, `lastUsedAt` - via an explicit Prisma `select`, **never** `refreshTokenHash`.
There is no `currentSession`-flag field today; if the UI needs to highlight "this device," compare
`sessionId` from the current login/refresh response against each row's `id` client-side.

### 7.6 Google OAuth status (spec section 29)

`IMPLEMENTED_STATICALLY` / **`UNVERIFIED_NATIVE_FLOW`** - `passport-google-oauth20` is wired,
shares the same `AuthIdentity` table as password auth (keyed by `(userId, provider)`, so a Google
login on an email that already registered with a password links to the same account), and is
optional at boot (the app starts fine with no Google credentials configured, the feature is just
unreachable). **It has never been exercised against a real Google Cloud OAuth app or a live
network exchange in this build** - do not present it as production-ready, and do not build a
native/deep-link mobile Google sign-in against it without first verifying the browser-redirect
flow live end-to-end.

### 7.7 Auth error semantics (spec section 27)

| Situation | `code` | HTTP |
|---|---|---|
| Wrong email or password | `AUTH_INVALID_CREDENTIALS` | 401 |
| Email not yet verified (where enforced) | `AUTH_EMAIL_NOT_VERIFIED` | 403 |
| Account suspended | `AUTH_ACCOUNT_SUSPENDED` | 403 |
| Account disabled/deleted | `AUTH_ACCOUNT_DISABLED` | 403 |
| Access token expired | standard JWT 401 (`UNAUTHENTICATED`) - call `/auth/refresh` | 401 |
| Refresh token expired | `AUTH_TOKEN_EXPIRED` | 401 - re-authenticate |
| Refresh token reused (already rotated away) | `AUTH_REFRESH_REUSE_DETECTED` | 401 - every session on the account was just revoked as a precaution; re-authenticate |
| CSRF header missing/mismatched (cookie mode) | `AUTH_CSRF_INVALID` | 403 |
| Rate limited (register/login/reset/etc., see section 20) | `AUTH_RATE_LIMITED` generic `RATE_LIMITED` | 429 |
| Session was explicitly revoked | `AUTH_SESSION_REVOKED` | 401 |

Full list of the 15 AUTH codes: `apps/api/src/modules/auth/auth-error-codes.ts`.

## 8. Community ("Chuyen nguoi Viet")

`CommunityStory` is a separate knowledge layer from `Story`/`HistoricalFact` by design - see the
full trust-boundary discussion in `docs/backend/COMMUNITY_ARCHITECTURE.md`. Its
`verificationState` has two independently-gated halves: an author can move their own story
through `PERSONAL_MEMORY -> COMMUNITY_SUBMISSION -> SOURCE_ATTACHED` via `PATCH
/community/stories/:id/verification-state`, but **only** `EDITOR`/`HISTORIAN_REVIEWER`/`ADMIN`
can set `UNDER_REVIEW` or `VERIFIED_CONTRIBUTION`, via the separate `PATCH
.../review-verification-state` endpoint - and, as of Phase 08, that endpoint (and `PATCH
.../moderation-status`) refuses the story's own author outright, even if they hold the role
(unit-tested: an author calling either endpoint on their own story gets a 403, never a silent
self-approval).

**Phase 08 additions**: a real `PATCH`/`DELETE` edit/withdraw path (author or `EDITOR`+, soft
delete only); server-validated ownership + target-existence on every entity-link endpoint
(`.../places`, `.../people`, `.../events`, `.../eras` - previously anyone could link any story
to any entity, a real gap now closed); an idempotent `StoryVote` "helpful" vote
(self-voting rejected, a removed/flagged story cannot receive one); `originalLocale` tracking so
the language an author actually wrote in is never silently overwritten; comments now validate
their target exists and is public before accepting a post, enforce a 3-level reply depth
(`Comment.depth`), and tombstone (never drop) `REMOVED`/`UNDER_REVIEW` comments so sibling/child
replies keep their place in the thread; bookmarks and reports both now validate their target
exists (bookmarks are additionally restricted to `PLACE`/`STORY`/`JOURNEY`/`COMMUNITY_STORY`);
a new `GET/POST/DELETE /admin/moderation/*` surface unifies the moderator queue/detail/action
view over the same underlying setters; public profiles (`GET /profiles/:id`) now surface
community contribution stats (stories, helpful-received, badges) with visited places private
by default (`User.visitedPlacesPublic`, opt-in); a new rule/editorial-only `UserBadge` system
(`ADMIN`-granted only, never self-awarded). Full contract, including every deliberate
non-goal (no XP/streak mechanics, no `RELEVANT` ranking yet, no email-verification-to-post
gate): **`docs/backend/COMMUNITY_ARCHITECTURE.md`**.

Comments/votes/bookmarks/reports are generic (`EntityKind` + id) and shared across every content type listed in section 31 of the spec (Place, Person, Event, Story, CommunityStory, Journey, Source).

## 9. Media

**Full contract: `docs/backend/MEDIA_ARCHITECTURE.md` (Phase 05 / 05.1).** Summary: `POST /media/uploads` validates purpose/type/MIME/size, generates a server-only storage key, and creates a `MediaAsset` row already in `PENDING_UPLOAD` status, returning a presigned S3/MinIO PUT URL. The client PUTs the file directly to that URL, then calls `POST /media/uploads/:id/confirm` (owner, or EDITOR+) - which verifies the object actually exists in storage (`HeadObject`), streams it once to compute an authoritative server-side SHA-256 **and** check its magic-byte signature against the declared MIME (Phase 05.1 - a client-supplied checksum, if given, is only compared against the server value and rejected on mismatch, never trusted outright), before moving to `UPLOADED` and enqueuing a `media-processing` BullMQ job. The old single-step `POST /media` "register after upload" endpoint (which trusted the client's claim with no verification) was removed in Phase 05 - **a `MediaAsset` is never usable just because the client says the upload succeeded.** `GET /media/:id` (public) only ever returns a `MediaAsset` whose `status` is `READY`, and only ever resolves a full `url` when `accessPolicy` is `PUBLIC`; the response now also lists any generated `variants` (Phase 05.1), each independently filtered through the same policy check. `accessPolicy` (`PUBLIC`/`PREVIEW_ONLY`/`METADATA_ONLY`/`RESTRICTED`) also gates `GET /sources/:id`'s embedded `SourceDocument`s (Phase 04). AI-generated/reconstructed media (`isAiGenerated: true`) is rejected unless `aiDisclosure` is also provided, and a `RECONSTRUCTION`-type asset is rejected unless it discloses its basis via `provenanceNote` or `aiDisclosure`, whether or not AI was involved (Phase 05). Rights metadata (`rightsStatus`, `attributionText`, etc.) can only be set by `EDITOR`+ via `PATCH /media/:id/rights` - never the uploader alone; access-policy/quarantine/archive changes now cascade to every derivative (Phase 05.1). A BullMQ `media-processing` queue and worker drive the real `UPLOADED -> PROCESSING -> READY` lifecycle transition (idempotent, bounded retry/backoff) and - as of Phase 05.1 - actually generate real image derivatives via `sharp`: mandatory `THUMBNAIL`/`MEDIUM`/`LARGE` WebP variants (aspect-ratio-preserving, never upscaled, EXIF-orientation-normalized, metadata-stripped) plus a best-effort AVIF `OPTIMIZED_WEB` variant, for raster image types only (PDF/audio/video skip straight to `READY`, unchanged).

## 9b. Media contract detail (spec sections 31-35)

- **Checksum**: server-computed SHA-256 is the only authority (`confirmUpload` streams the
  uploaded object once, computing both the checksum and the magic-byte signature check). A
  client-supplied `checksum` in the confirm request is only ever *compared* against the
  server-computed value, never stored/trusted in its place - a mismatch returns
  `MEDIA_CHECKSUM_MISMATCH` and the asset is marked `FAILED`, never usable. Never rely on a
  client-side hash for integrity.
- **Status values** frontend may display/use: `PENDING_UPLOAD` (awaiting the client's PUT),
  `UPLOADED` (verified in storage, queued for processing), `PROCESSING`, `READY` (the only status
  the public `GET /media/:id` will ever return - poll or refetch until this state, never assume
  upload completion means the asset is usable), `FAILED` (checksum/signature mismatch or
  unprocessable file - do not retry the same upload session, request a new one), `QUARANTINED`
  (moderator action, never publicly visible regardless of `accessPolicy`), `ARCHIVED` (soft-removed,
  never publicly visible).
- **Variants**: `GET /media/:id`'s response includes a `variants` array (each entry independently
  policy-filtered the same way the parent is) - `THUMBNAIL`/`MEDIUM`/`LARGE` WebP (mandatory for
  raster images) plus a best-effort AVIF `OPTIMIZED_WEB` variant. **Never construct a derivative
  URL yourself** - only use the `url` the API already resolved for you; a `null` `url` means that
  variant/policy combination is not authorized for the current (unauthenticated, public) caller.
- **Access policy** (`accessPolicy`) - exactly four values, and exactly what each permits through
  the public `GET /media/:id` path:

  | Policy | Public `url` resolved? | Notes |
  |---|---|---|
  | `PUBLIC` | Yes | Full asset and all READY variants |
  | `PREVIEW_ONLY` | No (`url: null`) | A privileged, role-gated read path may return more (`SourcesService.getDocumentForViewer` for the `SourceDocument` case) - there is no equivalent generic privileged `MediaAsset` full-read endpoint today (a documented limitation, not a hidden one) |
  | `METADATA_ONLY` | No (`url: null`) | Same as above |
  | `RESTRICTED` | No (`url: null`) | Same as above |

  This applies uniformly regardless of `status` - a non-`READY` asset already 404s before
  `accessPolicy` is even considered.
- **Reconstruction/AI disclosure** - render `mediaType === 'RECONSTRUCTION'` and/or
  `isAiGenerated: true` with an explicit disclosure label (e.g. Vietnamese "Minh họa phục dựng")
  using the `aiDisclosure`/`provenanceNote` text fields the API already returns - **never infer
  this from a filename or omit it**; the backend rejects creating such an asset in the first place
  without a disclosure string, so if `isAiGenerated`/`mediaType === 'RECONSTRUCTION'` is true,
  `aiDisclosure` (or `provenanceNote`) is guaranteed non-empty.

## 9c. Source / Citation public contract (spec sections 49/50)

`GET /sources` / `GET /sources/:id` (public) return: `id`, `sourceType`, `title`, `author`,
`organization`, `publisher`, `publicationYear`, `isbn`/`issn`, `edition`, `volume`, `archiveName`/
`archiveCode`, `originalLanguage`, `url`, `accessedAt`, `credibilityLevel`, `notes` (bibliographic
notes, not a reviewer's internal note - there is no separate internal-note field on `Source`), and
`sourceDocuments` (each redacted per its own `accessPolicy` - `extractedText` stripped entirely
unless `PUBLIC`, kept only for `PREVIEW_ONLY`). **`createdById`/`archivedById`/`archiveReason`
are never included** in the public response (a real leak found and fixed in Phase 11 - see
`SourcesService.redactSourceForPublic`) - those are internal workflow pointers, not bibliographic
content. A `Citation` (surfaced embedded in a Story's `citations` list, section 10a) exposes: `id`,
`source` (a Source summary), `pageFrom`/`pageTo`/`volume`/`chapter`, `excerpt`, `editorNote`,
`verificationState` (`UNVERIFIED`/`VERIFIED`/`REJECTED`/`DISPUTED`) - never an internal reviewer
note beyond `editorNote` (which is itself editorial context meant to be shown, e.g. "translated
excerpt", not a private note).

## 9d. Comments / votes / bookmarks / visits / profile contract (spec sections 57-61)

- **Comments** (generic `EntityKind` + `targetId`, shared across Place/Person/Event/Story/
  CommunityStory/Journey/Source): `parentId` for a reply (`null` for a top-level comment),
  server-computed `depth` (0-indexed, **maximum depth 3** - a reply attempt past that is rejected
  with `COMMENT_MAX_DEPTH`), `editedAt` (non-null once edited), and tombstone behavior - a
  `REMOVED`/`UNDER_REVIEW` comment's `body`/author are nulled out in the response but the row (and
  its replies) stay in the thread, never vanish structurally. Sorting is always chronological
  within a thread (oldest-first per depth level) - there is no alternate comment sort. Pagination
  is cursor-based (section 3.4). There is no per-caller "your vote state" field returned inline
  today - track it client-side after your own vote/unvote action, or infer nothing and always
  show the neutral state on a fresh load (a documented limitation, not a hidden one).
- **Votes** (`StoryVote`, `CommentVote`) are **explicit POST-to-add / DELETE-to-remove**, not a
  single idempotent toggle endpoint - `POST :id/vote` then `DELETE :id/vote` (Comments) or
  `POST .../:id/vote` then `DELETE .../:id/vote` (CommunityStory). Calling POST when a vote
  already exists, or DELETE when none exists, is idempotent (safe to retry, not an error) but is
  still two distinct calls, not one toggle call - do not build a UI that assumes a single
  endpoint flips state. Self-voting your own Comment/CommunityStory is rejected
  (`VOTE_SELF_NOT_ALLOWED`).
- **Bookmarks**: private by default with **no public-read path at all** - only the owner can ever
  list their own bookmarks (`GET /bookmarks`). Allow-listed targets only:
  `PLACE`/`STORY`/`JOURNEY`/`COMMUNITY_STORY` (any other `targetType` is rejected,
  `BOOKMARK_INVALID_TARGET`).
- **Place visits** (`POST /places/:slug/visits`): marks a place visited by the caller. No GPS/
  location proof is required or checked - this is an honor-system "I've been here" marker, not a
  location-tracking feature; no coordinates are ever sent or stored by this endpoint.
  `visitedAt` is the server timestamp of the call, not a claimed visit date. Visibility: private
  by default; a user's full own list is always visible to themselves
  (`GET /users/me/visited-places`); it appears on their **public** profile only if they opt in
  (`User.visitedPlacesPublic`, default `false`, changed via `PATCH /users/me`).
- **Public profile** (`GET /profiles/:id`) explicitly excludes: `email`, sessions, bookmarks
  (structurally - no public bookmark read path exists at all), moderation notes, and precise
  location (visited places are place-level, not coordinate-level, and opt-in only per above).
  It includes: `id`, `displayName`, `avatarMediaId`, `createdAt`, public `communityStories`
  (public-visible only), `contributionCount` (a bare count, never the Contributions themselves -
  raw Contributions have no public-read path either), `helpfulReceived`, `badges`, and
  `visitedPlaces` (only when opted in).

## 9a. Contributions (Phase 09)

**Full contract: `docs/backend/CONTRIBUTION_ARCHITECTURE.md`.** Summary: `Contribution` is a controlled intake/review pipeline (`SUBMITTED -> TRIAGE -> PROVENANCE_REVIEW -> HISTORICAL_REVIEW -> ACCEPTED -> CATALOGUED`, or `REJECTED` at any review stage), enforced by one centralized transition method (`ContributionsService.submitReview`) - the client sends a `decision` (`APPROVE`/`REJECT`/`REQUEST_INFO`/`RETURN_TO_PREVIOUS_STAGE`), never a raw target status. **The core invariant: `Contribution ACCEPTED` is not `HistoricalFact PUBLISHED` and is not `Source VERIFIED`.** A contribution reaching `ACCEPTED` means review is complete enough to accept the material; it becomes trusted catalogue material only through a separate, explicit, audited `POST /admin/contributions/:id/catalogue/{source,document,media}` action (`HISTORIAN_REVIEWER`/`ADMIN` only), and `ACCEPTED -> CATALOGUED` happens automatically the moment the first catalogue result is created - never through `submitReview`. Cataloguing additionally requires `rightsReviewState = APPROVED_FOR_CATALOGUE` (a reviewer-only field, structurally separate from the submitter's own `submitterDeclaration` claim) and is idempotent (a second call for the same contribution returns the existing `ContributionCatalogueResult` rather than creating a duplicate `Source`). Self-review is refused everywhere (the contribution's own author can never review, rights-review, or catalogue their own submission, regardless of role). Every reviewer/admin write carries an `expectedVersion` (optimistic concurrency - a stale value is rejected with `CONTRIBUTION_VERSION_CONFLICT`). Raw contributions never appear in `GET /search` or `GET /editorial/home`, and a submitter's own detail view never includes internal review notes - only `rejectionReason` (meant to be read by the submitter) is exposed there.

## 9e. Moderation status semantics (spec section 65)

`ModerationStatus` (`CommunityStory`, `Comment`) - exactly these five values, this meaning:

| Status | Meaning | Publicly visible? |
|---|---|---|
| `VISIBLE` | Normal, no moderation action taken | Yes |
| `LIMITED` | Reduced visibility (e.g. de-ranked/collapsed by default) but not removed | Yes, with reduced prominence (frontend's choice how to render "limited") |
| `UNDER_REVIEW` | Flagged, pending a moderator decision | Yes (not equivalent to removed - do not hide it while under review) |
| `REMOVED` | Moderator-removed | No (tombstoned for Comments - see 9d; excluded from public lists for CommunityStory) |
| `LOCKED` | Content stays visible but further mutation (edits/replies/votes) is blocked | Yes, but treat as read-only in the UI |

`GET /admin/moderation/queue` (`MODERATOR`/`ADMIN`) and `POST /admin/moderation/actions`
(`{ targetType, targetId, action: REMOVE|RESTORE|LIMIT|LOCK|UNLOCK|MARK_UNDER_REVIEW, reason? }`)
are the single unified entrypoint - it delegates to the same per-domain setters `PATCH
.../moderation-status` already uses, so both surfaces stay consistent by construction. A
moderator can never action their own content (self-moderation is refused regardless of role,
same principle as Fact self-approval - see `AUTHORIZATION_MATRIX.md`).

## 9f. Admin contribution catalogue contract (spec section 64)

Restated precisely, because Admin UI must never let a reviewer submit an arbitrary next status:
`POST /admin/contributions/:id/reviews` takes only a `decision`
(`APPROVE`/`REJECT`/`REQUEST_INFO`/`RETURN_TO_PREVIOUS_STAGE`) plus `expectedVersion` - the
server alone computes the resulting `ContributionStatus`; there is no field in this request body
for a raw target status at all, so an Admin UI cannot even construct a request that attempts one.
Every reviewer/admin write (`reviews`, `rights-review`, `provenance-confidence`, `sensitivity`,
all three `catalogue/*` actions) requires `expectedVersion` matching the contribution's current
`version` - a stale value is rejected with `CONTRIBUTION_VERSION_CONFLICT` (optimistic
concurrency; refetch and retry). Catalogue actions additionally require `HISTORIAN_REVIEWER`/
`ADMIN` (stricter than the `EDITOR`+ gate on ordinary review actions) and
`rightsReviewState = APPROVED_FOR_CATALOGUE` first.

## 10. Admin

There is no separate "Admin API" module - every entity module exposes the role-gated mutation endpoints an Admin/CMS UI needs directly (create/publish/moderate/review), all listed in the endpoint inventory above and enforced by the same global `RolesGuard`. `GET /admin/audit?entityType=&entityId=` exposes the append-only audit trail (every fact/citation/moderation/role change is logged via `AuditService`, which has no update/delete method).

## 10a. Story body block schema (spec section 52)

A Story's structured body (`StoryTranslation.content`, returned as `body` in the public DTO) is a
JSON array of a **closed set** of block shapes, validated server-side by `validateStoryBody`
(`apps/api/src/modules/stories/story-body.util.ts`) - **never render it as arbitrary JSON/HTML**;
render exactly these block `type`s and nothing else:

| `type` | Fields | Renders as |
|---|---|---|
| `heading` | `level` (2\|3\|4), `text` | A heading at the given level |
| `paragraph` | `text` | Plain paragraph text |
| `quote` | `text`, `attribution?`, `citationId?` | A blockquote, optionally linked to a citation |
| `image` | `mediaAssetId`, `caption?` | Resolve `mediaAssetId` via `GET /media/:id` for the actual URL - never construct a storage URL yourself |
| `source_reference` | `citationId`, `label?` | An inline footnote/citation marker - `citationId` is a real `Citation.id`, resolvable against the Story's own `citations` list (section 10a's sibling, section on Story detail) |
| `entity_reference` | `entityKind` (`PLACE`\|`PERSON`\|`EVENT`\|`ERA`\|`TERRITORY`), `entityId`, `text?` | An inline link to another entity |
| `callout` | `style` (`info`\|`warning`\|`disclosure`), `text` | A highlighted callout box - `disclosure` is used for AI-translation/UGC-adjacent/sensitive-context notices (e.g. the Hoàng Sa/Trường Sa dossier Story) |
| `audio` | `mediaAssetId`, `caption?` | Resolve via `GET /media/:id` same as `image` |

Any block whose `type` is not in this list (including anything `html`/`iframe`/`embed`-shaped) is
rejected server-side at write time - it can never appear in a stored Story, so the frontend does
not need its own defensive sanitization pass, but still must not attempt to `dangerouslySetInnerHTML`
or otherwise treat block text as trusted markup - treat every block's text fields as plain text.

## 10b. Entity summary / slug / URL-locale contract (spec sections 22-24)

- **Identity is always the entity's stable `id`** (a cuid, e.g. `Place.id`), never the slug.
  `canonicalSlug` is derived once from the Vietnamese name at creation and **never changes**
  afterward, even if the Vietnamese translation is later edited - safe to use in a URL long-term.
  Each locale's `*Translation` row carries its own `slug` (e.g. a Place might have `canonicalSlug:
  "co-do-hue"` and an English translation `slug: "hue-imperial-city"`) - **a Vietnamese slug is
  not guaranteed to also work as an English route param and vice versa**; always resolve a
  locale-specific route via that locale's own translation slug, not by assuming one string works
  for both locales.
- **For frontend locale-switching**, resolve the *same entity* across locales via its stable `id`
  (fetch once, keep the `id`, refetch or query the other locale's slug from a translations list
  if you need a locale-specific URL) - **never re-derive a slug by translating text client-side.**
- **No shared `EntitySummary` DTO type exists as a formal exported type** (spec section 22 -
  avoiding refactor-for-DRYness-alone of otherwise-working code per this phase's brief) - but the
  shape is consistent by convention across every list/related-content endpoint: `{ id, slug, ...
  a locale-resolved display field (name/title), type/kind where relevant }`. Check
  `docs/backend/openapi.json` for the exact per-endpoint shape rather than assuming a name across
  resources (e.g. Place/Person use `name`, Event/Story/Journey use `title`).
- **UUID vs slug vs stable key:** every canonical entity (Place/Person/Event/Era/Dynasty/
  Territory/Story/Journey/Source/HistoricalFact/CommunityStory/Contribution/MediaAsset) uses a
  cuid `id` as its true identity and (where browsable) a `canonicalSlug` for URLs. The Golden
  Dataset additionally uses stable human-readable string keys (`PLACE_HUE`, `SRC_UNESCO_HUE`,
  `FACT_HUE_UNESCO`, etc.) purely as **seed-time-only** authoring keys inside
  `prisma/golden/*.ts` - these are never the real database `id` format for anything except
  `Source`/`HistoricalFact`/`Citation`/`FactReview` rows seeded by the Golden Dataset specifically
  (where the seed key *is* used as the literal `id`, for seed idempotency - see
  `docs/backend/GOLDEN_DATASET.md`). **Never hardcode a Golden Dataset id/key in frontend code** -
  always resolve entities by slug/query, never by assuming a specific seeded row's id is stable
  across environments.

## 10c. Rate limits / CSRF / CORS (spec sections 68-70)

- **Rate limiting** (`ThrottlerModule`, applied globally via `APP_GUARD`, IP-based): a default
  bucket (`RATE_LIMIT_TTL`/`RATE_LIMIT_MAX` env vars, seconds/count) applies to every route, with
  tighter per-route overrides on sensitive actions: register (5/min), login (10/min), refresh
  (20/min), email-verification-resend (5/min), request-password-reset (3/min), reset-password
  (5/min), change-password (5/min), CommunityStory creation (5/min), comment creation (20/min),
  comment votes (60/min), story votes (30/min), report filing (10/min). A limited request receives
  HTTP `429` with `code: "RATE_LIMITED"` (or the auth-specific `AUTH_RATE_LIMITED` on auth routes)
  - back off and retry after the window, there is no `Retry-After` header currently exposed.
- **CSRF** - only relevant to web cookie-mode auth mutations (`/auth/refresh`, `/auth/logout`);
  see section 7.2 for the exact header/cookie contract. No other endpoint uses cookie-based auth
  (every other authenticated endpoint uses the `Authorization: Bearer <accessToken>` header, which
  is not vulnerable to CSRF the way cookies are), so no other endpoint requires a CSRF token.
- **CORS** - `CORS_ORIGINS` (comma-separated origin list) is read at boot; if empty, the server
  reflects whatever `Origin` header the request sent (a development convenience) with
  `credentials: true` always enabled. **Production deployments must set `CORS_ORIGINS` explicitly
  to the real web/admin origins before launch** - the empty-reflects-anything default must never
  ship as-is once cookie-mode auth is in use.

## 10d. Request ID / Health contract (spec sections 86/87)

- **Request ID**: every response (success or error) carries an `X-Request-Id` response header
  (`RequestIdMiddleware`, Phase 11 addition); error bodies additionally include it as
  `error.requestId` in the JSON (section 3.3). Reuse it verbatim when reporting a bug.
- **Health**: `GET /health` (public) - a single liveness+readiness-style endpoint (this API does
  not distinguish separate liveness/readiness probes today), returning `{ status, checks: {
  database, redis } }`. **Only report a dependency as healthy if it was actually checked** - the
  handler performs a real lightweight query/ping against each; it does not assume health.

## 10e. Environment variables (spec sections 71-73)

Authoritative template: **`.env.example`** (repo root - `apps/api` reads the same variables via
`@nestjs/config`, no separate `apps/api/.env.example` content diverges from it). Validated at
boot (`apps/api/src/config/env.validation.ts`) - **the app refuses to start** if `DATABASE_URL`/
`REDIS_URL` are missing or `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` are under 32 characters,
unit-tested. Classification:

| Variable | Class | Notes |
|---|---|---|
| `DATABASE_URL` | REQUIRED, SECRET | Boot-validated |
| `REDIS_URL` | REQUIRED | SECRET if the Redis instance requires auth in its URL |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | REQUIRED, SECRET | Boot-validated, min 32 chars |
| `NODE_ENV`, `PORT`, `API_PREFIX`, `APP_URL` | OPTIONAL | Safe defaults |
| `CORS_ORIGINS` | OPTIONAL, PUBLIC/NON-SECRET | **Must be set explicitly in production** - see 10c |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | OPTIONAL | Defaults `15m`/`30d` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALLBACK_URL` | OPTIONAL, SECRET (client secret) | Feature disables gracefully if unset - see 7.6 |
| `S3_*` (endpoint/region/keys/bucket/TTLs) | REQUIRED for media upload, SECRET (keys) | MinIO locally, any S3-compatible store in production |
| `MEDIA_PENDING_UPLOAD_EXPIRY_MINUTES` | OPTIONAL | Default 60 |
| `SMTP_*` | OPTIONAL, SECRET in production | Mailhog locally (no real credentials) |
| `RATE_LIMIT_TTL` / `RATE_LIMIT_MAX` | OPTIONAL | Defaults 60s / 120 |
| `SKIP_DB_CONNECT` | DEVELOPMENT_ONLY / tooling-only | **Never set for a real server boot** - see 3.9. Not read by `main.ts` at all. |

## 10f. Frontend integration rules (spec section 91)

**Codex MAY:**

- Consume every documented API in this handoff and in `docs/backend/openapi.json`.
- Build Web, Expo/React Native, and Admin UI against these documented contracts.
- Generate/hand-write a typed API client wrapper from `docs/backend/openapi.json`.
- Report a backend contract gap, ambiguity, or bug back rather than guessing.

**Codex MUST NOT:**

- Import `@prisma/client` (or any Prisma type) into any frontend package - see section 3.8.
- Bypass the API with direct database access, ever.
- Invent an undocumented backend field/endpoint/enum value and rely on it existing.
- Silently change a backend response contract by "fixing" the frontend to expect something new -
  a contract change is a backend change, requested and reviewed as one.
- Treat `CommunityStory`/`Contribution` content as verified `HistoricalFact` - render the UGC
  disclaimer/appropriate trust framing per section 8/9a; `verificationState`/`ContributionStatus`
  values like `SOURCE_ATTACHED`/`VERIFIED_CONTRIBUTION`/`ACCEPTED`/`CATALOGUED` are **never**
  equivalent to a published, cited `HistoricalFact`.
- Expose a `RESTRICTED`/`METADATA_ONLY` `MediaAsset`/`SourceDocument`'s content past what its
  `accessPolicy` already permits through the documented API response (there is no "restricted
  URL" to expose in the first place - the API itself never returns one to an unauthorized caller,
  per the Phase 11 leak-audit fixes in section 9).
- Fabricate/adjust a historical date (always render exactly what `HistoricalDateResponse` gives -
  section 2's date contract - never invent a day/month the API left `null`).
- Hardcode a Golden Dataset database id in frontend code (section 10b).

If a real gap blocks frontend work (a genuinely missing endpoint/field), report it as a backend
blocker rather than working around it with an unauthorized contract change.

## 11. Test accounts (seed, `DevPassword123!` for all - dev/local only, never use in production)

`admin@dauviet.vn` (ADMIN), `editor@dauviet.vn` (EDITOR), `historian@dauviet.vn` (HISTORIAN_REVIEWER), `moderator@dauviet.vn` (MODERATOR), `contributor@dauviet.vn` (CONTRIBUTOR), `user@dauviet.vn` (USER).

## 12. Golden Dataset (Phase 10 — full contract: `docs/backend/GOLDEN_DATASET.md`)

**As of Phase 10, this is a real, source-backed, citation-complete reference corpus** — not just
a structural placeholder. Domain-separated pure-data modules live under `prisma/golden/*.ts`
(`prisma/golden-dataset.ts` is kept as a stable re-export of `GOLDEN_PLACES` only, per its
existing "single source of truth" doc claim); `prisma/seed.ts` orchestrates the actual upserts in
dependency order (eras/dynasties/themes -> places -> people -> events -> sources -> facts ->
stories -> journeys -> editorial slots).

**Counts:** 12 Places (Hoàng thành Thăng Long, Văn Miếu – Quốc Tử Giám, Cổ Loa, Hoa Lư, Cố đô Huế,
Mỹ Sơn, Hội An, Điện Biên Phủ, Địa đạo Củ Chi, Dinh Độc Lập, Hoàng Sa, Trường Sa - the last two as
real `ARCHIPELAGO` Place rows, single representative-point coordinates, never hard-coded map
labels), 8 People, 8 Events, 6 Eras, 3 Dynasties, 4 Themes, **23 Sources, 28 PUBLISHED
HistoricalFacts (100% carry >=1 VERIFIED Citation - see below), 30 Citations, 5 editorial Stories,
3 Journeys, 5 EditorialSlot rows.**

**Citation coverage: 28/28 PUBLISHED facts (100%) verified-cited** - every substantive claim
traces to a real UNESCO/official-Vietnamese-government/Britannica/peer-reviewed source (never a
blog, SEO page, Wikipedia, or Fandom wiki - those were used only to locate leads, per the Phase 10
source policy). Full source-by-source manifest: `docs/backend/golden-data/sources-manifest.md`.
What was researched-and-omitted rather than fabricated: `docs/backend/golden-data/
research-notes.md`.

**Hoàng Sa/Trường Sa dossier**: no territorial claim, boundary, or `TerritoryGeometry` was added -
both remain plain `ARCHIPELAGO` Place rows. The actual dossier (historical documents cited by
Vietnam's official MOFA position, the 1974 Paracels naval engagement, the existence of multiple
international claimants, and Vietnam's own current domestic administrative organization) lives in
four individually-cited, neutrally-framed `HistoricalFact` rows with `sensitivity: TERRITORIAL`,
each with its own `reviewedById`/`reviewedAt` (spec section 13's "current-context needs a review
date" requirement) - see `GOLDEN_DATASET.md` section 9 for the full framing rationale.

**What is honestly labeled, not silently upgraded:** Vietnamese text is `method: ORIGINAL`
(canonical/source language); every English translation is honestly `method: AI_ASSISTED` /
`status: AI_ASSISTED` (drafted by Claude, never human-reviewed - a real audit-and-fix from this
phase: every prior phase's English text had been mislabeled `HUMAN`). Fact `certainty` is
deliberately not uniform (13 `CONFIRMED`, 14 `HIGH_CONFIDENCE`, 1 `TRADITIONAL_ACCOUNT` for Cổ
Loa's legendary founding, which also deliberately has no fabricated BCE date - the date-model
codebase has no BCE support anywhere, so the claim is kept with `date: UNKNOWN` rather than
inventing a Gregorian conversion). **No `CommunityStory` or `Contribution` rows are seeded at all**
- no fabricated "real" community memory or contribution exists in production seed data; both are
statically regression-tested (`trust-regression.spec.ts`, `golden-dataset-validation.spec.ts`).

**Idempotency/production safety:** every write is an `upsert` with an empty `update: {}` - a
second seed run never duplicates a row, and (just as importantly) never overwrites a row a real
editor has since corrected through the normal API. See `GOLDEN_DATASET.md` section 12 for the
correction workflow this implies for *already-seeded* content going forward.

## 13. Known limitations (be explicit, not hidden)

- **Live database validation completed in Phase 12** (this bullet was accurate through Phase 11;
  it no longer is). The full 11-migration chain, the Golden Dataset seed (idempotency and
  production-safety), a real Nest API boot, and every critical HTTP flow (auth/CSRF/RBAC/rate
  limiting/Map/Nearby/Timeline/Search/Media/Comments/Contributions/audit log) have all been
  executed against a real running PostgreSQL+PostGIS/Redis/MinIO stack - see
  `docs/backend/LIVE_QA_REPORT.md` for full reproducible evidence and
  `docs/backend/BACKEND_FREEZE_REPORT.md`'s Phase 12 section for the freeze decision
  (`BACKEND_FREEZE_PASS`). Three real defects that only live execution could surface were found
  and fixed in that phase (a migration SQL bug, a missing runtime dependency, a search-ranking
  string-concatenation bug) - see the Phase 12 section for detail. Docker Desktop was simply not
  running as an application process in every prior phase's sandbox, not fundamentally
  incompatible with this host as those phases assumed.
- Unit tests cover the trust-layer integrity rules (fact publish gate, citation existence, community verification separation, locale fallback), the full auth/session/RBAC layer (Phase 02), the historical date model (Phase 03), the review-history/retraction/source-archive/document-access-policy trust layer (Phase 04), the media lifecycle/security layer (Phase 05), real image-derivative generation and integrity verification against actual `sharp`-generated image bytes (Phase 05.1), the editorial Story/Journey domain (Phase 06), the discovery layer (Phase 07) - Map bbox validation (including SQL-injection-shaped input rejected before any query runs) and zoom-based density, Timeline's overlap-vs-containment range fix, Search's exact-match ranking/diacritic normalization/community-content penalty, Nearby's coordinate/radius validation and meters-based distance, a Person timeline endpoint, and a static grep guard proving `$queryRawUnsafe`/`$executeRawUnsafe` are never used anywhere in `src/` - the Community/UGC layer (Phase 08), the contribution intake/review/cataloguing pipeline (Phase 09 - centralized transition policy, self-review refusal, provenance/rights separation, idempotent/transactional cataloguing, optimistic concurrency), and, as of Phase 10, the Golden Dataset itself (citation-coverage/idempotency/trust-boundary static validation against the real pure data structures, plus the real production `validateStoryBody` function run directly against every seeded Story body) - all with mocked Prisma/S3/queue (never a real network/DB call) but real image processing/hashing code paths where applicable, and, as of Phase 11, one dedicated suite (`openapi-contract.spec.ts`) that boots the **real, complete** Nest DI graph (every real module/controller/DTO, `SKIP_DB_CONNECT=true`, no live database) to generate and assert against the actual OpenAPI document, **572/572 passing** without a database or live object storage (44 suites; was 528/528 across 41 suites at the end of Phase 10 - Phase 11 added `openapi-contract.spec.ts` (32 tests), `common/errors/error-codes.spec.ts` (5 tests, global error-code uniqueness), `modules/community/dto/community-story.dto.spec.ts` (4 tests, sort/type/limit validation), extended `golden-dataset-validation.spec.ts`'s idempotency sweep, and added two private-field-leak regression tests to `media.service.spec.ts`/`sources.service.spec.ts`). Integration/e2e tests (`apps/api/test/health.e2e-spec.ts`) require a live database and were not executed here (its unrelated `supertest`/`@types/supertest` TypeScript call-signature mismatch, flagged in Phase 08, was fixed in Phase 09). Full historical-domain contract: `docs/backend/HISTORICAL_DOMAIN.md`. Full trust-layer contract: `docs/backend/TRUST_MODEL.md`. Full media contract: `docs/backend/MEDIA_ARCHITECTURE.md`. Full editorial contract: `docs/backend/EDITORIAL_CONTENT.md`. Full discovery contract: `docs/backend/DISCOVERY_ARCHITECTURE.md`. Full contribution contract: `docs/backend/CONTRIBUTION_ARCHITECTURE.md`. Full Golden Dataset contract: `docs/backend/GOLDEN_DATASET.md`.
- **Google OAuth is `UNVERIFIED_EXTERNAL_CREDENTIAL`** - implemented, but never exercised against a real Google Cloud OAuth app (no credentials configured, no live network validation possible in this sandbox). No native-app (deep-link) Google flow exists, only the browser-redirect one. See `docs/backend/AUTH.md` section 11.
- **Phase 05.1 closed both Phase 05 media gaps**: `MediaProcessor` now generates real image derivatives via `sharp` (mandatory THUMBNAIL/MEDIUM/LARGE WebP + best-effort AVIF, aspect-ratio-preserving, EXIF-orientation-normalized, metadata-stripped), and `confirmUpload` computes an authoritative server-side streamed SHA-256 rather than trusting a client-supplied one. No malware/virus scanner exists (`UNVERIFIED_MALWARE_SCANNER` - unchanged). No audio/video transcoding (out of scope for 05.1). See `docs/backend/MEDIA_ARCHITECTURE.md` "Known limitations".
- No Territory geometry seeded (no fabricated historical boundaries).
- `packages/domain`, `packages/api-client`, `packages/types`, `packages/validation`, `packages/i18n`, `packages/config` from the target monorepo tree were not created - Swagger/OpenAPI (`/docs-json`) is the authoritative contract for frontend codegen instead of hand-maintained shared packages. Generate a typed client from it (e.g. `openapi-typescript` or `orval`) rather than depending on Prisma types directly.
- `apps/web`, `apps/mobile`, `apps/admin` are intentionally not scaffolded - that is Codex's frontend scope per the master directive.
- Email delivery (verification/password reset) uses Mailhog in dev (`http://localhost:8025`) - no production SMTP/provider is wired up.
- Rate limiting (`ThrottlerGuard`) is now actually applied globally (Phase 01 had it configured but never wired to `APP_GUARD` - fixed in Phase 02) with tighter per-route overrides on register/login/refresh/verification-resend/password-reset/change-password (see `docs/backend/AUTH.md` section 12). It tracks by IP only, not per-account - acceptable for v1 but worth revisiting if shared-IP/NAT traffic causes false positives.
- Production `CORS_ORIGINS` must be set explicitly to the real web/admin origins before launch - the current default (empty -> reflects request Origin) is a development convenience that must not ship as-is, especially now that cookie-mode auth uses `credentials: true`.
- Argon2id's native binding (`argon2` npm package) was confirmed working in this sandbox (`argon2.hash`/`argon2.verify` round-trip tested directly via `node -e`), but the full app was never booted against a live DB to confirm end-to-end - see the live-verification caveat above.
- **Phase 11 additions**: a machine-generated `docs/backend/openapi.json` (regenerate via `pnpm --filter @dauviet/api openapi:generate`, no live DB needed), a `requestId`/`X-Request-Id` correlation id on every response, two real private-field leaks found and fixed (`GET /media/:id` previously leaked the raw S3 `storageKey` plus several internal workflow fields; `GET /sources`/`GET /sources/:id` previously leaked `createdById`/`archivedById`/`archiveReason`), and an unvalidated `sort`/`type` query gap closed on `GET /community/stories`. None of these required a schema migration. **`SKIP_DB_CONNECT`** (env var, read only by `PrismaService.onModuleInit`) is a new, narrowly-scoped tooling escape hatch for offline OpenAPI generation/contract tests only - `main.ts` never sets it, so a real server boot's fail-fast-on-unreachable-database behavior is unchanged.
- Rate limiting and CSRF enforcement are implemented, unit-tested, **and confirmed live in
  Phase 12** against a real running server: repeated real HTTP requests against a rate-limited
  route correctly return `429` once the configured window is exceeded, and the real cookie-mode
  refresh flow correctly returns `403 AUTH_CSRF_INVALID` without the `X-CSRF-Token` header and
  succeeds with it - see `docs/backend/LIVE_QA_REPORT.md` section 5.

## 14. GLOBAL BACKEND V2 EXTENSION - G01 status

**Everything above this section describes DẤU VIỆT BACKEND V1 (Phase 00-12.1), which remains
`BACKEND_FREEZE_PASS` and is unchanged by G01.** G01 is the first controlled phase of a new,
additive **Global Backend V2 Extension** program, per the locked G00 Product Constitution V2 (the
platform's pivot from a Vietnam-only historical atlas to a global history/culture/travel
platform, with Vietnam as its strongest first-party vertical). **This section does not upgrade or
reopen the V1 freeze decision** - it is a new, separate program status.

**G01 (Global Geography Foundation) verdict: COMPLETE.** Added a new, additive `Country` /
`Region` / `City` / `Destination` domain (models, migration, admin+public REST APIs, VI/EN
translations, aliases, a Vietnam+Japan representative seed) without renaming, replacing, or
opportunistically refactoring any V1 model. Full contract: `docs/backend/GLOBAL_GEOGRAPHY.md`.
Phase roadmap: `docs/backend/GLOBAL_V2_ROADMAP.md`.

**What was proven live** (Docker was healthy in this session - PostGIS/Redis/MinIO/Mailhog, same
stack V1 used): a fresh 12-migration chain (11 V1 + the new
`20260906000000_g01_global_geography`) applied cleanly from an empty database; the Golden Dataset
seed ran twice with byte-identical row counts before/after the second run (2 Country, 4 Region, 4
City, 4 Destination, 8/8/8 translations, 28 EntityAlias rows - see `GLOBAL_GEOGRAPHY.md` for the
exact table); a real server boot registered every new route; `GET /v1/countries`,
locale-fallback-aware `GET /v1/countries/:slug` (vi and en both verified), `GET
/v1/countries/:slug/regions`, `GET /v1/cities/:slug`, `GET /v1/cities/:slug/destinations`, and a
region-less `GET /v1/destinations/:slug` (Hoi An Ancient Town - Country -> City -> Destination,
no Region) all returned correct real data; an unauthenticated `POST /v1/countries` returned `401`,
an authenticated non-`EDITOR` user returned `403`, an `EDITOR` create+publish cycle worked and
correctly hid the `DRAFT` row from the public read (`404`) until published (`200`); a real
cross-country `City.regionId` mismatch was rejected with `400 GEOGRAPHY_COUNTRY_MISMATCH`; and
both `country.created`/`country.status.changed` audit rows were correctly attributed via `GET
/v1/admin/audit`. The database was then reset and re-seeded once more to leave only the golden
dataset behind (no disposable QA rows).

**Regression**: root/API `tsc --noEmit` clean, `nest build` clean, `eslint --max-warnings=0`
clean, **`npx jest`: 50 suites / 633 tests passing** (up from the Phase 12.1 baseline of 44
suites / 572 tests - no existing test was modified in a way that weakens its assertion, only
additive test files plus a handful of additive cases appended to
`modules/aliases/aliases.service.spec.ts`), **e2e: 2 suites / 3 tests passing**, unchanged from
Phase 12.1. `docs/backend/openapi.json` was regenerated via the real `nest build` +
`openapi:generate` path (never hand-edited) and now includes every new route.

**Deferred to later Global phases (not scope creep into G01):** provider/hotel/restaurant/
activity integration and licensing (G02/G05), global historical-content enrichment for these new
countries (G03), Destination editorial experiences (G04), Trip planning and everything under it
(G06+), global Search/Map integration of these entities (G11). No `Provider`/`Trip`/`Affiliate`
table or route exists anywhere in this codebase as of G01.

## 15. GLOBAL BACKEND V2 EXTENSION - G02 status

**G02 (Provider + Licensing Foundation)**, built on the unchanged V1 (`BACKEND_FREEZE_PASS`) and
G01 (`COMPLETE`) baselines. Not a reopening of either. Full contract:
`docs/backend/PROVIDER_LICENSING.md`. Research: `docs/backend/PROVIDER_RESEARCH.md`.

Added a provider-neutral `ExternalProvider` (not "TravelProvider" - future providers may include
maps/currency/weather) domain: capabilities (SUPPORTED_BY_PROVIDER vs ENABLED_FOR_OUR_ACCOUNT are
two distinct models), per-environment integrations, licenses with **tri/four-state rights**
(`UNKNOWN`/`ALLOWED`/`PROHIBITED`/`CONDITIONAL` - never a Boolean), operational data-retention
policies (always traced to a license), first-class attribution rules, and policy evidence. The
entire domain is admin-only (`ADMIN` role, zero public routes) and entirely independent of both
the V1 historical Source/Citation trust chain and G01's geography models (structurally
regression-tested, `common/providers/schema-graph.spec.ts`). No real provider (Google/Booking/
Agoda/Viator/Amadeus) is credentialed, activated, or claimed as a partner anywhere in this
codebase - every researched candidate is documented, never integrated.

**Two real runtime defects were found and fixed during this phase's own live QA** (not deferred,
not left as known issues) - full root-cause/fix/regression/live-proof detail in
`PROVIDER_LICENSING.md` section 3a:

1. Capability enablement (`ProviderIntegrationCapability`, "our account has API access to this
   capability") was incorrectly gated by the same license check as full activation, making it
   impossible to ever observe "enabled but not yet licensed" and producing a misleading error code
   on every failed activation attempt regardless of the real cause. Fixed by splitting
   `enableCapability` (ungated) from `activateCapability` (fully gated).
2. `ProviderRegistryService`'s license query pre-filtered to `status: APPROVED`, which made the
   evaluator's own `REVOKED`/`EXPIRED`/`NOT_APPROVED` branches unreachable in production - a
   revoked license produced the generic `PROVIDER_LICENSE_NOT_FOUND` instead of
   `PROVIDER_LICENSE_REVOKED`. Fixed by fetching every applicable license regardless of status and
   selecting the most relevant one (capability specificity, then `APPROVED` preferred, then most
   recently updated).

A third issue was corrected as a design clarification during the same QA pass: `CONDITIONAL`
rights now fail closed (previously treated as effectively `ALLOWED`) - G02 has no
machine-evaluable condition checker, so an unverified constraint must never silently pass.

**What was proven live** (Docker/Postgres healthy this session, same stack V1/G01 used): a fresh
13-migration chain (12 prior + `20260907000000_g02_provider_licensing`) applied cleanly from an
empty database, twice, with the golden dataset seed re-run twice showing byte-identical counts
(G02 itself adds zero production provider rows by design); the full mandated activation lifecycle
(create provider -> declare capability -> configure integration -> enable capability -> blocked
without a license -> license with UNKNOWN rights still blocked -> rights set ALLOWED -> attribution
configured -> activation succeeds -> execution context resolves with no raw secret -> license
revoked -> execution context immediately rejected with the specific `PROVIDER_LICENSE_REVOKED` code,
no restart or cache invalidation needed -> license restored -> integration suspended -> blocked
independently of the now-valid license) all passed against the real, corrected code; a dedicated
matrix test drove every lifecycle status (`DRAFT`/`TERMS_REVIEW`/`LEGAL_REVIEW`/not-yet-effective/
expired-by-date/`REVOKED`/`CONDITIONAL`/`PROHIBITED`/`UNKNOWN`) through the real
`ProviderRegistryService` + Postgres path (not just the pure evaluator) and got the correct specific
code every time; the full RBAC matrix (unauthenticated/USER/EDITOR/HISTORIAN_REVIEWER/MODERATOR all
rejected, ADMIN allowed) was reconfirmed against the corrected code; a real transaction-rollback
probe (mirroring the Phase 12.1 audit-propagation lesson) proved neither the integration mutation
nor its audit row survives when the transaction fails partway through.

**Regression**: root/API `tsc --noEmit` clean, `nest build` clean, `eslint --max-warnings=0` clean,
**`npx jest`: 55 suites / 696 tests passing** (up from the G01 baseline of 50 suites / 633 tests -
no existing test weakened, only additive files plus the CONDITIONAL-semantics correction to one
pre-existing G02 test written earlier in this same phase), **e2e: 3 suites / 6 tests passing** (up
from 2/3 - the new `provider-activation.e2e-spec.ts`). `docs/backend/openapi.json` was regenerated
via the real `nest build` + `openapi:generate` path after every code change (never hand-edited).

**Deferred to later Global phases (not scope creep into G02):** any real provider API integration,
credentials, or activation (G05), Trip/geography-provider linking (`ProviderEntityReference`,
`AccommodationIdentity`, etc. - G05/G06), affiliate/monetization tracking (G10). No `Trip`,
`Affiliate`, or hotel/restaurant/activity table exists anywhere in this codebase as of G02.

## 16. GLOBAL BACKEND V2 EXTENSION - G03 status

**G03 (Global Historical Knowledge Extension)**, built on the unchanged V1/G01/G02 baselines.
**Verdict: COMPLETE.** Added `DateEra` (BCE/CE), pure-integer chronology ordinal columns
(`*ChronologyStart`/`*ChronologyEnd`, authoritative over the legacy `Date`-based `sortStart`/
`sortEnd` for ordering/range-filtering as of this phase), `Place.currentCountryId`/
`currentRegionId`/`currentCityId`, `EventCountry`, `EraCountry`, `PersonPlace`. Full contract in
the migration's own doc comment (`prisma/migrations/20260908000000_g03_global_historical_
knowledge/migration.sql`) and `chronology-backfill-parity.spec.ts`.

**What was proven live:** Migration Path A (fresh DB, all 15 migrations including G03) and Path B
(a real pre-G03 seeded database - reconstructed from the git commit immediately before G03 was
added - with the G03 migration applied on top, proving the legacy-year validation guard and the
in-migration chronology backfill against genuine pre-existing rows, not synthetic ones); direct
`psql` chronology verification for representative CE years (1010/1288/1789/1945/1954/1975),
hand-matching the same formula `chronology-backfill-parity.spec.ts` already proves in TypeScript; a
BCE/CE live query matrix (a disposable, cleaned-up BCE probe era, since no Golden Dataset content
has an authoritative exact BCE date - see below); the small Japan historical fixture (3 eras, 5
events, 2 people, 9 sources including 2 genuine `ja`-language government sources, 8 published
facts) live-served correctly in vi/en; seed idempotency (exact before/after counts); RBAC/audit/a
real PostgreSQL rollback proof; full V1/G01/G02 regression; OpenAPI regenerated with zero drift.

**Post-G03 operational hardening** (a separate, immediately-following remediation): closed a real
environment-precedence defect found during G03's own live QA - see section 1a above.

**Deferred/explicitly out of scope:** Cổ Loa's traditional ~257 BCE founding date was **not**
seeded (left as `UNKNOWN_DATE`/`TRADITIONAL_ACCOUNT`, unchanged) - no Tier A/B source was found
with a defensible exact-date representation, the same reasoning that excluded Emperor Jimmu's
legendary 660 BCE founding date from the Japan fixture. G11 global search/map BCE support remains
G11 scope.

## 17. GLOBAL BACKEND V2 EXTENSION - G04 status

**G04 (Destination Discovery)**, built on the unchanged V1/G01/G02/G03 baselines. **Verdict:
COMPLETE.** Full contract: `docs/backend/G04_DESTINATION_DISCOVERY.md`. Summary: additive-only
`DestinationPlace`/`Theme`/`Story`/`Journey`/`Event` composition relations, `DestinationCollection`
(+ translation/membership), `Destination.heroMediaId`, `DestinationTranslation.tagline`/
`whyVisit`; a deterministic, documented discovery-ranking formula and a computed (never persisted)
related-destinations feature; a real transactional "replace style" mutation pattern for every
composition relation, proven atomic against real PostgreSQL.

**What was proven live:** Migration Path A (fresh DB) and Path B (the real, already-seeded
post-G03 database, with an explicit before/after row-count comparison across every V1/G01/G02/G03
table proving zero data loss and zero Destination identity/slug change); seed idempotency; VI/EN
Destination detail composition for both Vietnam (Hanoi Old Quarter - themes, curated Places, a
published Story, the 1010 capital-move turning point) and Japan (Gion - themes, the G03 794 Kyoto/
Heian-kyō founding event as a turning point); deterministic list ordering and pagination (including
a tie-break unit test); draft-exclusion and unauthenticated-mutation live checks; RBAC/audit/a
real PostgreSQL rollback proof; full V1/G01/G02/G03 regression; the post-G03 environment-precedence
regression (a normal `node dist/main.js` boot with zero manually-injected env vars, TCP-level and
content-level proof it connected to the intended database); OpenAPI regenerated with zero drift.

**A real pre-existing G01 defect was found and fixed** by this phase's own live QA - `GET
/v1/destinations`'s documented filter query params were silently rejected by a dual-`@Query()`
binding collision. See `G04_DESTINATION_DISCOVERY.md` section 11 for the full root-cause/fix/
regression detail.

**Deferred to later Global phases (not scope creep into G04):** any provider/commercial/booking
data (G05), `Trip`/itinerary/cost engine (G06), location sharing (G08), expense settlement (G09),
affiliate/monetization (G10), any redesign of `/v1/search`/`/v1/map/features` (G11 - `Destination`
is not yet integrated into either). No `Trip`, `TripDay`, `TripItem`, or booking/availability table
exists anywhere in this codebase as of G04.
