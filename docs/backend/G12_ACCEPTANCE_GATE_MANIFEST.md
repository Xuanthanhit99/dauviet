# G12 — Acceptance Gate Manifest

Audience: the Backend V2 freeze reviewer. One gate per requirement of the G12 brief (§§6–101),
derived from the brief, not forced to a count. Result is one of `PASS`, `FAIL`, `UNVERIFIED`,
`PASS — NOT APPLICABLE`. "Blocker" states what a non-PASS would mean.

Abbreviations: **CERT** = `apps/api/test/g12-certification.e2e-spec.ts` (§n = its section);
**E2E** = full sequential e2e run; **UNIT** = full unit run; **EV** = `docs/backend/g12-evidence/`;
**PA/PB/PCD** = Path A / Path B / Path C+D; scripts are under `scripts/g12/`.

Gate numbers G12-GATE-131 to 149 are intentionally unused (group boundary before the build/test gates).

Final runs on the final source: UNIT 105/105 suites, 1516/1516 tests; E2E and critical repeats: see
gates 150–156.

## Pre-freeze remediation — chronology (§6–10)

| Gate | Requirement | Evidence | Test / command | Result | Blocker |
|---|---|---|---|---|---|
| G12-GATE-001 | Seeded Vietnam events/eras/dynasties audited for missing chronology | Pre-freeze audit §10: 13/9/3 rows, 0 ordinals | SQL counts | PASS | — |
| G12-GATE-002 | Period-filter semantics unchanged; UNKNOWN != active in every period | search code untouched; 6 UNKNOWN eras and 5 undated facts stay NULL; parity spec "UNKNOWN stays unknown" | `seed-chronology-parity.spec.ts`, `path-b-chronology-rows.txt` | PASS | P1 |
| G12-GATE-003 | Backfill only from accepted evidence; no invented dates | ordinals are the G03 pure function of each row's own cited year/month/day/precision/qualifier; no row without a stored year was touched | migration `20260927000000` guards; parity spec | PASS | STOP |
| G12-GATE-004 | Unresolvable chronology left UNKNOWN and documented | 6 e2e-leftover eras (dev DB), 5 undated facts | `path-b-chronology-rows.txt` | PASS | — |
| G12-GATE-005 | Safest mechanism; accepted migrations untouched; ownership explained | seed (new rows) + additive data migration (existing rows); 24 accepted checksums identical | PB snapshot MIGRATION lines | PASS | STOP |
| G12-GATE-006 | Search projection refreshed after remediation | triggers enqueued 35 refreshes; drained; SearchDocument content equal except chronology | `path-b-dev/`, PB delta | PASS | — |
| G12-GATE-007 | Before/overlap/after/unknown/boundary proven over HTTP | Bạch Đằng 1288, Thời Lý/Nhà Lý, ongoing modern era, Lam Sơn range | `chronology-search-proof.txt` | PASS | — |
| G12-GATE-008 | BCE/CE where canonical data supports it | no seeded row is BCE; BCE proven with API-created entities by the accepted G11 suite (re-run green in E2E) | search-map e2e | PASS — NOT APPLICABLE (no canonical BCE row) | — |
| G12-GATE-009 | Golden Dataset remains canonical, cited, deterministic, production-safe | production profile seeds no loginable account/fixture provider; content identical across two seed runs | PA seed snapshots `TABLE_CONTENT` | PASS | P1 |

## Pre-freeze remediation — Redis isolation (§11–13, 53)

| Gate | Requirement | Evidence | Test / command | Result | Blocker |
|---|---|---|---|---|---|
| G12-GATE-010 | No FLUSHALL/FLUSHDB against shared/dev Redis | grep of `apps/api/src`, `apps/api/test`, `scripts`: only comments | grep | PASS | STOP |
| G12-GATE-011 | Tests clean only state they own (run-scoped namespace) | `REDIS_KEY_PREFIX`; `e2e-global-setup/teardown`; guard `^dv-e2e:[A-Za-z0-9-]+$` | teardown log "removed N suite-owned keys, 0 left" | PASS | STOP |
| G12-GATE-012 | External sentinel survives full E2E cleanup/run | all six sentinels (two plantings incl. the real `bull:` namespace and db 1) unchanged, TTL -1, after the final full e2e; run namespace emptied | sentinel before/after (gate 152) | PASS | STOP |
| G12-GATE-013 | Cleanup not weakened; determinism kept | search-map "Redis not the authority" now wipes the run namespace and **asserts** it is empty (was best-effort) | search-map e2e | PASS | — |

