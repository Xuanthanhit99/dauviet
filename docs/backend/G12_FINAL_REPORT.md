# G12 — Final Contract, Live QA and Backend V2 Freeze Certification: Final Report

Audience: the external reviewer who decides the Backend V2 freeze.

## Verdict: **COMPLETE_WITH_ENVIRONMENT_BLOCKERS**
## Freeze recommendation: **FREEZE_WITH_EXTERNAL_INTEGRATION_BLOCKERS**

The backend is certified on everything that can be proven in this environment. It is not bare
`COMPLETE`/`FREEZE` only because real credentials or partner approvals for GeoNames, Google Places,
Booking.com, Agoda and Viator (and a live Google OAuth app / SMTP relay) do not exist here; every one
of those integrations fails closed and no core behaviour depends on it. No live provider result was
fabricated. This report recommends; it does **not** mark Backend V2 Production LOCKED.

## 1. Baseline, branch, working tree, ownership

- Accepted baseline: G00–G06, G07–G09, G11 COMPLETE/LOCKED; G06.5 and G10 COMPLETE_WITH_ENVIRONMENT_BLOCKERS.
- Branch `main`, HEAD `9931a16` — unchanged. G07–G12 are uncommitted in the working tree (each brief
  forbade committing). Only read-only git was used; nothing is staged (one accidental `git mv -k` on an
  untracked file was a no-op — verified 0 staged entries — disclosed here).
- `frontend-pass-10/` (concurrently owned) was never touched. The unrelated `beaconvie-*` containers on
  the same Docker host were never addressed; the conventional SMTP port 1025 on this host belongs to
  that project's mail catcher, so every G12 app/e2e run pointed SMTP at a closed port instead.
- **Machine power loss** interrupted G12 once (during the performance benchmark). Recovery was
  performed from repository/database evidence: PostgreSQL WAL recovery completed cleanly; all 28
  migrations finished on every database with checksums equal to the files; every G12 effect verified
  present; Redis restored an older RDB snapshot, which re-created a few already-deleted suite-owned
  meta keys (removed; sentinels intact). The interrupted benchmark produced no samples and was
  re-run from a freshly reloaded dataset (INTERRUPTED_BY_MACHINE_SHUTDOWN, not a product failure).
  Every validation reported below ran on the final source after recovery unless stated.

## 2. Findings and remediations (all found by G12's own audit or tests)

| Id | Sev | Finding | Fix |
|---|---|---|---|
| P1-1 | P1 | Production seed created loginable dev accounts (ADMIN with a known password) and an ACTIVE fixture provider whose prices G05 would serve publicly | `SEED_PROFILE` (production default under `NODE_ENV=production`): credential-less authorship accounts only, no fixture provider |
| P1-2 | P1 | `EntityKind.FACT` declared in the schema but missing from the database enum since V1 → citation/fact-review audit writes fail (proven: `POST /citations` → 500 on an accepted-G11 database, citation row left without audit) | additive migration `…0002_g12_entity_kind_fact`; the recurring "drift artifact" was half real |
| P1-3 | P1 | EXACT/PERCENTAGE splits accepted negative shares (sum-only check) and >2-decimal percentages | service validation + DB CHECKs; 4 unit tests red on the old code, green now |
| P1-4 | P1 | Empty `CORS_ORIGINS` reflected any origin with credentials in production | production boot refuses empty/wildcard/path origins |
| P1-5 | P1 | Backup/restore of any accepted database silently lost 9 expression indexes (`pg_restore` errors; `--exit-on-error` aborts) and autovacuum could not analyze those tables | schema-qualified `immutable_unaccent` (`…0003`) — restore now exits 0 with every table and facet equal |
| P1-6 | P1 | Real PostgreSQL deadlock (40P01 → 500) between ownership transfer and member removal (opposite lock orders inside G07) | `transferOwnership` now locks TripMember before Trip, the order every other trip mutation uses; ×10 race per certification run, 0 deadlocks since |
| P2 | P2 | Chronology ordinals missing on every seeded row (G11 carry-over) | seed + data migration from each row's own cited dates |
| P2 | P2 | E2E `FLUSHALL` on shared Redis (G11 carry-over) | run-scoped namespace + guarded scoped cleanup; sentinel proof |
| P2 | P2 | Placeholder/identical JWT secrets, empty `DATABASE_URL`, missing `APP_URL`, `SKIP_DB_CONNECT` accepted in production | production config validation |
| P2 | P2 | Affiliate redirect token kept redirecting for its TTL after provider disable/license revocation | G02 gate re-checked on every redirect |
| P2 | P2 | `/health` reported Redis `ok` while Redis was down; DB-down was HTTP 200 | real PING; DB down 503, Redis down 200 `degraded` |
| P2 | P2 | >1 MB body → 500; transient DB errors → 400/500; NUL byte → 500; `2026-02-30` silently stored as 2 March, `2026-13-01` → 500; parser errors echoed request content; `error.message` sometimes an array | filter mapping (413/503/fixed messages/string message), NUL guard, calendar-date + strict ISO validation |
| P2 | P2 | No graceful shutdown hooks | `enableShutdownHooks()` (probe 6/6) |
| P2 | P2 | Seed re-run re-stamped fact review dates and would re-publish a retracted fact | first-run-only publish |
| P2 | P2 | Logs could carry DB-URL passwords, JWTs, Prisma argument frames | log redaction |
| P2 | P2 | Google OAuth linked accounts by unverified email (not reachable: no Google app configured) | verified-email requirement |
| P2 | P2 | `GET /media/{id}` documented as bearer-only though public | per-method bearer declaration |
| P2 | P2 | SSRF literal gaps (IPv4-mapped IPv6, `::`, reserved ranges) | IP-literal BlockList + 10 bypass tests |
| P2 | P2 | 12 ESLint errors across `src`/`test` | fixed at source, no disables |

