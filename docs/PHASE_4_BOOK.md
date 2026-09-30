# PHASE 4 — BOOK IMPLEMENTATION BASELINE

Status: **IN PROGRESS — DRAFT ONLY — NOT FOR PRODUCTION**

Phase 4 consumes the frozen G05 Stay/Food/Activities and G10 Affiliate Attribution contracts. It does not reopen backend freeze.

## Product contract

BOOK means discovery-to-provider handoff, not a Dấu Việt booking engine.

- Stay: canonical accommodation discovery/detail plus context-bound, provider-gated current offers.
- Food: canonical restaurant discovery/detail plus provider-scoped current operational snapshots.
- Activities: canonical activity discovery/detail plus context-bound, provider-gated current offers.
- Commercial handoff: only through G10 affiliate click + opaque server redirect when a provider is eligible.
- Never invent availability, price, rating, booking confirmation, provider capability, or a Dấu Việt booking aggregate.
- Empty/gated/expired provider data is rendered as unavailable rather than inferred.
- Provider attribution stays visible with provider-scoped data.
- PR #2 remains Draft. No merge and no production deployment during Phase 4.

## Consumer implementation sequence

1. BOOK hub with Stay / Food / Activities entry points and destination-aware filters.
2. Stay list/detail; explicit check-in/check-out/guests/rooms/currency before requesting offers.
3. Food list/detail; operational data stays provider-scoped and no cross-provider rating merge.
4. Activity list/detail; explicit date/participants/currency before requesting offers.
5. G10 affiliate handoff from an eligible provider result; external handoff is clearly labelled and never represented as an in-app booking.
6. Empty/error/gated/expired states.
7. Web regression coverage and Consumer QA on exact HEAD.

## Acceptance gate

Phase 4 cannot become COMPLETE until the consumer flow proves Stay/Food/Activities discovery, truthful provider-data states, eligible external handoff, failure states, and green Consumer QA on the exact accepted HEAD.
