/**
 * Pure Golden Dataset Global Geography definitions (G01 spec section 26-27).
 * No Prisma calls, no side effects - mirrors the existing
 * `prisma/golden/places.ts` convention exactly. This is architectural
 * representative data proving the model, not a historical-research phase:
 * summaries stay conservative, no UNESCO/heritage claim is asserted unless
 * it is already backed elsewhere (none is asserted here).
 *
 * Deliberately does NOT model Vietnam's provincial administrative structure
 * (spec section 26's "current administrative reality must be checked...OR
 * choose another stable region"): Vietnam went through provincial mergers
 * in the mid-2020s, so this dataset seeds only the two centrally-governed
 * municipalities (Ha Noi, Da Nang) as Regions - long-stable, unambiguous
 * administrative facts untouched by that reorganisation - and seeds Hoi An
 * as a Region-less City directly under Country. That also doubles as the
 * required proof that Region is optional (spec section 4/9): "Country ->
 * City" and "Country -> City -> Destination" are both exercised here,
 * alongside the full "Country -> Region -> City -> Destination" chain on
 * the Japan side.
 */
import { DestinationType, RegionType } from '@prisma/client';

interface LocalizedText {
  name: string;
  shortDescription?: string;
  description?: string;
  summary?: string;
}

export interface CountrySeedSpec {
  key: string;
  iso2: string;
  iso3: string;
  defaultLocale: string;
  defaultCurrency: string;
  lat: number;
  lng: number;
  vi: LocalizedText;
  en: LocalizedText;
  /** Locale-agnostic romanizations (EntityAlias with locale=""). */
  aliases?: string[];
  /** Locale-specific aliases in the country's own script (spec section 13). */
  localizedAliases?: { locale: string; alias: string }[];
}

export interface RegionSeedSpec {
  key: string;
  countryKey: string;
  type: RegionType;
  lat: number;
  lng: number;
  vi: LocalizedText;
  en: LocalizedText;
}

export interface CitySeedSpec {
  key: string;
  countryKey: string;
  /** Optional - proves Region is not mandatory (spec section 4/9). */
  regionKey?: string;
  timezone: string;
  lat: number;
  lng: number;
  importance: number;
  vi: LocalizedText;
  en: LocalizedText;
  aliases?: string[];
}

export interface DestinationSeedSpec {
  key: string;
  countryKey: string;
  regionKey?: string;
  cityKey?: string;
  type: DestinationType;
  lat: number;
  lng: number;
  importance: number;
  vi: LocalizedText;
  en: LocalizedText;
}

export const GOLDEN_COUNTRIES: CountrySeedSpec[] = [
  {
    key: 'COUNTRY_VN',
    iso2: 'VN',
    iso3: 'VNM',
    defaultLocale: 'vi',
    defaultCurrency: 'VND',
    lat: 14.0583,
    lng: 108.2772,
    vi: { name: 'Việt Nam', shortDescription: 'Quốc gia Đông Nam Á với lịch sử và văn hóa lâu đời.' },
    en: { name: 'Vietnam', shortDescription: 'A Southeast Asian country with a long history and culture.' },
    aliases: ['Viet Nam'],
  },
  {
    key: 'COUNTRY_JP',
    iso2: 'JP',
    iso3: 'JPN',
    defaultLocale: 'ja',
    defaultCurrency: 'JPY',
    lat: 36.2048,
    lng: 138.2529,
    vi: { name: 'Nhật Bản', shortDescription: 'Quốc đảo Đông Á nổi tiếng với di sản văn hóa và ẩm thực.' },
    en: { name: 'Japan', shortDescription: 'An East Asian island country known for its cultural heritage and cuisine.' },
    aliases: ['Nihon', 'Nippon'],
    localizedAliases: [{ locale: 'ja', alias: '日本' }],
  },
];

export const GOLDEN_REGIONS: RegionSeedSpec[] = [
  {
    key: 'REGION_HA_NOI',
    countryKey: 'COUNTRY_VN',
    type: RegionType.METROPOLITAN_CITY,
    lat: 21.0278,
    lng: 105.8342,
    vi: { name: 'Hà Nội' },
    en: { name: 'Hanoi' },
  },
  {
    key: 'REGION_DA_NANG',
    countryKey: 'COUNTRY_VN',
    type: RegionType.METROPOLITAN_CITY,
    lat: 16.0544,
    lng: 108.2022,
    vi: { name: 'Đà Nẵng' },
    en: { name: 'Da Nang' },
  },
  {
    key: 'REGION_TOKYO',
    countryKey: 'COUNTRY_JP',
    // Tokyo Metropolis ("to") is a direct-administration prefecture-level
    // unit, not an ordinary prefecture (spec section 26) - reuses the same
    // METROPOLITAN_CITY type as Vietnam's centrally-governed cities, which
    // is semantically the closest fit rather than inventing a Japan-only type.
    type: RegionType.METROPOLITAN_CITY,
    lat: 35.6895,
    lng: 139.6917,
    vi: { name: 'Tokyo' },
    en: { name: 'Tokyo Metropolis' },
  },
  {
    key: 'REGION_KYOTO_PREF',
    countryKey: 'COUNTRY_JP',
    type: RegionType.PREFECTURE,
    lat: 35.0212,
    lng: 135.7556,
    vi: { name: 'Tỉnh Kyoto' },
    en: { name: 'Kyoto Prefecture' },
  },
];

