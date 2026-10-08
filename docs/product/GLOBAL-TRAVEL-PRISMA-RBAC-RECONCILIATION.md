# Global Travel — Prisma / API / RBAC reconciliation
Date: 2026-10-08
Source: main prisma/schema.prisma, trips/trip-authorization.service.ts, trips/trip-members.controller.ts, trips/trip-location-sharing.service.ts, community/community.service.ts, comments/comments.controller.ts.
Status: STATIC AUDIT COMPLETE for named models and controllers; no migrations or tests executed.

## Existing schema — verified
User: locale defaults to vi; avatar and visitedPlacesPublic privacy toggle; relations to comments, community stories, trip memberships/invitations, trip location sharing and affiliate sessions.
Comment: targetType EntityKind + targetId, author, parent/replies, moderation status, votes, depth, timestamps.
TripMember: unique(tripId,userId), role; owner is NOT stored as member.
TripInvitation: tokenHash only, expiresAt, status; invitation alone never grants membership.
TripCollaborationEvent: activity trail for trip membership and governance changes.
TripLocationSharing: unique(tripId,userId), ACTIVE/STOPPED/EXPIRED, explicit self-consent, finite expiresAt.
TripMemberLocation: unique per trip/user latest coordinate with freshness TTL; not GPS history.
AffiliateSession/Click: commercial referral tracking, not evidence of live provider contracts.
No Conversation, Message, Friendship, SafetyCheckIn, TrustedContact models found in model declaration scan.

## Authorization invariants — preserve
TripAuthorizationService centralizes VIEW_TRIP, EDIT_TRIP, GENERATE_ESTIMATE, MANAGE_MEMBERS, MANAGE_INVITATIONS, TRANSFER_OWNERSHIP, ARCHIVE_TRIP.
OWNER virtual from Trip.ownerId; EDITOR planning permissions; VIEWER read-only.
DB is re-read on every authorization, not a stale JWT membership claim.
Existing trip location self-consent is independent of trip membership, finite and revocable. Never automatically share it with chat participants or contacts.

## Minimal additive schema proposal — NOT YET APPLIED
1. UserConnection (requester, addressee, status PENDING/ACCEPTED/BLOCKED, unique normalized pair, moderation metadata). Block must supersede messaging and discoverability.
2. Conversation (DIRECT/GROUP_TRIP/PROVIDER), ConversationParticipant (role, joined/left, lastReadAt), Message (author, body, attachment media references, moderation status, createdAt, editedAt, deletedAt); enforce group-trip membership dynamically and per-message server authorization.
3. TripPoll/TripPollOption/TripPollVote attached to existing Trip; voting requires VIEW_TRIP, poll creation EDIT_TRIP, manage closure OWNER/EDITOR as explicitly approved.
4. FirstPartyReview (reviewer, target entity, rating 1..5, booking eligibility reference, moderation, edit audit), ProviderReply; reuse Comment for discussion if target EntityKind supports new review targets, otherwise additive typed association.
5. ExternalRatingReference (provider, external place ID, attribution, source timestamp, permitted summary only); never ingest or average unlicensed Google reviews.
6. TripSafetyPlan (owner, trip, deadline, grace window, state, consent snapshot), TrustedContact (verified channel and acceptance), SafetyEscalation (idempotency key, state transitions, delivery log, revocation), SafetyAccessAudit. No automatic public missing-person alert.

## API design gates
- GET/POST /v1/conversations and /v1/conversations/:id/messages: authenticate; authorize participant for every read/write; paginate; rate-limit; no cross-trip leakage.
- POST /v1/trips/:id/polls and vote: use centralized TripAuthorizationService; ensure membership revoked immediately removes access.
- GET/POST /v1/reviews: distinguish verified booking review from community commentary; ownership/moderation; provider response authorization.
- Safety routes require user opt-in, verified contact acceptance, privacy-scoped release, audit; no direct public coordinate access.
- Review target enum/booking reference and Prisma relation names must be inspected before migration, especially potential cascade and data retention issues.

## Mandatory tests before implementation PASS
- stranger, VIEWER, EDITOR, OWNER, removed member, pending invite, blocked user; read/write/reconnect chat authorization.
- concurrent duplicate message/idempotency, edits/deletes, attachment permissions, moderation and spam limits.
- fake booking review, repeat review, provider replying as someone else, external rating source confusion.
- location sharing revoked/expired; stale location never shown; no access from membership alone.
- missed check-in and delayed queue race; contact verification, cancellation, false alarm, time zones, retry and no public broadcast.
- Prisma migration on existing populated DB; rollback plan, exact-head API tests, web/mobile 1536/390 screenshots.

## Next
Design specific DTOs and ERD after reading current EntityKind enum, booking references and community verification models. Build a single small vertical slice after user-approved Desktop/Mobile master and security contract. No duplicate tables or blind migrations.