## 3. Chronology remediation

Before: 13 events, 9 eras, 3 dynasties, 10 people, 31 dated facts had NULL ordinals (the G03
backfill ran once at migration time; the seed never computed them). Evidence: each row's own cited
year/month/day/precision/qualifier (`docs/backend/golden-data/sources-manifest.md`) through the accepted
G03 formula — no model knowledge, no new historical claim. Ownership: seed (new installs; CE-only
helpers proven equal to `historical-date.util` for every Golden-Dataset spec — 75 tests) and data
migration `…0000` (existing rows, only where both ordinals are NULL and the start is known and CE).
UNKNOWN rows untouched (6 e2e-leftover eras, 5 undated facts). Period-filter semantics unchanged.
HTTP proof on seeded data: before/overlap/inside/boundary/after/ongoing all correct
(`g12-evidence/chronology-search-proof.txt`); BCE: no canonical BCE row exists — BCE remains proven by
the accepted G11 suite with API-created entities.

## 4. Redis isolation

`REDIS_KEY_PREFIX` (default `bull`, unchanged for deployments); e2e global setup assigns
`dv-e2e:<run>`; teardown SCAN+UNLINKs that namespace only and asserts it empty; a pattern guard refuses
any other prefix. Sentinels (plain key, key inside the real `bull:` namespace, db-1 key) survived two
full e2e runs unchanged (`g12-evidence/redis-sentinel-and-final-e2e.txt`). No FLUSHALL/FLUSHDB remains.

## 5. Migration certification and candidate manifest

28 migrations (24 accepted byte-identical + 4 G12, all additive or data-only; none destructive; no
shadow database). Inventory, checksums and database requirements: `G12_BACKEND_V2_CANDIDATE_MANIFEST.md`.

## 6. Paths

- **A — clean room** (`dauviet_g12_path_a`): 28 migrations; production seed ×2 with identical
  content (only bookkeeping `updatedAt` re-stamped by four accepted sync sections — P3); no loginable
  account/fixture provider/offer/trip; production-mode boot; worker built 105 documents; ADMIN
  rebuild ×2 identical, equal to the worker's; wipe → rebuild converges; canonical untouched; smoke
  56/56; production checks 14/14; three unsafe production boots refused.
- **B — accepted G11 upgrade**: fresh DB at the exact accepted state (24 migrations, HEAD seed,
  projection, every private domain populated through the API), BEFORE/AFTER snapshots of every one of
  165 tables plus schema facets. Deltas: chronology (5 tables, content-minus-chronology identical) and
  projection refresh — EXPECTED_REMEDIATION; +4 migrations, +8 CHECKs — EXPECTED_ADDITIVE; enum value,
  function body — EXPECTED_REMEDIATION; **no UNEXPECTED delta**; every trip/collaboration/location/
  expense/affiliate/provider/auth table byte-identical. A supporting run on the dev database agreed.
- **C/D — restart and failure injection**: 16/16 (report §5) and graceful shutdown 6/6.
- **Backup/restore**: local `pg_dump -Fc` / `pg_restore` proven on the candidate (not a cloud restore).

## 7. Cross-domain invariants, trust zones, ingestion, provider, collaboration, location, money, affiliate, search/map

`G12_CROSS_DOMAIN_INVARIANTS.md` X01–X28, each proven by the certification suite (49 tests) or a G12
script: trust zones never promoted; unaccepted IngestionCandidates never public; G02 revocation
effective on the next G05 and G10 request; offer ≠ click ≠ conversion ≠ booking ≠ expense (a
conversion never creates an expense; commission never reaches the ledger); planned ≠ actual ≠
settlement; no FX; membership ≠ consent; private coordinates absent from every public surface, audit,
errors, OpenAPI and logs; projection disposable; current ≠ historical geography.

