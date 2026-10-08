# Anciquest Global Travel — Execution Plan / Gate 0
Date: 2026-10-08
Owner roles: BA/Product, UX/UI, API/Data, Web/Mobile, Security/Privacy, QA/Release.
Status: STARTED; documentation and source audit only, no implementation PASS claim.

## New source findings (main branch)
- Trip collaboration ALREADY EXISTS: apps/api/src/modules/trips/trip-members.controller.ts includes membership, invitation, role/capability and activity endpoints.
- Trip location sharing ALREADY EXISTS: apps/api/src/modules/trips/trip-location-sharing.service.ts implements explicit user self-consent with finite duration; trip membership alone does not grant location permission. Must preserve its locking, audit and revocation invariants.
- Community ALREADY EXISTS: apps/api/src/modules/community/community.controller.ts includes community stories, author/review verification state and moderation routes.
- Comments ALREADY EXISTS: apps/api/src/modules/comments/comments.controller.ts supports target comments, replies, updates, votes and moderation with throttling.
- Providers are admin-only governance; affiliate has click/redirect tracking; no evidence of full public guide marketplace or contracted booking.
- No dedicated chat/realtime or safety escalation API module seen in API module tree; verify schemas and dependencies before adding.

## Corrected reuse decisions
Trip group membership/invitations: EXTEND existing; do not create duplicate GroupTrip or GroupMembership without schema reconciliation.
Opt-in location sharing: EXTEND existing consent service; do not build a parallel tracker or infer consent from group membership.
Community comments/review verification: EXTEND existing, first audit schema and authorization; no duplicate review records.
Provider onboarding/public guide profile and human chat: design additive layer using existing governance/identity contracts.
Safety check-in: new workflow on top of consent + trip state, without auto-public alert.

## Workstreams / deliverables
BA: complete use cases and acceptance criteria for search/booking, guide marketplace, chat, friendship, group trips, reviews, AI, safety; identify partner contracts and regulatory constraints.
Design: independent Desktop 1536 and Mobile 390 master exports from user-approved V2 visual direction, plus states for no data/loading/error, chat, provider detail, reviews and active trip safety. Review before code.
Backend: audit Prisma models and existing authorization, propose additive migrations and versioned DTOs; implement modules one gate at a time with unit/integration tests.
Web/Mobile: build components strictly against approved masters, using actual data and rights-cleared media; mobile UX native-first.
QA: exact-head typecheck, tests, consumer flows, security/accessibility, media provenance and side-by-side screenshots; no CI-green-only visual pass.
Release: partner compliance, privacy/consent, observability, staged deployment, rollback; PR #15 remains Draft and isolated.

## Gate order
G0 complete code/schema/API audit and gap matrix — IN PROGRESS.
G1 1536/390 master approval — PENDING.
G2 Global discovery and localized destination selector — PENDING.
G3 Provider-backed affiliate and planner — PENDING.
G4 Social/group chat/reviews and guide marketplace — PENDING.
G5 Safety escalation with explicit trusted-contact authorization — PENDING.
G6 End-to-end production readiness — PENDING.

## Next concrete engineering task
Inspect prisma/schema.prisma for TripMembership, TripLocationSharing, CommunityReview, Comment and Provider; inspect authz, controller tests and web/mobile consumers; produce minimal additive schema/API change proposal and security test matrix. Do not write migrations before that reconciliation.