## Freeze candidate, migrations (§14–15, 45, 77, 81)

| Gate | Requirement | Evidence | Test / command | Result | Blocker |
|---|---|---|---|---|---|
| G12-GATE-014 | Candidate manifest | `G12_BACKEND_V2_CANDIDATE_MANIFEST.md` | — | PASS | — |
| G12-GATE-015 | Migration ordering + checksums | 28 migrations; checksums equal file sha256 on dev, PA, PB, perf DBs (re-checked after power loss) | checksum script | PASS | STOP |
| G12-GATE-016 | Destructive operations audited | only accepted V1 phase03/phase06 `DROP COLUMN`s (documented there); G12 adds none | migration inventory | PASS | STOP |
| G12-GATE-017 | Extensions / constraints / indexes / triggers / FKs / ON DELETE audited | inventory table in pre-freeze audit §2 | migration-inventory script | PASS | — |
| G12-GATE-018 | Accepted G00–G11 migrations unmodified | 24 checksums identical | PB MIGRATION lines | PASS | STOP |
| G12-GATE-019 | DB-level enforcement of key invariants | uniqueness/idempotency keys already present; G12 added 8 CHECKs (money sign, share range, settlement parties, currency format, coordinate range) validated against existing data | CERT §4 direct-writer test; PB | PASS | P1 |
| G12-GATE-020 | Recurring "drift artifact" re-examined | `EntityKind.FACT` was a real missing enum value (P1-2, fixed); 17 index drops remain a genuine artifact | migration `20260927000002` | PASS | P1 |
| G12-GATE-021 | Schema compatibility classified | columns/indexes/triggers unchanged; +CHECKs, +enum value, function body — additive/remediation | PB schema facets | PASS | STOP |
| G12-GATE-022 | No promise of reversible DB rollback; backup + roll-forward documented | runbook §2, §8 | — | PASS | — |

## Path A — clean room (§16–17, 70, 82)

| Gate | Requirement | Evidence | Test / command | Result | Blocker |
|---|---|---|---|---|---|
| G12-GATE-023 | Fresh isolated DB, all migrations | `dauviet_g12_path_a`, 28/28, status up to date | `prisma migrate deploy/status` | PASS | P1 |
| G12-GATE-024 | Seed twice, deterministic | production profile ×2: `TABLE_CONTENT` identical for every table (only bookkeeping `updatedAt` re-stamped by 4 accepted sync sections — P3) | db-snapshot | PASS | P1 |
| G12-GATE-025 | Seed has no fake customer/expense/booking/conversion/benchmark junk | 2 credential-less authorship users, 0 providers, 0 offers, 0 trips/expenses/conversions | SQL counts | PASS | P1 |
| G12-GATE-026 | G11 rebuild twice deterministic; equals worker-built projection | rebuild ×2 identical; wipe → rebuild identical; canonical untouched | `path-a-rebuild.ts` 8/8 | PASS | P1 |
| G12-GATE-027 | Build, boot (production mode), workers | `nest build`; boot with `NODE_ENV=production`; worker built 105 documents | PA app log | PASS | P1 |
| G12-GATE-028 | Full-domain HTTP smoke | 56/56 (health, auth bearer+cookie+CSRF, geography, knowledge incl. citation/FACT, discovery, provider fail-closed, trip, collaboration, location, expense, settlement, affiliate fixture, policy revocation, search, map) | `http-smoke.ts` | PASS | P1 |
| G12-GATE-029 | No real paid/external booking | fixture provider only | smoke | PASS | STOP |
| G12-GATE-030 | Disposable resources dropped afterwards | dauviet_g12_path_a / _path_b / _restore_probe and dauviet_perf dropped; container dumps removed | gate 160 | PASS | — |

## Path B — accepted G11 upgrade (§18–19)

