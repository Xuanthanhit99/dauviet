# G10 — Provider Policy Research

Retrieved: **2026-09-23**, via live web search and page fetches against official provider
documentation domains. Every claim below is either directly sourced (URL + what the source actually
says) or explicitly flagged as unconfirmed. This document is evidence for the G10 domain design, not
a permanent business-constant source — see §2 of the design notes below.

## 1. Booking.com — Demand API

**Sources**:
- https://developers.booking.com/demand (Demand API portal)
- https://developers.booking.com/demand/docs/getting-started/overview
- https://developers.booking.com/demand/docs/development-guide/authentication
- https://affiliates.support.booking.com/kb/s/article/API-access
- https://developers.booking.com/demand/docs/open-api/demand-api/orders/orders/details

**Confirmed**:
- Authentication is a bearer token in the `Authorization: Bearer <token>` header, plus an affiliate
  identifier in a separate `X-Affiliate-Id` header — confirmed via a documented sandbox curl example
  (`https://demandapi-sandbox.booking.com/3.1/accommodations/search`). HTTPS is required; the
  documentation states the bearer token will not work over unsecured HTTP.
- The Demand API accepts a `label` field/parameter (in the accommodation/order object) used for
  affiliate-side attribution tracking (functionally described as corresponding to a "subid" for
  attribution/performance analysis).
- As of **July 30, 2026** (per third-party aggregated reporting of Booking.com's own partner
  communications, not independently re-verified against a dated first-party announcement page in
  this pass), the Demand API requires **Managed Affiliate Partner** status, a signed contract, and
  Account-Manager-enabled Partner Centre access before sandbox or production credentials are issued.
  Booking through the Orders endpoints requires a further, separate "Search, Look & Book" approval.
- Availability of specific fields/endpoints "varies by travel service, API version and partner
  access" (the overview page's own wording) — i.e. no single fixed contract can be assumed for every
  partner.

**Not independently re-confirmed this pass** (carried from the prompt's own claims, treated as
plausible but not verified against a live, dated first-party page in this session — several
Booking.com doc pages returned JS-rendered loading shells rather than static content to the fetch
tool): the specific "v3.2 is latest Stable" version claim. The sandbox curl example observed used
path `/3.1/...`, suggesting the exact latest-stable version number is a live, partner-portal-gated
fact that should be re-checked against the partner's own Partner Centre at implementation/launch
time, not hard-coded from this research pass.

**Design implication**: G10 does not target a specific Booking.com API version in code. The adapter
interface is version-agnostic; a real Booking.com adapter is not implemented in this phase (no
production/sandbox credentials exist in this environment — see the pre-implementation report's
"Provider credential blockers").

## 2. Agoda — Partner/Demand API

**Sources**:
- https://developer.agoda.com/demand/docs/getting-started
- https://developer.agoda.com/supply/reference/where-to-start
- https://partners.agoda.com/DeveloperPortal/FAQ

**Confirmed**:
- Agoda's documentation describes OAuth 2.0 as the current/recommended authentication approach: a
  client ID + client secret exchanged for a short-lived (~1 hour) access token, refreshed before
  expiry.
- Partner onboarding is a five-step gated process (partnership model selection → API review/
  integration → become a partner to receive site credentials → certification → switch to Live) —
  finance-account creation explicitly requires a signed contract and a signed vendor registration
  form (AVRF). This is not a self-service API.

**Not independently confirmed this pass**: the prompt's specific claim that legacy API-key/siteId
authentication is documented for deprecation "by end of 2026." Multiple targeted searches in this
session did not surface a first-party Agoda page stating an explicit legacy-auth deprecation date.
This claim is therefore treated as **unverified** for this research pass — G10's design does not
depend on it being true or false either way (see design implication below), so it does not block
anything, but it is not asserted as fact in this document.

**Design implication**: since Agoda credentials do not exist in this environment either, and the
authentication story is explicitly in flux (OAuth being rolled out, legacy key status unconfirmed),
the G10 provider-adapter interface is deliberately designed to be **authentication-method-agnostic**
— no Agoda `siteId`/API-key assumption is encoded into any G10 domain model or affiliate-domain
service (spec section 22). Provider auth entirely belongs to the existing G02
`ProviderIntegration`/credential layer, unchanged by this phase.

## 3. Viator — Partner API / Affiliate Program

**Sources**:
- https://docs.viator.com/partner-api/ (documentation home)
- https://docs.viator.com/partner-api/affiliate/technical/
- https://partnerresources.viator.com/travel-commerce/affiliate/

**Confirmed**:
- Partner tiers are **merchant** and **affiliate**; affiliate access itself has three levels:
  **Basic** (product content + availability, immediate on signup), **Full** (product content +
  availability, qualification required), and **Full + Booking** (adds booking data).
  costs to sign up or to request additional access tiers.
- A **30-day** referral/cookie attribution window is stated on Viator's own partner-resources page
  ("30 day cookie window" — partners earn commission on bookings completed within that window after
  a referred click).
- Commission is described via two models on the partner-resources page: a referral model (standard
  commission on bookings within the 30-day window) and a payment-integration model (embedded iFrame/
  custom checkout). The specific **8%** figure appeared in general secondary search results (e.g.
  affiliate-marketing aggregator pages) referencing Viator's public affiliate materials, but was
  **not directly re-confirmed on a first-party Viator page fetched in this session** — treated as
  plausible current public messaging, not a verified first-party number for this pass.
- Technical support contact for affiliate API onboarding: `affiliateapi@tripadvisor.com` (Viator is
  a TripAdvisor company).

**Not independently confirmed this pass**: the exact `campaign-value` parameter name. The
partner-resources marketing page did not enumerate specific query-parameter names; the full
technical specification (`docs.viator.com/partner-api/affiliate/technical/`) did not return usable
static content to the fetch tool in this session (likely JS-rendered). The prompt's own naming
(`campaign-value`) is therefore carried forward as the **assumed** parameter name in the G10 fixture
adapter's design, explicitly flagged as needing re-verification against the live technical spec
before any real Viator integration is built.

## 4. Design conclusion (binding for this phase)

None of the three providers' specific numeric/naming facts above (Booking.com's exact API version,
Agoda's legacy-auth deprecation date, Viator's exact commission percentage or parameter name) are
encoded as compile-time constants anywhere in the G10 domain or service code. Per the brief's own
explicit instruction (§2), these are treated as **versioned provider policy evidence**, reusing G02's
existing `ProviderAttributionRule`/`ProviderPolicyEvidence` models (see pre-implementation report
§5/9) — configurable, dated, and revisable without a code change, never baked into
`AffiliateSession`/`AffiliateClick`/`AffiliateConversion`'s own domain logic.

No real Booking.com, Agoda, or Viator credentials exist in this environment (confirmed: `.env`/
`.env.example` audited, no provider-specific secret beyond the existing G02 fixture/G06.5 ingestion
credentials). A clearly-named G10 fixture provider is used for all live proofs in this phase — see
the final report's "Fixture provider" section. This is an environment blocker for real end-to-end
Booking.com/Agoda/Viator proof, not a design gap.
