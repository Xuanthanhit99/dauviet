# G10 — Affiliate & Commercial Attribution: Pre-Implementation Report

## 1. Branch / HEAD / working tree

- Branch `main`, HEAD `9931a16` — unchanged since G07/G08/G09 (all still uncommitted in this same
  working tree, per each phase's own "do not commit" instruction; G10 builds directly on top).
- `git status --short`: the cumulative G07+G08+G09 diff, plus one untracked, unrelated directory
  `frontend-pass-10/`, never touched.

## 2. Concurrent-owned files

`frontend-pass-10/` left untouched. No other concurrent-owned files overlap G10's paths
(`apps/api/src/modules/affiliate/**` (new), `prisma/schema.prisma`, `prisma/migrations/**`,
`docs/backend/**`).

## 3. Provider policy research

See `docs/backend/G10_PROVIDER_POLICY_RESEARCH.md` (retrieved 2026-09-23, live web search + fetch
against official provider domains). Summary: Booking.com Demand API confirmed bearer-token +
`X-Affiliate-Id` auth and a `label` attribution field, but is Managed-Affiliate-Partner-gated;
Agoda confirmed moving to OAuth 2.0 partner-gated access; Viator confirmed a 30-day cookie window
and three affiliate access tiers (Basic/Full/Full+Booking). Several specific numeric/naming claims
(Booking.com's exact latest API version, Agoda's legacy-auth deprecation date, Viator's exact
commission percentage and the literal `campaign-value` parameter name) could **not** be
independently re-confirmed against a first-party page in this session and are explicitly flagged as
unverified, not asserted as fact. **No real credentials for any of the three providers exist in this
environment** — this is the binding fact for this phase's scope (§12 below).

## 4. G02 capabilities/policies reused (audited, not modified)

- `ExternalProvider`/`ProviderCapability`/`ProviderIntegration`/`ProviderIntegrationCapability`/
  `ProviderLicense`/`ProviderDataPolicy`/`ProviderAttributionRule`/`ProviderPolicyEvidence` — all
  reused as-is. `ProviderCapabilityType` already contains `AFFILIATE_LINK`, `BOOKING_REDIRECT`,
  `WEBHOOK`, and `CONVERSION_REPORTING` values (evidently anticipated by G02's own original design)
  — G10 needs **zero new enum values** here.
- `ProviderRegistryService.getExecutionContext({ providerCode, environment, capability, usage })` is
  the **sole** gate every G10 commercial action goes through — re-fetches and re-evaluates on every
  call, nothing cached, so a license revocation/integration suspension takes effect on the very next
  request (spec §18). G10 calls it with `capability: 'AFFILIATE_LINK'` and `usage: 'commercialUse'`
  for the redirect flow. No G10 code ever queries `ExternalProvider`/`ProviderLicense`/etc. directly
  to make an authorization decision — only through this one method, exactly as G05 already does.
- `ProviderAttributionRule`/`ProviderPolicyEvidence` are reused verbatim for provider policy
  evidence (Viator's 8%/30-day, Booking.com's label semantics, etc. — spec §32/33) — no duplicate
  attribution-policy model is created.

## 5. Proposed models (additive only)

`AffiliateSession`, `AffiliateClick`, `AffiliateConversion`, `ProviderBookingReference` — see
`G10_AFFILIATE_ATTRIBUTION.md` for full field-level design. Two enums reused directly from existing
schema (`ProviderEnvironment`, `ProviderCapabilityType`); four new enums
(`AffiliateSourceSurface`, `AffiliatePlacement`, `AffiliateConversionStatus`,
`AffiliateEvidenceType`). One additive `EntityKind` value (`AFFILIATE_CONVERSION`) — the only G10
row type that is individually audited (spec §54 explicitly says `AffiliateClick` itself "need not
duplicate every click into generic AuditLog", matching G08's precedent of not auditing individual
location updates).

**No FK from any G10 table to `TripMember`** (mirroring G09's own structural former-member
preservation reasoning) — `tripId`/`destinationId`/`userId` references are all nullable and
`onDelete: SetNull`, never `Cascade`, per spec §55's explicit "prefer detach/pseudonymize" guidance.
Confirmed by audit: no user hard-delete endpoint exists anywhere in this codebase (same finding as
every prior phase) — `UserStatus.DELETED` is a soft status value only, so this is a forward-looking
safe default, not a currently-exercised path.

## 6. Provider adapter design

```ts
interface AffiliateProviderAdapter {
  readonly providerCode: string;
  buildAffiliateRedirect(input: BuildRedirectInput, context: ProviderExecutionContext): BuildRedirectResult;
  normalizeConversion(raw: unknown): NormalizedConversionInput;
}
```

A small in-process registry (`AffiliateAdapterRegistry`, keyed by `providerCode`) — not a
provider-conditional spread across services (spec §15). **Only one adapter is implemented this
phase**: a clearly-named G10 fixture adapter (`TEST_FIXTURE_PROVIDER_G10_AFFILIATE`, distinct from
G02's own `TEST_PROVIDER_G02_FIXTURE`), used for every live/e2e proof (spec §63/64).

**Real Booking.com/Agoda/Viator adapters are deliberately not implemented as executable code this
phase.** Redirect-URL construction alone would not strictly require live credentials (it is pure
string-building), but the research pass in §3 could not independently re-confirm the exact
first-party URL/parameter shape for any of the three providers to a confidence level this project
ships code on. Writing an unverified "adapter" and presenting it as functionally correct would be
worse than clearly deferring it — the conceptual mapping (which internal field maps to which
provider parameter, privacy constraints on the value) is documented in
`G10_AFFILIATE_ATTRIBUTION.md` instead, explicitly marked as design-only, not implemented. This is
the primary driver of this phase's expected `COMPLETE_WITH_ENVIRONMENT_BLOCKERS` verdict.

## 7. Redirect security design

The client **never** supplies a URL — only canonical internal identifiers (`providerCode`,
`providerEntityReferenceId`/`providerOfferId`, `surface`, `placement`, spec §11). The adapter builds
the destination URL server-side; a dedicated `affiliate-redirect-security.util.ts` validator
(`validateRedirectUrl`) is run against the adapter's own output before it is ever stored/served, as
defense-in-depth against a future adapter bug — checking scheme (`https:` only), no userinfo, exact
hostname allowlist membership (no suffix/subdomain matching — full-string equality only, to defeat
lookalike/subdomain tricks), and no control characters (CRLF/header-injection defense). The full
open-redirect matrix (spec §89) is proven directly against this validator with dedicated unit tests,
since no HTTP endpoint in this design ever accepts a raw URL as input at all — the strongest
available defense is eliminating that attack surface entirely, not just filtering it.

A short-lived, opaque, hashed **redirect token** (spec §14) is generated at click-creation time
(`randomBytes(32).toString('base64url')`, SHA-256-hashed before storage — the exact pattern G07's
invitation token already established) and bound to the specific `AffiliateClick` row's
already-validated `redirectUrl`. `GET /v1/affiliate/r/:token` only ever resolves this token to that
pre-validated URL — it never re-derives or re-validates a URL from user input at redirect time.
**Replay behavior (documented per spec §14)**: the token may be used repeatedly within its TTL (a
page reload/back-button should not break the redirect) — it is idempotent, always resolving to the
same stored, already-validated URL; it is never re-evaluated against changed policy after issuance
(policy freshness is enforced at click-creation time, not at redirect time, since regenerating the
whole flow for every reload would be both unnecessary and would reintroduce a race between click
and redirect that the pre-validated stored URL avoids entirely).

## 8. Attribution reconciliation design

`AffiliateConversion` never fabricates a click relation (spec §41/42) — `affiliateClickId` is
resolved **only** via a deterministic provider-supplied tracking key that was itself generated at
click time and echoed back by the provider's evidence (e.g. the `campaignKey` stored on
`AffiliateClick`, if and when a provider's conversion evidence includes it back). No fuzzy matching
on amount/date/destination/user is ever implemented. A conversion with valid provider evidence but
no reconcilable click is retained with `affiliateClickId = null` (spec §42) — never rejected, never
force-matched.

## 9. Conversion idempotency design

`@@unique([providerId, providerConversionId])` (spec §36) is the DB-enforced idempotency key.
Ingestion uses the same `INSERT ... ON CONFLICT (providerId, providerConversionId) DO UPDATE ...
WHERE stored.providerOccurredAt <= EXCLUDED.providerOccurredAt` pattern G08/G09 already established
for their own newer-wins/idempotent-duplicate proofs — real-PostgreSQL-provable, not a
read-then-write race. Out-of-order evidence (spec §38) is resolved by this same `providerOccurredAt`
comparison: strictly older evidence is rejected without touching the stored row; equal
`providerOccurredAt` (a genuine duplicate delivery) is an idempotent no-op; newer evidence updates
`status`/`rawProviderStatus`/amounts in place — never a second economic event for one provider
conversion.

## 10. Retention / privacy design

No G08/G09-style *active read-time enforcement* of an expiry is needed here (there is no
"disclosure" property to protect the way location/consent had one) — retention here is a
**data-minimization policy**, documented per spec §56, not an automated deletion job built in this
phase (matching this codebase's existing precedent: no background retention-cleanup job exists
anywhere yet outside G06.5's own ingestion-specific raw-retention days, which is also a documented
policy value, not a currently-running cron). Recommended, documented (not enforced-by-code) windows:
`AffiliateSession` 90 days, `AffiliateClick` 180 days, `AffiliateConversion`/
`ProviderBookingReference` retained per accounting/contractual need (no fixed number invented — spec
§56 leaves this to "provider policy/legal requirements," which this environment has none of on
file). PII minimization (spec §45/91) is structural: no field for traveler name/passport/phone/
email/billing address/payment data exists anywhere in any G10 model.

## 11. Idempotency / webhook infrastructure (audited)

No generic client-idempotency-key or webhook-signature-verification infrastructure exists anywhere
in this codebase (confirmed by search, matching G09's own finding). G10 does not build a generic
webhook receiver in this phase — `AffiliateEvidenceType.PROVIDER_WEBHOOK` is modeled as a valid
evidence *type* for future use, but no live webhook endpoint is wired to any real provider (no
credentials to configure one against). Manual/admin evidence ingestion
(`AffiliateEvidenceType.APPROVED_IMPORT`/`FIXTURE`) is the only ingestion path actually exercised
this phase.

## 12. Provider credential blockers (binding for verdict)

No Booking.com, Agoda, or Viator credentials (sandbox or production) exist in this environment —
confirmed by auditing `.env`/`.env.example` and `AppConfig`. Per spec §65-68, this is an environment
blocker, not a reason to fabricate proof: no real sandbox call is made against any of the three
providers anywhere in this phase. All live proof uses the G10 fixture provider. This is expected to
drive the final verdict to `COMPLETE_WITH_ENVIRONMENT_BLOCKERS`.

## 13. Migration plan

One additive migration (`<timestamp>_g10_affiliate_attribution`): four new tables
(`AffiliateSession`, `AffiliateClick`, `AffiliateConversion`, `ProviderBookingReference`), four new
enums, one additive `EntityKind` value, additive relation arrays on `ExternalProvider`/`Trip`/
`Destination`/`User`. Generated the same way G09's was (diffing the live dev database — already at
the accepted G09 baseline — against the working schema via
`prisma migrate diff --from-url <DATABASE_URL> --to-schema-datamodel prisma/schema.prisma --script`,
no shadow database), reviewed, then hand-placed, stripping the same pre-existing
`EntityKind.FACT`/trigram-index drift artifact every phase since G04 has found.

## 14. Expected APIs

```
POST /v1/affiliate/clicks        (@Public, optional auth - anonymous + authenticated)
GET  /v1/affiliate/r/:token      (@Public - browser redirect target)

GET  /v1/admin/affiliate/conversions   (ADMIN only)
GET  /v1/admin/affiliate/summary       (ADMIN only)
POST /v1/admin/affiliate/conversions/ingest   (ADMIN only - approved-evidence ingestion)
```

No public conversion mutation endpoint exists anywhere (spec §52/53). Commercial reporting is
ADMIN-only (spec §50), reusing this codebase's existing `@Roles('ADMIN')`/`RolesGuard` convention
(the same tier `ProviderLicensesController`'s mutation routes already use), not a new role.

## 15. Risks

1. Real provider adapters are not implemented as executable code (§6/12) — by design, not an
   oversight, but it means the "provider adapter" requirement is satisfied at the
   interface/registry/fixture level only, not with three working real integrations.
2. No active retention-deletion job (§10) — documented policy only, matching existing codebase
   precedent, not a gap introduced by G10 specifically.
3. The new `OptionalJwtAuthGuard` (needed for §6 "support anonymous, capture user when present") is
   new shared-guard infrastructure, layered locally alongside `@Public()` rather than modifying the
   existing global `JwtAuthGuard` — chosen specifically to avoid touching that security-critical
   global class at all.

## 16. Canonical gate count

See `docs/backend/G10_ACCEPTANCE_GATE_MANIFEST.md` — derived directly from this brief's own numbered
sections, not chosen in advance.
