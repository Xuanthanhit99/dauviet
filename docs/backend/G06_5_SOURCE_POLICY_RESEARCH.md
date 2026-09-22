# G06.5 — Source Policy Research

Global Phase G06.5, Global Backend V2 Extension. Purpose: record what each candidate external
source's *current, official* documentation actually says about access, licensing, caching/storage,
and attribution — before any adapter is built — per the phase brief's section 5 requirement. This
is a policy/legal-posture research document, not an implementation doc (see
`G06_5_PRE_IMPLEMENTATION_REPORT.md` for schema/reuse decisions and
`G06_5_KNOWLEDGE_INGESTION.md` for adapter code once built).

Method (matches the precedent set by `docs/backend/PROVIDER_RESEARCH.md` for G02): every claim
below was fetched directly from an official first-party page (`developers.google.com`,
`wikidata.org`/`wikimedia.org`/`foundation.wikimedia.org`, `data.unesco.org`, `geonames.org`,
`operations.osmfoundation.org`) on **2026-09-22**. No blog, SEO page, or third-party summary is
used as the source of a compliance-relevant claim. Where an official page did not state something
on the page reviewed, that is recorded as **NOT STATED ON PAGE REVIEWED**, distinct from
**UNKNOWN**. No secrets appear anywhere in this document.

Rights below are recorded using the existing `ProviderRightState` enum vocabulary
(`UNKNOWN | ALLOWED | PROHIBITED | CONDITIONAL`) reused from G02's `prisma/schema.prisma`, per the
brief's instruction not to duplicate an existing rights enum. This is a **research classification**,
not yet the seeded `IngestionSourcePolicy` row — the actual seed values are finalized in
`G06_5_PRE_IMPLEMENTATION_REPORT.md`'s policy matrix and must independently pass fail-closed
`UNKNOWN`/`CONDITIONAL` handling regardless of how confident this research is.

---

## 1. Wikidata

**Source class:** `STRUCTURED_KNOWLEDGE`. **Transport:** REST API (`www.wikidata.org/w/rest.php/...`)
and SPARQL Query Service (`query.wikidata.org/sparql`).

