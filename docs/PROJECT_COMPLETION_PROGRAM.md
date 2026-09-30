# PROJECT COMPLETION PROGRAM

Status: **PHASE 4 COMPLETE · PHASE 5 CONTRIBUTE / REMEMBER / SHARE IN PROGRESS — NOT FOR PRODUCTION**

Baseline: `main@74846c4ce0bd5fe5bd806278cac576a3f82b9df2`.
The public web completion pass is accepted and green. This program finishes the remaining product surfaces before any real deployment.

## Current-state audit

| Area | State at program start | Completion target |
| --- | --- | --- |
| Backend V2 | Frozen candidate with documented external integration blockers | Preserve freeze; only additive contract-gap work when required |
| Public web discovery/history | Accepted with frozen contract gaps | Preserve locked UI and regression suite |
| Authenticated web product | Not complete as an end-to-end product | Auth/account, bookmarks/community, Trip planning/collaboration/location/expenses/affiliate flows |
| Admin/CMS | Placeholder page only | Role-gated editorial, trust/provenance, moderation, ingestion/provider and audit workspaces |
| Mobile | Placeholder home only | Expo consumer app with discovery, detail, Trip/Together/Remember flows and explicit location consent |
| Shared API client | Minimal request wrapper | Typed envelope/errors/auth/session primitives shared by consumers |
| Consumer CI | Web-heavy; Admin/Mobile typecheck/build only | Add meaningful Admin/Mobile tests and completion gates |
| External integrations | GeoNames, Google Places, Booking.com, Agoda, Viator blocked by credentials/approval | Remain fail-closed; never fake production capability |

## Locked product lifecycle

DISCOVER → UNDERSTAND → EXPERIENCE → PLAN → BOOK → TRAVEL → CONTRIBUTE → REMEMBER → SHARE → DISCOVER AGAIN.

Trust zones remain distinct: VERIFIED KNOWLEDGE / PROVIDER DATA / COMMUNITY CONTENT. Trip location is explicit opt-in, trip-scoped, temporary and OFF by default. Provider/commercial claims remain fail-closed.

## Delivery phases

1. **Consumer foundation — COMPLETE** — shared API client, session/error primitives, web authenticated shell, mobile navigation/session foundation.
2. **PLAN — COMPLETE** — Trip list/detail, itinerary, deterministic cost output, optimistic concurrency and role-aware collaboration. Final Consumer QA: `36725356192`.
3. **TOGETHER — COMPLETE** — invitations/members/activity, explicit location sharing controls, expenses/balances/settlements. Final Consumer QA: `36734861258` on accepted head `dfe36c3c6374faa168ae9451f0fea8766a977124`.
4. **BOOK — COMPLETE** — G05 stay/food/activity surfaces, truthful provider states and G10 server-controlled affiliate handoff with forged/cross-provider identifier protection. Final Consumer QA: `36738812532` on accepted head `eab9560670ec7560435e44d7c8f5f64bd09c429c`.
5. **CONTRIBUTE / REMEMBER / SHARE — IN PROGRESS** — bookmarks, community stories/comments, contribution workflow and personal journey continuity supported by frozen APIs.
6. **Admin/CMS** — editorial publishing, trust/source/citation review, media provenance, moderation, ingestion/provider policy and audit.
7. **Mobile parity** — core discovery/detail/trip/together/community flows with native accessibility and location permission semantics.
8. **Final system QA** — dead-link/contract sweep, VI/EN, responsive/native layouts, accessibility, auth/RBAC, failure/offline states, full consumer CI and final acceptance report.

## Non-negotiable gates

- No production deployment during this program.
- No fake provider availability, booking success, prices, historical facts, translations or media.
- No Culture=Theme inference and no unsupported canonical route invention.
- No automatic location sharing from membership/invitation/role changes.
- No backend freeze reopening for UI convenience.
- Each phase must have regression coverage and green CI before it is accepted.