| Gate | Requirement | Evidence | Test / command | Result | Blocker |
|---|---|---|---|---|---|
| G12-GATE-031 | Exact accepted pre-G12 state | fresh DB: 24 accepted migrations + HEAD seed (unchanged by G07–G11), projection built, every domain populated through the API (trip, member, invitation, sharing, location, 2 expenses/4 shares, settlement, affiliate session/click/conversion) | PB | PASS | P1 |
| G12-GATE-032 | BEFORE/AFTER capture of migrations, schema, counts, every table hash | `path-b-before.txt` / `path-b-after.txt` | db-snapshot | PASS | P1 |
| G12-GATE-033 | Every delta classified; no UNEXPECTED | chronology (5 tables, excl-hash equal) EXPECTED_REMEDIATION; projection refresh EXPECTED; +4 migrations, +8 CHECKs EXPECTED_ADDITIVE; enum + function EXPECTED_REMEDIATION; all trip/G07/G08/G09/G10/provider/auth tables identical | `path-b-delta.diff` | PASS | STOP |
| G12-GATE-034 | Chronology delta enumerated, no byte-identical claim | `path-b-chronology-rows.txt` | — | PASS | — |
| G12-GATE-035 | Upgraded DB serves correctly | smoke 56/56 after upgrade (citation 500 → 201) | `path-b-smoke-on-g11-baseline.txt` + post smoke | PASS | P1 |

## Paths C / D (§20–21, 54–57, 79)

| Gate | Requirement | Evidence | Test / command | Result | Blocker |
|---|---|---|---|---|---|
| G12-GATE-036 | API restart: no loss of policy/location/ledger/conversions/canonical | C1 ×5 | `path-cd.ts` | PASS | P1 |
| G12-GATE-037 | Worker restart / search recovery / convergence | C2, C3 (killed mid-drain = full rebuild) | `path-cd.ts` | PASS | P1 |
| G12-GATE-038 | Redis restart / state loss | C4; search-map namespace wipe | `path-cd.ts`, E2E | PASS | P1 |
| G12-GATE-039 | DB transaction failure → no partial canonical state | D2 connections killed mid-burst (503s, ledger intact); accepted forced-rollback suites (G06/G07/G09/G10) re-run in E2E | `path-cd.ts`, E2E | PASS | P1 |
| G12-GATE-040 | Queue interruption / worker failure | C3; media/ingestion BullMQ retry policy audited (bounded attempts, jobId dedup) | pre-freeze audit §6 | PASS | — |
| G12-GATE-041 | Redis unavailable classified; DB domains not corrupted | Redis-outage table; D1 ledger check | `path-cd.ts` | PASS | P1 |
| G12-GATE-042 | Provider timeout/failure fail-closed | G05 failure isolation + G06.5 outbound timeout/byte-cap tests (unit); provider disable → next request fail-closed (CERT §3) | UNIT, CERT | PASS | P1 |
| G12-GATE-043 | Duplicate request / duplicate + out-of-order provider event | CERT §6 duplicate concurrent conversions (1 row) + stale evidence 409; accepted G06 concurrent generation, G07 invitation race | CERT, E2E | PASS | P1 |
| G12-GATE-044 | API killed mid-workflow | D3 | `path-cd.ts` | PASS | P1 |
| G12-GATE-045 | Graceful shutdown closes dependencies, no partial ops | `enableShutdownHooks`; probe 6/6 | `graceful-shutdown-probe.ts` | PASS | P2 |

## Cross-domain invariants (§22–30)

| Gate | Requirement | Evidence | Test / command | Result | Blocker |
|---|---|---|---|---|---|
| G12-GATE-046 | Cross-domain matrix documented and proven | `G12_CROSS_DOMAIN_INVARIANTS.md` X01–X28 | CERT | PASS | — |
| G12-GATE-047 | Trust zones never silently promoted | X08, X09, community `trustClass` (G11) | CERT §4 | PASS | P1 |
| G12-GATE-048 | IngestionCandidate never in search/map/facts/places/offers/attribution | X08 | CERT §4 | PASS | P0 |
| G12-GATE-049 | G02 revocation affects next request in G05 and G10, no restart | X06, X07 | CERT §3, §6 | PASS | P1 |
| G12-GATE-050 | Offer != click != conversion != booking != expense; conversion never creates an expense | X10 | CERT §4, smoke | PASS | P1 |
| G12-GATE-051 | Planned cost != expense != settlement != commission | X11, X10 | CERT §4 | PASS | P1 |
| G12-GATE-052 | No implicit FX / cross-currency aggregation | X12 | CERT §4, smoke | PASS | P1 |
| G12-GATE-053 | Membership != location consent | X15 | CERT §5 | PASS | P0 |
| G12-GATE-054 | Private coordinates absent from search, map, affiliate, expense, audit, errors, OpenAPI, logs | X16 | CERT §5, §10 | PASS | P0 |
| G12-GATE-055 | Projection disposable; canonical unchanged by rebuild/wipe | X23 | PA rebuild, CERT §6 | PASS | P1 |
| G12-GATE-056 | Current geography != historical territory; no sovereignty inference | accepted G11 suite unchanged, re-run in E2E | E2E | PASS | P1 |