**Official sources:**
- [Wikidata:Data access](https://www.wikidata.org/wiki/Wikidata:Data_access) — accessed 2026-09-22.
- [Wikimedia Foundation User-Agent policy](https://foundation.wikimedia.org/wiki/Policy:User-Agent_policy) — accessed 2026-09-22.
- [Wikimedia APIs Rate limits](https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits) — linked from the above, not independently deep-fetched this session; treat exact numeric limits as **UNKNOWN** until confirmed, rely on live 429/`Retry-After` handling instead of a hardcoded number.

**License:** **CC0** ("No rights reserved") for all structured data in the main/Property/Lexeme/
EntitySchema namespaces. Quoted: *"the structured data in the main, Property, Lexeme, and
EntitySchema namespaces is released under CC0."*

**Authentication:** None required for public read access (REST API + SPARQL). `authRequired: false`.

**Attribution:** Not legally required, but explicitly requested ("Powered by Wikidata" / "Data from
Wikidata" / "Source: Wikidata"). Rights classification: `attributionRequirement: NOT_REQUIRED`
(policy-legal), but the adapter will still emit a `Source: Wikidata` attribution string by
convention, since CC0 not requiring attribution is not the same as it being undesirable practice.

**Rate limit / concurrency:** No fixed numeric quota stated on the page reviewed for anonymous API
use; global Wikimedia guidance is to respond to HTTP 429 by honoring `Retry-After`, use
`Accept-Encoding: gzip,deflate`, and avoid excessive concurrent requests. **G06.5 default: bounded
concurrency = 1, conservative fixed delay between requests, honor 429/`Retry-After` — never a fixed
"safe" RPS assumed from a number we did not confirm on an official page.**

**User-Agent requirement (binding on every request):** exact format required by the Wikimedia
Foundation User-Agent policy: `<client name>/<version> (<contact info>) <library>/<version>`, contact
info must be an email, URL, or `(<project>; User:<name>)`. Missing/generic (`curl`, `python-urllib`)
User-Agents may receive HTTP 403 or be silently rate-limited/blocked without notice. **This is why
`WIKIMEDIA_USER_AGENT`/`WIKIMEDIA_CONTACT` are required env vars whenever Wikidata OR Commons is
enabled** (shared policy, shared header).

**Storage/caching rights:** `normalizedStorageRight: ALLOWED` (CC0 — no legal restriction on storing
normalized structured facts as *candidates*). Per the phase's canonical law this is still never
`ALLOWED` for *direct promotion* to `HistoricalFact` — CC0 licensing removes the *legal* blocker,
not the *editorial trust* requirement.

**Commercial use:** `ALLOWED` (CC0 imposes no commercial-use restriction).

**Scope discipline (binding, brief section 6):** no uncontrolled SPARQL crawling. `IngestionJob`
scope for Wikidata must be `EXPLICIT_ENTITY_SET` (explicit QIDs) or `COUNTRY`/`DESTINATION`-scoped
bounded lookups — never an unbounded `WORLD`-scope SPARQL query.

**Verdict:** Candidate for **LIVE** adapter in G06.5 (no credential required, license fully
permissive, bounded-scope discipline is an implementation choice, not a policy blocker).

---

## 2. Wikimedia Commons

**Source class:** `MEDIA`. **Transport:** MediaWiki Action API
(`commons.wikimedia.org/w/api.php`, read-only `query`/`imageinfo` actions).

**Official sources:**
- [Commons:Reusing content outside Wikimedia](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia) — accessed 2026-09-22.
- Wikimedia Foundation User-Agent policy (same as above — one shared policy for all Wikimedia-family APIs).

**License:** **Per-file, not uniform.** Quoted: *"each [file] may have different requirements for
crediting a photographer, linking a license, etc."* Some files are public domain, others
CC BY / CC BY-SA (with share-alike obligations on derivatives), a minority carry additional
non-copyright restrictions (trademark, personality/privacy rights) the license string does not
capture. **`normalizedStorageRight` for the *file itself* cannot be a single source-level constant
— it must be evaluated per `IngestionRecord`/`IngestionCandidate` from that file's own `imageinfo`
license fields.** The source-level `IngestionSourcePolicy` row therefore sets
`mediaReusePolicy: CONDITIONAL` with `conditionalNotes: "license/attribution must be read per-file
from the Commons API response; never assume a blanket license for all Commons files."`

**Authentication:** None required for public read access to file metadata. `authRequired: false`.

**Attribution:** Per-file — `attributionRequirement: CONDITIONAL`. The adapter must capture, per
file: author/creator (may differ from uploader), license identifier + license URL, and any
required attribution text, from the `imageinfo` API response, not inferred.

**User-Agent:** Same Wikimedia Foundation User-Agent policy as Wikidata — shared
`WIKIMEDIA_USER_AGENT`/`WIKIMEDIA_CONTACT` config.

**Rate limit:** Same MediaWiki Action API guidance as Wikidata (429/`Retry-After` driven, no fixed
numeric quota confirmed on an official page this session).

**Storage/caching rights:** File *metadata* (author, license, source URL, checksum where computable)
is `STORE_ALLOWED` — this is factual/legal metadata, not the copyrighted work itself. The binary
media file itself is only promoted into a real `MediaAsset` after a rights check per brief section
32/55 — G06.5 does not blanket-store raw Commons binaries as `IngestionRecord.rawPayload`, only
their metadata (`rawPayloadStorage: STORE_LIMITED` — metadata only, never the binary blob in the
`IngestionRecord` row; the binary itself, once approved, goes through the existing
`MediaAsset`/S3 upload pipeline, not through raw ingestion storage).

**Commercial use:** File-dependent (`CONDITIONAL`) — CC BY-SA-licensed files permit commercial reuse
under share-alike; some files carry NC-only or no-commercial-reuse markers. Never assumed `ALLOWED`
at the source level.

**Verdict:** Candidate for **LIVE** adapter in G06.5, restricted to metadata read (no key needed),
with every promotion gated on the specific file's own license fields — never a source-level
blanket approval.

---

## 3. UNESCO

**Source class:** `AUTHORITATIVE`. **Transport:** `DATASET` (official UNESCO DataHub OpenDataSoft
Explore API v2.1), **not** the paid XML syndication feed.

**Official sources:**
- [UNESCO World Heritage Centre — Syndication](https://whc.unesco.org/en/syndication/) — accessed 2026-09-22 (via search-result summary; the live page returned HTTP 403 to automated fetch both directly and via search-engine cache during this session — recorded as a fetch limitation, not a policy finding).
- [UNESCO DataHub — World Heritage List dataset (`whc001`)](https://data.unesco.org/explore/dataset/whc001/) and its API metadata endpoint `https://data.unesco.org/api/explore/v2.1/catalog/datasets/whc001/` — accessed 2026-09-22, full JSON metadata fetched successfully.

**Two distinct official transports exist — this matters:**

1. **`whc.unesco.org/en/syndication`** (direct WHC site): per the search-result summary of the
   official page, personal/non-commercial syndication may be requested free of charge, but *"those
   who wish to syndicate specific material must obtain a specific XML subscription and licence from
   UNESCO/WHC, which will imply a fee"* for anything broader. **This transport is `PROHIBITED` for
   G06.5** absent a paid license — never used.
2. **`data.unesco.org`** (UNESCO DataHub, an OpenDataSoft-hosted open-data portal): the `whc001`
   dataset (World Heritage List, 1,273 records, updated annually, fields include multilingual
   names/descriptions, `date_inscribed`, `cultural_criteria`/`natural_criteria`, `area_hectares`,
   `coordinates` (`geo_point_2d`), `states_names`, `iso_codes`, `region`, `main_image_url`,
   `uuid`/`id_no`) is served under **CC BY-SA 4.0** via a public, keyless JSON REST API
   (`/api/explore/v2.1/catalog/datasets/whc001/records`). **This is the transport G06.5 uses.**

**License:** **CC BY-SA 4.0** (DataHub dataset). Attribution required; a derivative dataset built
from it must itself be shared under compatible terms if redistributed as a dataset — this does
**not** block promoting individual facts (with citation) into `HistoricalFact`/`Source`/`Citation`,
which is citation-based editorial reuse, not dataset redistribution.

**Authentication:** None required for the public DataHub API. `authRequired: false`. No UNESCO
credential env var is added, per brief section 15 ("Add UNESCO credential only if the selected
official transport genuinely requires it" — it does not).

**Storage/caching rights:** `normalizedStorageRight: ALLOWED`, `commercialUseRight: CONDITIONAL`
(CC BY-SA share-alike condition applies to redistribution of the dataset itself, not to citing
individual facts with attribution — `conditionalNotes` records this distinction explicitly so the
fail-closed gate has something concrete to check against, not a bare guess).

**Verdict:** Candidate for **LIVE** adapter in G06.5 via `data.unesco.org`'s Explore API — a real,
keyless, officially documented transport. The `whc.unesco.org` XML syndication transport is
implemented as **contract-only / disabled** (would require a paid license this project does not
have).

---

## 4. GeoNames

**Source class:** `GEOSPATIAL`. **Transport:** Web Services API (`api.geonames.org`) plus a
separate free bulk dump (`download.geonames.org`, `allCountries.zip` + per-country files).

**Official sources:**
- [GeoNames Web Services](https://www.geonames.org/export/web-services.html) — accessed 2026-09-22.
- [GeoNames Export](https://www.geonames.org/export/) — accessed 2026-09-22.

**License:** **CC BY 4.0.** Quoted: *"You should give credit to GeoNames when using data or web
services with a link or another reference to GeoNames."* `attributionRequirement: REQUIRED`.

**Authentication:** **Required** — every web-service call needs a registered `username` query
parameter. The bundled `demo` account is explicitly not for production use. `authRequired: true`,
credential: `GEONAMES_USERNAME` (a free-tier registered username, not a secret API key in the
traditional sense — but still handled as a credential: never logged, never committed, never
returned in API responses).

**Rate limit:** Free tier is materially more restricted than the premium tier on specific endpoints
(e.g. elevation: 20 points/call free vs. 2000 premium; postal-code search: 30 km/500 rows free vs.
160 km/2500 rows premium). No single confirmed global requests-per-hour figure was found on the
pages reviewed this session — **recorded as UNKNOWN pending direct confirmation**, and the adapter
must therefore apply a conservative fixed default (`rateLimitPerSecond: 1`) rather than assume a
number that was not read from an official page.

**Storage/caching rights:** `normalizedStorageRight: ALLOWED`, `commercialUseRight: ALLOWED` (CC BY
permits commercial reuse with attribution — no NC restriction stated on either page reviewed).

**Verdict:** Adapter **contract implemented, but disabled by default** — G06.5 does not ship with a
real registered GeoNames account (per brief section 51, no fake credential may be used against a
real service). If the operator supplies a real `GEONAMES_USERNAME`, the adapter activates cleanly
(fail-closed → enabled, not a code change). Fixture-based contract tests prove the adapter's
request/response/error-classification logic without a real account.

---

## 5. OpenStreetMap (Nominatim)

**Source class:** `GEOSPATIAL`. **Transport:** none live-enabled — contract only.

**Official source:**
- [Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/) — OSM Foundation, accessed 2026-09-22.

**License:** ODbL (share-alike for substantial extraction) — `commercialUseRight: CONDITIONAL`
(ODbL's share-alike condition), not independently a blocker for citation-style use, but irrelevant
here since the transport itself is disabled.

**Binding restrictions quoted from the official policy (why this source stays disabled):**
- Hard rate cap: **"a maximum of 1 request per second"**; bulk/scripted use capped further to
  **"4 requests per minute"** for anything run regularly or exceeding a day.
- **Explicitly prohibited**: "Auto-complete search", "Systematic queries" (grid-based reverse
  searches, complete postal-code sweeps), automatic scraping of detail pages, and "Reselling of
  geocoding results."
- Bulk geocoding, where permitted at all, must be single-threaded, single-machine ("no distributed
  scripts"), with local result caching — i.e. structurally incompatible with a queued, distributed,
  bounded-job ingestion worker model like G06.5's.
- A valid `User-Agent`/`Referer` is mandatory; default library headers are explicitly insufficient.

**Verdict (binding, matches brief sections 10/96 exactly):** the public Nominatim endpoint is
**never used as a bulk POI ingestion engine**. `IngestionSourcePolicy.enabled: false` for OSM in
G06.5. The adapter's *contract* (DTOs, normalization shape, identity model) is implemented so a
future phase can plug in an approved bounded mechanism (an OSM extract/import, or self-hosted
Nominatim) without a schema change — but no code path in G06.5 issues a live request to
`nominatim.openstreetmap.org`, proven by a repository-search regression test (brief section 96).

---

## 6. Google Places

**Source class:** `OPERATIONAL_PROVIDER` — explicitly **not** a historical-knowledge source (brief
section 11; matches this repo's existing G02/G05 provider-trust boundary exactly — Google Places
here is the *same commercial provider concept* `ExternalProvider` already models, but G06.5's
ingestion layer treats it purely as an `IngestionSource` for **place identity discovery**, never
for `HistoricalFact` content).

**Official sources:**
- [Policies and attributions for Places API](https://developers.google.com/maps/documentation/places/web-service/policies) — Google for Developers, accessed 2026-09-22.
- Google Maps Platform [Service Specific Terms](https://cloud.google.com/maps-platform/terms/maps-service-terms) — caching-duration specifics corroborated via search summary this session, not independently deep-fetched line-by-line; flagged for full legal review before any real (non-fixture) activation, matching the existing G02 `PROVIDER_RESEARCH.md` verdict for this same provider ("BLOCKED pending legal review of the full Terms of Service").

**License:** Proprietary Google Maps Platform Terms — not an open license.

**Authentication:** **Required.** API key + Google Cloud billing account. `authRequired: true`,
credential: `GOOGLE_PLACES_API_KEY`.

**Storage/caching rights (quoted):**
- **Place ID**: *"is exempt from the caching restrictions. You can therefore store place ID values
  indefinitely."* → `normalizedStorageRight` for the Place ID specifically: `ALLOWED`.
- **Latitude/longitude**: may be temporarily cached for **up to 30 consecutive calendar days**, then
  must be deleted, per the Maps Platform Service Specific Terms.
- **Everything else** (display name, formatted address, ratings, reviews, opening hours, photos,
  phone numbers, website URLs): *"You must not pre-fetch, cache, or store Places API content beyond
  the allowed exceptions."* → `STORE_ALLOWED` only for Place ID; **`REFERENCE_ONLY`** for
  lat/lng (bounded 30-day TTL, enforced by `IngestionSourcePolicy.retentionDays: 30` specifically
  for coordinate fields); **`PROHIBITED`** for all other content fields — never written to
  `IngestionRecord.rawPayload` beyond the single live response used to render a page, and never
  promoted to `HistoricalFact`.

**Attribution:** `REQUIRED`. Google logo or "Google Maps" text (Roboto, ≥16dp) when not shown on a
live Google Map; photo/review reuse specifically requires author avatar+name+profile-link
attribution and a live link back to the source; third-party-sourced map data must name both Google
and the third party.

**Commercial use / data-use restriction (quoted):** *"You cannot create alternate maps or databases
from Places API content."* This is a direct, binding statement that Google Places content must
never become a standalone Dấu Việt database of places — it may only be used live, per-request, for
identity resolution/enrichment display, exactly per brief section 11/47.

**Verdict:** Adapter **contract implemented (DTOs, place-ID identity mapping, redaction, storage-
policy enforcement), disabled by default** — no real `GOOGLE_PLACES_API_KEY` is available in this
environment. All G06.5 proof for this source is fixture/mocked-transport only (brief section 52),
never a real call. If a real key is later supplied by the operator, the existing G02
`ProviderRegistryService` gate (this repo's own precedent — see
`docs/backend/PROVIDER_LICENSING.md`) is the correct place to require an actual legal-review sign-
off before flipping `ExternalProvider` status for Google Places to `ACTIVE`; G06.5's
`IngestionSource` for Google Places stays a distinct, ingestion-scoped registration and does not by
itself grant G05's commercial `ExternalProvider` activation.

---

## 7. Summary policy matrix

| Source | Class | Transport | Auth | License | Live in G06.5? |
|---|---|---|---|---|---|
| Wikidata | STRUCTURED_KNOWLEDGE | API (REST+SPARQL) | none | CC0 | **Yes** |
| Wikimedia Commons | MEDIA | API (metadata only) | none | Per-file | **Yes** (metadata only) |
| UNESCO | AUTHORITATIVE | DATASET (data.unesco.org) | none | CC BY-SA 4.0 | **Yes** |
| GeoNames | GEOSPATIAL | API | username (optional, not shipped) | CC BY 4.0 | Contract only — enabled if operator supplies `GEONAMES_USERNAME` |
| OpenStreetMap | GEOSPATIAL | — (disabled) | — | ODbL | **No** — policy-prohibited for bulk use, contract only |
| Google Places | OPERATIONAL_PROVIDER | API | API key (not shipped) | Proprietary | Contract only — fixture/mocked tests only |

All six sources default `enabled: false` at the `IngestionSourcePolicy` row level except Wikidata,
Wikimedia Commons, and UNESCO, which are seeded `enabled: true` with the rights above — every field
not explicitly confirmed above from an official page stays `UNKNOWN`, which fails closed per brief
section 53.
