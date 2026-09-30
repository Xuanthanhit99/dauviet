# PHASE 4 — BOOK FINAL AUDIT

Status: **CONDITIONAL — EXACT-CURRENT-HEAD CI REQUIRED**

The G05 → G10 P1 integration gap is remediated in source.

## Gate

- Stay: PASS — contextual provider offers expose opaque server offer/reference ids.
- Food: PASS — operational snapshots remain provider-scoped and expose the mapped opaque provider reference id.
- Activities: PASS — contextual provider offers expose opaque server offer/reference ids.
- Affiliate integrity: PASS IN SOURCE — G10 verifies offer/reference ownership against the declared provider before creating a click.
- Fail closed: PASS IN SOURCE — no raw provider URL or fabricated identifier is accepted by the consumer flow.
- Browser regression: ADDED — Stay server-id handoff + provider rejection, Food reference handoff, Activity empty-state/no fabricated CTA.
- Backend regression: ADDED — forged offer/reference identifiers are rejected before an AffiliateClick is created.
- CI: PENDING — must pass on the exact current head containing these remediations and regressions.

## Remaining acceptance rule

Phase 4 is not COMPLETE until exact-current-head Consumer QA succeeds. If CI exposes a P0/P1 regression, remediate and rerun before acceptance.

PR #2 remains Draft. No merge and no production deployment.
