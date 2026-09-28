# Backend V2 — Freeze Candidate (recommendation, not a lock)

Audience: the external reviewer who makes the Backend V2 freeze decision.

**Recommendation: FREEZE_WITH_EXTERNAL_INTEGRATION_BLOCKERS.**
This document proposes a candidate. It does **not** mark Backend V2 Production LOCKED; that decision is
yours.

## What is proposed

The Dấu Việt backend as it stands in the working tree of `main` (HEAD `9931a16` + uncommitted G07–G12),
exactly as inventoried in `G12_BACKEND_V2_CANDIDATE_MANIFEST.md`: 28 migrations (24 accepted + 4 G12),
schema sha256 `09434bc6bfc17292`, seed sha256 `8921cf1dc039569b`, OpenAPI 314 paths / 363 operations
(sha256 `e9eb921fd963af5e`).

## Why it qualifies

- No unresolved P0 or P1. G12 found six P1s (unsafe production seed, missing `EntityKind.FACT`, negative
  expense shares, fail-open production CORS, backup/restore losing indexes, a real transfer×removal
  deadlock) and fixed each with a regression proof.
- Core certification passed on the final source: unit 105/105 suites (1516 tests); e2e 13/13 suites
  (320 tests) with a run-scoped Redis namespace and an external sentinel surviving; the 49-test
  cross-domain/contract/security suite green three times (UTC, Asia/Bangkok, America/New_York);
  Path A (fresh install, production profile), Path B (accepted G11 → G12, no unexpected delta),
  Paths C/D, graceful shutdown, local backup/restore; final deployment smoke 56/56 and production-mode
  checks 14/14; performance targets met; 0 secrets.
- Runtime contract == OpenAPI == committed document (automated check); no breaking change for valid clients.

## Why "with external integration blockers"

GeoNames, Google Places (G06.5) and Booking.com, Agoda, Viator (G10) have no credentials/approval here,
and no Google OAuth app or SMTP relay is configured. Each is behind the G02 gate or its adapter registry
and fails closed; no core behaviour depends on any of them; no live result was fabricated. Enabling one
is additive and needs its own live proof (`G12_EXTERNAL_INTEGRATION_MATRIX.md`).

## What the reviewer should weigh (open, non-blocking)

P2: dependency upgrades (qs, nodemailer 7.x, AWS SDK); OpenAPI lacks response/error schemas; G05 offer
display evaluates the SANDBOX integration; rate limiting keys on the direct peer (configure `trust
proxy`/edge limits behind a load balancer); no retention/purge jobs. P3 items: `G12_FINAL_REPORT.md` §18.
Performance was measured on a shared laptop, not production hardware; no cloud restore was performed.

## Before production launch (deployment actions, not freeze blockers)

Follow `G12_DEPLOYMENT_RUNBOOK.md`: production configuration, pre-migration backup, `prisma migrate deploy`,
`SEED_PROFILE=production` seed, first-administrator provisioning, readiness and smoke; decide retention
and `trust proxy`; enable external integrations one at a time with their own proofs.
