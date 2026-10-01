# PHASE 8 — FINAL SYSTEM QA

Status: **IN PROGRESS — DRAFT ONLY — NOT FOR PRODUCTION**

Phase 8 is the final cross-surface acceptance pass after Phases 1–7. It does not reopen frozen backend contracts for UI convenience and does not authorize deployment.

## Gate order

1. Dead-link / canonical route / API-contract sweep across Web, Admin and Mobile.
2. VI/EN copy and locale-path audit; no fabricated translation fallback.
3. Responsive Web/Admin and native safe-area/touch/layout audit.
4. Accessibility semantics, keyboard/focus and reduced-motion audit.
5. Auth/session/RBAC and ownership/role boundary regression.
6. Failure/offline/retry/fail-closed audit for discovery, provider, location and contribution surfaces.
7. Full exact-head Consumer QA and final acceptance evidence.

## Initial findings

- Phase 7 final exact-head Consumer QA 36828618986 (#244) on ffa56afefde6021d4376ea81e1d97c26c7451a8d is green.
- Mobile home still contained stale Phase 7 implementation copy after Phase 7 completion; removed at Phase 8 start.
- Route sweep found the native /book lifecycle surface had no App Shell entry point. Added a canonical BOOK header link while keeping the four-item bottom navigation focused on Explore / Trips / Remember / Community.
- Location remains foreground permission only after explicit trip-scoped opt-in; no background location permission is introduced.
- Provider/affiliate paths remain server-controlled and fail closed.\n- VI/EN audit found Admin operational/review surfaces mixing English prose into Vietnamese UI. User-facing labels/status prose were localized while preserving server-owned enum/role/contract identifiers (for example ADMIN, MODERATOR, HISTORIAN_REVIEWER, PROVIDER enum values).

## Acceptance checklist

| Gate | State |
| --- | --- |
| Dead-link / route / contract sweep | PASS — route trees verified; native BOOK entry point repaired; API client remains canonical /v1 contract boundary |
| VI/EN | PASS — source audit completed; detail routes propagate requested VI/EN locale; backend fallback metadata remains authoritative; no client-side translation synthesis |
| Responsive / native layout | PENDING |
| Accessibility | PENDING |
| Auth / RBAC | PENDING |
| Failure / offline | PENDING |
| Full exact-head final CI | PENDING |
| Final acceptance report | PENDING |

## Non-negotiable

PR #2 remains Draft. No merge and no production deployment until the entire completion program and Phase 8 acceptance are complete. No fake provider availability, booking success, price, historical fact, translation, provenance, media or location data.

- Gate 2 locale audit found Destination, Place and Story detail routes accepted no locale and hard-coded backend requests to `locale=vi`; route search params now propagate the requested `vi|en` locale into API reads. Backend-owned fallback metadata remains authoritative; the UI does not synthesize missing translations.

- Gate 2 final source audit also found Country and Journey detail hard-coded to `locale=vi`; both now propagate `?locale=vi|en` into backend reads. Region, Event and Person already propagated locale correctly. No audited detail surface synthesizes missing backend translations; published-content fallback is represented by backend `meta.requestedLocale`, `resolvedLocale` and `fallbackApplied`.
