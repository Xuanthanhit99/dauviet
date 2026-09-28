# G12 — External Integration Matrix

Audience: the freeze reviewer and whoever enables integrations in a deployment. Built from the actual
code (`apps/api/src/modules/**`, adapters and registries), not from intent. **No live provider
result was fabricated in G12**; where no credential exists, the integration stays blocked and the
table says so.

"Fails closed" = with the credential/approval missing (or revoked), the feature returns an empty
result or a typed 4xx and the rest of the API is unaffected — proven live where noted.

| Integration | Code ready? | Credentials in this environment? | Sandbox / live proof | Required for core? | Blocks freeze? | Deployment action |
|---|---|---|---|---|---|---|
| **PostgreSQL 16 + PostGIS 3.4 (+ pg_trgm, unaccent)** | yes | yes (local Docker) | Path A/B, full e2e, backup/restore | **yes** | no (proven) | provision managed PG with the 3 extensions available; `prisma migrate deploy` creates them (`IF NOT EXISTS`, needs a role allowed to `CREATE EXTENSION` or pre-created extensions) |
| **Redis 7 (BullMQ)** | yes | yes (local Docker) | e2e, Path C/D outage | yes for media + ingestion jobs; **not** for auth/trips/search/map (see Redis outage classification) | no | provision Redis; set `REDIS_URL` |
| **S3-compatible object storage** (media) | yes (AWS SDK v3; MinIO locally) | local MinIO only | G05-era media e2e; Path A smoke does not upload | no (media features only) | no | create bucket + least-privilege key; set `S3_*` |
| **Email (SMTP, nodemailer)** | partial: host/port/secure only, **no SMTP auth** | none (a local catcher would be required; the conventional port on this host belongs to another project, so G12 pointed SMTP at a closed port) | fail-soft proven: send failure is logged, request succeeds | no (verification/reset/invitation mails degrade) | no (documented P3) | use a relay that accepts unauthenticated submission from the API host, or add SMTP auth (post-freeze change) |
| **Google OAuth** | yes; G12 added a verified-email requirement before any account link | **no** | none (never exercised against a real Google app) | no (password auth is core) | no | create Google app, set `GOOGLE_*`, live-verify before announcing |
| **Wikidata** (G06.5) | yes | none needed (public API + User-Agent policy) | live-verified in G06.5 | no | no | set `WIKIMEDIA_USER_AGENT`/`WIKIMEDIA_CONTACT`, `KNOWLEDGE_INGESTION_ENABLED=true` |
| **Wikimedia Commons** (G06.5) | yes | none needed | live-verified in G06.5 (real media promotion) | no | no | as above + S3 |
| **UNESCO DataHub** (G06.5) | yes | none needed | live-verified in G06.5 | no | no | as above |
| **GeoNames** (G06.5) | yes (contract complete) | **no** (`GEONAMES_USERNAME` empty) | fail-closed proven (G06.5); **no live proof** | no | **no — external blocker** | register a GeoNames account, set `GEONAMES_USERNAME`, run a pilot job, live-verify |
| **Google Places** (G06.5) | yes (contract complete) | **no** | fail-closed proven (G06.5); **no live proof** | no | **no — external blocker** | billing-enabled key, set `GOOGLE_PLACES_API_KEY`, live-verify under Google's terms |
| **OpenStreetMap / Nominatim** | adapter hard-disabled by design | n/a | permanently disabled (usage policy forbids bulk use) | no | no | none |
| **Booking.com Demand API** (G10) | **no real adapter** (additive later; only the internal fixture adapter is registered) | **no** (partner approval + credentials) | none — no result fabricated | no | **no — external blocker** | partner approval → implement adapter against `AffiliateAdapter` → G02 provider/license/attribution rows → sandbox proof |
| **Agoda Partner API** (G10) | **no real adapter** | **no** | none | no | **no — external blocker** | same as Booking.com |
| **Viator Partner API** (G10) | **no real adapter** | **no** | none | no | **no — external blocker** | same as Booking.com |
| **G05 stay/food/activity offer providers** | provider layer + G02 gate ready; no real adapter; offers only from the development-seed fixture | **no** | fixture only (development seed); production seed profile seeds no fixture (G12) | no | no | real adapters are future work; note G05 offer display evaluates the `SANDBOX` integration (see final report P2) |
| **Fixture providers** (`TEST_PROVIDER_G05_FIXTURE`, `TEST_FIXTURE_PROVIDER_G10_AFFILIATE*`) | test/QA only | n/a | used for every G10/G12 live commercial proof | no | no | never create in production (production seed profile skips it) |

## Fail-closed evidence gathered in G12

- Provider disabled via G02 (`ExternalProvider.status = SUSPENDED`): the **next** G05 offers request
  returns `[]` and the **next** G10 click returns `403`; restoring `ACTIVE` restores both — no
  restart, no cache (`g12-certification.e2e-spec.ts` §3).
- License revoked: the next click is `403 PROVIDER_LICENSE_REVOKED`; **G12 fix**: an already-issued
  redirect token is now re-checked too, so it stops redirecting on the next request instead of for
  the rest of its 300 s TTL (§6 race test + unit tests).
- Offer endpoint with no provider data: `200` with `offers: []` (smoke, production seed profile).
- Missing optional credentials (GeoNames/Google/Booking/Agoda/Viator/Google OAuth/SMTP): the compiled
  API boots and `/v1/health` is `ok` (Path A boot with none of them set).

## What a freeze with external blockers means here

Core backend correctness (auth, knowledge, geography, discovery, trips, collaboration, location,
expenses, affiliate attribution *mechanics*, search, map) does not depend on any blocked
integration. Every blocked integration is behind the G02 gate or an explicit adapter registry and
fails closed. Enabling one later is additive (a credential + registry rows, and for G10 a new
adapter), followed by its own live proof.
