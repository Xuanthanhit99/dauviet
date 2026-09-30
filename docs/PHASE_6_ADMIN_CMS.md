# PHASE 6 — ADMIN / CMS IMPLEMENTATION BASELINE

Status: **IN PROGRESS — DRAFT ONLY — NOT FOR PRODUCTION**

Phase 6 turns the existing role-gated backend administration contracts into truthful operational workspaces. It does not relax backend RBAC and does not promote community/contributor claims into verified knowledge on the client.

## Existing surface and contract inventory

- Admin app already has session restoration and an allow-list gate for ADMIN, EDITOR, HISTORIAN_REVIEWER and MODERATOR.
- Contributions admin: EDITOR/HISTORIAN_REVIEWER/ADMIN queue/detail/review; cataloguing promotion is restricted to HISTORIAN_REVIEWER/ADMIN.
- Ingestion administration: ADMIN-only source, policy, evidence, job, run and cancellation contracts.
- Existing backend admin controllers also cover stories/editorial, journeys, search and affiliate operations.

## Implementation sequence

1. Admin shell/navigation and role-aware workspace visibility.
2. Contribution review queue/detail with server-owned status, rights, provenance-confidence and sensitivity actions.
3. Editorial publishing/trust/source/citation workflows only where frozen admin contracts exist.
4. Media provenance and moderation surfaces with exact backend role gates.
5. Ingestion/provider policy and job operations; external integrations remain fail-closed.
6. Audit/operational states, loading/error/empty/success, destructive-action confirmation and RBAC failure states.
7. Admin browser regression + exact-current-head Consumer QA.
8. Phase 6 final audit.

## Non-negotiable

No client-side privilege elevation. No fabricated verification, provenance, moderation outcome, provider availability, historical claim, translation or media. Cataloguing actions must respect HISTORIAN_REVIEWER/ADMIN restrictions; ingestion remains ADMIN-only. No production deployment. PR #2 remains Draft.
