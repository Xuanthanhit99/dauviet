/**
 * Pure Golden Dataset Source definitions (Phase 10 spec sections 1/7-9).
 * Every entry here was individually verified against a real external
 * source during this phase's research pass - see
 * docs/backend/golden-data/sources-manifest.md for the full reproducible
 * record (what each source is, what it supports, trust tier, access date).
 *
 * Stable string `key`s (spec section 8) are used as the literal Prisma
 * `id` at seed time - `prisma/facts.ts` references sources by this key,
 * never a generated UUID, so seed relationships stay readable and stable
 * across re-runs.
 *
 * Trust-tier note: UNESCO World Heritage Centre and official Vietnamese
 * government/heritage-management-board pages are treated as Tier A
 * (`credibilityLevel: PRIMARY` - the issuing institution's own record of
 * its own designation). Encyclopaedia Britannica entries are treated as
 * Tier A/B reputable tertiary reference (`credibilityLevel: SECONDARY` -
 * an editorially-controlled synthesis, not a primary document). No
 * blog/SEO/travel-guide/Wikipedia/Fandom page was used as a Source here
 * (Wikipedia was used only to discover leads during research, per policy,
 * never cited as final evidence).
 */
import { SourceCredibility, SourceType } from '@prisma/client';

export interface SourceSeedSpec {
  key: string;
  sourceType: SourceType;
  title: string;
  author?: string;
  organization?: string;
  publisher?: string;
  publicationYear?: number;
  url?: string;
  originalLanguage?: string;
  credibilityLevel: SourceCredibility;
  notes?: string;
}

