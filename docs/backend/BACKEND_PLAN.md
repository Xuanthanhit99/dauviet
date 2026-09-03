# DẤU VIỆT — Backend Implementation Plan

**Status: BACKEND IMPLEMENTATION IN PROGRESS.** Not frozen, not declared ready for frontend integration. See `docs/backend/BACKEND_FREEZE_REPORT.md` for exact command evidence and open blockers before relying on this for production.

## Phase 00 — Repository & Architecture Audit (COMPLETE)

**Findings at audit time (2026-09-03):**
- `d:\dauviet` is a git repository (`main` branch) with **zero commits** and **no files** other than `.git`.
- No existing monorepo, no package manager lockfiles, no Prisma schema, no Docker config, no docs, no prior implementation of any kind.
- Nothing to preserve, nothing to conflict with. This is a greenfield bootstrap.
- Local tooling confirmed available: Node v22.17.0, npm 10.9.2, pnpm 11.18.0, Docker 29.6.1, git 2.42.0.

**Decision:** Bootstrap the full monorepo and backend foundation per the Master Build Directive, starting immediately with Phase 01. No destructive-ambiguity blockers exist.

## Scope reality check

This directive specifies a production-grade historical-knowledge-graph backend (60+ Prisma models, full auth, PostGIS map layer, full-text search, editorial workflow, community layer, moderation, contributions, media pipeline, Swagger, tests, Docker infra, seed data) — realistically weeks of senior-engineer work. It will be built as a single continuous NestJS/Prisma backend across the phases below, in one working session, with an emphasis on:

1. A **correct, complete, migrated Prisma schema** covering all core domains (this is the backbone everything else depends on).
2. A **working NestJS API** with real modules/services/controllers for the highest-priority domains (auth, historical graph, trust layer, map, timeline, search, community, admin/editorial), not placeholder stubs.
3. Enforced integrity rules called out in the spec (fact publication requires approved citation, sensitive facts need review, roles enforced server-side, etc.) as actual Nest guards/services, with tests proving them.
4. Docker Compose local infra (Postgres+PostGIS, Redis).
5. A curated Golden Dataset seed with **no fabricated citations** — facts without verified sources are explicitly seeded as `UNVERIFIED`/`DRAFT`.
6. Swagger/OpenAPI for every implemented endpoint.
7. Honest `BACKEND_HANDOFF.md` and `BACKEND_FREEZE_REPORT.md` — anything not fully implemented will be listed under "Known limitations," not silently omitted.

Where full depth of every single section (e.g. every media derivative pipeline, every future-locale plumbing) cannot be completed with production polish in this session, the scaffolding and extension points will exist and gaps will be documented explicitly rather than faked.

## Phases (tracking)

- [x] Phase 00 — Repository & Architecture Audit
- [x] Phase 01 — Foundation (workspace, Docker Compose infra config, Prisma bootstrap, BullMQ foundation, config, validation, logging, health, migrations, test foundation) — code complete; infra config never actually run live in this sandbox (Docker unavailable, see freeze report)
- [x] Phase 02 — Identity & Security: initial pass complete in Phase 01, then **hardened in a dedicated Phase 02 pass** (2026-09-10): Argon2id replacing bcrypt, email normalization, minimal session-bound JWT claims (immediate revocation on logout/suspend, not just at token expiry), refresh-token rotation + reuse detection, change-password, resend-verification, account suspend/disable with immediate session revocation, public-profile boundary, admin self-escalation guards, CSRF for the new web-cookie auth mode, globally-applied rate limiting (previously configured but not actually wired to a guard - fixed), and 45 new auth/RBAC unit tests (62/62 total passing). Full writeup: `docs/backend/AUTH.md` and `docs/backend/AUTHORIZATION_MATRIX.md`.
- [x] Phase 03 — Historical Knowledge Graph (Place, Person, Event, Era, Dynasty, Territory, aliases, translations, historical date model, join tables)
- [x] Phase 04 — Trust Layer (HistoricalFact, Source, Citation, SourceDocument, review states, sensitivity rules, revisions, audit) — unit-tested
- [x] Phase 05 — Media (MediaAsset, storage, access policy, upload validation, job foundation, provenance/rights) — thumbnail/derivative pipeline is a documented no-op stub
- [x] Phase 06 — Editorial Content (Story, Journey, editorial workflow, translations, relations, publication)
- [x] Phase 07 — Map / Timeline / Search (PostGIS queries, GeoJSON endpoint, timeline endpoint, pg_trgm search, aliases)
- [x] Phase 08 — Community (CommunityStory, comments, votes, bookmarks, visits, reports, moderation, verification states) — unit-tested
- [x] Phase 09 — Contributions (Contribution workflow, provenance)
- [x] Phase 10 — Golden Dataset (curated seed, no fabricated sources) — written and type-checked; never executed against a live DB
- [x] Phase 11 — API Contract Completion (Swagger setup, DTOs, pagination, locale contracts, response envelope) — Swagger document generation itself unconfirmed at runtime (app boot blocked on live DB/Redis)
- [x] Phase 12 — Full QA & Freeze — see `docs/backend/BACKEND_FREEZE_REPORT.md`; NOT a green light for production until the blocked live-infra checks are re-run for real

See `docs/backend/BACKEND_HANDOFF.md` for the full contract and `docs/backend/BACKEND_FREEZE_REPORT.md` for exact command evidence and open blockers.
