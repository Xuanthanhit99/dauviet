# PHASE 2 — PLAN / TRIP FINAL AUDIT

Status: **CONDITIONAL — CURRENT-HEAD CI REQUIRED**

Scope: Trip list/create/detail, itinerary destinations/day items/transport, deterministic cost presentation, optimistic concurrency, collaboration and OWNER/EDITOR/VIEWER actions.

## Audit results

- **Trip create/list:** authenticated routes use the shared API client; empty/loading/error states are explicit.
- **Trip detail composition:** audit found a P1 contract gap: `GET /trips/:id` returned only the Trip aggregate row while the consumer requires persisted days/items/destinations/transport. Fixed additively by returning the authorized planning composition. Authorization semantics are unchanged.
- **Replace-all safety:** audit found a P1 data-loss risk in the first UI pass because add forms sent a single entry to replace-all endpoints. Fixed: the consumer now preserves the existing ordered composition and appends the new destination/day item/transport leg.
- **Optimistic concurrency:** itinerary mutations send the current `Trip.version`; backend rejects stale writes with `TRIP_VERSION_CONFLICT`; the consumer reloads after successful mutation.
- **Deterministic cost:** UI consumes persisted LOW/TYPICAL/HIGH estimate output and exposes completeness/confidence/unknown count. Missing evidence remains unknown; no synthetic live price or currency conversion is introduced.
- **Role-aware actions:** backend remains authoritative through `TripAuthorizationService`. OWNER can govern and edit; EDITOR can edit/generate estimates; VIEWER is read-only. Consumer mutation controls are hidden for VIEWER and invitation governance is OWNER-only.
- **Collaboration:** member list and invitation creation are wired. Phase 3 owns the expanded invitations/activity/location/finance experience.
- **Regression:** Playwright covers authenticated Trip list/detail, no-estimate truthfulness, VIEWER read-only controls, and replace-all destination preservation.

## Gate

Phase 2 can be marked **COMPLETE** only when Consumer QA passes on the current head after all audit corrections above. PR #2 remains Draft. No production deployment is permitted by the completion program.
