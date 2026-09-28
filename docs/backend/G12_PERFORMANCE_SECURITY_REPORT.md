# G12 — Performance & Security Report

Audience: the Backend V2 freeze reviewer. Everything below was measured on this project's own
infrastructure (Docker Desktop on a shared 4-core Windows laptop, PostgreSQL 16.4 + PostGIS 3.4.3,
Redis 7) against disposable databases unless stated. Raw outputs: `docs/backend/g12-evidence/`.
No cloud or production measurement was performed; nothing here claims internet-scale capacity.

## 1. Environment and noise

The host is shared with unrelated desktop applications (browsers, editors, chat apps; 40–87 % CPU
busy while G12 ran). Every latency run includes a `GET /v1/health` control class and interleaved
rounds so host noise is visible. G12's `/health` does a little more work than G11's (a real Redis
PING), so the control is a noise indicator, not an identical baseline.

## 2. G11 search/map benchmark (re-run)

Dataset: `scripts/g11-perf/perf-load.sql` into a fresh `dauviet_perf` (all 28 migrations) —
82,010 synthetic entities → **78,110 search documents / 112,663 terms** built by the real
`rebuildAll` (836 s; idempotent re-run 642 s, 0 failed). Harness: `apps/api/test/perf/g11-benchmark.ts`
(real Nest app, real HTTP stack), 6 interleaved rounds × 60 warm sequential requests per class.