## Authorization (§31–34)

| Gate | Requirement | Evidence | Test / command | Result | Blocker |
|---|---|---|---|---|---|
| G12-GATE-057 | Actor matrix covered (anonymous, user, owner, editor, viewer, removed, pending, admin, internal) | CERT §1–§3; no internal/provider-ingestion principal exists (ingest is ADMIN) | CERT | PASS | P0 |
| G12-GATE-058 | Every runtime route classified, no unexplained route | 363 ops classified; runtime router ↔ controller metadata 1:1 | CERT §1 | PASS | P0 |
| G12-GATE-059 | Anonymous 401 on every non-public route | CERT §1 | CERT | PASS | P0 |
| G12-GATE-060 | USER 403 on every role-gated route | CERT §1 | CERT | PASS | P0 |
| G12-GATE-061 | IDOR across trip/member/invitation/location/expense/settlement/commercial/admin | 31 probes × 3 actors; cross-trip confusion 404; admin objects 403 | CERT §2 | PASS (P3: `leave` version oracle) | P0 |
| G12-GATE-062 | Same-JWT revocation: role downgrade, removal, archive, location stop, provider disable | + suspension | CERT §3 | PASS | P0 |

## Contract (§35–39, 76)

| Gate | Requirement | Evidence | Test / command | Result | Blocker |
|---|---|---|---|---|---|
| G12-GATE-063 | Final OpenAPI generated from the real candidate | 314 paths / 363 ops | `generate-openapi.ts` | PASS | P1 |
| G12-GATE-064 | Runtime routes == OpenAPI operations | no undocumented, no phantom | CERT §1 | PASS | P1 |
| G12-GATE-065 | Auth declarations match guards | fixed `GET /media/{id}` | CERT §1 | PASS | P2 |
| G12-GATE-066 | Automated drift detection | CERT §1 committed-doc equality + `openapi-contract.spec.ts` | CERT, UNIT | PASS | — |
| G12-GATE-067 | DTO schemas / required / enums / status codes | request DTOs: 222 schemas (validated by ValidationPipe + input-abuse sweep); **response schemas and error status codes are not declared in OpenAPI** (only 200/201) | OpenAPI inspection | PASS with documented P2 gap | P2 |
| G12-GATE-068 | Error contract consistent (400/401/403/404/409/413/429/503/5xx) | message always string, requestId present | CERT §7, filter spec | PASS | P2 |
| G12-GATE-069 | No unexpected 500 from normal invalid input | input-abuse sweep all 4xx | CERT §7 | PASS | P1 |
| G12-GATE-070 | 5xx privacy | forced 5xx + real Prisma error | CERT §7 | PASS | P1 |
| G12-GATE-071 | Backward compatibility classified | 1 OpenAPI change (doc correction); behavioural remediations listed; no BREAKING | manifest §6, `openapi-g11-to-g12.diff.txt` | PASS | STOP |

## Environment, integrations (§40–44, 83)

| Gate | Requirement | Evidence | Test / command | Result | Blocker |
|---|---|---|---|---|---|
| G12-GATE-072 | Environment matrix | `G12_ENVIRONMENT_MATRIX.md` | — | PASS | — |
| G12-GATE-073 | Missing required core config fails clearly; no unsafe default secret | unit 18 tests; live refused boots (empty CORS, wildcard, placeholder secret) | `env.validation.spec.ts`, PA | PASS | P1 |
| G12-GATE-074 | Missing optional provider credentials do not crash core | PA boot with none set; health ok | PA | PASS | P1 |
| G12-GATE-075 | External integration matrix | `G12_EXTERNAL_INTEGRATION_MATRIX.md` | — | PASS | — |
| G12-GATE-076 | No fabricated live provider proof | fixture only; blockers listed | — | PASS | STOP |
| G12-GATE-077 | Secret inventory by name only | env matrix §secrets | — | PASS | — |

