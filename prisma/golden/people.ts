/**
 * Pure Golden Dataset Person definitions (Phase 10 spec sections 4/14/15).
 * Diacritics restored (see `places.ts` header note - same audit finding,
 * same slug-stability verification applies). Birth/death years/dates and
 * summaries are research-backed (see docs/backend/golden-data/
 * sources-manifest.md); where only a year (or an approximate year) is
 * reliably attested across sources, precision/qualifier say so honestly -
 * never a fabricated day (spec section 17).
 */
import { HistoricalDateSeed, circaYear, exactDate, yearOnly } from './helpers';

export interface PersonAliasSeed {
  alias: string;
  type: 'REGNAL_NAME' | 'TEMPLE_NAME' | 'BIRTH_NAME' | 'TITLE' | 'EPITHET';
}

export interface PersonSeedSpec {
  key: string;
  vi: { name: string; summary?: string };
  en?: { name: string; summary?: string };
  birth?: HistoricalDateSeed;
  death?: HistoricalDateSeed;
  aliases?: PersonAliasSeed[];
}

export const GOLDEN_PEOPLE: PersonSeedSpec[] = [
  {
    key: 'PERSON_LY_CONG_UAN',
    vi: {
      name: 'Lý Công Uẩn',
      summary: 'Vị vua sáng lập nhà Lý, người ban Chiếu dời đô, chuyển kinh đô về Thăng Long năm 1010.',
    },
    en: { name: 'Ly Cong Uan (Emperor Ly Thai To)', summary: 'Founding emperor of the Ly dynasty; moved the capital to Thang Long in 1010.' },
    birth: yearOnly(974),
    death: yearOnly(1028),
    aliases: [{ alias: 'Ly Thai To', type: 'REGNAL_NAME' }],
  },
  {
    key: 'PERSON_TRAN_HUNG_DAO',
    vi: {
      name: 'Trần Hưng Đạo',
      summary: 'Thống lĩnh quân đội nhà Trần, chỉ huy chiến thắng Bạch Đằng năm 1288 trước quân Nguyên Mông.',
    },
    en: { name: 'Tran Hung Dao', summary: 'Commander of Dai Viet forces under the Tran dynasty; led the 1288 victory over the Mongol Yuan fleet at the Bach Dang River.' },
    birth: circaYear(1228),
    death: yearOnly(1300),
    aliases: [
      { alias: 'Trần Quốc Tuấn', type: 'BIRTH_NAME' },
      { alias: 'Hưng Đạo Đại Vương', type: 'TITLE' },
    ],
  },
  {
    key: 'PERSON_LE_LOI',
    vi: {
      name: 'Lê Lợi',
      summary: 'Người lãnh đạo khởi nghĩa Lam Sơn (1418-1427), vị vua sáng lập nhà Lê sơ.',
    },
    en: { name: 'Le Loi (Emperor Le Thai To)', summary: 'Leader of the Lam Son uprising (1418-1427) against Ming rule; founding emperor of the Le dynasty.' },
    birth: yearOnly(1385),
    death: yearOnly(1433),
    aliases: [{ alias: 'Le Thai To', type: 'REGNAL_NAME' }],
  },
  {
    key: 'PERSON_QUANG_TRUNG',
    vi: {
      name: 'Quang Trung',
      summary: 'Hoàng đế nhà Tây Sơn, lãnh đạo chiến thắng Ngọc Hồi - Đống Đa năm 1789.',
    },
    en: { name: 'Emperor Quang Trung (Nguyen Hue)', summary: 'Second emperor of the Tay Son dynasty; led the 1789 victory at Ngoc Hoi-Dong Da.' },
    birth: circaYear(1753),
    death: exactDate(1792, 9, 16),
    aliases: [{ alias: 'Nguyễn Huệ', type: 'BIRTH_NAME' }],
  },
  {
    key: 'PERSON_GIA_LONG',
    vi: {
      name: 'Gia Long',
      summary: 'Vị vua sáng lập nhà Nguyễn, thống nhất đất nước và lên ngôi năm 1802.',
    },
    en: { name: 'Emperor Gia Long', summary: 'Founding emperor of the Nguyen dynasty; unified the country and proclaimed himself emperor in 1802.' },
    birth: yearOnly(1762),
    death: yearOnly(1820),
    aliases: [{ alias: 'Nguyễn Ánh', type: 'BIRTH_NAME' }],
  },
  {
    key: 'PERSON_MINH_MANG',
    vi: {
      name: 'Minh Mạng',
      summary: 'Hoàng đế thứ hai nhà Nguyễn, trị vì từ 1820 đến 1841, thực hiện nhiều cải cách hành chính.',
    },
    en: { name: 'Emperor Minh Mang', summary: 'Second emperor of the Nguyen dynasty, reigning 1820-1841; instituted administrative, postal, and educational reforms.' },
    birth: yearOnly(1791),
    death: yearOnly(1841),
  },
  {
    key: 'PERSON_HO_CHI_MINH',
    vi: {
      name: 'Hồ Chí Minh',
      summary: 'Người sáng lập nước Việt Nam Dân chủ Cộng hòa, đọc Tuyên ngôn Độc lập tại Quảng trường Ba Đình ngày 2/9/1945.',
    },
    en: { name: 'Ho Chi Minh', summary: 'Founder of the Democratic Republic of Vietnam; read the Declaration of Independence at Ba Dinh Square on 2 September 1945.' },
    birth: exactDate(1890, 5, 19),
    death: exactDate(1969, 9, 2),
  },
  {
    key: 'PERSON_VO_NGUYEN_GIAP',
    vi: {
      name: 'Võ Nguyên Giáp',
      summary: 'Đại tướng, chỉ huy Quân đội nhân dân Việt Nam trong chiến dịch Điện Biên Phủ năm 1954.',
    },
    en: { name: 'Vo Nguyen Giap', summary: 'General who commanded Vietnamese People\'s Army forces in the 1954 Dien Bien Phu campaign.' },
    birth: exactDate(1911, 8, 25),
    death: exactDate(2013, 10, 4),
  },
];
