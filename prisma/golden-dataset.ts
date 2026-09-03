/**
 * Pure Golden Dataset definitions (spec sections 37-39) - no Prisma calls,
 * no side effects. `seed.ts` imports this and performs the actual
 * upserts; `apps/api/src/common/historical-date/golden-dataset.spec.ts`
 * imports it too, so the "Hoang Sa / Truong Sa must always be seeded as
 * ARCHIPELAGO" regression check (spec section 7/39) runs against the real
 * data definition, not a hand-copied duplicate, without needing a live DB.
 */
import { PlaceType } from '@prisma/client';

export interface PlaceSeedSpec {
  type: PlaceType;
  vi: { name: string; summary?: string };
  en?: { name: string; summary?: string };
  lat?: number;
  lng?: number;
  aliases?: string[];
}

/**
 * The required-core Place list (spec section 38). Every entry here is a
 * real, publication-safe, uncontroversial gazetteer-style fact - no
 * territorial claims or historical narrative are encoded here beyond name/
 * type/approximate coordinates.
 */
export const GOLDEN_PLACES: PlaceSeedSpec[] = [
  {
    type: PlaceType.CITADEL,
    vi: { name: 'Hoang thanh Thang Long', summary: 'Kinh do cua Viet Nam qua nhieu trieu dai, di san van hoa the gioi UNESCO.' },
    en: { name: 'Imperial Citadel of Thang Long' },
    lat: 21.0359,
    lng: 105.8402,
    aliases: ['Imperial Citadel of Thang Long', 'Thang Long'],
  },
  {
    type: PlaceType.TEMPLE,
    vi: { name: 'Van Mieu Quoc Tu Giam', summary: 'Van mieu va truong dai hoc dau tien cua Viet Nam, xay dung nam 1070.' },
    en: { name: 'Temple of Literature' },
    lat: 21.0288,
    lng: 105.8355,
  },
  {
    type: PlaceType.ARCHAEOLOGICAL_SITE,
    vi: { name: 'Co Loa', summary: 'Kinh do cua nha nuoc Au Lac thoi An Duong Vuong.' },
    lat: 21.1,
    lng: 105.87,
  },
  {
    type: PlaceType.CITADEL,
    vi: { name: 'Hoa Lu', summary: 'Kinh do cua Viet Nam thoi nha Dinh va Tien Le.' },
    lat: 20.265,
    lng: 105.915,
  },
  {
    type: PlaceType.PALACE,
    vi: { name: 'Co do Hue', summary: 'Kinh do cua Viet Nam thoi nha Nguyen, di san van hoa the gioi UNESCO.' },
    en: { name: 'Hue Imperial City' },
    lat: 16.4674,
    lng: 107.5793,
    aliases: ['Hue', 'Imperial City of Hue'],
  },
  {
    type: PlaceType.ARCHAEOLOGICAL_SITE,
    vi: { name: 'My Son', summary: 'Quan the den thap Champa, di san van hoa the gioi UNESCO.' },
    lat: 15.7639,
    lng: 108.1246,
  },
  {
    type: PlaceType.URBAN_AREA,
    vi: { name: 'Hoi An', summary: 'Do thi co, thuong cang lich su, di san van hoa the gioi UNESCO.' },
    lat: 15.8801,
    lng: 108.338,
  },
  {
    type: PlaceType.BATTLEFIELD,
    vi: { name: 'Dien Bien Phu', summary: 'Dia diem chien dich Dien Bien Phu nam 1954.' },
    lat: 21.386,
    lng: 103.0169,
  },
  {
    type: PlaceType.HISTORICAL_SITE,
    vi: { name: 'Dia dao Cu Chi', summary: 'He thong dia dao lich su tai Cu Chi, Thanh pho Ho Chi Minh.' },
    lat: 11.14,
    lng: 106.455,
  },
  {
    type: PlaceType.PALACE,
    vi: { name: 'Dinh Doc Lap', summary: 'Di tich lich su tai Thanh pho Ho Chi Minh.' },
    en: { name: 'Independence Palace' },
    lat: 10.7772,
    lng: 106.6953,
  },
  // Spec section 7 (CRITICAL): both seeded as real ARCHIPELAGO Place rows,
  // never a hard-coded frontend map label. Do not remove or retype these
  // without updating docs/backend/HISTORICAL_DOMAIN.md section "Hoang Sa /
  // Truong Sa" - a regression test asserts on their presence and type.
  {
    type: PlaceType.ARCHIPELAGO,
    vi: { name: 'Hoang Sa', summary: 'Quan dao thuoc Bien Dong.' },
    en: { name: 'Hoang Sa (Paracel Islands)' },
    lat: 16.5,
    lng: 112.0,
    aliases: ['Paracel Islands'],
  },
  {
    type: PlaceType.ARCHIPELAGO,
    vi: { name: 'Truong Sa', summary: 'Quan dao thuoc Bien Dong.' },
    en: { name: 'Truong Sa (Spratly Islands)' },
    lat: 8.6,
    lng: 111.9,
    aliases: ['Spratly Islands'],
  },
];
