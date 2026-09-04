import { ModerationStatus } from '@prisma/client';

/**
 * Statuses a piece of moderated content (CommunityStory, Comment, ...) stays
 * reachable at through an ordinary public read (spec Phase 08 section 39):
 * VISIBLE and LIMITED are self-explanatory; LOCKED means "read normally, no
 * new interaction" (section 43), so it stays in this set. UNDER_REVIEW and
 * REMOVED are both withheld from public reads - a flagged-pending-judgment
 * item gets the same public treatment as a removed one until a moderator
 * resolves it one way or the other. Deliberate, documented policy (see
 * docs/backend/COMMUNITY_ARCHITECTURE.md), not an oversight.
 */
export const PUBLIC_VISIBLE_STATUSES: ModerationStatus[] = [
  ModerationStatus.VISIBLE,
  ModerationStatus.LIMITED,
  ModerationStatus.LOCKED,
];

/** Withheld from a public read and shown as a tombstone instead when structural position must be preserved (spec section 34). */
export const TOMBSTONE_STATUSES: ModerationStatus[] = [ModerationStatus.REMOVED, ModerationStatus.UNDER_REVIEW];
