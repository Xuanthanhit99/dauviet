/**
 * Pure Golden Dataset EditorialSlot definitions (Phase 10 spec section 38).
 * Only a small number of Home slots, each pointing at a real, PUBLISHED
 * Golden entity created earlier in the same seed run - never a hardcoded
 * id (the seed resolves `targetKey` to the real row id at insert time, the
 * same way every other Golden relationship in this dataset does).
 */
import { EntityKind } from '@prisma/client';

export interface EditorialSlotSeed {
  slotKey: string;
  order: number;
  entityKind: EntityKind;
  /** Resolved against the relevant Golden `key` (Story/Journey/Place) at seed time. */
  targetKey: string;
}

export const GOLDEN_EDITORIAL_SLOTS: EditorialSlotSeed[] = [
  { slotKey: 'HOME_FEATURED_STORY', order: 0, entityKind: EntityKind.STORY, targetKey: 'STORY_DOI_DO_THANG_LONG' },
  { slotKey: 'HOME_FEATURED_STORY', order: 1, entityKind: EntityKind.STORY, targetKey: 'STORY_HUE_NGUYEN' },
  { slotKey: 'HOME_JOURNEY', order: 0, entityKind: EntityKind.JOURNEY, targetKey: 'JOURNEY_DI_SAN_MIEN_TRUNG' },
  { slotKey: 'HOME_SEA_ISLANDS', order: 0, entityKind: EntityKind.PLACE, targetKey: 'PLACE_HOANG_SA' },
  { slotKey: 'HOME_SEA_ISLANDS', order: 1, entityKind: EntityKind.PLACE, targetKey: 'PLACE_TRUONG_SA' },
];
