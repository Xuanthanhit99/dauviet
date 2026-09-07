# Dau Viet - Provider Research (G02)

Global Phase G02, Global Backend V2 Extension. Purpose: validate that the licensing/capability
model built in this phase (`docs/backend/PROVIDER_LICENSING.md`) can actually represent the real
access/rights restrictions these providers impose - **not** to choose a final vendor. No provider
below is integrated, credentialed, or activated. Every provider seeded by G02 is `DRAFT`/
`UNDER_REVIEW` only (see `PROVIDER_LICENSING.md` section "Seed policy").

Research method: fetched official developer/policy documentation directly (via `WebFetch`) on
2026-09-07, quoting policy text where the source stated it explicitly. Where an official page did
not state a policy (rather than merely being unread), that is recorded as **NOT STATED ON PAGE
REVIEWED**, distinct from **UNKNOWN** (a claim that might exist elsewhere but wasn't found). No
blog, SEO page, AI-generated summary, or third-party tutorial was used as the source for any
compliance-relevant claim - several appeared in search results (e.g. a `bizcollect.dev` blog post
paraphrasing Google's Places policy) and were deliberately not used as the cited source; only the
official `developers.google.com`/`developers.booking.com`/etc. pages below were cited.

---

### Google Maps Platform / Places API

**Official sources:**
- [Policies and attributions for Places API](https://developers.google.com/maps/documentation/places/web-service/policies) - Google for Developers, accessed 2026-09-07.
- [Google Maps Platform Service Specific Terms](https://cloud.google.com/maps-platform/terms/maps-service-terms) - Google Cloud, accessed 2026-09-07 (linked but not deep-fetched this session; flagged for full legal review before any real integration).

**Verified capabilities:** Place search/detail, photos, reviews (maps to this platform's proposed `PLACE_SEARCH`/`PLACE_DETAIL`/`PHOTOS`/`REVIEWS` capabilities).

**Access requirements:** Self-service via a Google Cloud API key/billing account (no partnership contract needed to start) - NOT independently re-verified this session beyond prior general knowledge; treat as `REQUIRES_LEGAL_REVIEW` for the exact current billing/quota terms.

**Commercial model:** Pay-per-request via Google Cloud Billing (not independently re-verified this session for current 2026 pricing).

**Verified rights/restrictions (quoted from the official policy page):**
- Caching/storage: **"You must not pre-fetch, cache, or store Places API content beyond the allowed exceptions."** The **place ID is explicitly exempt**: **"The place ID... is exempt from the caching restrictions. You can therefore store place ID values indefinitely."** No other content (names, ratings, reviews, photos, phone numbers) may be cached/stored beyond that exception per the page as reviewed.
- Attribution: **"You don't need to add extra attribution if the Content is shown on a Google Map where the attribution is already visible."** Without a Google Map: **"you must include the Google logo, adhering to the provided style guidelines."** Photos/reviews: **"You must always credit the author... Each photo and review includes an author attribution (author's avatar image, name, and profile link)"**, and end users must be able to reach the source photo/review via the provided `googleMapsUri`.
- Commercial use/redistribution: **NOT STATED on the policy page reviewed** - the page itself directs readers to the full Maps Platform Terms of Service for this, which was not deep-fetched this session.

**Unknowns / requires further review:** Full commercial-use/redistribution terms (Maps Platform Terms of Service, not yet deep-reviewed), current 2026 pricing/quota structure, whether any EEA-specific coordinate-caching exception (a 30-day temporary cache allowance for lat/lng, per a secondary summary in search results) is still current and applies outside the EEA - **not independently confirmed against the primary terms page this session, marked UNKNOWN**.

**Requires account approval?** No formal partnership contract to start (self-service API key), but real production use requires a live Google Cloud billing account - not evaluated further here.
**Requires legal review?** **YES** - the caching/attribution rules above are unusually strict and narrowly-scoped (place ID only); any real integration must have counsel review the full Maps Platform Terms before G05 activation.
**Recommended G05 status:** `NEEDS_PARTNERSHIP` is too strong (no partnership needed) - recommend `BLOCKED` pending legal review of the full Terms of Service, given how easy it would be to accidentally violate the narrow caching exception.

---

### Booking.com (Demand API)

**Official sources:**
- [About Demand API](https://developers.booking.com/demand/docs/getting-started/overview) - Booking.com Developers, accessed 2026-09-07.
- Search-result summary of [API V3 | Booking.com Partnerships Hub](https://partnerships.booking.com/api-v3) and a third-party integration-agency article, used only to corroborate the *existence* of a partner-gate, not as the source of any specific rights claim.

**Verified capabilities (per the official overview page):** "Content" (display travel content), "Search" (let travellers search/view travel options), "Booking" (integrated booking experience, order completes on-partner's-platform) - spanning accommodations, car rentals, and attractions per the page.

**Access requirements:** The official overview page itself does **NOT** state on-page whether self-service access exists; it defers to a separate "Prerequisites" page (not fetched this session). Secondary sources (a partner-integration blog, a third-party API directory) consistently describe this as gated behind a signed **Managed Affiliate Partner** contract with Partner Centre access provisioned by a Booking.com Account Manager, and note that booking capability specifically requires separate contractual approval plus PCI-DSS compliance - **this is UNKNOWN at the primary-source level for G02** (not confirmed by a Booking.com-authored page fetched this session) and is recorded here only as a directionally-useful signal, explicitly flagged `REQUIRES_LEGAL_REVIEW`/re-verification against the actual Prerequisites page before any real integration decision.

**Commercial model:** Affiliate-commission-based per secondary sources; NOT STATED on the page reviewed.

**Verified rights/restrictions:** **NOT STATED on the official page reviewed** - no caching/storage/display/attribution language appears on the "About Demand API" overview page itself.

**Unknowns:** Exact partner-tier gate, caching/attribution/display terms (likely documented on other pages within `developers.booking.com` not fetched this session), PCI-DSS/booking-specific requirements.
**Requires account approval?** Very likely yes (per secondary sources) - **UNKNOWN at primary-source confidence for G02**.
**Requires legal review?** Yes, before any partnership discussion.
**Recommended G05 status:** `NEEDS_PARTNERSHIP` (directionally, pending primary-source confirmation of the exact gate).

---

### Agoda (Demand API / Affiliate models)

**Official sources:**
- [Getting Started - Agoda-Demand](https://developer.agoda.com/demand/docs/getting-started) - accessed 2026-09-07.

**Verified capabilities (per the official page):** Content (property content), Search (rooms/rates), Book (submit booking with guest/payment info), Report (post-book API), Cancel (two-step). Different partnership models get different API subsets - "Search only" for the Online Affiliates/MSE model, "Search + Book" for the Agoda Fulfill Assisted model, and the full set for the Partner Fulfillment model, per the page.

**Access requirements:** The page explicitly describes a partnership-first onboarding: **"Find the partnership model that suits you best"** then **"Become a partner to receive your site credentials"** before any sandbox/live access.

**Commercial model:** Three named partnership models (Online Affiliates/MSE, Agoda Fulfill Assisted, Partner Fulfillment) with increasing scope/responsibility, per the page.

**Verified rights/restrictions:** **NOT STATED on the page reviewed** - no caching, storage, display, or attribution policy language appears on this getting-started page.

**Unknowns:** Exact caching/attribution/display terms (likely in a separate terms document not fetched this session), exact commercial/revenue terms per model.
**Requires account approval?** **YES**, explicitly, per the page quoted above.
**Requires legal review?** Yes, before any partnership application.
**Recommended G05 status:** `NEEDS_PARTNERSHIP`.

---

### Viator (Partner API)

**Official sources:**
- [Viator partner-API documentation home](https://docs.viator.com/partner-api/) - accessed 2026-09-07.

**Verified capabilities / tiers (per the official page):**
- **Merchant Partners**: "Take full responsibility for all monetary transactions carried out by their users"; handle customer support/cancellations/refunds/supplier communication; full access to booking/transactional endpoints, no redirect required.
- **Affiliate Partners (VBA)**: "Full access to content-related API areas" only; "restricted from booking/transactional endpoints"; must redirect the customer to viator.com to complete a purchase, via a commission-tracking URL/cookie.
- The page notes a "transactional affiliate" capability (booking without redirect) exists for some VBAs but does not describe it as a fully separate named tier on this page.

**Access requirements:** The page states the API is **"designed for use by both organizations and individuals partnered with Viator"** but defers the actual approval process to the separate Partner Resource Center (not fetched this session).

**Commercial model:** Commission-based for affiliates (redirect model); direct transaction responsibility for merchants.

**Verified rights/restrictions:** **NOT STATED on the page reviewed** for caching/attribution specifically. The page does note flexibility on data handling: **"data can either be ingested periodically and managed on your local system, or calls can be made in real time"** - this is a capability statement, not a rights/retention policy, and should not be read as blanket permission to store all content indefinitely without further review.

**Unknowns:** Exact attribution requirements, exact retention limits (if any) implied by "managed on your local system," exact approval process/timeline.
**Requires account approval?** Yes (partnership required, exact process not confirmed on this page).
**Requires legal review?** Yes.
**Recommended G05 status:** `NEEDS_PARTNERSHIP` for the affiliate/VBA tier (lower barrier than Booking/Agoda based on available signals); `BLOCKED` for the merchant/transactional tier pending PCI/legal review.

---

### Amadeus for Developers (flight search - candidate per spec section 3.5, "one flight/travel-search provider candidate")

**Official sources:**
- Search-result summary of [Flight APIs Tutorial - Amadeus for Developers](https://developers.amadeus.com/self-service/apis-docs/guides/developer-guides/resources/flights/) - accessed 2026-09-07. **Direct page fetch failed this session** (JS-rendered portal returned no extractable content via `WebFetch`) - findings below come only from the search-result snippet, not a verified full-page read, and are marked accordingly.

**Verified capabilities (low confidence, snippet-only):** Flight search/comparison across "over 400 airlines," flight booking, airport information, cheapest-date/destination search.

**Access requirements (snippet-only, not page-verified):** Described as having a **Self-Service tier** (API key registration through the developer portal, free testing, limited production transaction quotas) distinct from an **Enterprise tier** (full GDS capability, commercial agreement, broader airline coverage including majors like American/Delta/British Airways that the Self-Service tier reportedly excludes).

**Why this candidate:** Included specifically to validate that the capability/license model can represent a **self-service, no-partnership-required** access tier (unlike Booking/Agoda/Viator's partnership-gated models) alongside a separate, contractually-gated Enterprise tier - i.e. the same provider needing two different `ProviderIntegration` rows with different `ProviderLicense` states is a real, representable scenario.

**Verified rights/restrictions:** **UNKNOWN** - the terms/caching/attribution page was not successfully fetched this session. Explicitly `REQUIRES_LEGAL_REVIEW` and re-verification via a direct page fetch before any real integration work.

**Requires account approval?** Self-Service tier: apparently no (API-key self-registration, per snippet). Enterprise tier: yes.
**Requires legal review?** Yes - no rights/retention terms were actually verified this session.
**Recommended G05 status:** `CANDIDATE` for Self-Service-tier architecture validation only; `BLOCKED` for any real data use until terms are actually fetched and reviewed.

---

### eSIM / insurance comparison provider

Per spec section 3 ("only if useful for architecture comparison - do not integrate"): **not
separately researched this session.** The five providers above already exercise a sufficiently
diverse set of access models for validating the G02 licensing/capability schema - self-service
API-key (Amadeus), strict-attribution consumer display with a narrow caching exception (Google
Places), and three variations of contract-gated partnership (Booking, Agoda, Viator's
affiliate/merchant split). Spending further research budget on an eSIM/insurance provider without
a concrete G02 architectural question it would answer differently would not have added new
validation value. If a future phase needs to specifically validate an eSIM/insurance provider's
terms, that research should happen in the phase that actually considers integrating one (G05 or
later), not speculatively here.

---

## Summary table

| Provider | Access model | Rights verified? | Requires partnership? | Requires legal review? | Recommended status |
|---|---|---|---|---|---|
| Google Places | Self-service (API key) | Partial (caching + attribution quoted from official page) | No | Yes (full ToS not reviewed) | `BLOCKED` pending full ToS review |
| Booking.com Demand API | Partnership-gated (per secondary sources; not primary-confirmed) | No (not stated on page reviewed) | Yes (unconfirmed at primary-source level) | Yes | `NEEDS_PARTNERSHIP` |
| Agoda Demand API | Partnership-gated (confirmed on official page) | No (not stated on page reviewed) | Yes (confirmed) | Yes | `NEEDS_PARTNERSHIP` |
| Viator Partner API | Tiered: affiliate (content-only, redirect) vs merchant (full) | No (not stated on page reviewed) | Yes (confirmed, tier-dependent) | Yes | `NEEDS_PARTNERSHIP` (affiliate) / `BLOCKED` (merchant) |
| Amadeus for Developers | Self-service tier + gated Enterprise tier | No (page fetch failed; snippet-only) | No (self-service tier only) | Yes | `CANDIDATE` (architecture only) |

**No provider above is activated, credentialed, or claimed as an approved partner in this
codebase.** Every provider record G02 seeds is `DRAFT`/`UNDER_REVIEW`, license `reviewStatus:
DRAFT` or `TERMS_REVIEW`, every tri-state right `UNKNOWN` unless explicitly quoted above, and no
credential/secret exists anywhere in this repository for any of them.
