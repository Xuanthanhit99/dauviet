# PHASE 4 — BOOK INTEGRATION AUDIT

Status: **BLOCKED — P1 CONTRACT INTEGRATION GAP**

Phase 4 consumer work now has BOOK discovery plus Stay, Food and Activity detail/provider-data states. Current-head CI for the three surfaces is green.

## P1 — G05 → G10 handoff has no trustworthy identifier

The frozen G05 public offer responses expose provider code, commercial fields, freshness and attribution, but do **not** expose the provider offer id or provider-reference id.

G10 `POST /v1/affiliate/clicks` requires `providerOfferId` or `providerEntityReferenceId`. The consumer therefore has no server-issued identifier it can truthfully pass from a displayed G05 offer into G10.

The G10 fixture adapter accepts any non-empty identifier, but synthesizing an id from slug/index/provider code would violate the BOOK truth contract and would make attribution unrelated to the displayed provider record.

### Consequence

Affiliate handoff is intentionally **not wired** in the web UI yet. Phase 4 must not be marked COMPLETE while this gap exists.

### Required remediation

Resolve this as a backend cross-contract defect, not as a UI convenience change:

1. G05 provider-backed public responses expose the opaque server identifier required for G10 handoff (offer id and/or provider-reference id).
2. G10 validates that the supplied identifier belongs to the declared provider and expected entity family before creating the click.
3. Preserve the existing G02 eligibility/policy gate, server-controlled redirect, attribution, expiry and fail-closed behavior.
4. Add backend regression proving valid G05 → G10 handoff and rejection of forged/cross-provider identifiers.
5. Only then wire the BOOK CTA and browser regression.

No raw provider URL is accepted from the browser. No fabricated id is allowed.

PR #2 remains Draft. No merge and no production deployment.
