/**
 * Pure Golden Dataset HistoricalEvent definitions (Phase 10 spec sections
 * 4/16/17). Diacritics restored (see `places.ts` header note). Dates
 * upgraded to day-precision only where independently corroborated by a
 * reputable source (see docs/backend/golden-data/sources-manifest.md) -
 * otherwise left at year precision, never a fabricated day.
 */
import { HistoricalDateSeed, exactDate, yearOnly } from './helpers';

export interface EventSeedSpec {
  key: string;
  vi: { title: string; summary?: string };
  en?: { title: string; summary?: string };
  date: HistoricalDateSeed;
  rangeEndYear?: number;
  importance?: number;
  eraKey: string;
  themeKeys: string[];
  placeKeys?: string[];
  personKeys?: string[];
}

export const GOLDEN_EVENTS: EventSeedSpec[] = [
  {
    key: 'EVENT_DOI_DO_1010',
    vi: { title: 'Dời đô về Thăng Long năm 1010', summary: 'Lý Công Uẩn dời kinh đô từ Hoa Lư về Đại La, đổi tên thành Thăng Long.' },
    en: { title: 'Move of the Capital to Thang Long (1010)', summary: 'Emperor Ly Cong Uan moved the capital from Hoa Lu to Dai La, renaming it Thang Long.' },
    date: yearOnly(1010),
    importance: 9,
    eraKey: 'ERA_LY',
    themeKeys: ['political', 'heritage'],
    placeKeys: ['PLACE_THANG_LONG'],
    personKeys: ['PERSON_LY_CONG_UAN'],
  },
  {
    key: 'EVENT_BACH_DANG_1288',
    vi: { title: 'Chiến thắng Bạch Đằng năm 1288', summary: 'Chiến thắng của quân đội nhà Trần trước quân Nguyên Mông trên sông Bạch Đằng, ngày 9/4/1288.' },
    en: { title: 'Victory at the Battle of Bach Dang (1288)', summary: 'Tran dynasty forces defeated the Mongol Yuan fleet on the Bach Dang River on 9 April 1288.' },
    date: exactDate(1288, 4, 9),
    importance: 9,
    eraKey: 'ERA_TRAN',
    themeKeys: ['military'],
    personKeys: ['PERSON_TRAN_HUNG_DAO'],
  },
  {
    key: 'EVENT_LAM_SON',
    vi: { title: 'Khởi nghĩa Lam Sơn', summary: 'Cuộc khởi nghĩa do Lê Lợi lãnh đạo chống quân Minh, 1418-1427.' },
    en: { title: 'The Lam Son Uprising', summary: 'Uprising led by Le Loi against Ming occupation, 1418-1427.' },
    date: yearOnly(1418),
    rangeEndYear: 1427,
    importance: 8,
    eraKey: 'ERA_LE_SO',
    themeKeys: ['military'],
    personKeys: ['PERSON_LE_LOI'],
  },
  {
    key: 'EVENT_NGOC_HOI_DONG_DA',
    vi: { title: 'Chiến thắng Ngọc Hồi - Đống Đa năm 1789', summary: 'Chiến thắng của nghĩa quân Tây Sơn do Quang Trung lãnh đạo trước quân Thanh, mùng 5 Tết Kỷ Dậu (30/1/1789).' },
    en: { title: 'Victory at Ngoc Hoi-Dong Da (1789)', summary: 'Tay Son forces led by Emperor Quang Trung defeated Qing forces on the 5th day of Tet, 30 January 1789.' },
    date: exactDate(1789, 1, 30),
    importance: 9,
    eraKey: 'ERA_TAY_SON',
    themeKeys: ['military'],
    personKeys: ['PERSON_QUANG_TRUNG'],
  },
  {
    key: 'EVENT_NGUYEN_FOUNDING',
    vi: { title: 'Thành lập triều Nguyễn', summary: 'Nguyễn Ánh lên ngôi, lấy hiệu Gia Long, thành lập triều Nguyễn năm 1802.' },
    en: { title: 'Founding of the Nguyen Dynasty', summary: 'Nguyen Anh proclaimed himself Emperor Gia Long, founding the Nguyen dynasty in 1802.' },
    date: yearOnly(1802),
    importance: 7,
    eraKey: 'ERA_NGUYEN',
    themeKeys: ['political'],
    placeKeys: ['PLACE_HUE'],
    personKeys: ['PERSON_GIA_LONG'],
  },
  {
    key: 'EVENT_TUYEN_NGON_1945',
    vi: { title: 'Tuyên ngôn Độc lập 1945', summary: 'Hồ Chí Minh đọc Tuyên ngôn Độc lập tại Quảng trường Ba Đình ngày 2/9/1945, khai sinh nước Việt Nam Dân chủ Cộng hòa.' },
    en: { title: 'The 1945 Declaration of Independence', summary: 'Ho Chi Minh read the Declaration of Independence at Ba Dinh Square on 2 September 1945, founding the Democratic Republic of Vietnam.' },
    date: exactDate(1945, 9, 2),
    importance: 10,
    eraKey: 'ERA_MODERN',
    themeKeys: ['political'],
    personKeys: ['PERSON_HO_CHI_MINH'],
  },
  {
    key: 'EVENT_DIEN_BIEN_PHU_1954',
    vi: { title: 'Chiến thắng Điện Biên Phủ năm 1954', summary: 'Chiến dịch quyết định chấm dứt chiến tranh Đông Dương lần thứ nhất, kết thúc ngày 7/5/1954.' },
    en: { title: 'Victory at Dien Bien Phu (1954)', summary: 'Decisive campaign that ended the First Indochina War, concluding on 7 May 1954.' },
    date: exactDate(1954, 5, 7),
    importance: 10,
    eraKey: 'ERA_MODERN',
    themeKeys: ['military', 'territorial'],
    placeKeys: ['PLACE_DIEN_BIEN_PHU'],
    personKeys: ['PERSON_VO_NGUYEN_GIAP'],
  },
  {
    key: 'EVENT_30_THANG_4',
    vi: { title: '30 tháng 4 năm 1975', summary: 'Ngày thống nhất đất nước Việt Nam.' },
    en: { title: '30 April 1975', summary: 'Day of national reunification of Vietnam.' },
    date: exactDate(1975, 4, 30),
    importance: 10,
    eraKey: 'ERA_MODERN',
    themeKeys: ['political'],
    placeKeys: ['PLACE_DINH_DOC_LAP'],
  },
];