## 8. Authorization, IDOR, same-JWT revocation

All 363 runtime operations classified from real guard metadata (91 PUBLIC, 37 AUTHENTICATED,
35 TRIP_CAPABILITY, 199 ADMIN, 1 PROVIDER_CALLBACK, 0 INTERNAL); anonymous → 401 on every non-public
route, plain USER → 403 on every role-gated route, public routes never 5xx. IDOR: 31 trip-route probes
× unrelated/pending/removed actors with known ids → denied, nothing mutated; cross-trip sub-resource
confusion → 404. Same-JWT revocation proven for role downgrade, removal, archive, location stop,
provider disable, account suspension. Authorization matrix: `AUTHORIZATION_MATRIX.md` (G12 section).

## 9. Runtime/OpenAPI contract, error contract, backward compatibility

Final OpenAPI generated from the real app: **314 paths / 363 operations** (G11: 314/363). Runtime
router == generated document == committed file, security declarations == guards (automated in the
certification suite, plus the existing `openapi-contract.spec.ts`). Only OpenAPI change: `GET
/media/{id}` no longer claims bearer auth (doc correction). Behavioural remediations are listed in the
manifest §6; none is BREAKING for a valid client. Documented gap (P2): OpenAPI declares request DTOs
(222 schemas) but no response schemas and no error status codes.

## 10. Environment and external integrations

`G12_ENVIRONMENT_MATRIX.md` (62 variables, classified; required core enforced at boot);
`G12_EXTERNAL_INTEGRATION_MATRIX.md`. External blockers: GeoNames, Google Places, Booking.com,
Agoda, Viator (credentials/approval); Google OAuth app and SMTP relay not configured. All fail closed.

## 11. Data integrity, Decimal/currency, time

No Float money column or JS-number money path; Decimal end to end; 8 new CHECKs back the service rules.
Time: capturedAt ≠ receivedAt, providerOccurredAt drives G10 newer-wins, date-only fields are
timezone-independent — certification §8 passed under TZ=UTC, Asia/Bangkok and America/New_York
(including a DST-transition trip range); impossible calendar dates rejected.

## 12. Concurrency, deadlock stress, retry, Redis, queues

Real PostgreSQL races (certification §6) — removal × expense/location, archive × location/expense,
transfer × removal (×10), revoke × redirect, duplicate and out-of-order conversions, rebuild ×
publish/unpublish — and a 10-burst lock-order stress across Trip/TripMember/TripLocationSharing/
TripMemberLocation/TripExpense/TripExpenseShare/TripSettlement: no 5xx, no deadlock, ledger exact.
Retry: only P2034/40P01, once (`withDeadlockRetry`); transient failures surface as 503 for client
retry. Redis outage classification and queue audit: performance/security report §5.

## 13. Security and privacy

`G12_PERFORMANCE_SECURITY_REPORT.md` §6–7: rate limits, input abuse, SSRF, open redirect, CORS,
cookies, CSRF, headers, 5xx and log privacy, audit privacy, secret scan (0 secrets), dependency audit
(43 backend advisories, none P0/P1; P2 upgrades recommended: qs, nodemailer, AWS SDK), licenses.

## 14. Retention and ownership (documentation, not a legal claim)

| Data | Current behaviour | Owner |
|---|---|---|
| Sessions | rows kept; expired/revoked flags; no purge job | auth |
| Location (G08) | one latest row per (trip, user); logically expires by TTL (300 s default); deleted on removal/leave; not purged by a job; no history | trips |
| Provider evidence / offers | offers carry `expiresAt`; no purge job; G06.5 raw ingestion payload retention setting (90 days) exists, purge not scheduled | providers / ingestion |
| Affiliate sessions/clicks/conversions | policy text only (G10: 90 d / 180 d / contractual); no deletion job | commercial |
| Audit log | append-only, no deletion | platform |
| Community moderation | V1 moderation states; no purge | moderation |

Any statutory retention requirement (e.g. location or commercial data) is an open deployment decision
and must be implemented before launch where required.

## 15. Seed / Golden Dataset, performance, load, N+1, health, shutdown, deployment

Seed deterministic in content and production-safe (§6 A). Performance: G11 targets met (search
≤ 300 ms — cursor page 267 ms isolated; suggestions 116.5 ≤ 150; map ≤ 246.5 ≤ 300), with host-noise
disclosure; fuzzy top-up and wide-area-map regressions absent. Load: 5,880 requests at 20-way
concurrency with no 5xx, no deadlock, ledger exact. N+1: none on the measured hot paths. Health:
DB-down 503 / Redis-down 200 degraded. Graceful shutdown proven. Runbook: `G12_DEPLOYMENT_RUNBOOK.md`.

