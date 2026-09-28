# G10 — Affiliate & Commercial Attribution: Contract Reference

Status: **COMPLETE_WITH_ENVIRONMENT_BLOCKERS**. See `docs/backend/G10_PRE_IMPLEMENTATION_REPORT.md`
for design rationale, `docs/backend/G10_PROVIDER_POLICY_RESEARCH.md` for the provider research
behind it, and `docs/backend/G10_FINAL_REPORT.md` for the full verification record.

Core flow (spec section 0):

```
DISCOVERY/TRIP -> G05 provider offer/reference -> G02 policy gate (getExecutionContext)
  -> AffiliateSession -> AffiliateClick -> validated provider redirect -> external provider
  -> provider-supplied conversion evidence -> AffiliateConversion -> optional ProviderBookingReference
```

## 1. Data model

### `AffiliateSession` — attribution context, NOT an auth session

`providerId`, `userId?`, `tripId?`, `destinationId?`, `sourceSurface`, `campaignKey` (opaque,
server-generated, unique), `expiresAt` (browsing-session-length TTL — independent of any provider's
own attribution window). Anonymous-friendly: `userId` is optional.

### `AffiliateClick` — append-only, server-side redirect event

No PATCH/DELETE route exists. `providerEntityReferenceId`/`providerOfferId` are plain soft pointers
(no DB relation — matches `TripCostEstimateItem.offerId`'s precedent), never a copy of the full
offer payload. `redirectUrl` is the exact, already-validated destination this click redirected to.
`redirectTokenHash`/`redirectTokenExpiresAt` back the short-lived redirect token.

### `AffiliateConversion` — exists ONLY from provider evidence

`@@unique([providerId, providerConversionId])` is the idempotency key. `affiliateClickId`/
`affiliateSessionId` are nullable — a legitimate conversion with no reconcilable click is retained,
never fabricated a relation. `status` is one of `PENDING`/`CONFIRMED`/`CANCELLED`/`REVERSED`, with
`rawProviderStatus` preserved separately. `bookingAmount`/`commissionAmount` may independently be
null and may use different currencies.

### `ProviderBookingReference` — external evidence, never a Dấu Việt booking

Optional link from a conversion (`@@unique([providerId, externalBookingReference])`). No traveler
PII.

## 2. Provider adapter architecture

```ts
interface AffiliateProviderAdapter {
  readonly providerCode: string;
  readonly allowedRedirectHosts: readonly string[];
  buildAffiliateRedirect(input, context: ProviderExecutionContext): { redirectUrl: string };
  normalizeConversion(raw: unknown): NormalizedConversionInput;
}
```

`AffiliateAdapterRegistry` maps `providerCode` to its adapter — no provider-conditional branching
anywhere in the business services. **Only one adapter is implemented this phase**: the fixture
adapter (`TEST_FIXTURE_PROVIDER_G10_AFFILIATE`). Real Booking.com/Agoda/Viator adapters are
deliberately not shipped as executable code — see the pre-implementation report §6 for why (no
credentials to validate against, and the research pass could not independently re-confirm every
detail needed to ship real integration code with confidence).

**Conceptual mapping for a future real adapter** (design-only, not implemented):

| Provider | Would map `campaignKey` to... | Confirmed this session? |
|---|---|---|
| Booking.com | The Demand API's `label` field | Yes — field exists, used for affiliate tracking |
| Viator | A `campaign-value`-shaped tracking parameter | Parameter name carried from the brief, not independently re-verified against the live technical spec |
| Agoda | Provider-specific tracking parameter (TBD) | Not researched to this depth — Agoda's affiliate-tracking parameter name was out of scope for this pass |

None of these are wired to any `ExternalProvider` row — no real provider is eligible to receive a
live redirect in this environment.

## 3. Redirect security

The client never supplies a URL — only `providerCode` + canonical identifiers
(`providerEntityReferenceId`/`providerOfferId`) + `surface`/`placement`. `affiliate-redirect-
security.util.ts`'s `validateRedirectUrl` checks: `https:` only, no userinfo/credentials, exact
(never suffix/subdomain) hostname allowlist match, no control characters (CRLF/header-injection
defense). Applied to the adapter's own output as defense-in-depth, not as an attacker-input filter —
there is no HTTP path that accepts a raw URL at all.

A short-lived, opaque, hashed redirect token (`randomBytes(32).toString('base64url')`, SHA-256
before storage — the same pattern G07's invitation token uses) resolves to the pre-validated
`AffiliateClick.redirectUrl`. **Replay behavior**: repeated use within the TTL resolves to the exact
same stored URL, idempotently — a page reload/back-button never breaks the flow, and the token is
never re-validated or re-derived at redirect time.

## 4. Policy gate

Every commercial action calls `ProviderRegistryService.getExecutionContext({ providerCode,
environment, capability: 'AFFILIATE_LINK' | 'CONVERSION_REPORTING', usage: 'commercialUse' })` — the
same G02 gate G05 already uses, re-evaluated on every call with nothing cached. A disabled provider/
suspended integration/revoked license/missing capability/missing required attribution fails closed
immediately, live-proven (policy-revocation and attribution-missing e2e tests).

## 5. Idempotency / out-of-order evidence

`INSERT ... ON CONFLICT ("providerId","providerConversionId") DO UPDATE ... WHERE
stored.providerOccurredAt <= EXCLUDED.providerOccurredAt` — the same newer-wins pattern G08/G09
established. Strictly older evidence is rejected (`AFFILIATE_CONVERSION_STALE_EVIDENCE`) without
touching the stored row; identical `providerOccurredAt` is an idempotent no-op (duplicate delivery);
newer evidence updates the row in place — never a duplicate economic event.

## 6. Reconciliation

Deterministic only: a conversion's `affiliateClickId` is resolved by matching the provider-echoed
`campaignKey` against `AffiliateClick.campaignKey`, scoped to the same provider. No fuzzy matching
on amount/date/destination/user is ever attempted. No match → retained with `affiliateClickId =
null`.

## 7. Authorization

| Action | Access |
|---|---|
| Initiate a redirect (`POST /clicks`, `GET /r/:token`) | Anonymous or authenticated — no role required |
| Enumerate click history | Nobody — no such endpoint exists |
| List conversions / commission summary | `ADMIN` only |
| Ingest conversion evidence | `ADMIN` only |

Trip role (`OWNER`/`EDITOR`/`VIEWER`) grants **no** commercial reporting access — live-proven. A
click that references a `tripId` still requires ordinary `VIEW_TRIP` access to that trip (reusing
`TripAuthorizationService`, never a parallel check).

## 8. Money

Reuses G09's `parseMoney`/`Prisma.Decimal` directly — no new money utility invented. Booking and
commission amounts may be null independently and may use different currencies. No FX — reporting
groups strictly by currency.

## 9. Privacy / retention

No traveler PII field exists on any G10 model. No payment data field exists anywhere. `userId`/
`tripId`/`destinationId` are nullable, `onDelete: SetNull` (never Cascade) — commercial evidence
survives a hypothetical future user-detach, never cascades away with it. Retention is a documented
policy (`AffiliateSession` 90 days, `AffiliateClick` 180 days, `AffiliateConversion`/
`ProviderBookingReference` per accounting need), not an active deletion job in this phase — matches
this codebase's existing precedent (no background retention-cleanup job runs anywhere yet).

## 10. API

```
POST /v1/affiliate/clicks              (anonymous or authenticated)
GET  /v1/affiliate/r/:token            (anonymous or authenticated - browser redirect target)

GET  /v1/admin/affiliate/conversions   (ADMIN)
GET  /v1/admin/affiliate/summary       (ADMIN)
POST /v1/admin/affiliate/conversions/ingest   (ADMIN)
```

## 11. Error codes

| Code | HTTP | When |
|---|---|---|
| `AFFILIATE_PROVIDER_ENTITY_REQUIRED` | 400 | neither `providerEntityReferenceId` nor `providerOfferId` supplied |
| `AFFILIATE_REDIRECT_INVALID` | 400 | the adapter's own built URL failed the redirect-security validator (should never happen in practice — defense-in-depth) |
| `AFFILIATE_REDIRECT_TOKEN_INVALID` | 404 | unknown redirect token |
| `AFFILIATE_REDIRECT_TOKEN_EXPIRED` | 410 | redirect token past its TTL |
| `AFFILIATE_ADAPTER_NOT_FOUND` | — | no adapter registered for the provider code (internal — should not surface to a real request against a properly-configured provider) |
| `AFFILIATE_CONVERSION_INVALID` | 400 | malformed/incomplete evidence |
| `AFFILIATE_CONVERSION_STALE_EVIDENCE` | 409 | evidence older than the currently-stored authoritative state |
| `PROVIDER_*` | varies | reused directly from G02's `PROVIDER_ERROR_CODES` for every policy-gate failure |

## 12. Explicitly out of scope (unchanged from the brief)

No Dấu Việt booking aggregate. No Wallet/Payment/PaymentIntent/Charge/Capture/Payout model. No FX
service. No general ledger/invoice/tax/payout-reconciliation system. No receipt/booking checkout. A
conversion never automatically creates a `TripExpense`/`TripSettlement` (G09 is untouched). No
precise location is ever copied into any G10 model (G08 is untouched).
