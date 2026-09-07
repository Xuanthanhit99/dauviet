/**
 * Pure Golden Dataset Place definitions (Phase 07 spec sections 37-39,
 * Phase 10 spec sections 4/6/10-12). No Prisma calls, no side effects.
 * `prisma/seed.ts` imports this (via `prisma/golden-dataset.ts`, kept as a
 * stable re-export per docs/backend/HISTORICAL_DOMAIN.md) and performs the
 * actual upserts; `golden-dataset.spec.ts` imports it too, so the "Hoang Sa
 * / Truong Sa must always be seeded as ARCHIPELAGO" regression check runs
 * against the real data definition, not a hand-copied duplicate.
 *
 * Phase 10 audit finding: every `vi.name`/`summary` here previously used
 * diacritic-stripped ASCII text (e.g. "Hoang thanh Thang Long"). That is not
 * high-quality Vietnamese (spec section 23) - it was a placeholder
 * simplification from an earlier phase. Restored to proper Vietnamese with
 * diacritics in this phase; verified this does not change any
 * `canonicalSlug` (slugify's `locale: 'vi'` transliteration already
 * produced the identical ASCII slug either way - confirmed directly before
 * making this change), so no URL/route stability was broken. Diacritic and
 * non-diacritic search queries both resolve the same entity through the
 * existing `immutable_unaccent` search index (Phase 07) - no separate ASCII
 * alias is needed for that purpose.
 */
import { PlaceType } from '@prisma/client';

export interface PlaceSeedSpec {
  key: string;
  type: PlaceType;
  vi: { name: string; summary?: string };
  en?: { name: string; summary?: string };
  lat?: number;
  lng?: number;
  aliases?: string[];
  /**
   * Editorial prominence ranking (spec Phase 07 section 10) - drives map
   * zoom-density and search ranking. Never a popularity/traffic signal;
   * these are widely-known-gazetteer-level rankings (UNESCO status, major
   * historical significance), the same kind of judgment already applied to
   * `HistoricalEvent.importance`. Populated for every golden Place,
   * including Hoang Sa/Truong Sa, so national-zoom map visibility (spec
   * Phase 07 section 11) works through the ordinary importance mechanism.
   */
  importance?: number;
  /**
   * Phase 10 section 11: coordinates for point-only golden Places are
   * representative, sourced from public/institutional mapping (UNESCO
   * nomination documents, official heritage-site portals), never
   * survey-grade. For Hoang Sa/Truong Sa specifically, the coordinate is a
   * single representative point for a large, multi-feature archipelago -
   * explicitly not a claim about any specific feature's precise location,
   * and never a polygon/boundary.
   */
  coordinateNote?: string;
}

/**
 * The required-core Place list (spec Phase 07 section 38, reaffirmed Phase
 * 10 section 4). Every entry is a real, publication-safe, uncontroversial
 * gazetteer-style fact - name/type/approximate coordinates/UNESCO or
 * national-relic status only. Richer, citable claims live in
 * `prisma/golden/facts.ts` with a real Source/Citation, never inline here.
 */