## 16. Build, typecheck, lint, unit, E2E, repeats

- `nest build` clean; `tsc` (API + root) clean; ESLint over all of `src` and `test`: 0 errors.
- `prisma validate` valid; shadow-database guard 10/10.
- **Unit (final source): 105/105 suites, 1516/1516 tests** (G11: 98/1352).
- **E2E (final source, sequential, real PostgreSQL/PostGIS + Redis): 13/13 suites, 320/320 tests**
  (G11: 12/271; +49 certification tests). Accepted phase suites' assertions unmodified.
- Critical repeats on the final source: the 49-test certification suite passed in the final full e2e and again
  under TZ=Asia/Bangkok and TZ=America/New_York (49/49 each, no unexpected server error logged).
- Final deployment smoke on the final build: 56/56; production-mode checks 14/14; secret scan 0 secrets.

## 17. Flake classification

| Occurrence | Classification | Evidence |
|---|---|---|
| Certification suite: all 49 tests failed at boot (`Can't reach database server`), trivial query took 14 s | ENVIRONMENT_NOISE (host at 87 % CPU from other apps) | harness now uses 60 s connect/pool timeouts; `afterAll` guarded |
| Transfer × removal race returned 500 | **PRODUCT_RACE** — real 40P01, fixed (P1-6) | PostgreSQL deadlock log; 0 since |
| Map 429 test saw an extra 200 and a 400 | TEST_DEFECT (2 s window shorter than request spacing on the slow host) + transient pool timeout then mapped to 400 → the 400 exposed the error-mapping defect (now 503) | window 10 s |
| Revoke × redirect race exceeded 180 s once (Asia/Bangkok run) | ENVIRONMENT_NOISE — not reproduced in 2 isolated reruns + 4 full runs; no lock wait/deadlock/error in the PostgreSQL log; root cause of the stall not isolated | reruns |
| Search 429 principal test (127.0.0.2) | TEST_DEFECT (on Windows 127.0.0.x connects from 127.0.0.1) | uses IPv4 vs IPv6 loopback on a fresh app |
| Performance run 1 (910 s stall, 503) | ENVIRONMENT_NOISE (host stall) — run invalidated, not pooled | run 2/3 |
| Stale `dv-e2e` keys after power loss | INTERRUPTED_BY_MACHINE_SHUTDOWN (Redis RDB snapshot restore) | removed |

Test-harness changes (not assertion weakening): run-scoped Redis namespace, SMTP to a closed port,
longer DB timeouts, `--forceExit` (BullMQ handles), the G10 click-spec harness default gate, a
`TRIP_PLANNER`→`TRIP_STAY` surface fix and result-only leak assertions in the new suite. The only
pre-existing test line changed semantically is the search-map "Redis is not the authority" helper
(FLUSHALL → scoped wipe, now asserted). One remediation was reverted instead of changing an accepted
G07 assertion (the `leave` version oracle — P3).

## 18. Open items (no P0, no P1)

| Id | Sev | Item |
|---|---|---|
| O-1 | P2 | Dependency upgrades: qs (reachable DoS), nodemailer 7.x, AWS SDK (fast-xml-parser) |
| O-2 | P2 | OpenAPI has no response schemas / error status codes |
| O-3 | P2 | G05 offer display evaluates the `SANDBOX` integration regardless of deployment; a real provider needs a decision before launch |
| O-4 | P2 | Rate limits key on the direct peer address; behind a load balancer configure `trust proxy` or rate-limit at the edge (also affects the per-IP G08 location limit) |
| O-5 | P2 | No retention/purge jobs (§14) — deployment decision |
| O-6 | P3 | SMTP transport has no auth settings; mailer logs recipient address on failure |
| O-7 | P3 | `leave` reveals a trip's version to a non-member (409 vs 404); member role/remove version checks are pre-transaction |
| O-8 | P3 | SSRF: DNS names resolving to private addresses not blocked (admin-only ingestion) |
| O-9 | P3 | Citation create writes its audit row outside the create transaction (V1 pattern) |
| O-10 | P3 | Seed re-run re-stamps `updatedAt` in four accepted sync sections |
| O-11 | P3 | Swagger UI served in every environment; inbound `X-Request-Id` accepted verbatim |
| O-12 | P3 | Cursor-page search is the class closest to its target on this host |

## 19. Gate manifest

`G12_ACCEPTANCE_GATE_MANIFEST.md` — 144 gates derived one per requirement: **143 PASS, 1 PASS — NOT APPLICABLE
(no canonical BCE row), 0 FAIL, 0 UNVERIFIED.** Open P0: 0. Open P1: 0 (six found and fixed).
