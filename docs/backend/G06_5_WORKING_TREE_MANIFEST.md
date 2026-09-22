# G06.5 Working-Tree Isolation Manifest

Read-only audit. No git staging, commit, or destructive operation was performed to produce this
document. Nothing in the working tree was reverted, cleaned, or reset.

## 1. Repository identity

- Root: `D:\dauviet`
- Branch: `main`
- HEAD: `9a16e4a9880c38a1ff973ec1dd1fb069b1445c01` ("qa: register Story Explorer V4 Chromium gate", 2026-09-22 00:09:21 +0700)
- `origin/main`: identical to HEAD (`9a16e4a9880c38a1ff973ec1dd1fb069b1445c01`) — branch is up to date with origin, no divergence.
- Staged changes: **none** (`git diff --cached` is empty).
- Audit date/time: 2026-09-22 (this closure pass).

## 2. Full changed/untracked file list — 37 entries, every one classified

Legend: **A** G06.5 implementation · **B** G06.5 test · **C** G06.5 migration/Prisma · **D** G06.5
documentation · **E** G06.5 config/env · **F** G06.5 safety/tooling · **G** pre-existing/accepted
prior-phase change · **H** unrelated concurrent change · **I** unknown ownership — not touched.

| # | Git status | Path | Category | Evidence |
|---|---|---|---|---|
| 1 | M | `.env.example` | **E** | Diff is exactly the appended "Knowledge & Place Data Ingestion (G06.5)" block; nothing else in the file changed. |
| 2 | M | `apps/api/src/app.module.ts` | **A** | Diff adds the `KnowledgeIngestionModule` import + registration only. |
| 3 | M | `apps/api/src/common/errors/error-codes.spec.ts` | **B** | Diff registers `INGESTION_ERROR_CODES` in the `REGISTRIES` map (matches every prior phase's own registration pattern). |
| 4 | M | `apps/api/src/common/historical-date/golden-dataset-validation.spec.ts` | **B** | Diff adds `'ingestionSourcePolicyEvidence'` to `ALLOWED_BARE_CREATE_MODELS` plus one new guard-verification test (Defect 3 fix — see Final Report). |
| 5 | M | `apps/api/src/config/configuration.ts` | **E** | Diff adds the `ingestion: {...}` config block and its `AppConfig` interface entry only. |
| 6 | M | `apps/web/app/globals.css` | **H** | Frontend CSS; diff contains no reference to ingestion/G06.5 (checked). |
| 7 | M | `apps/web/app/map/explore-map-client.tsx` | **H** | Frontend component; diff contains no reference to ingestion/G06.5 (checked). |
| 8 | M | `apps/web/app/stories/[slug]/story-explorer.tsx` | **H** | Frontend component; diff contains no reference to ingestion/G06.5 (checked). |
| 9 | M | `apps/web/next-env.d.ts` | **H** | Next.js generated type-reference file, frontend-only. |
| 10 | M | `apps/web/tests/story-explorer-v4.spec.ts` | **H** | Playwright frontend test; part of the "Story Explorer V4" consumer-integration pass (see `docs/brand/consumer-integration-pass-07-*.md`). |
| 11 | M | `apps/web/tsconfig.json` | **H** | Frontend TS config. |
| 12 | M | `docs/backend/AUTHORIZATION_MATRIX.md` | **D** | Diff adds two G06.5 RBAC table rows + one separation-of-duties bullet only. |
| 13 | M | `docs/backend/BACKEND_HANDOFF.md` | **D** | Diff appends a new "## G06.5" summary section at the end of the file only — added during this closure pass to close a real gap (see section 6 below). |
| 14 | M | `docs/backend/GLOBAL_V2_ROADMAP.md` | **D** | Diff adds one new roadmap table row (`G06.5`) only. |
| 15 | M | `docs/backend/openapi.json` | **D** | Diff is 774 insertions / 4 deletions; the 4 "deletions" are `EntityKind` enum re-serialization (trailing comma) from appending 4 new enum values, appearing 4 times because the enum is inlined at 4 schema locations — verified line-by-line, purely additive, all new content is `INGESTION_*`/`ADMIN_INGESTION_*`-scoped. |
| 16 | M | `docs/brand/consumer-integration-pass-07-story-explorer-v4.md` | **H** | Content is entirely about `/stories/[slug]` frontend QA status; explicitly states `"backendChanged": false` in the paired registry entry. |
| 17 | M | `package.json` | **F** | Diff adds exactly two npm scripts: `db:migrate:diff:safe` and `test:db-guard`, both pointing at `scripts/db/*` (the shadow-database safety guard). Nothing else changed. |
| 18 | M | `packages/brand-contracts/brand-registry.json` | **H** | Diff updates the `pass7`/adds a `pass8` status entry for the frontend consumer-integration passes; no ingestion content. |
| 19 | M | `pnpm-lock.yaml` | **H** | Diff is 5546 insertions / 109 deletions, dominated by new `apps/admin` and `apps/mobile` workspace dependency trees (Next.js 16, Expo, react-native, etc.) — none of these are G06.5 dependencies. This session's only `pnpm`-triggered install attempt (`pnpm db:seed`) **failed** before completing (ignored build-script error), so this large regeneration was not produced by this work. |
| 20 | M | `pnpm-workspace.yaml` | **I — UNKNOWN OWNERSHIP, NOT TOUCHED** | Diff is a single added line: `sharp: set this to true or false` under `allowBuilds`. Ambiguous origin: could stem from this session's one failed `pnpm db:seed` attempt (which logged an "Ignored build scripts: sharp@0.34.5" warning before failing) **or** from the concurrent full `pnpm install` that produced entry #19's large lockfile diff (a full install also touches every package's build-script approval state). Cannot be attributed with confidence to either side. Left untouched per the closure pass's own stop-condition ("ownership of a changed file is ambiguous"). |
| 21 | M | `prisma/golden/index.ts` | **C** | Diff adds one `export * from './knowledge-ingestion';` line only. |
| 22 | M | `prisma/schema.prisma` | **C** | Diff adds 12 new models + 12 new enums + 4 additive `EntityKind` values, in a clearly-delimited new section at the end of the file; zero existing model/enum/field altered (verified in the Final Report's Path B table-diff). |
| 23 | M | `prisma/seed.ts` | **C** | Diff adds the `GOLDEN_INGESTION_SOURCES` import and one new seeding block at the end of `main()`, plus the two new imports. Zero existing seeding logic altered. |
| 24 | ?? | `apps/api/src/common/errors/ingestion-error-codes.ts` | **A** | New file — 29 `INGESTION_*` error codes. |
| 25 | ?? | `apps/api/src/modules/knowledge-ingestion/` | **A + B** (28 files — see section 3) | New module directory, entirely G06.5. |
| 26 | ?? | `apps/web/.gitignore` | **H** | Frontend-scoped gitignore; unrelated to backend ingestion work. |
| 27 | ?? | `apps/web/app/components/` | **H** | New frontend component directory (consumer-integration work). |
| 28 | ?? | `apps/web/app/journeys/` | **H** | New frontend route directory — matches `docs/brand/consumer-integration-pass-08-journey-detail-v3.md`. |
| 29 | ?? | `apps/web/qa-evidence/` | **H** | Frontend QA evidence artifacts (screenshots/reports for the consumer-integration passes). |
| 30 | ?? | `apps/web/tests/journey-detail-v3.spec.ts` | **H** | Frontend Playwright test, "Journey Detail V3" pass. |
| 31 | ?? | `docs/backend/G06_5_FINAL_REPORT.md` | **D** | New — this phase's final report. |
| 32 | ?? | `docs/backend/G06_5_PRE_IMPLEMENTATION_REPORT.md` | **D** | New — pre-implementation audit. |
| 33 | ?? | `docs/backend/G06_5_SOURCE_POLICY_RESEARCH.md` | **D** | New — official source-policy research. |
| 34 | ?? | `docs/brand/consumer-integration-pass-08-journey-detail-v3.md` | **H** | New — pairs with entries #27/#28/#29/#30, "Journey Detail V3" frontend pass. |
| 35 | ?? | `prisma/golden/knowledge-ingestion.ts` | **C** | New — `IngestionSource`/`IngestionSourcePolicy` seed registry. |
| 36 | ?? | `prisma/migrations/20260922093507_g06_5_knowledge_ingestion/` | **C** | New — the one G06.5 migration (1 file, `migration.sql`). |
| 37 | ?? | `scripts/db/` | **F** (3 files — see section 3) | New — shadow-database safety guard + safe migration-diff wrapper + tests. |

## 3. Directory entries expanded to individual files

**`apps/api/src/modules/knowledge-ingestion/`** — 28 files, all **A** except the 5 marked **B**:

```
adapters/adapter.types.ts                    A
adapters/geonames.adapter.ts                 A
adapters/google-places.adapter.ts            A
adapters/openstreetmap.adapter.ts            A
adapters/openstreetmap.adapter.spec.ts       B
adapters/unesco.adapter.ts                   A
adapters/wikidata.adapter.ts                 A
adapters/wikimedia-commons.adapter.ts        A
dto/ingestion.dto.ts                         A
entity-resolution.service.spec.ts            B
entity-resolution.service.ts                 A
ingestion-admin.controller.ts                A
ingestion-candidates.controller.ts           A
ingestion-candidates.service.ts              A
ingestion-jobs.service.ts                    A
ingestion-policy.service.ts                  A
ingestion-policy.types.ts                    A
ingestion-policy.util.spec.ts                B
ingestion-policy.util.ts                     A
ingestion-promotion.service.ts               A
ingestion-run.service.spec.ts                B
ingestion-run.service.ts                     A
ingestion-sources.service.ts                 A
ingestion.processor.ts                       A
knowledge-ingestion.constants.ts             A
knowledge-ingestion.module.ts                A
outbound-http.service.spec.ts                B
outbound-http.service.ts                     A
```

**`scripts/db/`** — 3 files, all **F**:

```
safe-migrate-diff.ts             F
shadow-database-guard.spec.ts    F
shadow-database-guard.ts         F
```

**`apps/web/app/components/`, `apps/web/app/journeys/`, `apps/web/qa-evidence/`** — not enumerated
file-by-file here: every file under these three directories is frontend/QA-artifact content,
category **H**, and none was opened, read for content correctness, or touched by this work. They
are recorded at the directory level because file-by-file enumeration would not change their
classification.

## 4. Category totals

Two countings are given: **git-status lines** (one row per line in section 2's 37-row table — a
directory that is entirely untracked collapses to a single line) and **individual files** (directory
lines expanded per section 3). Every line in section 2 has exactly one primary category; the
`knowledge-ingestion/` line's internal A/B split and `scripts/db/`'s files are the only places a
single status line represents more than one file.

| Category | Git-status lines | Individual files |
|---|---|---|
| A — G06.5 implementation | 3 (`app.module.ts`, `ingestion-error-codes.ts`, `knowledge-ingestion/` dir) | 25 (2 + 23 non-spec files in the dir) |
| B — G06.5 test | 2 (`error-codes.spec.ts`, `golden-dataset-validation.spec.ts`) | 7 (2 + 5 `.spec.ts` files inside the `knowledge-ingestion/` dir) |
| C — G06.5 migration/Prisma | 5 | 5 |
| D — G06.5 documentation | 7 | 7 |
| E — G06.5 config/env | 2 | 2 |
| F — G06.5 safety/tooling | 2 (`package.json`, `scripts/db/` dir) | 4 (1 + 3 files in the dir) |
| G — pre-existing/accepted prior-phase change | 0 | 0 |
| H — unrelated concurrent change | 15 | not individually enumerated (3 of the 15 lines are directories — see section 3) |
| I — unknown ownership, not touched | 1 | 1 |
| **Total** | **37** | — |

Git-status-line check: 3 + 2 + 5 + 7 + 2 + 2 + 0 + 15 + 1 = **37** ✓ (matches section 2's row count
exactly). G06.5-attributable lines (A+B+C+D+E+F) = **21**. Unrelated concurrent (H) = **15**.
Unknown ownership (I) = **1**.

## 5. Cross-contamination check (spec section 5)

Checked specifically for G06.5 edits leaking into: frontend UI, brand assets, mobile code, G07/G08/
G09/G10 code, accepted G00–G06 migrations, unrelated provider functionality, unrelated Docker/
project configuration.

**Result: no cross-contamination found**, with one caveat already reported as ambiguous (entry #20,
`pnpm-workspace.yaml`) and one confirmed-clean edge case:

- `package.json` (entry #17) is a **shared root config file**, but its diff is 100% attributable to
  G06.5 (exactly two new npm scripts, nothing else touched) — no unrelated content mixed in, no
  hunk-level separation needed.
- `pnpm-workspace.yaml` (entry #20) — see section 2's row for the full reasoning. Flagged, not
  corrected, not staged, not reverted.
- No accepted G00–G06 migration file shows any diff (`git diff --stat -- prisma/migrations/` returns
  empty for all 18 tracked migration files).
- No G07/G08/G09/G10-named file, route, or model exists anywhere in the working tree (grepped: zero
  hits for `TripMember`, `LocationSession`, `TripExpense`, `AffiliateClick`/`AffiliateConversion`, or
  any G07–G10-scoped module directory).
- No frontend file's diff contains any `ingestion`/`wikidata`/`unesco`/`geonames` reference (checked
  directly against every modified `apps/web/*` file's diff content, not just its path).

## 6. Accidental G06.5 edit corrected during this pass

One genuine documentation gap was found and fixed: `docs/backend/BACKEND_HANDOFF.md` (originally
listed in the G06.5 brief's section 79 as a file to update) had never been touched despite
`GLOBAL_V2_ROADMAP.md` and `AUTHORIZATION_MATRIX.md` both being updated correctly in the prior
session. This is not an "accidental modification of an out-of-scope file" (section 5's concern) —
it is the opposite: an **omitted** in-scope documentation update. Per this closure pass's own
instruction to "verify final reports accurately reflect current evidence" and that the three docs
"must agree," a concise new "## G06.5" section (mirroring the existing G01–G06 section format) was
appended to the end of the file — pure addition, zero existing content altered, verified by diff
(`git diff docs/backend/BACKEND_HANDOFF.md` shows only appended lines after the file's prior final
line).

## 7. Accepted migration integrity (spec section 6)

- `git diff --stat -- prisma/migrations/` against all 18 previously-accepted migration files: **empty
  — zero changes**.
- The one new migration, `prisma/migrations/20260922093507_g06_5_knowledge_ingestion/migration.sql`,
  has SHA-256 `d7a086a3ff6013898c4f2ab9e764841d776d24be6320ad16ee51e2b0e9d26202` on disk, which is
  **byte-identical** to the checksum Prisma itself recorded in `_prisma_migrations.checksum` at the
  time it was applied and validated during the Path A/B proof (queried directly from Postgres). The
  file was not regenerated, edited, or replaced since that validation.
- No new migration directory appeared beyond the one already accounted for in the Final Report.

## 8. Shadow-database safety guard verification (spec section 7)

- `scripts/db/shadow-database-guard.ts` and `scripts/db/safe-migrate-diff.ts` both present, both
  attributable to G06.5 (new files, this session).
- `scripts/db/shadow-database-guard.spec.ts` re-run during this closure pass: **10/10 tests pass**
  (`node:test`), including the exact-incident-reproduction case (byte-identical URLs throw
  `ShadowDatabaseSameAsRealError`).
- Guard was not redesigned, not modified, not re-run destructively — only its existing test suite
  was re-executed, per this pass's explicit allowance ("a focused existing guard test may be rerun
  if inexpensive").

## 9. Secret scan result (spec section 8)

**Result: clean — no real secret found in any G06.5-attributable file.**

- Pattern scan (API keys, passwords, bearer tokens, embedded DB credentials) across every file in
  categories A/B/C/D/E/F found only synthetic, non-secret literals:
  - `scripts/db/shadow-database-guard.spec.ts`: the literal string `secret` used as a placeholder
    password in 8 test-fixture connection-string constants — not a real credential, same convention
    this codebase already uses for `DevPassword123!` in other test fixtures.
  - `.env.example` line 20: `DATABASE_URL="postgresql://dauviet:dauviet@localhost:5432/dauviet..."` —
    **pre-existing** (not added by G06.5; the G06.5 block was appended later in the same file), a
    well-known local-only default credential already present in `docker-compose.yml` in plaintext.
- `apps/api/.env` (which holds the real `WIKIMEDIA_USER_AGENT`/contact string and the empty
  `GEONAMES_USERNAME`/`GOOGLE_PLACES_API_KEY` placeholders) is confirmed `git`-ignored
  (`git check-ignore -v` → matched by `.gitignore:5`) and does **not** appear anywhere in
  `git status` — it was never tracked, staged, or at risk of being committed.
- `.env.example`'s G06.5 block contains only placeholder/empty values for
  `GEONAMES_USERNAME`/`GOOGLE_PLACES_API_KEY`, confirmed by direct read.
- No raw restricted provider payload, OAuth token, or Authorization header value appears in any
  G06.5 source, test, doc, or migration file.

## 10. Env contract check (spec section 9)

`.env.example`'s G06.5 block and `apps/api/src/config/configuration.ts`'s actual `process.env.*`
reads were compared line-by-line: **exact match** —
`KNOWLEDGE_INGESTION_ENABLED`/`WIKIMEDIA_USER_AGENT`/`WIKIMEDIA_CONTACT`/`GEONAMES_USERNAME`/
`GOOGLE_PLACES_API_KEY`/`INGESTION_WORKER_CONCURRENCY`/`INGESTION_MAX_RETRIES`/
`INGESTION_RAW_RETENTION_DAYS`, all read with safe defaults via `??`, none required.
`apps/api/src/config/env.validation.ts` (the hard-required-field validator) shows **zero diff** —
confirmed no optional G06.5 credential was ever converted into a mandatory startup requirement.

## 11. OpenAPI closure check (spec section 13)

No executable/route-affecting source file was modified after the OpenAPI regeneration that produced
the reported 287 paths — the only file touched afterward in this session was
`golden-dataset-validation.spec.ts` (a Jest test file, category **B**, read by no OpenAPI generation
step) plus this closure pass's own documentation edits (category **D**, also not read by OpenAPI
generation). **The existing `docs/backend/openapi.json` (287 paths) is not stale and was not
regenerated during this closure pass**, per this pass's own instruction to avoid unnecessary
regeneration.

## 12. Regression evidence reuse (spec section 14)

No executable code was modified during this closure pass (only documentation: `AUTHORIZATION_MATRIX.md`,
`GLOBAL_V2_ROADMAP.md`, `BACKEND_HANDOFF.md`, plus this manifest and the allowlist). The prior
session's regression evidence — **1022/1022 unit tests, 62/62 e2e tests** — is reused as-is, per
this pass's explicit instruction not to re-run expensive regression when no code changed. The one
test re-run during this pass (`shadow-database-guard.spec.ts`, 10/10) was inexpensive and
explicitly permitted.

## 13. Final working-tree status

Unchanged in shape from the start of this closure pass except for the one documentation addition
(`docs/backend/BACKEND_HANDOFF.md`) and the two new files this manifest itself produces
(`G06_5_WORKING_TREE_MANIFEST.md`, `G06_5_COMMIT_ALLOWLIST.txt`). Nothing staged. Nothing committed.
Nothing pushed. No concurrent (`apps/web/*`, `docs/brand/*`, `packages/brand-contracts/*`) file was
read for anything beyond confirming its diff contains no G06.5 content, and none was modified,
staged, or reverted.