export const GOLDEN_PLACES: PlaceSeedSpec[] = [
  {
    key: 'PLACE_THANG_LONG',
    type: PlaceType.CITADEL,
    vi: {
      name: 'Hoàng thành Thăng Long',
      summary: 'Trung tâm hoàng thành Thăng Long - Hà Nội, di sản văn hóa thế giới UNESCO (2010).',
    },
    en: {
      name: 'Imperial Citadel of Thang Long',
      summary: 'Central Sector of the Imperial Citadel of Thang Long - Hanoi, a UNESCO World Heritage Site inscribed in 2010.',
    },
    lat: 21.0359,
    lng: 105.8402,
    aliases: ['Imperial Citadel of Thang Long', 'Thang Long', 'Thang Long Imperial Citadel'],
    importance: 10,
    coordinateNote: 'Representative point at the Doan Mon/central axis area of the UNESCO core zone.',
  },
  {
    key: 'PLACE_VAN_MIEU',
    type: PlaceType.TEMPLE,
    vi: {
      name: 'Văn Miếu – Quốc Tử Giám',
      summary: 'Văn miếu và trường đại học đầu tiên của Việt Nam, được xây dựng năm 1070 (Văn Miếu) và 1076 (Quốc Tử Giám).',
    },
    en: { name: 'Temple of Literature', summary: 'Temple of Confucius and first national university of Vietnam, founded 1070 (temple) and 1076 (university).' },
    lat: 21.0288,
    lng: 105.8355,
    aliases: ['Temple of Literature'],
    importance: 9,
  },
  {
    key: 'PLACE_CO_LOA',
    type: PlaceType.ARCHAEOLOGICAL_SITE,
    vi: {
      name: 'Cổ Loa',
      summary: 'Kinh đô của nhà nước Âu Lạc thời An Dương Vương, di tích quốc gia đặc biệt.',
    },
    en: { name: 'Co Loa Citadel', summary: 'Capital of the ancient Au Lac kingdom under An Duong Vuong; a special national relic of Vietnam.' },
    lat: 21.1,
    lng: 105.87,
    aliases: ['Co Loa Citadel'],
    importance: 8,
  },
  {
    key: 'PLACE_HOA_LU',
    type: PlaceType.CITADEL,
    vi: {
      name: 'Hoa Lư',
      summary: 'Kinh đô của Việt Nam thời nhà Đinh, Tiền Lê và đầu thời Lý (968-1010), di tích quốc gia đặc biệt.',
    },
    en: { name: 'Hoa Lu Ancient Capital', summary: "Capital of Vietnam under the Dinh and Early Le dynasties, and briefly the early Ly dynasty (968-1010)." },
    lat: 20.265,
    lng: 105.915,
    aliases: ['Hoa Lu Ancient Capital'],
    importance: 8,
  },
  {
    key: 'PLACE_HUE',
    type: PlaceType.PALACE,
    vi: {
      name: 'Cố đô Huế',
      summary: 'Kinh đô của Việt Nam thời nhà Nguyễn (1802-1945), Quần thể di tích Cố đô Huế là di sản văn hóa thế giới UNESCO (1993).',
    },
    en: {
      name: 'Complex of Hue Monuments',
      summary: 'Imperial capital of Vietnam under the Nguyen dynasty (1802-1945); the Complex of Hue Monuments was inscribed as a UNESCO World Heritage Site in 1993.',
    },
    lat: 16.4674,
    lng: 107.5793,
    aliases: ['Hue', 'Imperial City of Hue', 'Complex of Hue Monuments'],
    importance: 10,
  },
  {
    key: 'PLACE_MY_SON',
    type: PlaceType.ARCHAEOLOGICAL_SITE,
    vi: {
      name: 'Mỹ Sơn',
      summary: 'Quần thể đền tháp Champa, di sản văn hóa thế giới UNESCO (1999).',
    },
    en: { name: 'My Son Sanctuary', summary: 'Cluster of Cham temple towers built between the 4th and 13th centuries; inscribed as a UNESCO World Heritage Site in 1999.' },
    lat: 15.7639,
    lng: 108.1246,
    aliases: ['My Son Sanctuary'],
    importance: 9,
  },
  {
    key: 'PLACE_HOI_AN',
    type: PlaceType.URBAN_AREA,
    vi: {
      name: 'Hội An',
      summary: 'Đô thị cổ, thương cảng lịch sử, di sản văn hóa thế giới UNESCO (1999).',
    },
    en: { name: 'Hoi An Ancient Town', summary: 'Historic trading port town; inscribed as a UNESCO World Heritage Site in 1999.' },
    lat: 15.8801,
    lng: 108.338,
    aliases: ['Hoi An Ancient Town'],
    importance: 9,
  },
  {
    key: 'PLACE_DIEN_BIEN_PHU',
    type: PlaceType.BATTLEFIELD,
    vi: {
      name: 'Điện Biên Phủ',
      summary: 'Địa điểm chiến dịch Điện Biên Phủ năm 1954, di tích quốc gia đặc biệt.',
    },
    en: { name: 'Dien Bien Phu', summary: 'Site of the 1954 Battle of Dien Bien Phu; a special national relic of Vietnam.' },
    lat: 21.386,
    lng: 103.0169,
    aliases: ['Dien Bien Phu'],
    importance: 9,
  },
  {
    key: 'PLACE_CU_CHI',
    type: PlaceType.HISTORICAL_SITE,
    vi: {
      name: 'Địa đạo Củ Chi',
      summary: 'Hệ thống địa đạo lịch sử tại Củ Chi, Thành phố Hồ Chí Minh, di tích quốc gia đặc biệt (2015).',
    },
    en: { name: 'Cu Chi Tunnels', summary: 'Historic underground tunnel network in Cu Chi district, Ho Chi Minh City; designated a special national relic in 2015.' },
    lat: 11.14,
    lng: 106.455,
    aliases: ['Cu Chi Tunnels'],
    importance: 8,
  },
  {
    key: 'PLACE_DINH_DOC_LAP',
    type: PlaceType.PALACE,
    vi: {
      name: 'Dinh Độc Lập',
      summary: 'Di tích lịch sử tại Thành phố Hồ Chí Minh, nơi diễn ra sự kiện ngày 30 tháng 4 năm 1975; di tích quốc gia đặc biệt (2009).',
    },
    en: {
      name: 'Independence Palace',
      summary: 'Historic site in Ho Chi Minh City where the events of 30 April 1975 took place; designated a Special National Monument in 2009.',
    },
    lat: 10.7772,
    lng: 106.6953,
    aliases: ['Independence Palace', 'Reunification Palace'],
    importance: 8,
  },
  // Spec section 12 (CRITICAL): both seeded as real ARCHIPELAGO Place rows,
  // never a hard-coded frontend map label. Do not remove or retype these
  // without updating docs/backend/HISTORICAL_DOMAIN.md section "Hoang Sa /
  // Truong Sa" - a regression test asserts on their presence and type. The
  // Place-level summary here stays deliberately neutral/geographic only -
  // the source-backed dossier (historical documentation, current
  // administrative context, other claimants) lives in
  // `prisma/golden/facts.ts` as separate, individually-cited
  // HistoricalFact rows with `sensitivity: TERRITORIAL`, per spec section
  // 12's "do not collapse these into one unqualified statement."
  {
    key: 'PLACE_HOANG_SA',
    type: PlaceType.ARCHIPELAGO,
    vi: { name: 'Hoàng Sa', summary: 'Quần đảo thuộc Biển Đông.' },
    en: { name: 'Hoang Sa (Paracel Islands)' },
    lat: 16.5,
    lng: 112.0,
    aliases: ['Paracel Islands'],
    importance: 9,
    coordinateNote: 'A single representative point for a multi-feature archipelago spanning a wide area - not a claim about any specific reef/island\'s precise location, and not a boundary.',
  },
  {
    key: 'PLACE_TRUONG_SA',
    type: PlaceType.ARCHIPELAGO,
    vi: { name: 'Trường Sa', summary: 'Quần đảo thuộc Biển Đông.' },
    en: { name: 'Truong Sa (Spratly Islands)' },
    lat: 8.6,
    lng: 111.9,
    aliases: ['Spratly Islands'],
    importance: 9,
    coordinateNote: 'A single representative point for a multi-feature archipelago spanning a wide area - not a claim about any specific reef/island\'s precise location, and not a boundary.',
  },
];