## Money, time, concurrency (§46–52)

| Gate | Requirement | Evidence | Test / command | Result | Blocker |
|---|---|---|---|---|---|
| G12-GATE-078 | Decimal integrity (no Float/parseFloat/toFixed money path) | grep audit; no Float money column; split util Decimal | audit, UNIT | PASS | P1 |
| G12-GATE-079 | Negative/over-range shares impossible | P1-3 fixed (API) + CHECKs (DB) | UNIT red→green, CERT §4 | PASS | P1 |
| G12-GATE-080 | No implicit cross-currency totals | gate 052 | CERT | PASS | P1 |
| G12-GATE-081 | Semantic timestamps distinct (capturedAt/receivedAt/occurredAt/providerOccurredAt/reportedAt/chronology/trip dates) | code audit; CERT §8 capturedAt != receivedAt; G10 newer-wins on providerOccurredAt | CERT | PASS | P2 |
| G12-GATE-082 | Timezones UTC / UTC+7 / DST; date boundaries | CERT §8 under TZ=UTC, Asia/Bangkok, America/New_York (DST range 2026-03-08) | CERT ×3 TZ | PASS | P2 |
| G12-GATE-083 | Impossible calendar dates rejected | `IsCalendarDate` + strict ISO | UNIT, CERT §7 | PASS | P2 |
| G12-GATE-084 | Real PostgreSQL races (removal×expense/location, archive×location/expense, transfer×collaboration, revoke×redirect, duplicate & out-of-order conversions, rebuild×publish/unpublish) | CERT §6 | CERT | PASS | P1 |
| G12-GATE-085 | Lock-order stress, repeated | 10 bursts × 7 mutations, repeated in every CERT run; transfer×removal ×10; **real 40P01 found and fixed** (transfer lock order) | CERT §6 | PASS | P1 |
| G12-GATE-086 | Retry only transient errors; idempotent | `withDeadlockRetry` retries only P2034/40P01 once; filter maps transient to 503 (client retry) | code, filter spec | PASS | P2 |

## Redis, queues, rate limits, input (§53–59)

| Gate | Requirement | Evidence | Test / command | Result | Blocker |
|---|---|---|---|---|---|
| G12-GATE-087 | Redis outage classification | report §5 | PCD | PASS | P2 |
| G12-GATE-088 | BullMQ jobs: dedup, bounded retries, visibility, DB authority | pre-freeze audit §6 | code audit | PASS | P2 |
| G12-GATE-089 | Search worker kill → convergence | C3 | PCD | PASS | P1 |
| G12-GATE-090 | 429, window recovery, principal separation, search/map/auth controls | CERT §9 | CERT | PASS | P2 |
| G12-GATE-091 | Input abuse / fuzz | CERT §7 | CERT | PASS | P1 |

## Security (§60–69, 84–86)

