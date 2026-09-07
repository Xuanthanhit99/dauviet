# Dau Viet - Global Geography (G01)

Global Phase G01, Global Backend V2 Extension. Status: **COMPLETE**. Backend V1 (Phase 00-12.1,
`BACKEND_FREEZE_PASS`) is unrelated and untouched - see `docs/backend/BACKEND_HANDOFF.md` section
14 for the program boundary. This document is the G01 contract; do not read it as reopening or
amending the V1 freeze.

## 1. What this is

The minimal global geography backbone every later Global phase (provider integration, trip
planning, global search/map) will build on: `Country` -> `Region`(optional) -> `City`(optional) ->
`Destination`. New, additive domain - no V1 model (`Place`, `Person`, `HistoricalEvent`, ...) was
renamed, replaced, or restructured.

## 2. Destination vs V1 Place - the single most important distinction

**`Destination != Place`.** A `Place` (V1, Phase 03) is a historical/place-of-interest entity -
the record for a specific historically significant site (a citadel, a monument, a battlefield). A
`Destination` (G01) is a global travel/discovery geography concept - a neighborhood, historic
district, island, natural area, or heritage area that a traveller would search for or plan a trip
around. They can coexist and even share a name: this dataset seeds both a V1 `Place` and a G01
`City`/`Destination` all named "Hội An" - the historical Place record, the municipality, and the
travel destination are three different things by design (G00 Product Constitution, "Destination !=
Place"). No relation was added between `Destination` and `Place` in G01 (deferred - not required by
any G01 API, and a specific relation shape should wait for a concrete G04/G05 requirement rather
than being added speculatively).

## 3. Entities

| Model | Required parent | Optional parents | Notes |
|---|---|---|---|
| `Country` | - | - | First-class, stable. `iso2`/`iso3` (ISO 3166-1), `defaultLocale`, `defaultCurrency` (ISO 4217). No `nameVi`/`nameEn` columns - see `CountryTranslation`. |
| `Region` | `Country` | `Region` (self, for sub-regions) | `type: RegionType` (`PROVINCE`, `STATE`, `PREFECTURE`, `AUTONOMOUS_REGION`, `METROPOLITAN_CITY`, `TERRITORY`, `OTHER`). Not every country's administrative system resembles Vietnam's - this is deliberately broad, not a province-only model. |
| `City` | `Country` | `Region` | `Region` is optional - Country is authoritative. `timezone` is a validated IANA identifier. |
| `Destination` | `Country` | `Region`, `City` | Both optional and independently nullable. `type: DestinationType` (`CITY_AREA`, `NEIGHBORHOOD`, `HISTORIC_DISTRICT`, `HERITAGE_AREA`, `ISLAND`, `ARCHIPELAGO`, `NATURAL_AREA`, `NATIONAL_PARK`, `COAST`, `BAY`, `TOURISM_AREA`, `OTHER`). |

Each has a `*Translation` table (`countryId`/`regionId`/`cityId`/`destinationId` + `locale` +
`name`/`slug`/`summary or shortDescription`/`description`/`seoTitle`/`seoDescription` +
`status: TranslationStatus` + `method: TranslationMethod`) - the same translation-table pattern V1
already uses for `Place`/`Person`/etc. No new translation enum was introduced; `TranslationStatus`/
`TranslationMethod` are reused as-is.

## 4. Hierarchy is not a rigid chain

The model deliberately supports every shape spec section 4 requires:

- `Country -> City` (no Region) - e.g. Hoi An (`City`, `regionId: null`).
- `Country -> City -> Destination` (no Region) - e.g. Hoi An Ancient Town (`Destination`,
  `regionId: null`, `cityId` -> Hoi An).
- `Country -> Region -> City -> Destination` (full chain) - e.g. Japan -> Kyoto Prefecture ->
  Kyoto -> Gion.
- `Country -> Destination` (no Region, no City) is also representable, though not exercised by
  the current seed.

There is no single mandatory `parentId` column forcing every record through the same levels.
Region's own `parentRegionId` self-relation additionally allows sub-regions where a country's
administrative reality needs it (not exercised by the current seed - no sub-region was needed for
Vietnam or Japan at this scale).

## 5. Hierarchy consistency validation

Enforced in each service (`RegionsService`/`CitiesService`/`DestinationsService`), not just by the
FK relations themselves:

