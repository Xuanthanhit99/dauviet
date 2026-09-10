/**
 * G04 - Destination Discovery. Small, deliberately deep (not wide) golden
 * fixture proving the G04 model end-to-end: DestinationPlace/Theme/Story/
 * Event composition, discovery-editorial translation fields (tagline/
 * whyVisit), and - for the Japan side - a direct connection to G03
 * historical content via DestinationEvent (no new Japan `Place` row exists
 * - G03 deliberately did not seed one - so the "how X became X" turning
 * point is expressed through the historical EVENT itself, which is exactly
 * what it is: Kyoto's own founding event).
 *
 * Reuses only entities that already exist in the Golden Dataset (G01
 * geography.ts Destinations/Places, V1 events.ts/stories.ts, G03 japan.ts) -
 * no new Destination row, no new historical claim, no unsourced prose.
 * Editorial tagline/whyVisit copy below is original, non-operational, and
 * makes no substantive historical assertion beyond what the linked,
 * already-cited HistoricalFact/Story content itself supports (spec section
 * 51: "discovery adapts to verified knowledge, verified knowledge is not
 * fabricated to fit discovery").
 */

export interface DestinationDiscoveryTranslationPatch {
  locale: string;
  tagline: string;
  whyVisit: string;
}

export interface DestinationDiscoverySpec {
  destinationKey: string;
  translations: DestinationDiscoveryTranslationPatch[];
  themeSlugs: string[];
  places: { placeKey: string; role: 'CORE' | 'LANDMARK' | 'HISTORICAL' | 'CULTURAL' | 'NATURAL' | 'CONTEXTUAL'; sortOrder: number; isFeatured?: boolean }[];
  storyKeys: string[];
  eventLinks: { eventKey: string; sortOrder: number; role?: string }[];
}

export const GOLDEN_DESTINATION_DISCOVERY: DestinationDiscoverySpec[] = [
  {
    destinationKey: 'DESTINATION_HANOI_OLD_QUARTER',
    translations: [
      {
        locale: 'vi',
        tagline: 'Nơi Thăng Long bắt đầu, nghìn năm vẫn còn đó.',
        whyVisit: 'Đi bộ qua 36 phố phường để chạm vào lớp lớp lịch sử của kinh đô Thăng Long xưa, từ Hoàng thành đến Văn Miếu - Quốc Tử Giám.',
      },
      {
        locale: 'en',
        tagline: 'Where Thang Long began, a thousand years ago.',
        whyVisit: "Walk the 36 Streets to trace the layered history of the old Thang Long capital, from the Imperial Citadel to the Temple of Literature.",
      },
    ],
    themeSlugs: ['heritage', 'political'],
    places: [
      { placeKey: 'PLACE_THANG_LONG', role: 'HISTORICAL', sortOrder: 0, isFeatured: true },
      { placeKey: 'PLACE_VAN_MIEU', role: 'CULTURAL', sortOrder: 1 },
    ],
    storyKeys: ['STORY_DOI_DO_THANG_LONG'],
    eventLinks: [{ eventKey: 'EVENT_DOI_DO_1010', sortOrder: 0, role: 'founding' }],
  },
  {
    destinationKey: 'DESTINATION_GION',
    translations: [
      {
        locale: 'vi',
        tagline: 'Khu phố geisha giữa lòng cố đô Heian-kyo.',
        whyVisit: 'Gion là một phần của Kyoto - kinh đô Heian-kyo được lập năm 794, mở đầu thời kỳ Heian của Nhật Bản.',
      },
      {
        locale: 'en',
        tagline: "Kyoto's geisha district, in the heart of the old Heian-kyo capital.",
        whyVisit: 'Gion sits within Kyoto - the Heian-kyo capital founded in 794, which began the Heian period of Japan.',
      },
    ],
    themeSlugs: ['heritage'],
    places: [],
    storyKeys: [],
    eventLinks: [{ eventKey: 'EVENT_JP_HEIAN_CAPITAL', sortOrder: 0, role: 'founding' }],
  },
];