| Gate | Requirement | Evidence | Test / command | Result | Blocker |
|---|---|---|---|---|---|
| G12-GATE-092 | SSRF re-audit + bypass cases | IP-literal BlockList added; 10 new bypass cases | UNIT outbound spec 22/22 | PASS (P3 residual: DNS-resolving names) | P1 |
| G12-GATE-093 | Open redirect bypass matrix | unit matrix + live fixture redirect + G02 re-check | UNIT, smoke, CERT | PASS | P1 |
| G12-GATE-094 | Production CORS, no wildcard-with-credentials | prod checks + boot refusal | `prod-mode-checks.ts` 14/14 | PASS | P1 |
| G12-GATE-095 | Cookie flags | prod checks | prod-mode-checks | PASS | P1 |
| G12-GATE-096 | CSRF | smoke 3 checks | http-smoke | PASS | P1 |
| G12-GATE-097 | Security headers on real production responses | prod checks | prod-mode-checks | PASS | P2 |
| G12-GATE-098 | Log privacy | CERT §10; redaction util | CERT, UNIT | PASS | P1 |
| G12-GATE-099 | Audit privacy (lifecycle evidence, no sensitive payload) | CERT §5 audit/collab metadata scan | CERT | PASS | P1 |
| G12-GATE-100 | Retention/ownership documented, no legal claims | final report §retention | — | PASS | — |
| G12-GATE-101 | Backup/restore (local, disposable) | G11 dump: 9 index errors found → fixed; G12 dump: `--exit-on-error` exit 0, every table/facet equal | pg_dump/pg_restore | PASS | P1 |
| G12-GATE-102 | Secret scan (repository, not only diff) | 678 files, 0 secrets | `secret-scan.js` (re-run at end, gate 158) | PASS | STOP |
| G12-GATE-103 | Dependency audit classified | report §7 | `pnpm audit` + `audit-summary.js` | PASS (P2 upgrades recommended) | P1 |
| G12-GATE-104 | License audit | report §6 | `pnpm licenses list` | PASS | — |
| G12-GATE-105 | Google OAuth cannot link by unverified email | strategy spec | UNIT | PASS | P2 |
| G12-GATE-106 | NUL byte never reaches PostgreSQL | middleware + spec | UNIT, CERT §7 | PASS | P2 |

## Performance (§71–75)

| Gate | Requirement | Evidence | Test / command | Result | Blocker |
|---|---|---|---|---|---|
| G12-GATE-107 | Search pooled p95 ≤ 300 ms | run 2 all classes ≤ 218.5 except cursor 309.5 (isolated run 3: 267.2 = G11) | perf runs 2–3 | PASS (noise disclosed) | P2 |
| G12-GATE-108 | Suggestions pooled p95 ≤ 150 ms | 116.5 | run 2 | PASS | P2 |
| G12-GATE-109 | Map pooled p95 ≤ 300 ms | ≤ 246.5 | run 2 | PASS | P2 |
| G12-GATE-110 | p50/p95/p99/max + noise reported | report §2 | — | PASS | — |
| G12-GATE-111 | Fuzzy only tops up sparse results | live tier check | report §2 | PASS | P2 |
| G12-GATE-112 | Wide-area map not in cached-plan failure mode | world zoom 2 p95 125 ms; plan setting present | report §2 | PASS | P2 |
| G12-GATE-113 | Representative API sample | report §3 | `api-load.ts` | PASS | — |
| G12-GATE-114 | Bounded load: pool, Redis, deadlocks, queue, memory, event loop | report §3 | `api-load.ts` | PASS | P2 |
| G12-GATE-115 | N+1 audit of hot paths | report §4 | `n-plus-one-audit.ts` | PASS | P2 |

## Health, deployment (§78–82)

| Gate | Requirement | Evidence | Test / command | Result | Blocker |
|---|---|---|---|---|---|
| G12-GATE-116 | Liveness/readiness semantics; optional providers never make core unready | DB down 503, Redis down 200 degraded; providers not probed | PCD D1 | PASS | P2 |
| G12-GATE-117 | Deployment runbook | `G12_DEPLOYMENT_RUNBOOK.md` | — | PASS | — |
| G12-GATE-118 | Deployment smoke on the final candidate | final build: smoke 56/56, production checks 14/14 | gate 157 | PASS | P1 |

## P1 / P2 remediations found by G12 (each fixed, with a regression test)

