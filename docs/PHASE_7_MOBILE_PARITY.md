# PHASE 7 — MOBILE PARITY IMPLEMENTATION BASELINE

Status: **IN PROGRESS — DRAFT ONLY — NOT FOR PRODUCTION**

Phase 7 turns the existing Expo shell and secure auth/session foundation into the consumer mobile counterpart of the accepted web lifecycle. It reuses frozen backend contracts and the shared API client; it does not invent mobile-only truth, provider, location or historical semantics.

## Starting state

- Expo Router root shell and native StatusBar exist.
- Login/session foundation uses SecureStore for refresh-token persistence and in-memory access tokens.
- The current home screen is still a placeholder and does not yet provide accepted discovery/detail/Trip/Together/Remember/Community parity.
- Consumer QA currently typechecks Mobile but has no meaningful native/mobile regression gate.

## Implementation sequence

1. Native app shell/navigation, loading/error/empty/success primitives and authenticated account state.
2. Discovery parity: Explore, destination/place/story detail using the same truthful public contracts.
3. Trip parity: list/detail/planning and role-aware Together collaboration.
4. Explicit location-sharing controls: OFF by default, trip-scoped, temporary, never inferred from membership/invitation/role.
5. Remember/bookmarks and Community/Contribution parity with verified/community trust disclosure.
6. BOOK handoff parity using server/provider state only; no fake availability, price or booking success.
7. Native accessibility, touch targets, safe-area/layout, failure/offline states and VI/EN sweep.
8. Add meaningful Mobile regression/CI gate and run exact-current-head Consumer QA.
9. Phase 7 final audit.

## Non-negotiable

No automatic location sharing. No fabricated provider availability, booking success, prices, historical facts, translations, provenance or media. Community content must remain distinct from verified knowledge. External integrations remain fail-closed. PR #2 remains Draft; no merge and no production deployment during Phase 7.
