/**
 * Pure Golden Dataset Journey definitions (Phase 10 spec sections 35-37).
 * Every stop references a real Golden Place (spec section 35 - "only use
 * stops that exist in Golden Place data. Do not invent road routes.").
 * No `routeGeometry`/`distanceMeters` is populated for any journey here -
 * these are curated, ordered reference trails (the same product concept
 * `Journey.routeGeometry` already treats as optional, per
 * docs/backend/EDITORIAL_CONTENT.md), never a claim of an actual drivable
 * route between stops. `recommendedDurationMinutes` is a modest, reasonable
 * editorial suggestion for an on-site visit, not a historical or logistics
 * claim (spec section 36).
 */
export interface JourneyStopSeed {
  placeKey: string;
  order: number;
  stopTitle?: string;
  recommendedDurationMinutes?: number;
  notes?: string;
}

export interface JourneySeedSpec {
  key: string;
  slug: string;
  vi: { title: string; summary?: string; description?: string };
  en: { title: string; summary?: string };
  region?: string;
  stops: JourneyStopSeed[];
}

export const GOLDEN_JOURNEYS: JourneySeedSpec[] = [
  {
    key: 'JOURNEY_KINH_DO_XUA',
    slug: 'dau-kinh-do-xua',
    vi: {
      title: 'Dấu kinh đô xưa',
      summary: 'Hành trình theo dấu ba kinh đô cổ của Việt Nam: Cổ Loa, Hoa Lư và Thăng Long.',
      description: 'Từ kinh đô Âu Lạc tại Cổ Loa, đến Hoa Lư thời Đinh - Tiền Lê, và Thăng Long từ năm 1010 - ba địa điểm đánh dấu các giai đoạn hình thành nhà nước Việt Nam thời kỳ đầu.',
    },
    en: {
      title: 'Trail of Ancient Capitals',
      summary: 'A curated trail through three ancient capitals of Vietnam: Co Loa, Hoa Lu, and Thang Long.',
    },
    region: 'Bac Bo (Northern Vietnam)',
    stops: [
      { placeKey: 'PLACE_CO_LOA', order: 1, recommendedDurationMinutes: 90, notes: 'Kinh do nha nuoc Au Lac.' },
      { placeKey: 'PLACE_HOA_LU', order: 2, recommendedDurationMinutes: 120, notes: 'Kinh do thoi Dinh, Tien Le.' },
      { placeKey: 'PLACE_THANG_LONG', order: 3, recommendedDurationMinutes: 120, notes: 'Kinh do tu nam 1010.' },
    ],
  },
  {
    key: 'JOURNEY_DI_SAN_MIEN_TRUNG',
    slug: 'di-san-mien-trung',
    vi: {
      title: 'Di sản miền Trung',
      summary: 'Ba di sản văn hóa thế giới UNESCO tại miền Trung Việt Nam: Cố đô Huế, Mỹ Sơn và Hội An.',
    },
    en: {
      title: 'Central Vietnam Heritage Trail',
      summary: 'Three UNESCO World Heritage Sites in Central Vietnam: the Complex of Hue Monuments, My Son Sanctuary, and Hoi An Ancient Town.',
    },
    region: 'Mien Trung (Central Vietnam)',
    stops: [
      { placeKey: 'PLACE_HUE', order: 1, recommendedDurationMinutes: 180 },
      { placeKey: 'PLACE_MY_SON', order: 2, recommendedDurationMinutes: 120 },
      { placeKey: 'PLACE_HOI_AN', order: 3, recommendedDurationMinutes: 150 },
    ],
  },
  {
    key: 'JOURNEY_DAU_AN_KHANG_CHIEN',
    slug: 'dau-an-khang-chien',
    vi: {
      title: 'Dấu ấn kháng chiến',
      summary: 'Ba địa điểm gắn với các cuộc kháng chiến của Việt Nam trong thế kỷ 20: Điện Biên Phủ, Địa đạo Củ Chi, và Dinh Độc Lập.',
    },
    en: {
      title: 'Marks of the Resistance Wars',
      summary: 'Three sites connected to Vietnam\'s 20th-century wars of independence and reunification: Dien Bien Phu, the Cu Chi Tunnels, and Independence Palace.',
    },
    stops: [
      { placeKey: 'PLACE_DIEN_BIEN_PHU', order: 1, recommendedDurationMinutes: 120, notes: '1954.' },
      { placeKey: 'PLACE_CU_CHI', order: 2, recommendedDurationMinutes: 150 },
      { placeKey: 'PLACE_DINH_DOC_LAP', order: 3, recommendedDurationMinutes: 90, notes: '1975.' },
    ],
  },
];