| Gate | Finding | Fix | Evidence | Result | Blocker |
|---|---|---|---|---|---|
| G12-GATE-119 | P1-1 unsafe production seed (known-password ADMIN, ACTIVE fixture provider) | `SEED_PROFILE` production default | PA counts | PASS | P1 |
| G12-GATE-120 | P1-2 `EntityKind.FACT` missing (citation 500 on every migration-built DB) | additive enum migration | PB smoke before/after, CERT §4 | PASS | P1 |
| G12-GATE-121 | P1-3 negative expense shares accepted | service + CHECK | UNIT red→green, CERT | PASS | P1 |
| G12-GATE-122 | P1-4 fail-open production CORS | boot validation | UNIT, PA | PASS | P1 |
| G12-GATE-123 | P1-5 backup/restore drops 9 indexes (restore fails `--exit-on-error`) | qualified `immutable_unaccent` | restore probe | PASS | P1 |
| G12-GATE-124 | P1-6 real deadlock transfer×removal → 500 | consistent TripMember→Trip lock order | CERT §6 (×10 per run) | PASS | P1 |
| G12-GATE-125 | P2 redirect not re-gated after revocation | G02 re-check per redirect | UNIT, CERT §6 | PASS | P2 |
| G12-GATE-126 | P2 health false `ok` during Redis outage | real PING + 503/degraded | PCD | PASS | P2 |
| G12-GATE-127 | P2 413/parse/transient/NUL/impossible-date → 500 or silent coercion | filter + guard + validators | UNIT, CERT §7, PCD D2 | PASS | P2 |
| G12-GATE-128 | P2 no graceful shutdown | `enableShutdownHooks` | shutdown probe | PASS | P2 |
| G12-GATE-129 | P2 seed re-run re-published retracted facts / re-dated reviews | first-run-only publish | PA seed content diff | PASS | P2 |
| G12-GATE-130 | P2 log could carry credentials / Prisma argument frames | redaction util | UNIT, CERT §10 | PASS | P2 |

## Build, tests, repeat, flakes (§87–95)

| Gate | Requirement | Evidence | Test / command | Result | Blocker |
|---|---|---|---|---|---|
| G12-GATE-150 | Production build clean | `nest build` exit 0 on final source | — | PASS | P1 |
| G12-GATE-151 | Typecheck + lint clean (whole backend, no mass disable) | `tsc` api + root 0; ESLint `{src,test}` 0 errors (12 pre-existing fixed at source) | — | PASS | P1 |
| G12-GATE-152 | Full unit suite | 105/105 suites, 1516/1516 tests | `jest` | PASS | P1 |
| G12-GATE-153 | Full sequential E2E, sentinel survives | 13/13 suites, 320/320 tests; `redis-sentinel-and-final-e2e.txt` | `jest --config test/jest-e2e.json --runInBand` | PASS | P1 |
| G12-GATE-154 | Critical race/privacy/security suite repeated ≥ 2 on final source | certification suite 49/49 in the final e2e and again under Asia/Bangkok and America/New_York | — | PASS | P1 |
| G12-GATE-155 | Flakes investigated and classified | final report §flakes | — | PASS | P1 |
| G12-GATE-156 | No assertion weakened | accepted suites unmodified in assertions; harness-only changes listed in final report | review | PASS | STOP |
| G12-GATE-157 | Deployment smoke on the final build | `final-deployment-smoke.txt` 56/56, `final-prod-mode-checks.txt` 14/14 | `http-smoke.ts`, `prod-mode-checks.ts` | PASS | P1 |
| G12-GATE-158 | Secret scan on the final tree | 709 files, 21 hits all reviewed synthetic fixtures, 0 secrets (`secret-scan.json`) | `secret-scan.js` | PASS | STOP |
| G12-GATE-159 | P0 = 0, P1 = 0 unresolved | 6 P1 found and fixed with regression proofs; 0 P0 / 0 P1 open | — | PASS | STOP |
| G12-GATE-160 | Disposable DBs/keys removed | disposable DBs, container dumps, G12 Redis keys and sentinels removed; dev DB and dev queues untouched | — | PASS | — |

## Documents (§96–101)

| Gate | Requirement | Evidence | Result |
|---|---|---|---|
| G12-GATE-161 | Nine G12 documents complete | this set | PASS |
| G12-GATE-162 | Handoff / roadmap / authorization matrix / openapi updated (relevant sections only) | roadmap G12/freeze rows, handoff G12 section, authorization-matrix G12 section, openapi regenerated | PASS |
| G12-GATE-163 | Freeze candidate artifact only if recommended; no LOCKED claim | `BACKEND_V2_FREEZE_CANDIDATE.md` (recommendation only) | PASS |

## Totals

144 gates: **143 PASS**, **1 PASS — NOT APPLICABLE** (G12-GATE-008: no canonical BCE row exists), **0 FAIL**, **0 UNVERIFIED**.
Several PASS gates carry a documented P2/P3 note (007/092 residuals, 067 OpenAPI response schemas, 107 host-noise disclosure); none is a P0/P1.