export const GOLDEN_SOURCES: SourceSeedSpec[] = [
  {
    key: 'SRC_UNESCO_THANG_LONG',
    sourceType: SourceType.UNESCO_RECORD,
    title: 'Central Sector of the Imperial Citadel of Thang Long - Hanoi',
    organization: 'UNESCO World Heritage Centre',
    publicationYear: 2010,
    url: 'https://whc.unesco.org/en/list/1328',
    originalLanguage: 'en',
    credibilityLevel: SourceCredibility.PRIMARY,
    notes: 'Official World Heritage List entry (ID 1328); inscribed 2010, 34th session.',
  },
  {
    key: 'SRC_UNESCO_HUE',
    sourceType: SourceType.UNESCO_RECORD,
    title: 'Complex of Hue Monuments',
    organization: 'UNESCO World Heritage Centre',
    publicationYear: 1993,
    url: 'https://whc.unesco.org/en/list/678',
    originalLanguage: 'en',
    credibilityLevel: SourceCredibility.PRIMARY,
    notes: 'Official World Heritage List entry (ID 678); inscribed 1993, 17th session, criterion (iv).',
  },
  {
    key: 'SRC_UNESCO_MY_SON',
    sourceType: SourceType.UNESCO_RECORD,
    title: 'My Son Sanctuary',
    organization: 'UNESCO World Heritage Centre',
    publicationYear: 1999,
    url: 'https://whc.unesco.org/en/list/949',
    originalLanguage: 'en',
    credibilityLevel: SourceCredibility.PRIMARY,
    notes: 'Official World Heritage List entry (ID 949); inscribed 1 December 1999.',
  },
  {
    key: 'SRC_UNESCO_HOI_AN',
    sourceType: SourceType.UNESCO_RECORD,
    title: 'Hoi An Ancient Town',
    organization: 'UNESCO World Heritage Centre',
    publicationYear: 1999,
    url: 'https://whc.unesco.org/en/list/948',
    originalLanguage: 'en',
    credibilityLevel: SourceCredibility.PRIMARY,
    notes: 'Official World Heritage List entry (ID 948); inscribed 4 December 1999, 23rd session.',
  },
  {
    key: 'SRC_GOV_CO_LOA',
    sourceType: SourceType.GOVERNMENT_DOCUMENT,
    title: 'Co Loa Special National Relic',
    organization: 'Co Loa Special National Relic Management Board',
    url: 'https://thanhcoloa.vn/en/co-loa-special-national-relic-recognized-as-tourist-attraction',
    originalLanguage: 'en',
    credibilityLevel: SourceCredibility.PRIMARY,
    notes: 'Official relic-management-board site; classified a national historical/cultural relic in 1962, recognized as a special tourist site by Hanoi People\'s Committee Decision 4839/QD-UBND (15 Nov 2021).',
  },
  {
    key: 'SRC_GOV_HOA_LU',
    sourceType: SourceType.GOVERNMENT_DOCUMENT,
    title: 'Hoa Lu Ancient Capital',
    organization: 'Ninh Binh Provincial Department of Tourism',
    url: 'https://sodulich.ninhbinh.gov.vn/en/news-events/hoa-lu-ancient-capital-1478.html',
    originalLanguage: 'en',
    credibilityLevel: SourceCredibility.PRIMARY,
    notes: 'Official provincial government tourism-department page.',
  },
  {
    key: 'SRC_GOV_DOC_LAP',
    sourceType: SourceType.GOVERNMENT_DOCUMENT,
    title: 'History of Independence Palace',
    organization: 'Independence Palace Relic Management Board',
    url: 'https://dinhdoclap.gov.vn/en/history-of-the-independent-palace/',
    originalLanguage: 'en',
    credibilityLevel: SourceCredibility.PRIMARY,
    notes: 'Official relic-site government portal; Special National Monument, PM Decision No. 1272/QD-TTg (12 Aug 2009); event of 30 April 1975 (10:45am, tank 843).',
  },
  {
    key: 'SRC_GOV_CU_CHI',
    sourceType: SourceType.GOVERNMENT_DOCUMENT,
    title: 'Di tich lich su Dia dao Cu Chi (Cu Chi Tunnels Historical Relic)',
    organization: 'Cuc Di san van hoa - Dept. of Cultural Heritage, Ministry of Culture, Sports and Tourism',
    url: 'https://dsvh.gov.vn/di-tich-lich-su-dia-dao-cu-chi-1490',
    originalLanguage: 'vi',
    credibilityLevel: SourceCredibility.PRIMARY,
    notes: 'Official national cultural-heritage database entry. Special National Relic per PM Decision No. 2367/QD-TTg (23 Dec 2015).',
  },
  {
    key: 'SRC_MOFA_VN_HOANG_SA_TRUONG_SA',
    sourceType: SourceType.GOVERNMENT_DOCUMENT,
    title: 'Vietnam has full legal basis to assert sovereignty over Hoang Sa',
    organization: 'Ministry of Foreign Affairs of Vietnam',
    url: 'https://mofa.gov.vn/web/ministry-of-foreign-affairs/detail/chi-tiet/vietnam-has-full-legal-basis-to-assert-sovereignty-over-hoang-sa-52-82.html',
    originalLanguage: 'en',
    credibilityLevel: SourceCredibility.PRIMARY,
    notes: 'Vietnam\'s own official government position statement - cited AS a stated position, not as an adjudicated international-law conclusion. Also see the 1975/1981/1985 MOFA white papers on the Hoang Sa/Truong Sa archipelagoes (not independently re-verified page-by-page in this phase; referenced for context in research-notes.md).',
  },
  {
    key: 'SRC_BRITANNICA_SPRATLY',
    sourceType: SourceType.WEBSITE,
    title: 'Spratly Islands',
    organization: 'Encyclopaedia Britannica',
    url: 'https://www.britannica.com/place/Spratly-Islands',
    originalLanguage: 'en',
    credibilityLevel: SourceCredibility.SECONDARY,
    notes: 'Neutral tertiary reference confirming multiple claimants (Vietnam, China, Taiwan, and in part Malaysia/Philippines/Brunei) over the Spratly Islands.',
  },
  {
    key: 'SRC_NAVALHISTORY_PARACELS_1974',
    sourceType: SourceType.WEBSITE,
    title: 'The 1974 Paracels Sea Battle: A Campaign Appraisal',
    author: 'Toshi Yoshihara',
    organization: 'U.S. Naval War College Review (Naval History Magazine, USNI)',
    publicationYear: 2016,
    url: 'https://www.andrewerickson.com/wp-content/uploads/2018/02/Yoshihara_Toshi_The-1974-Paracels-Sea-Battle-A-Campaign-Appraisal_NWCR_2016-Spring_41-65.pdf',
    originalLanguage: 'en',
    credibilityLevel: SourceCredibility.SECONDARY,
    notes: 'Peer-reviewed naval-history journal article (Naval War College Review, Spring 2016) on the 19 January 1974 battle between Chinese and South Vietnamese forces near the Paracel Islands.',
  },
  {
    key: 'SRC_GOV_THANG_LONG_EDICT',
    sourceType: SourceType.GOVERNMENT_DOCUMENT,
    title: 'The royal edict on the transfer of the capital of Thang Long in the year 1010',
    organization: 'Thang Long - Government Portal (Cong Thong tin dien tu Chinh phu)',
    url: 'https://thanglong.chinhphu.vn/english/the-royal-edict-on-the-transfer-of-the-capital-of-thang-long-in-the-year-1010-110109.htm',
    originalLanguage: 'en',
    credibilityLevel: SourceCredibility.PRIMARY,
    notes: 'Official Vietnamese government-portal page on the Chieu doi do (Edict on the Transfer of the Capital), fall 1010.',
  },
  {
    key: 'SRC_NHANDAN_VAN_MIEU',
    sourceType: SourceType.NEWSPAPER,
    title: 'Van Mieu - Quoc Tu Giam: An eternal symbol of a thousand-year-old civilisation',
    organization: 'Nhan Dan (Communist Party of Vietnam official newspaper)',
    url: 'https://special.nhandan.vn/van-mieu-en/index.html',
    originalLanguage: 'en',
    credibilityLevel: SourceCredibility.SECONDARY,
    notes: 'Confirms founding by Emperor Ly Thanh Tong in 1070 (temple) and 1076 (Quoc Tu Giam academy).',
  },
  {
    key: 'SRC_VNA_HS_TS_ADMIN',
    sourceType: SourceType.GOVERNMENT_DOCUMENT,
    title: 'Hoang Sa - sacred part of Vietnam\'s territory',
    organization: 'Vietnam News Agency (Thong tan xa Viet Nam) - VietnamPlus',
    url: 'https://en.vietnamplus.vn/hoang-sa-sacred-part-of-vietnams-territory-post276491.vnp',
    originalLanguage: 'en',
    credibilityLevel: SourceCredibility.SECONDARY,
    notes: 'Vietnam\'s official state news agency, describing Vietnam\'s administrative organization of Hoang Sa (Da Nang) and Truong Sa (Khanh Hoa) districts. Cited as Vietnam\'s administrative-claim context, not as international-law adjudication.',
  },
  {
    key: 'SRC_BRITANNICA_TRAN_HUNG_DAO',
    sourceType: SourceType.WEBSITE,
    title: 'Tran Hung Dao',
    organization: 'Encyclopaedia Britannica',
    url: 'https://www.britannica.com/biography/Tran-Hung-Dao',
    originalLanguage: 'en',
    credibilityLevel: SourceCredibility.SECONDARY,
    notes: 'Also the source for the Battle of Bach Dang (9 April 1288) date/summary.',
  },
  {
    key: 'SRC_BRITANNICA_LE_LOI',
    sourceType: SourceType.WEBSITE,
    title: 'Le Loi',
    organization: 'Encyclopaedia Britannica',
    url: 'https://www.britannica.com/biography/Le-Loi',
    originalLanguage: 'en',
    credibilityLevel: SourceCredibility.SECONDARY,
  },
  {
    key: 'SRC_BRITANNICA_QUANG_TRUNG',
    sourceType: SourceType.WEBSITE,
    title: 'Quang Trung',
    organization: 'Encyclopaedia Britannica',
    url: 'https://www.britannica.com/biography/Quang-Trung',
    originalLanguage: 'en',
    credibilityLevel: SourceCredibility.SECONDARY,
  },
  {
    key: 'SRC_QDND_NGOC_HOI_DONG_DA',
    sourceType: SourceType.NEWSPAPER,
    title: 'Chien thang Dong Da - Thang Long dau Xuan Ky Dau (1789)',
    organization: 'Quan doi nhan dan (Vietnam Peoples Army Newspaper)',
    url: 'https://www.qdnd.vn/quoc-phong-an-ninh/nghe-thuat-quan-su-vn/chien-thang-dong-da-thang-long-dau-xuan-ky-dau-1789-764936',
    originalLanguage: 'vi',
    credibilityLevel: SourceCredibility.SECONDARY,
    notes: 'Confirms the lunar-to-Gregorian date conversion for the Ngoc Hoi-Dong Da victory (5th day of Tet Ky Dau = 30 January 1789).',
  },
  {
    key: 'SRC_BRITANNICA_GIA_LONG',
    sourceType: SourceType.WEBSITE,
    title: 'Gia Long',
    organization: 'Encyclopaedia Britannica',
    url: 'https://www.britannica.com/biography/Gia-Long',
    originalLanguage: 'en',
    credibilityLevel: SourceCredibility.SECONDARY,
  },
  {
    key: 'SRC_BRITANNICA_MINH_MANG',
    sourceType: SourceType.WEBSITE,
    title: 'Minh Mang',
    organization: 'Encyclopaedia Britannica',
    url: 'https://www.britannica.com/biography/Minh-Mang',
    originalLanguage: 'en',
    credibilityLevel: SourceCredibility.SECONDARY,
  },
  {
    key: 'SRC_BRITANNICA_HO_CHI_MINH',
    sourceType: SourceType.WEBSITE,
    title: 'Ho Chi Minh',
    organization: 'Encyclopaedia Britannica',
    url: 'https://www.britannica.com/biography/Ho-Chi-Minh',
    originalLanguage: 'en',
    credibilityLevel: SourceCredibility.SECONDARY,
  },
  {
    key: 'SRC_BRITANNICA_VO_NGUYEN_GIAP',
    sourceType: SourceType.WEBSITE,
    title: 'Vo Nguyen Giap',
    organization: 'Encyclopaedia Britannica',
    url: 'https://www.britannica.com/biography/Vo-Nguyen-Giap',
    originalLanguage: 'en',
    credibilityLevel: SourceCredibility.SECONDARY,
  },
  {
    key: 'SRC_BRITANNICA_DIEN_BIEN_PHU',
    sourceType: SourceType.WEBSITE,
    title: 'Battle of Dien Bien Phu',
    organization: 'Encyclopaedia Britannica',
    url: 'https://www.britannica.com/event/Battle-of-Dien-Bien-Phu',
    originalLanguage: 'en',
    credibilityLevel: SourceCredibility.SECONDARY,
  },
];