export const GOLDEN_CITIES: CitySeedSpec[] = [
  {
    key: 'CITY_HA_NOI',
    countryKey: 'COUNTRY_VN',
    regionKey: 'REGION_HA_NOI',
    timezone: 'Asia/Ho_Chi_Minh',
    lat: 21.0285,
    lng: 105.8542,
    importance: 10,
    vi: { name: 'Hà Nội', summary: 'Thủ đô nghìn năm văn hiến của Việt Nam.' },
    en: { name: 'Hanoi', summary: "Vietnam's thousand-year-old capital city." },
  },
  {
    key: 'CITY_HOI_AN',
    countryKey: 'COUNTRY_VN',
    // No regionKey (spec section 4/9/26 - Country -> City directly).
    timezone: 'Asia/Ho_Chi_Minh',
    lat: 15.8801,
    lng: 108.338,
    importance: 8,
    vi: { name: 'Hội An', summary: 'Đô thị cổ ven sông Thu Bồn, nổi tiếng với phố cổ và đèn lồng.' },
    en: { name: 'Hoi An', summary: 'A historic riverside town known for its ancient town and lanterns.' },
  },
  {
    key: 'CITY_TOKYO',
    countryKey: 'COUNTRY_JP',
    regionKey: 'REGION_TOKYO',
    timezone: 'Asia/Tokyo',
    lat: 35.6762,
    lng: 139.6503,
    importance: 10,
    vi: { name: 'Tokyo', summary: 'Thủ đô hiện đại và trung tâm kinh tế của Nhật Bản.' },
    en: { name: 'Tokyo', summary: "Japan's modern capital and economic center." },
  },
  {
    key: 'CITY_KYOTO',
    countryKey: 'COUNTRY_JP',
    regionKey: 'REGION_KYOTO_PREF',
    timezone: 'Asia/Tokyo',
    lat: 35.0116,
    lng: 135.7681,
    importance: 9,
    vi: { name: 'Kyoto', summary: 'Cố đô Nhật Bản, trung tâm di sản văn hóa và đền chùa.' },
    en: { name: 'Kyoto', summary: "Japan's former imperial capital, a center of heritage temples and shrines." },
    aliases: ['Kyōto'],
  },
];

export const GOLDEN_DESTINATIONS: DestinationSeedSpec[] = [
  {
    key: 'DESTINATION_HANOI_OLD_QUARTER',
    countryKey: 'COUNTRY_VN',
    regionKey: 'REGION_HA_NOI',
    cityKey: 'CITY_HA_NOI',
    type: DestinationType.HISTORIC_DISTRICT,
    lat: 21.0343,
    lng: 105.8508,
    importance: 9,
    vi: { name: 'Phố cổ Hà Nội', summary: 'Khu phố buôn bán truyền thống với 36 phố phường.' },
    en: { name: 'Hanoi Old Quarter', summary: 'A traditional trading district known as the "36 Streets".' },
  },
  {
    key: 'DESTINATION_HOI_AN_ANCIENT_TOWN',
    countryKey: 'COUNTRY_VN',
    // No regionKey - inherits the region-less City above (spec section 11).
    cityKey: 'CITY_HOI_AN',
    type: DestinationType.HERITAGE_AREA,
    lat: 15.8794,
    lng: 108.335,
    importance: 9,
    vi: { name: 'Phố cổ Hội An', summary: 'Khu đô thị cổ ven sông với kiến trúc giao thoa nhiều nền văn hóa.' },
    en: { name: 'Hoi An Ancient Town', summary: 'A well-preserved riverside old town blending several cultural influences.' },
  },
  {
    key: 'DESTINATION_GION',
    countryKey: 'COUNTRY_JP',
    regionKey: 'REGION_KYOTO_PREF',
    cityKey: 'CITY_KYOTO',
    type: DestinationType.HISTORIC_DISTRICT,
    lat: 35.0037,
    lng: 135.7752,
    importance: 8,
    vi: { name: 'Gion', summary: 'Khu phố geisha truyền thống của Kyoto.' },
    en: { name: 'Gion', summary: "Kyoto's traditional geisha district." },
  },
  {
    key: 'DESTINATION_ARASHIYAMA',
    countryKey: 'COUNTRY_JP',
    regionKey: 'REGION_KYOTO_PREF',
    cityKey: 'CITY_KYOTO',
    type: DestinationType.NATURAL_AREA,
    lat: 35.0094,
    lng: 135.6667,
    importance: 8,
    vi: { name: 'Arashiyama', summary: 'Khu vực nổi tiếng với rừng tre và cảnh quan núi sông ở ngoại ô Kyoto.' },
    en: { name: 'Arashiyama', summary: 'An area on the outskirts of Kyoto known for its bamboo grove and mountain-river scenery.' },
  },
];
