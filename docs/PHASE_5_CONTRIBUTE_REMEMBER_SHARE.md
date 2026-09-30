# PHASE 5 — CONTRIBUTE / REMEMBER / SHARE IMPLEMENTATION BASELINE

Status: **IN PROGRESS — DRAFT ONLY — NOT FOR PRODUCTION**

Phase 5 continues the locked lifecycle after travel: CONTRIBUTE → REMEMBER → SHARE → DISCOVER AGAIN. It consumes existing frozen bookmark, community-story/comment and contribution contracts before considering any additive contract-gap work.

## Existing contract inventory

- Bookmarks: authenticated list/add/remove by canonical `EntityKind + targetId`.
- Community stories: public list/detail/comments; authenticated mine/create/update/withdraw/link/vote; moderation/review remain role-gated.
- Contributions: authenticated create/list mine/detail/update/withdraw plus provenance-source submission; reviewer/admin queue remains outside the consumer surface.

## Consumer sequence

1. Remember foundation: saved/bookmarked canonical entities and a personal saved-items surface.
2. Contribute: community story authoring and contributor-owned submission/status surfaces.
3. Trust: COMMUNITY CONTENT remains visually and semantically distinct from VERIFIED KNOWLEDGE; contribution provenance is explicit and never upgraded to verified knowledge by the client.
4. Share: only published/public community material may be shared publicly; drafts, withdrawn items and private contributor workflow are not exposed.
5. Continuity: link contribution/remember surfaces back to canonical discovery without inventing unsupported canonical routes.
6. Loading/error/empty/success states, ownership/RBAC failure states and browser regression.
7. Final Phase 5 audit + exact-current-head Consumer QA.

## Non-negotiable

No fabricated verification, provenance, moderation outcome, historical claim, translation or media. No production deployment. PR #2 remains Draft.
