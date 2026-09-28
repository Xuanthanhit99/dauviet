# G10 — Affiliate & Commercial Attribution: Acceptance Gate Manifest

Derived directly from the numbered sections of the G10 brief (not chosen in advance — see
`docs/backend/G10_PRE_IMPLEMENTATION_REPORT.md`). Allowed states: `PASS`, `FAIL`, `UNVERIFIED`,
`PASS — NOT APPLICABLE`. Evidence in `G10_FINAL_REPORT.md`.

| Gate | Requirement (brief section) | Status |
|---|---|---|
| G10-GATE-001 | Provider offer != affiliate click (§1) | PASS |
| G10-GATE-002 | Affiliate click != booking (§1) | PASS |
| G10-GATE-003 | Affiliate session != auth session (§1) | PASS |
| G10-GATE-004 | Click != conversion (§1) | PASS |
| G10-GATE-005 | Conversion != payment (§1) | PASS |
| G10-GATE-006 | Conversion != guaranteed commission (§1) | PASS |
| G10-GATE-007 | Commission != user expense (§1) | PASS |
| G10-GATE-008 | Provider booking reference != Dấu Việt booking (§1) | PASS |
| G10-GATE-009 | Attribution != user profiling (§1) | PASS |
| G10-GATE-010 | Redirect != availability guarantee (§1) | PASS |
| G10-GATE-011 | Current official provider documentation reverified before schema changes, recorded with source/date/evidence (§2) | PASS (`G10_PROVIDER_POLICY_RESEARCH.md`) |
| G10-GATE-012 | Unofficial blogs not used as policy authority where official docs exist (§2) | PASS |
| G10-GATE-013 | Viator 8%/30-day and similar values not hard-coded into core domain behavior (§2) | PASS (no such constant anywhere in code; modeled as `ProviderAttributionRule`/`ProviderPolicyEvidence` data) |
| G10-GATE-014 | Pre-implementation audit performed and documented before schema changes (§3) | PASS |
| G10-GATE-015 | Minimum additive domain used (`AffiliateSession`/`AffiliateClick`/`AffiliateConversion`/`ProviderBookingReference`) (§4) | PASS |
| G10-GATE-016 | No Dấu Việt Booking aggregate created (§4) | PASS |
| G10-GATE-017 | AffiliateSession is attribution context, not auth session, minimum fields (§5) | PASS |
| G10-GATE-018 | Anonymous users supported; auth not required for a valid redirect (§6) | PASS (live) |
| G10-GATE-019 | `userId` optional on session/click (§6) | PASS |
| G10-GATE-020 | No precise GPS/location history/device fingerprint/browsing history/cross-site profile/passport/phone/payment data in session/click (§7) | PASS |
| G10-GATE-021 | AffiliateClick is append-oriented server-side event with the expected minimum fields (§8) | PASS |
| G10-GATE-022 | No PATCH/DELETE exposed for ordinary click history (§9) | PASS (no such route exists) |
| G10-GATE-023 | Client does not build the affiliate URL/campaign/label/provider params (§10) | PASS (live — DTO accepts only canonical ids) |
| G10-GATE-024 | Redirect input is canonical internal identifiers, not an arbitrary URL (§11) | PASS |
| G10-GATE-025 | `?url=` style arbitrary redirect authority never accepted (§12) | PASS (no such field exists anywhere in the DTO) |
| G10-GATE-026 | Redirect destination generated/validated server-side (§12) | PASS |
| G10-GATE-027 | Redirect requires HTTPS, approved host, no credentials-in-URL, no javascript:/data:, no protocol-relative bypass, no hostname trick, no encoded-host bypass (§13) | PASS (live, redirect-security matrix) |
| G10-GATE-028 | Explicit redirect-security tests exist (§13) | PASS |
| G10-GATE-029 | Redirect token opaque/high-entropy or signed, finite TTL, no PII, no provider secret, no raw internal identity, tamper-resistant (§14) | PASS |
| G10-GATE-030 | Replay behavior documented (§14) | PASS |
| G10-GATE-031 | Provider adapter registry used, not conditionals spread across services (§15) | PASS |
| G10-GATE-032 | Only actually-supported provider methods implemented (§15) | PASS — the fixture adapter implements both; no real adapter is implemented (credential-blocked, §12) |
| G10-GATE-033 | Every provider-dependent commercial action uses `ProviderRegistryService.getExecutionContext` (§16) | PASS (live) |
| G10-GATE-034 | Gate never bypassed (§16) | PASS (code inspection — no direct `ExternalProvider`/license table read anywhere in the affiliate module) |
| G10-GATE-035 | Fail closed on disabled/blocked/invalid-license/inactive-capability/missing-evidence/unavailable-attribution (§17) | PASS (live) |
| G10-GATE-036 | Policy change affects the very next commercial request, no restart (§18) | PASS (live) |
| G10-GATE-037 | `ProviderAttributionRule`/`ProviderPolicyEvidence` reused, no duplicate policy universe (§19) | PASS |
| G10-GATE-038 | Booking.com label mapped to a privacy-safe tracking key where supported (§20) | PASS — NOT APPLICABLE (no real Booking.com adapter implemented, §12; the fixture adapter demonstrates the identical privacy-safe-campaign-key mechanism) |
| G10-GATE-039 | No email/raw userId/raw tripId/GPS/auth session in provider label (§20) | PASS (structural — `campaignKey` is a random opaque value, never derived from PII) |
| G10-GATE-040 | Viator campaign-value privacy-safe where supported (§21) | PASS — NOT APPLICABLE (same as §38) |
| G10-GATE-041 | No internal PII/secrets exposed via campaign value (§21) | PASS |
| G10-GATE-042 | No Agoda siteId/API-key assumption encoded into affiliate domain models (§22) | PASS (code inspection — provider auth is entirely `ProviderIntegration.credentialReference`, untouched by G10) |
| G10-GATE-043 | Design tolerates OAuth-based provider auth (§22) | PASS (adapter interface carries no auth-scheme assumption at all) |
| G10-GATE-044 | G05 `ProviderOffer` remains separate (§23) | PASS |
| G10-GATE-045 | AffiliateClick may reference an offer without copying the full payload (§23) | PASS (soft pointer only, no relation, no payload copy) |
| G10-GATE-046 | Expired offer price never presented as current (§24) | PASS — NOT APPLICABLE (G10 never reads/displays offer price at all; redirect semantics are independent of any price) |
| G10-GATE-047 | `ProviderBookingReference` represents external evidence, not a Dấu Việt booking, minimum fields, no unnecessary PII (§25) | PASS |
| G10-GATE-048 | Conversion does not require an external booking reference (§26) | PASS (nullable FK) |
| G10-GATE-049 | AffiliateConversion exists only from provider evidence, expected fields present (§27) | PASS |
| G10-GATE-050 | Evidence types limited to the allowed conceptual set; browser return is never treated as proof (§28/29) | PASS |
| G10-GATE-051 | Click does not create a conversion; redirect success does not create a conversion (§29) | PASS (live) |
| G10-GATE-052 | Normalized status limited to PENDING/CONFIRMED/CANCELLED/REVERSED, raw status preserved separately (§30) | PASS |
| G10-GATE-053 | No invented successful state absent provider evidence (§30) | PASS |
| G10-GATE-054 | `commissionAmount` may be null; never computed by hard-coded percentage (§31) | PASS |
| G10-GATE-055 | Viator 8%/30-day (or any provider policy value) stored as versioned evidence/config, never an immutable domain constant (§32) | PASS |
| G10-GATE-056 | Attribution windows modeled/configured with effective dates/evidence (§33) | PASS — NOT APPLICABLE in code (no real provider attribution-window enforcement is implemented, since no real provider is wired; the `ProviderAttributionRule`/`ProviderPolicyEvidence` model used already supports `effectiveFrom`/`effectiveUntil`-shaped dating from G02) |
| G10-GATE-057 | `AffiliateSession` TTL not automatically equal to provider attribution window (§33) | PASS (two independent config values) |
| G10-GATE-058 | Exact Decimal used for money, consistent with G09 (§34) | PASS (reuses G09's `parseMoney`) |
| G10-GATE-059 | Booking and commission amounts may use different currencies (§34) | PASS (independent nullable currency fields) |
| G10-GATE-060 | No Float used for money (§34) | PASS |
| G10-GATE-061 | No currency conversion between booking/commission (§35) | PASS |
| G10-GATE-062 | Commercial reporting groups by currency, no FX service (§35) | PASS |
| G10-GATE-063 | Conversion idempotency key defined and DB-enforced (§36) | PASS (`@@unique([providerId, providerConversionId])`) |
| G10-GATE-064 | Provider-specific idempotency strategy documented (§36) | PASS |
| G10-GATE-065 | Repeated evidence updates lifecycle instead of duplicating the economic event (§37) | PASS (live) |
| G10-GATE-066 | Out-of-order events: older evidence cannot overwrite newer authoritative state (§38) | PASS (live, real PostgreSQL) |
| G10-GATE-067 | Concurrent duplicate ingestion for the same conversion never creates duplicates (§39) | PASS (live, real PostgreSQL race) |
| G10-GATE-068 | Deterministic reconciliation of tracking key → click → session where evidence permits (§40) | PASS |
| G10-GATE-069 | No fuzzy attribution matching on amount/date/destination/user/browser (§41) | PASS (code inspection — no such matching logic exists) |
| G10-GATE-070 | Unattributed-but-valid conversion retained with `affiliateClickId = null`, never fabricated (§42) | PASS (live) |
| G10-GATE-071 | No unrestricted raw provider payload persisted (§43) | PASS (only normalized fields + an evidence hash/reference) |
| G10-GATE-072 | G02 storage-policy states respected, fail closed on insufficient storage rights (§44) | PASS — NOT APPLICABLE in the live-tested sense (no real provider `ProviderDataPolicy` row is exercised; the fixture provider's own gate gets the identical fail-closed treatment as any other capability check) |
| G10-GATE-073 | No traveler name/passport/phone/customer email/guest list/billing address stored unless strictly required (§45) | PASS (none of these fields exist in any G10 model) |
| G10-GATE-074 | No card PAN/CVV/payment token/bank credentials ever stored (§46) | PASS (no such field exists anywhere) |
| G10-GATE-075 | Conversion never automatically creates TripExpense/TripSettlement/balance change (§47) | PASS (live — code inspection confirms zero G09 imports in the affiliate module, plus a live regression test) |
| G10-GATE-076 | No precise location copied into session/click/conversion (§48) | PASS (no G08 import/reference anywhere in the affiliate module) |
| G10-GATE-077 | Trip role grants no commercial reporting access (§49) | PASS (live) |
| G10-GATE-078 | Commercial reporting is ADMIN-only (or a stricter existing role) (§50) | PASS (live) |
| G10-GATE-079 | Normal users cannot enumerate conversions/commission (§50) | PASS (live) |
| G10-GATE-080 | Anonymous/authenticated users may redirect but cannot enumerate global click history (§51) | PASS (live — no click-list endpoint exists for non-admins at all) |
| G10-GATE-081 | Conversion ingestion/reconciliation is admin/internal only (§52) | PASS (live) |
| G10-GATE-082 | No arbitrary public conversion-creation endpoint (§52) | PASS |
| G10-GATE-083 | Manual import (if implemented) requires evidence/source, idempotency, audit, policy gate; no generic "create commission" endpoint (§53) | PASS |
| G10-GATE-084 | Conversion ingestion/status-update/reconciliation-correction/manual-import audited (§54) | PASS (live) |
| G10-GATE-085 | AffiliateClick itself not duplicated into generic AuditLog (§54) | PASS |
| G10-GATE-086 | Current user-deletion semantics audited (§55) | PASS (pre-impl report §5 — no hard-delete endpoint exists anywhere) |
| G10-GATE-087 | No cascade-delete of commercial evidence merely on user-association removal; detach/pseudonymize preferred; no invented indefinite retention (§55) | PASS (`onDelete: SetNull` on every nullable user reference) |
| G10-GATE-088 | Retention documented separately for session/click/conversion/booking-reference/evidence (§56) | PASS |
| G10-GATE-089 | Attribution sessions not kept indefinitely (§56) | PASS (documented TTL/retention policy) |
| G10-GATE-090 | First-party attribution identifier (if used) opaque, finite, no PII, not an auth credential (§57) | PASS (session id serves this role; no additional identifier invented) |
| G10-GATE-091 | No cross-site profiling built (§57) | PASS |
| G10-GATE-092 | Provider attribution cookies correctly described as provider-side, not owned/inspectable by Dấu Việt (§58) | PASS (documented) |
| G10-GATE-093 | No unnecessary tracking cookie created by the backend (§58) | PASS (code inspection — no `res.cookie` call anywhere in the affiliate module; session continuity is a client-held opaque id, not a server-set cookie) |
| G10-GATE-094 | Controlled source-surface values used, chosen from actual product routes (§59) | PASS |
| G10-GATE-095 | Controlled placement values used (§60) | PASS |
| G10-GATE-096 | Admin can aggregate clicks/conversions/commission by provider/surface/campaign/currency/time, no implicit FX (§61) | PASS (live) |
| G10-GATE-097 | No general ledger/invoice system/tax accounting/payout reconciliation platform built (§62) | PASS |
| G10-GATE-098 | Clearly-named deterministic G10 fixture provider used for e2e; never masquerades as a real provider (§63) | PASS |
| G10-GATE-099 | Fixture proves eligible redirect/click/ingestion/duplicate-ingestion/status-change/cancellation/commission-update/unattributed-conversion/policy-revocation (§64) | PASS (live, full matrix) |
| G10-GATE-100 | Real provider sandbox used only with valid existing credentials; none fabricated (§65) | PASS — NOT APPLICABLE (no credentials exist; nothing to test against) |
| G10-GATE-101 | No auto-signup/paid booking/production-endpoint testing/invented credentials (§65-68) | PASS |
| G10-GATE-102 | Missing provider credentials treated as environment blockers, not fabricated as proof (§65) | PASS |
| G10-GATE-103 | Provider secrets never committed/logged/returned to client/written to docs/stored in affiliate rows (§69) | PASS (none exist to leak — no real credentials configured) |
| G10-GATE-104 | Provider auth implementation stays in the integration layer, not the affiliate domain (§70) | PASS |
| G10-GATE-105 | API route conventions audited before implementation (§71) | PASS |
| G10-GATE-106 | No public conversion mutation exposed (§71) | PASS |
| G10-GATE-107 | Redirect response is server-controlled/short-lived-token based, not a reusable arbitrary URL-building primitive (§72) | PASS |
| G10-GATE-108 | Provider adapter defines an approved redirect host allowlist (§73) | PASS |
| G10-GATE-109 | Subdomain/encoding tricks tested against the allowlist (§73) | PASS (live, redirect-security matrix) |
| G10-GATE-110 | Redirect/header injection via provider/user-controlled strings prevented (§74) | PASS (live) |
| G10-GATE-111 | Provider attribution values correctly encoded, never concatenated unescaped (§75) | PASS (`URLSearchParams`/`URL` API used throughout, never string concatenation) |
| G10-GATE-112 | Campaign/label value is pseudonymous, no raw email/userId/tripId/precise location (§76) | PASS |
| G10-GATE-113 | clickedAt/providerOccurredAt/reportedAt/ingestedAt distinguished, server-owned where appropriate (§77) | PASS |
| G10-GATE-114 | Historical records retain enough policy reference without copying full provider terms (§78) | PASS (`policyVersionRef` stores a license/rule id, never full terms text) |
| G10-GATE-115 | Policy updates affect future actions only; historical evidence never silently rewritten (§79) | PASS (code inspection — no update path ever mutates a past conversion's `policyVersionRef` retroactively) |
| G10-GATE-116 | Migration additive-only, no accepted G00-G09 migration edited (§80) | PASS |
| G10-GATE-117 | No destructive DROP/rename (§80) | PASS |
| G10-GATE-118 | Safe migration tooling used; live dev DB never used as shadow DB (§81) | PASS |
| G10-GATE-119 | Path A: fresh isolated DB, full migration chain, seed x2, idempotent, build, boot, HTTP smoke (§82) | PASS |
| G10-GATE-120 | Path B: exact pre-G10 state, before/after proof including G09 financial hashes and G08/G05 structural state, no locked data changed (§83) | PASS |
| G10-GATE-121 | No fake real commercial conversions seeded (§84) | PASS |
| G10-GATE-122 | Real PostgreSQL proof: click persistence (§85) | PASS |
| G10-GATE-123 | Real PostgreSQL proof: conversion uniqueness (§85) | PASS |
| G10-GATE-124 | Real PostgreSQL proof: concurrent duplicate ingestion (§85) | PASS |
| G10-GATE-125 | Real PostgreSQL proof: out-of-order update (§85) | PASS |
| G10-GATE-126 | Real PostgreSQL proof: transaction rollback (§85) | PASS |
| G10-GATE-127 | Real PostgreSQL proof: reconciliation (§85) | PASS |
| G10-GATE-128 | Real PostgreSQL proof: policy revocation behavior (§85) | PASS |
| G10-GATE-129 | Forced rollback: real DB failure after >=1 conversion/reconciliation mutation, no partial commercial state survives (§86) | PASS |
| G10-GATE-130 | Policy revocation live test: eligible → successful redirect → revoke → next redirect fails closed, no restart (§87) | PASS (live) |
| G10-GATE-131 | Attribution-rule-missing test: otherwise-eligible provider, missing required rule → fails closed (§88) | PASS (live) |
| G10-GATE-132 | Open redirect matrix: arbitrary host, http, javascript:, data:, protocol-relative, userinfo, lookalike host, subdomain trick, encoded trick, CRLF/header injection (§89) | PASS (live, all cases) |
| G10-GATE-133 | Conversion matrix: click-only→no conversion, redirect→no conversion, valid evidence→conversion, duplicate evidence→one conversion, status update→same conversion, older evidence→no override, cancel/reverse→correct lifecycle, missing commission→null, unattributed valid evidence→retained (§90) | PASS (live, full matrix) |
| G10-GATE-134 | Privacy matrix: no G08 coordinate/location history/auth token/raw JWT/password-reset token/card data/passport/unnecessary PII in any affiliate record (§91) | PASS (live) |
| G10-GATE-135 | Authorization matrix: anonymous/USER/OWNER/EDITOR/VIEWER/ADMIN against redirect-initiation/click-enumeration/conversion-list/commission-summary/ingestion (§92) | PASS (live) |
| G10-GATE-136 | G09 regression: conversion never alters TripExpense/TripExpenseShare/TripSettlement/balance (§93) | PASS (live) |
| G10-GATE-137 | G08 regression: no affiliate flow affects location consent/rows (§94) | PASS |
| G10-GATE-138 | G07 regression: trip collaboration permissions unchanged (§95) | PASS |
| G10-GATE-139 | G06 regression: cost estimate remains planning data, no commission enters it (§96) | PASS |
| G10-GATE-140 | G05 regression: provider offers/references remain separate, G10 only references them (§97) | PASS |
| G10-GATE-141 | G02 regression: full/focused provider policy tests pass, G10 uses current execution context (§98) | PASS |
| G10-GATE-142 | G06.5 regression: `IngestionSource != ExternalProvider` remains true, no boundary regression (§99) | PASS |
| G10-GATE-143 | Full unit suite green, no assertion weakened (§100) | PASS |
| G10-GATE-144 | Full E2E suite green, sequential per repository contract (§101) | PASS |
| G10-GATE-145 | OpenAPI regenerated from the real running app (§102) | PASS |
| G10-GATE-146 | Post-G10 path count reported, old-path changes explained if any (§102) | PASS |
| G10-GATE-147 | No admin commission/conversion data exposed through public schemas (§103) | PASS |
| G10-GATE-148 | Secret scan: no API keys/affiliate secrets/bearer tokens/OAuth secrets/DATABASE_URL/JWT/real PII (§104) | PASS |
| G10-GATE-149 | Log scan: no provider bearer tokens/API keys/redirect secrets/raw auth headers/customer PII (§105) | PASS |
| G10-GATE-150 | Working tree audited before work; concurrent-owned files (`frontend-pass-10/`) respected (§106) | PASS |
| G10-GATE-151 | No git mutation (§107) | PASS |
| G10-GATE-152 | No G11 search/map changes (§108) | PASS |
| G10-GATE-153 | No Backend V2 Freeze claim (§109) | PASS |
| G10-GATE-154 | No Dấu Việt booking/payment checkout created (§110) | PASS |
| G10-GATE-155 | No Wallet/Payment/PaymentIntent/Charge/Capture/Payout/Card/BankAccount model (§111) | PASS |
| G10-GATE-156 | No exchange-rate service or invented FX (§112) | PASS |
| G10-GATE-157 | Conversion never automatically creates a G09 expense (§113) | PASS (live) |
| G10-GATE-158 | Gate manifest derived before implementation, not an arbitrary count (§114) | PASS |
| G10-GATE-159 | Required documentation created/updated (§115) | PASS |
| G10-GATE-160 | Final report includes every required element (§116) | PASS |
| G10-GATE-161 | Verdict is exactly one of the four allowed states, justified by evidence (§117) | PASS |
| G10-GATE-162 | G11/G12 remain NOT STARTED after G10; Backend V2 Freeze not claimed (§118) | PASS |
| G10-GATE-163 | G10 not independently marked LOCKED (§118) | PASS |
| G10-GATE-164 | No STOP condition silently bypassed (§119) | PASS — NOT APPLICABLE (no STOP condition was reached) |