- A `Region.parentRegionId` must belong to the same `Country` as the region itself, and can never
  create a cycle (walked with a bounded-depth loop, `REGION_PARENT_CYCLE`/
  `REGION_PARENT_COUNTRY_MISMATCH`).
- A `City.regionId`, when present, must belong to the same `Country` as `City.countryId`
  (`GEOGRAPHY_COUNTRY_MISMATCH`).
- A `Destination.regionId`/`Destination.cityId`, when present, must each belong to the same
  `Country`, and when both are present, a City's own Region (if it has one) must not contradict
  the Destination's given `regionId` (`GEOGRAPHY_REGION_CITY_MISMATCH`).

See `apps/api/src/common/geography/geography-consistency.util.ts` for the shared cycle/
same-country helpers, and each service's `*.service.spec.ts` for the covering unit tests.

## 6. Slug strategy - deliberately NOT uniform with V1

Every entity has a **`canonicalSlug`** (globally unique per model, auto-suffixed on collision -
the exact same mechanism `Place.canonicalSlug` already uses). This is the stable public API
lookup key (`GET /v1/countries/:slug`, etc.).

Translation-level `slug` differs by entity:

- `CountryTranslation` keeps the V1 `@@unique([locale, slug])` global constraint - real-world
  country-name collisions across countries are not a realistic risk.
- `RegionTranslation` / `CityTranslation` / `DestinationTranslation` do **NOT** get that global
  constraint - only `@@unique([<parent>Id, locale])`. Common city/region names legitimately
  collide worldwide (Springfield, Victoria, San Jose - spec section 14); promising global
  per-locale slug uniqueness for those would be unsafe. `canonicalSlug` remains the one
  collision-free identifier; the scoped routes (`/v1/countries/:c/cities`, `/v1/cities/:c/
  destinations`) give callers country/city context to disambiguate a common display name without
  needing a globally unique slug.

## 7. Locale / translation-fallback contract