| Run | Condition | Status |
|---|---|---|
| 1 (`perf-run-1-noisy-invalidated.txt`) | control p95 85.6 ms (8× G11's 10.7), one request stalled 910 s and returned 503 (host stall; no DB error) | **invalidated as a verdict** — kept for transparency |
| 2 (`perf-run-2-full.txt`) | control p95 22.1 ms, 0 non-200 | verdict run |
| 3 (`perf-run-3-isolated-cursor.txt`) | cursor class + alias + control only, 10 rounds, control p95 20.9 ms | tie-breaker for the one class over target in run 2 |

A crash-interrupted attempt before the machine shutdown produced no samples and was discarded
(INTERRUPTED_BY_MACHINE_SHUTDOWN); runs 1–3 were taken afterwards from a freshly reloaded dataset.
Samples from different runs are never pooled together.

Run 2 (ms):

| Class | p50 | p95 | p99 | max | Target (pooled p95) | Result |
|---|---|---|---|---|---|---|
| CONTROL /health | 9.8 | 22.1 | 38.3 | 67.9 | – | noise floor |
| search exact canonical | 54.5 | 103.3 | 125.7 | 136.6 | ≤ 300 | PASS |
| search accent-insensitive | 52.5 | 139.7 | 212.2 | 270.0 | ≤ 300 | PASS |
| search exact alias | 92.3 | 218.5 | 861.4 | 1859.2 | ≤ 300 | PASS (tail noisy; run 3 p95 173.8) |
| search prefix | 28.2 | 60.7 | 84.6 | 135.9 | ≤ 300 | PASS |
| search FTS multi-token | 50.6 | 137.9 | 188.0 | 717.7 | ≤ 300 | PASS |
| search fuzzy (typo) | 44.5 | 101.4 | 154.8 | 200.6 | ≤ 300 | PASS |
| search short prefix "ha" | 41.1 | 74.9 | 106.8 | 111.1 | ≤ 300 | PASS |
| search types+country | 55.4 | 131.4 | 181.9 | 238.1 | ≤ 300 | PASS |
| search period filter | 35.5 | 63.3 | 89.2 | 124.7 | ≤ 300 | PASS |
| search bbox filter | 38.6 | 79.9 | 103.7 | 192.3 | ≤ 300 | PASS |
| search page 2 (cursor) | 155.0 | **309.5** | 465.1 | 527.4 | ≤ 300 | **run 3: p95 267.2** (G11: 267.4) — PASS on the isolated run; 3 % over in the interleaved run |
| suggestions | 48.0 | 116.5 | 227.5 | 374.7 | ≤ 150 | PASS |
| map world zoom 2 | 61.4 | 125.2 | 163.6 | 176.9 | ≤ 300 | PASS |
| map country zoom 5 | 52.3 | 95.8 | 137.8 | 164.5 | ≤ 300 | PASS |
| map regional zoom 8 | 56.0 | 120.5 | 174.1 | 214.8 | ≤ 300 | PASS |
| map city zoom 12 | 20.9 | 30.0 | 41.7 | 56.2 | ≤ 300 | PASS |
| map dense street zoom 15 | 16.5 | 28.8 | 37.4 | 85.9 | ≤ 300 | PASS |
| map geography layers zoom 6 | 38.5 | 59.8 | 70.9 | 86.0 | ≤ 300 | PASS |
| map territories zoom 5 | 33.9 | 78.6 | 135.1 | 170.3 | ≤ 300 | PASS |
| map strict period events+territories | 90.5 | 246.5 | 322.6 | 449.6 | ≤ 300 | PASS |

G12 did not change the search or map code paths (the only new per-request work is the NUL-byte guard
middleware's scan of the query/body). Verdict: targets met; the cursor page is the class closest
to its limit on this host in both G11 and G12 (P3 watch item).

**G11 regression proofs** (run against the 78k-document projection):
- *Fuzzy only tops up sparse result sets:* dense queries return no FUZZY tier (`ha` → 20 PREFIX;
  `hoi an` → 20 PREFIX; `thang long` → 8 PREFIX + 12 TEXT); a one-character typo of one unique name →
  6 FUZZY. The ≥ 10-strong-candidates guard is unchanged in `search.service.ts`.
- *Wide-area map does not regress to the cached generic-plan failure mode* (G11: p95 646 ms before the
  fix): world bbox zoom 2 p95 125 ms, single request 156 ms; `set_config('plan_cache_mode',
  'force_custom_plan', true)` still present in `map.service.ts`.

## 3. Representative API latency and bounded load

`scripts/g12/api-load.ts` against the compiled app in production mode on the Path A database
(`g12-evidence/api-load.json`). No product SLA exists for these endpoints; this looks for obvious
regressions and resource symptoms.

Sequential (100 warm requests each): p95 — `/health` 34.5, `GET /users/me` 29.4, `GET /auth/sessions`
25.4, trip read 19.1, trip list 29.1, trip update 38.8, expense create 74.3, expense summary 29.2,
location update 34.1, location read 22.2 ms.

Concurrent (20 workers × 90 s, one client address, mixed trip/expense/location/search/session):
5,880 requests (65 req/s); statuses 200 × 4,259, 201 × 841, 429 × 779, 0 × 1 (a client keep-alive
socket reset, not a server error); **no 5xx**. All 429s are `PUT /trips/:id/location` — the accepted
G08 per-route limit (60/min per IP), expected with every worker behind one address. p95 under this
load 0.2–1.7 s (4-core shared laptop). Resources: ≤ 10 PostgreSQL connections (Prisma pool),
≤ 8 Redis clients, projection queue never backed up, `/health` ≤ 113 ms throughout, **0 PostgreSQL
deadlocks**, **0 ledger-invariant violations** (every expense's shares still sum to its amount).
API memory 161 → 266 MB during the run (one run cannot distinguish a leak from warm-up; recorded
as an observation).

## 4. N+1 audit

`scripts/g12/n-plus-one-audit.ts`: SQL statements logged by PostgreSQL (`log_statement = all` on a
disposable DB) for one request, with 3 vs 30 expenses (5 participants each) on the trip:

| Path | 3 rows | 30 rows |
|---|---|---|
| trip detail | 3 | 3 |
| trip members | 5 | 5 |
| expense list | 7 | 8 |
| expense summary | 10 | 8 |
| settlement suggestions | 8 | 8 |
| settlements list | 7 | 7 |
| location list | 8 | 8 |

Counts include the two JWT-validation reads. No path grows with row count (an N+1 would add ~27).
Fixed-size paths: destination detail 26 statements (one per G04 composition section — bounded,
not data-dependent), search 4–5, map 7–8, `/users/me` 3. Only these hot paths were measured; the
whole backend is **not** claimed N+1-free. Admin write paths that link several ids issue one insert
per id inside a transaction (bounded by the request).

## 5. Restart, failure injection, Redis outage (Paths C/D)

`scripts/g12/path-cd.ts`, compiled app in production mode, 16/16:
API crash + restart (provider policy, sharing, latest location, ledger, conversions, canonical data
unchanged; same JWT valid; responses identical); canonical write while the API is down still
enqueues the projection refresh; worker converges after restart; API killed mid-drain → queue
drains and the projection equals a full rebuild; Redis restart; Redis down; PostgreSQL connections
terminated mid-burst (all failures 503, no partial expense, pool recovers without restart); API
killed mid write burst (no partial expense, one latest-location row).
Graceful shutdown (`scripts/g12/graceful-shutdown-probe.ts`, 6/6): SIGTERM handler installed; an
in-flight ADMIN projection rebuild completes 201; new connections refused; process exits; no projection
claim or DB connection left behind.

**Redis outage classification** (Redis container stopped, API running):

| API | Behaviour | Class |
|---|---|---|
| `/health` | 200, `status: degraded`, `redis: error` (≈ 1.5 s probe timeout) | DEGRADED (reported correctly — G12 fix; it used to report `ok`) |
| auth (login, sessions, JWT validation) | normal | UNAFFECTED |
| trips, collaboration, location, expenses, settlements | normal | UNAFFECTED |
| search, suggestions, map | normal (projection queue is in PostgreSQL) | UNAFFECTED |
| affiliate clicks/redirect/ingest, providers | normal (DB-only) | UNAFFECTED |
| media derivative jobs, knowledge-ingestion jobs | cannot be queued while Redis is down | UNAVAILABLE for job enqueueing (not individually measured) |

Redis loss never corrupts DB-authoritative data (PostgreSQL is the authority; proven by the ledger
checks after the outage).

## 6. Security

| Area | Evidence | Result |
|---|---|---|
| Route classification | automated from real guard metadata; `route-inventory.json` (363 ops: 91 PUBLIC, 37 AUTHENTICATED, 35 TRIP_CAPABILITY, 199 ADMIN, 1 PROVIDER_CALLBACK, 0 INTERNAL) | every route classified, no unexplained route |
| Runtime vs OpenAPI | certification §1: runtime router == generated document == committed `openapi.json`, security declaration matches guards | PASS (one doc error fixed: `GET /media/{id}`) |
| Auth sweep | anonymous → 401 on every non-public route; plain USER → 403 on every role-gated route; every public route with placeholder input → no 5xx | PASS |
| IDOR | unrelated / pending invitee / removed member × every trip route (31 probes) with known ids; cross-trip sub-resource confusion → 404; nothing mutated | PASS (`leave` answers a non-member with its own 404/409 — P3 version oracle) |
| Same-JWT revocation | role downgrade, removal, archive, location stop, provider disable (G05+G10), account suspension | PASS |
| Rate limits | search 429 per client address, second address unaffected, per-route; login 10/min → 429; global limit + window recovery on map | PASS |
| Input abuse | oversized/deep/malformed JSON, 5k-element arrays, NaN/Infinity/exponent/fullwidth/overflow amounts, bad currencies, impossible dates, bad coordinates/timestamps, bad bboxes, long/unknown/tampered search params, path traversal / SQL-like / NUL ids, invalid UTF-8, HTML/script | all 4xx, never 5xx (after G12 fixes: 413 mapping, calendar dates, NUL guard) |
| SSRF | single outbound client (`OutboundHttpService`, admin-only ingestion): http/https only, IP-literal BlockList (G12: IPv4-mapped IPv6, `::`, 0/8, CGNAT, multicast/reserved added), per-hop redirect re-validation, timeout, byte cap; decimal/octal/hex IPv4 normalised by the URL parser; 22 unit tests | PASS; residual P3: a hostname that *resolves* to a private address is not blocked (no DNS-resolution check) |
| Open redirect | client never supplies a URL (DTO rejects `url`/`label`); `validateRedirectUrl` unit matrix (arbitrary host, http, javascript:, data:, protocol-relative, userinfo, lookalike, subdomain, encoded, CRLF) in the unit suite; live redirects only to `https://www.fixture-provider.example/`; G12: G02 re-checked on every redirect | PASS |
| CORS | production: allowed origin echoed with credentials; foreign origin and preflight get no ACAO; never `*`; production boot refuses empty/wildcard/path origins | PASS |
| Cookies | production: refresh `HttpOnly; Secure; SameSite=Lax; Path=/v1/auth; Expires`; CSRF cookie readable, `Secure; SameSite=Lax`; host-only; no refresh token in web-login body | PASS |
| CSRF | cookie refresh without / with forged / with matching `X-CSRF-Token` → 403 / 403 / 201 | PASS |
| Security headers | helmet on 200/404/401: nosniff, X-Frame-Options, HSTS, CSP `default-src 'self'`, Referrer-Policy, COOP, no X-Powered-By | PASS |
| 5xx privacy | forced 5xx with DB URL/password/SQL/path/JWT in the error → body `{INTERNAL_ERROR, "Unexpected server error"}` only; real FK error → no SQL/constraint name; parser errors no longer echo request content | PASS |
| Log privacy | all app stdout/stderr captured during the certification suite: no JWT, refresh token, password, private coordinate, DB password; G12 redaction of URL credentials/JWT/bearer and Prisma argument frames | PASS |
| Secret scan | `scripts/g12/secret-scan.js`: backend tracked + untracked files, 10 patterns; every hit is a synthetic test fixture; only `.env.example` files were ever committed | no secret found |
| Dependencies | `pnpm audit --prod` (workspace lockfile): 86 advisories, **43 reach the backend** (1 critical, 17 high, 20 moderate, 5 low) — see §7 | no P0/P1; P2 upgrades recommended |
| Licenses | `pnpm licenses list --prod` for the API: MIT 164, Apache-2.0 106, ISC 4, BSD 5, 0BSD, MIT-0; notes: `@img/sharp-win32-x64` bundles LGPL-3.0 libvips (dynamic binary), `argparse` Python-2.0, `pause` has no license metadata | not a legal certification |

## 7. Dependency advisories reaching the backend (classification)

| Package (via) | Worst | Runtime reachability | Class |
|---|---|---|---|
| fast-xml-parser (AWS SDK S3) | critical | parses responses from the operator-configured S3 endpoint only (trusted) | P2 — likely unreachable by an attacker; upgrade AWS SDK |
| qs (express) | moderate (DoS) | parses every query string — reachable | P2 — override/upgrade to qs ≥ 6.14.1 after freeze review |
| nodemailer 6.9 | high/moderate (address-parser DoS, domain interpretation) | recipient addresses are user-supplied but DTO-validated emails | P2 — upgrade to a patched major (7.x) is a major bump, not done in G12 |
| path-to-regexp 0.1 (express) | high (ReDoS) | only for multi-parameter-per-segment route patterns, which this app does not declare | P3 — likely unreachable |
| multer (platform-express) | high (DoS) | no route accepts multipart | P3 — unreachable |
| js-yaml (swagger), lodash (config) | high | not applied to untrusted input | P3 — unreachable |
| nanoid 3.3.7 | high | called with defaults only | P3 — unreachable |
| @nestjs/common, @nestjs/core | moderate | FileTypeValidator / specific output paths not used | P3 — review with a Nest 10.4.x patch upgrade |
| uuid (bullmq), body-parser, @smithy/config-resolver | low/moderate | not reachable as used | P3 |

No dependency was upgraded in G12 (the brief forbids automatic major upgrades; the lockfile is shared
with the frontends).
