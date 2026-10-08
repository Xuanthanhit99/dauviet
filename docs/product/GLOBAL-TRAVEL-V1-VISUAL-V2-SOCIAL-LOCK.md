# Anciquest Global Travel V1 — Visual V2 lock and Social/Reviews extension
Date: 2026-10-08
Status: USER-APPROVED VISUAL DIRECTION; independent pixel-accurate 1536/390 implementation masters and production screenshots still required.

## Visual lock
Approved direction: Global Travel V2 candidate with cinematic scenic hero, destination/booking search, discover-by-map, destination suggestions, service discovery, local guide cards, personal trip panel, contextual Safety Check-in and integrated AI Travel Assistant. Premium travel application, NOT an editorial/news homepage.
Desktop: generous cinematic hero; map as primary discovery affordance; service and guide interactions; AI panel that does not obscure booking or primary CTAs.
Mobile: portrait hero, quick booking actions, compact AI entry, destination discovery, fixed bottom navigation, trips and safety accessible. Desktop must not be mechanically scaled down.
Preserve composition, hierarchy, spacing, imagery prominence and intent. Mockup ratings, prices, guides and imagery are illustrative only; production must use verified data and rights-cleared real media. Separate master exports 1536 and 390 must be reviewed before implementation; this is a direction lock, not a claim of pixel-perfect master exports.

## Social product contract
- Accounts: public profile with privacy controls, follow and mutual friendship requests, blocking, reporting, discoverability opt-out.
- Private chat: consent-aware direct messages; friend requests are not a precondition for provider inquiries; spam protection, abuse reporting, moderation, retention and deletion policies.
- Travel groups: private/invite-only by default; invite/approve members, roles (owner/admin/member), shared itinerary, polls, expenses, group chat, membership revocation.
- Guide/company chat: verified provider identity/badge, quote request, offer reference, booking-request linkage, dispute trail and business-hours expectations; never expose a traveler's phone/location by default.
- AI Assistant: explicitly distinguish AI messages from human conversations; AI may propose itinerary and summarize public data but cannot impersonate guides or promise bookings.
- Notifications: user-controlled push/email/in-app, quiet hours, consent and abuse controls.
- Realtime: reuse existing architecture only after inspecting actual Socket.IO/queue capabilities; don't assert it exists without source proof.

## Review & comments contract
- Separate first-party Anciquest ratings from Google Places rating. Show source name, review count, timestamp, attribution and external link where permitted; never average Google and Anciquest ratings.
- Google content is only accessible through licensed API/provider terms; no scraping, unauthorized caching, bulk import or review text copying.
- Anciquest reviews: only verified booking/purchase receives Verified Experience label; other user commentary must be visibly distinguished.
- One review per eligible booking/service subject, edit history, verified purchase status, fraud/dedup detection, report/appeal, provider right of reply and moderation audit.
- User comments and threads on places, trips, guides, services and editorial pages with rate limits, report/block, privacy and moderation.
- Review lists: All, Anciquest, Google (when available), Verified Experience, Recent, Highest, Lowest; filtering does not imply Google reviews can be ingested or sorted locally unless licensed API supports it.
- Rating summary must display its own provenance and sample size; no invented scores, review totals, fake guide photos or fake customers.

## New proposed domain contracts (not yet implemented)
SocialProfile, FriendshipRequest, FollowEdge, Conversation, ConversationMember, Message, MessageAttachment, GroupTrip, GroupMembership, GroupPoll, ProviderInquiry, ProviderQuote, Review, ReviewEligibility, ReviewResponse, Comment, CommentReport, ModerationDecision, ExternalRatingSnapshot.
Require explicit access control, ownership checks, audit events, abuse protections, consent and deletion. Do not store precise travel location in chat automatically.

## UI integration
Desktop navigation: Discover, Explore Map, Stays, Experiences, Local Guides, Trips, Community; persistent chat entry and AI assistant entry are visually distinct.
Mobile bottom nav proposed: Home, Explore, Trips, Chats, Profile; Safety inside active trip, accessible within two taps.
Guide/service detail: verified profile, offering, cancellation terms, first-party reviews, external rating attribution, message/quote/book actions.
Destination/place detail: maps, photos, reviews by source, comments and community trips.
Trip detail: group members, itinerary, shared expenses, polls, chat and optional safety.
Never overcrowd homepage with social feed: place social features in contextual surfaces.

## Acceptance gates
A. source-backed audit of existing comments/community/contributions/trips/providers/auth/notifications/realtime and Prisma entities; reuse first.
B. product privacy/permissions and moderation threat model approved.
C. desktop 1536 and mobile 390 independent master exports approved, with chat/reviews/detail subflows.
D. additive API/schema changes, migration tests, permissions, rate limits, realtime fallback, provider and Google licensing verified.
E. real media and ratings provenance; E2E user journeys, accessibility, responsive screenshots, visual side-by-side.
F. stage rollout; PR #15 remains Draft and unchanged until separate decision.