Reuses the exact V1 contract (`apps/api/src/common/translation/resolve-translation.util.ts`,
`apps/api/src/common/decorators/locale.decorator.ts`): requested locale -> exact match, else the
canonical `vi` translation, else any remaining translation. Every public detail response carries
`meta: { requestedLocale, resolvedLocale, fallbackApplied }` so a client is never silently served
a different language than it thinks it asked for. Initial supported locales remain `vi`/`en` (per
G00) - `Country.defaultLocale` is a geography fact (e.g. Japan's is `ja`), not a restriction on
which locales this platform can translate into, and never determines a user's own UI language.

## 8. Publication / editorial state

Reuses the existing `PublicationStatus` enum (`DRAFT`/`IN_REVIEW`/`PUBLISHED`/`ARCHIVED`) rather
than inventing a bespoke geography workflow - no `Story`/`HistoricalFact`-scale review pipeline is
warranted for a Country/Region/City/Destination record. Every public `GET` (list and detail)
filters to `PUBLISHED` only; publishing without at least one translation is rejected
(`GEOGRAPHY_CANNOT_PUBLISH_WITHOUT_TRANSLATION`), mirroring `PlacesService.setPublicationStatus`'s
existing guard.

## 9. Coordinates - representative points only, no PostGIS

`latitude`/`longitude` are plain, validated (`-90..90`/`-180..180`) `Float` columns, not PostGIS
geometry. No bbox/`ST_DWithin` query exists for these entities in G01 - `Place` already owns that
job for historical sites, and G11 (Global Search + Map) is the phase that should decide whether
Country/Region/City/Destination need real spatial queries, adding PostGIS geometry additively at
that point if a concrete bbox/proximity requirement emerges. No polygon/boundary geometry was
fabricated or ingested for any entity.

## 10. Timezone

`City.timezone` is a validated IANA identifier
(`apps/api/src/common/util/timezone.util.ts::isValidIanaTimezone`), never a fixed UTC offset (DST
exists). Validated via `Intl.DateTimeFormat` rather than `Intl.supportedValuesOf('timeZone')`
deliberately - the latter only enumerates *canonical* zone names and would incorrectly reject
long-standing IANA link aliases such as `Asia/Ho_Chi_Minh` (a real, valid identifier linked to
`Asia/Saigon`) that a human would reasonably type; this was caught live during G01's own
verification (see `docs/backend/LIVE_QA_REPORT.md`'s G01 section). `Destination`/`Region` carry no
separate timezone field - not duplicated, since no G01 API needs one independent of the City it
may belong to.

## 11. Currency / locale defaults

`Country.defaultCurrency` (ISO 4217) and `Country.defaultLocale` are geographical defaults only,
normalized uppercase/lowercase respectively and validated by regex in the DTO layer. Neither
determines a user's own UI language or currency preference (spec section 18) - those remain a
User-level concern, out of scope for G01.

## 12. Aliases

Reuses the existing generic `EntityAlias` architecture (`entityType` + `entityId` + `locale` +
`alias` + `aliasType`) rather than four bespoke alias tables. `EntityKind` gained `COUNTRY`/
`REGION`/`CITY`/`DESTINATION` (additive-only enum extension); `AliasesService.assertEntityExists`
gained four corresponding lookup cases, additive, every pre-existing case (`PLACE`, `PERSON`,
`EVENT`, `ERA`, `DYNASTY`, `TERRITORY`) untouched and re-tested unmodified
(`aliases.service.spec.ts`). Locale-agnostic romanizations use `locale: ''` (e.g. "Nihon",
"Nippon" for Japan); script-specific aliases carry their own locale (e.g. `ja`/"日本" for Japan,
seeded and verified live).

## 13. Archive/delete policy

**No delete endpoint exists anywhere in this domain** - the same convention V1's `Place`/`Person`
already use (neither has a `DELETE` route either). Archiving (`status: ARCHIVED`) only hides a
record from public reads; it does not cascade to children, and no uncontrolled cascade-delete
path exists at the DB level for these tables (`Region`/`City`/`Destination` FKs to their parents
use `RESTRICT`/`SET NULL`, never `CASCADE`, on the parent side - see the migration SQL).

## 14. Public API

All under `/v1`, following the existing global error envelope/pagination/locale conventions.
Pagination is offset-based (`OffsetPaginationQuery` - "small, bounded admin/reference lists",
exactly what this domain is), not cursor-based.

- `GET /v1/countries`, `GET /v1/countries/:slug`
- `GET /v1/countries/:slug/regions`, `.../cities`, `.../destinations` (each accepts the relevant
  scoping filters - `region`, `type`)
- `GET /v1/regions`, `GET /v1/regions/:slug` (filters: `country`, `parentRegion`, `type`)
- `GET /v1/cities`, `GET /v1/cities/:slug`, `GET /v1/cities/:slug/destinations` (filters:
  `country`, `region`)
- `GET /v1/destinations`, `GET /v1/destinations/:slug` (filters: `country`, `region`, `city`,
  `type`)

No new global search/map endpoint was added - G11 owns that integration; this data is
alias/slug/translation-ready for it.

## 15. Admin API

`POST`/`PATCH .../:id`/`PATCH .../:id/translations/:locale`/`PATCH .../:id/status` on each of the
four resources, gated `@Roles(EDITOR, ADMIN)` (see `docs/backend/AUTHORIZATION_MATRIX.md`) - the
same tier as V1's `Era`/`Dynasty` administration, since geography content carries no
historical-trust chain requiring the stricter `HISTORIAN_REVIEWER` gate `Place` has for its own
publication-status route. Every mutation is audited (`AuditService.log`, actions like
`country.created`/`region.status.changed`/etc.) - confirmed live via `GET /v1/admin/audit`.

## 16. Relationship with V1 `Place`

No relation was added between `Destination`/`City`/`Region`/`Country` and V1's `Place` in G01, and
`Place.currentAdminRegion` (a free-text string, per the Phase 03 gap this repo already documented)
was not touched or bulk-migrated into `Region`. Not required by any G01 acceptance gate; adding a
speculative relation without a concrete consuming API would be scope creep. A future phase that
needs "which historical Places are inside this Destination" should add that relation then, with
its own migration.

## 17. Known deferred items (see also `docs/backend/GLOBAL_V2_ROADMAP.md`)

Provider/hotel/restaurant/activity integration and licensing (G02/G05), global historical-content
enrichment for these countries (G03), Destination editorial experiences (G04), Trip planning and
everything downstream of it (G06+), global Search/Map integration (G11). No `Provider`, `Trip`,
`Affiliate`, or any hotel/restaurant/activity table exists anywhere in this codebase as of G01.

## 18. Seed data

`prisma/golden/geography.ts` (Vietnam + Japan only, per spec section 26 - not a historical-research
phase, summaries stay conservative, no unsupported UNESCO/heritage claim is asserted). See
`docs/backend/GLOBAL_V2_ROADMAP.md` and `BACKEND_HANDOFF.md` section 14 for the exact row counts
and live-verification evidence.
