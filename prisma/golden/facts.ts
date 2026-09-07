/**
 * Pure Golden Dataset HistoricalFact definitions (Phase 10 spec sections
 * 3/18-22). Every fact here is atomic, traces to >=1 real Source (see
 * `sources.ts`/docs/backend/golden-data/sources-manifest.md), and is
 * deliberately NOT over-fragmented (spec section 18). `certainty` is set
 * per-fact, honestly (spec section 19) - not everything is CONFIRMED.
 *
 * `publish: true` marks a fact this seed will attempt to move to
 * `FactEditorialStatus.PUBLISHED` - only ever set when every citation
 * listed is `VERIFIED` (the same gate `FactsService.setEditorialStatus`
 * enforces for a real API-driven publish, replicated faithfully here per
 * spec section 3/20 rather than bypassed). Facts whose evidence did not
 * meet that bar are left `publish: false` (seeded as DRAFT) rather than
 * omitted outright, so the trust workflow has real, visible draft material
 * to exercise too.
 *
 * Sensitive facts (`sensitivity !== NORMAL`) are seeded with
 * `reviewedById` set to a DIFFERENT dev account than `createdById` (see
 * `prisma/seed.ts`'s `upsertFact` helper) - mirroring the same
 * separation-of-duties invariant `FactsService.setEditorialStatus` enforces
 * for a real sensitive-fact publish (spec section 25 of Phase 04's
 * TRUST_MODEL.md), never merely flipping a status flag.
 */
import { CitationVerificationState, FactCertainty, FactSensitivity, FactType } from '@prisma/client';
import { HistoricalDateSeed, UNKNOWN_DATE, exactDate, yearOnly } from './helpers';

export interface FactCitationSeed {
  sourceKey: string;
  pageFrom?: string;
  pageTo?: string;
  volume?: string;
  chapter?: string;
  excerpt?: string;
  editorNote?: string;
  verificationState: CitationVerificationState;
}

export interface FactSeedSpec {
  key: string;
  factType: FactType;
  date: HistoricalDateSeed;
  certainty: FactCertainty;
  sensitivity?: FactSensitivity;
  vi: string;
  en?: string;
  eventKeys?: string[];
  personKeys?: string[];
  placeKeys?: string[];
  eraKeys?: string[];
  citations: FactCitationSeed[];
  publish: boolean;
}

const verified = (sourceKey: string, extra: Partial<FactCitationSeed> = {}): FactCitationSeed => ({
  sourceKey,
  verificationState: CitationVerificationState.VERIFIED,
  ...extra,
});

export const GOLDEN_FACTS: FactSeedSpec[] = [
  // ---- UNESCO World Heritage inscriptions -------------------------------
  {
    key: 'FACT_THANG_LONG_UNESCO',
    factType: FactType.CULTURAL,
    date: yearOnly(2010),
    certainty: FactCertainty.CONFIRMED,
    vi: 'Trung tâm Hoàng thành Thăng Long - Hà Nội được UNESCO công nhận là Di sản văn hóa thế giới năm 2010.',
    en: 'The Central Sector of the Imperial Citadel of Thang Long - Hanoi was inscribed as a UNESCO World Heritage Site in 2010.',
    placeKeys: ['PLACE_THANG_LONG'],
    citations: [verified('SRC_UNESCO_THANG_LONG')],
    publish: true,
  },
  {
    key: 'FACT_HUE_UNESCO',
    factType: FactType.CULTURAL,
    date: yearOnly(1993),
    certainty: FactCertainty.CONFIRMED,
    vi: 'Quần thể di tích Cố đô Huế được UNESCO công nhận là Di sản văn hóa thế giới năm 1993.',
    en: 'The Complex of Hue Monuments was inscribed as a UNESCO World Heritage Site in 1993.',
    placeKeys: ['PLACE_HUE'],
    citations: [verified('SRC_UNESCO_HUE')],
    publish: true,
  },
  {
    key: 'FACT_HUE_CAPITAL_PERIOD',
    factType: FactType.ADMINISTRATIVE,
    date: yearOnly(1802),
    certainty: FactCertainty.CONFIRMED,
    vi: 'Huế là kinh đô của Việt Nam dưới thời nhà Nguyễn, từ năm 1802 đến năm 1945.',
    en: 'Hue served as the imperial capital of Vietnam under the Nguyen dynasty, from 1802 to 1945.',
    placeKeys: ['PLACE_HUE'],
    eraKeys: ['ERA_NGUYEN'],
    citations: [verified('SRC_UNESCO_HUE')],
    publish: true,
  },
  {
    key: 'FACT_MY_SON_UNESCO',
    factType: FactType.CULTURAL,
    date: exactDate(1999, 12, 1),
    certainty: FactCertainty.CONFIRMED,
    vi: 'Khu di tích Mỹ Sơn được UNESCO công nhận là Di sản văn hóa thế giới ngày 1/12/1999.',
    en: 'My Son Sanctuary was inscribed as a UNESCO World Heritage Site on 1 December 1999.',
    placeKeys: ['PLACE_MY_SON'],
    citations: [verified('SRC_UNESCO_MY_SON')],
    publish: true,
  },
  {
    key: 'FACT_MY_SON_CHAMPA_PERIOD',
    factType: FactType.CULTURAL,
    date: UNKNOWN_DATE,
    certainty: FactCertainty.HIGH_CONFIDENCE,
    vi: 'Các đền tháp tại Mỹ Sơn được xây dựng bởi vương quốc Champa trong khoảng từ thế kỷ 4 đến thế kỷ 13.',
    en: 'The temple towers at My Son were built by the Champa civilisation between the 4th and 13th centuries AD.',
    placeKeys: ['PLACE_MY_SON'],
    citations: [verified('SRC_UNESCO_MY_SON')],
    publish: true,
  },
  {
    key: 'FACT_HOI_AN_UNESCO',
    factType: FactType.CULTURAL,
    date: exactDate(1999, 12, 4),
    certainty: FactCertainty.CONFIRMED,
    vi: 'Đô thị cổ Hội An được UNESCO công nhận là Di sản văn hóa thế giới ngày 4/12/1999.',
    en: 'Hoi An Ancient Town was inscribed as a UNESCO World Heritage Site on 4 December 1999.',
    placeKeys: ['PLACE_HOI_AN'],
    citations: [verified('SRC_UNESCO_HOI_AN')],
    publish: true,
  },

  // ---- Place status / foundational history ------------------------------
  {
    key: 'FACT_VAN_MIEU_FOUNDING',
    factType: FactType.CULTURAL,
    date: yearOnly(1070),
    certainty: FactCertainty.HIGH_CONFIDENCE,
    vi: 'Văn Miếu được xây dựng năm 1070 dưới thời vua Lý Thánh Tông để thờ Khổng Tử.',
    en: 'The Temple of Literature was founded in 1070 under Emperor Ly Thanh Tong to honour Confucius.',
    placeKeys: ['PLACE_VAN_MIEU'],
    eraKeys: ['ERA_LY'],
    citations: [verified('SRC_NHANDAN_VAN_MIEU')],
    publish: true,
  },
  {
    key: 'FACT_QUOC_TU_GIAM_FOUNDING',
    factType: FactType.CULTURAL,
    date: yearOnly(1076),
    certainty: FactCertainty.HIGH_CONFIDENCE,
    vi: 'Quốc Tử Giám được thành lập năm 1076 trong khuôn viên Văn Miếu, là trường đại học đầu tiên của Việt Nam.',
    en: 'Quoc Tu Giam, established in 1076 within the Temple of Literature grounds, was Vietnam\'s first national university.',
    placeKeys: ['PLACE_VAN_MIEU'],
    eraKeys: ['ERA_LY'],
    citations: [verified('SRC_NHANDAN_VAN_MIEU')],
    publish: true,
  },
  {
    key: 'FACT_CO_LOA_CAPITAL',
    factType: FactType.ADMINISTRATIVE,
    date: UNKNOWN_DATE,
    certainty: FactCertainty.TRADITIONAL_ACCOUNT,
    vi: 'Theo truyền thống lịch sử Việt Nam, Cổ Loa là kinh đô của nhà nước Âu Lạc dưới thời An Dương Vương.',
    en: 'Per Vietnamese historical tradition, Co Loa was the capital of the ancient Au Lac kingdom under An Duong Vuong.',
    placeKeys: ['PLACE_CO_LOA'],
    citations: [verified('SRC_GOV_CO_LOA')],
    publish: true,
  },
  {
    key: 'FACT_CO_LOA_RELIC_STATUS',
    factType: FactType.ADMINISTRATIVE,
    date: yearOnly(1962),
    certainty: FactCertainty.HIGH_CONFIDENCE,
    vi: 'Cổ Loa được xếp hạng di tích lịch sử - văn hóa quốc gia năm 1962.',
    en: 'Co Loa was classified as a national historical and cultural relic in 1962.',
    placeKeys: ['PLACE_CO_LOA'],
    citations: [verified('SRC_GOV_CO_LOA')],
    publish: true,
  },
  {
    key: 'FACT_HOA_LU_CAPITAL',
    factType: FactType.ADMINISTRATIVE,
    date: yearOnly(968),
    certainty: FactCertainty.HIGH_CONFIDENCE,
    vi: 'Hoa Lư là kinh đô của Việt Nam dưới thời nhà Đinh, Tiền Lê và đầu thời Lý, từ năm 968 đến năm 1010.',
    en: 'Hoa Lu served as the capital of Vietnam under the Dinh, Early Le, and briefly early Ly dynasties, from 968 to 1010.',
    placeKeys: ['PLACE_HOA_LU'],
    citations: [verified('SRC_GOV_HOA_LU')],
    publish: true,
  },
  {
    key: 'FACT_CU_CHI_RELIC_STATUS',
    factType: FactType.ADMINISTRATIVE,
    date: exactDate(2015, 12, 23),
    certainty: FactCertainty.CONFIRMED,
    vi: 'Địa đạo Củ Chi được Thủ tướng Chính phủ công nhận là Di tích quốc gia đặc biệt theo Quyết định số 2367/QĐ-TTg ngày 23/12/2015.',
    en: 'The Cu Chi Tunnels were designated a Special National Relic by Prime Ministerial Decision No. 2367/QD-TTg, dated 23 December 2015.',
    placeKeys: ['PLACE_CU_CHI'],
    citations: [verified('SRC_GOV_CU_CHI')],
    publish: true,
  },
  {
    key: 'FACT_DOC_LAP_RELIC_STATUS',
    factType: FactType.ADMINISTRATIVE,
    date: exactDate(2009, 8, 12),
    certainty: FactCertainty.CONFIRMED,
    vi: 'Dinh Độc Lập được công nhận là Di tích quốc gia đặc biệt theo Quyết định số 1272/QĐ-TTg ngày 12/8/2009.',
    en: 'Independence Palace was classified as a Special National Monument by Decision No. 1272/QD-TTg, dated 12 August 2009.',
    placeKeys: ['PLACE_DINH_DOC_LAP'],
    citations: [verified('SRC_GOV_DOC_LAP')],
    publish: true,
  },

  // ---- Events -------------------------------------------------------------
  {
    key: 'FACT_DOI_DO_1010',
    factType: FactType.EVENT_DETAIL,
    date: yearOnly(1010),
    certainty: FactCertainty.HIGH_CONFIDENCE,
    vi: 'Mùa thu năm 1010, vua Lý Thái Tổ (Lý Công Uẩn) ban Chiếu dời đô, chuyển kinh đô từ Hoa Lư về thành Đại La và đổi tên là Thăng Long.',
    en: 'In the fall of 1010, Emperor Ly Thai To (Ly Cong Uan) issued the Edict on the Transfer of the Capital, moving the capital from Hoa Lu to Dai La citadel, renamed Thang Long.',
    eventKeys: ['EVENT_DOI_DO_1010'],
    personKeys: ['PERSON_LY_CONG_UAN'],
    placeKeys: ['PLACE_THANG_LONG'],
    citations: [verified('SRC_GOV_THANG_LONG_EDICT')],
    publish: true,
  },
  {
    key: 'FACT_BACH_DANG_1288',
    factType: FactType.MILITARY,
    date: exactDate(1288, 4, 9),
    certainty: FactCertainty.CONFIRMED,
    vi: 'Ngày 9/4/1288, quân đội nhà Trần dưới sự chỉ huy của Trần Hưng Đạo đánh bại hạm đội quân Nguyên Mông trên sông Bạch Đằng.',
    en: 'On 9 April 1288, Tran dynasty forces under Tran Hung Dao defeated the Mongol Yuan fleet on the Bach Dang River.',
    eventKeys: ['EVENT_BACH_DANG_1288'],
    personKeys: ['PERSON_TRAN_HUNG_DAO'],
    citations: [verified('SRC_BRITANNICA_TRAN_HUNG_DAO')],
    publish: true,
  },
  {
    key: 'FACT_LAM_SON_UPRISING',
    factType: FactType.MILITARY,
    date: yearOnly(1418),
    certainty: FactCertainty.HIGH_CONFIDENCE,
    vi: 'Lê Lợi lãnh đạo khởi nghĩa Lam Sơn chống quân Minh từ năm 1418 đến năm 1427, giành lại độc lập cho Đại Việt.',
    en: 'Le Loi led the Lam Son uprising against Ming occupation from 1418 to 1427, restoring Dai Viet\'s independence.',
    eventKeys: ['EVENT_LAM_SON'],
    personKeys: ['PERSON_LE_LOI'],
    citations: [verified('SRC_BRITANNICA_LE_LOI')],
    publish: true,
  },
  {
    key: 'FACT_LE_LOI_FOUNDING',
    factType: FactType.ADMINISTRATIVE,
    date: yearOnly(1428),
    certainty: FactCertainty.HIGH_CONFIDENCE,
    vi: 'Năm 1428, Lê Lợi lên ngôi hoàng đế, lấy hiệu Lê Thái Tổ, sáng lập nhà Lê sơ.',
    en: 'In 1428, Le Loi ascended the throne as Emperor Le Thai To, founding the (Early) Le dynasty.',
    personKeys: ['PERSON_LE_LOI'],
    eraKeys: ['ERA_LE_SO'],
    citations: [verified('SRC_BRITANNICA_LE_LOI')],
    publish: true,
  },
  {
    key: 'FACT_NGOC_HOI_DONG_DA',
    factType: FactType.MILITARY,
    date: exactDate(1789, 1, 30),
    certainty: FactCertainty.CONFIRMED,
    vi: 'Vào mùng 5 Tết Kỷ Dậu (30/1/1789 dương lịch), nghĩa quân Tây Sơn do Quang Trung chỉ huy đánh bại quân Thanh tại Ngọc Hồi - Đống Đa.',
    en: 'On the 5th day of Tet Ky Dau (30 January 1789 in the Gregorian calendar), Tay Son forces led by Emperor Quang Trung defeated Qing forces at Ngoc Hoi-Dong Da.',
    eventKeys: ['EVENT_NGOC_HOI_DONG_DA'],
    personKeys: ['PERSON_QUANG_TRUNG'],
    citations: [
      verified('SRC_BRITANNICA_QUANG_TRUNG'),
      verified('SRC_QDND_NGOC_HOI_DONG_DA', { editorNote: 'Confirms the lunar-to-Gregorian date conversion.' }),
    ],
    publish: true,
  },
  {
    key: 'FACT_QUANG_TRUNG_DEATH',
    factType: FactType.BIOGRAPHICAL,
    date: exactDate(1792, 9, 16),
    certainty: FactCertainty.HIGH_CONFIDENCE,
    vi: 'Hoàng đế Quang Trung qua đời ngày 16/9/1792.',
    en: 'Emperor Quang Trung died on 16 September 1792.',
    personKeys: ['PERSON_QUANG_TRUNG'],
    citations: [verified('SRC_BRITANNICA_QUANG_TRUNG')],
    publish: true,
  },
  {
    key: 'FACT_NGUYEN_FOUNDING',
    factType: FactType.ADMINISTRATIVE,
    date: yearOnly(1802),
    certainty: FactCertainty.HIGH_CONFIDENCE,
    vi: 'Năm 1802, Nguyễn Ánh lên ngôi hoàng đế, lấy niên hiệu Gia Long, thành lập triều Nguyễn và thống nhất đất nước.',
    en: 'In 1802, Nguyen Anh proclaimed himself Emperor Gia Long, founding the Nguyen dynasty and unifying the country.',
    eventKeys: ['EVENT_NGUYEN_FOUNDING'],
    personKeys: ['PERSON_GIA_LONG'],
    placeKeys: ['PLACE_HUE'],
    eraKeys: ['ERA_NGUYEN'],
    citations: [verified('SRC_BRITANNICA_GIA_LONG')],
    publish: true,
  },
  {
    key: 'FACT_MINH_MANG_REIGN',
    factType: FactType.ADMINISTRATIVE,
    date: yearOnly(1820),
    certainty: FactCertainty.HIGH_CONFIDENCE,
    vi: 'Minh Mạng là hoàng đế thứ hai nhà Nguyễn, trị vì từ năm 1820 đến năm 1841, thực hiện nhiều cải cách hành chính, giáo dục và thiết lập hệ thống bưu chính.',
    en: 'Minh Mang was the second emperor of the Nguyen dynasty, reigning 1820-1841, instituting administrative, educational, and postal-system reforms.',
    personKeys: ['PERSON_MINH_MANG'],
    eraKeys: ['ERA_NGUYEN'],
    citations: [verified('SRC_BRITANNICA_MINH_MANG')],
    publish: true,
  },
  {
    key: 'FACT_TUYEN_NGON_1945',
    factType: FactType.EVENT_DETAIL,
    date: exactDate(1945, 9, 2),
    certainty: FactCertainty.CONFIRMED,
    vi: 'Ngày 2/9/1945, Hồ Chí Minh đọc Tuyên ngôn Độc lập tại Quảng trường Ba Đình, Hà Nội, khai sinh nước Việt Nam Dân chủ Cộng hòa.',
    en: 'On 2 September 1945, Ho Chi Minh read the Declaration of Independence at Ba Dinh Square, Hanoi, founding the Democratic Republic of Vietnam.',
    eventKeys: ['EVENT_TUYEN_NGON_1945'],
    personKeys: ['PERSON_HO_CHI_MINH'],
    citations: [verified('SRC_BRITANNICA_HO_CHI_MINH')],
    publish: true,
  },
  {
    key: 'FACT_DIEN_BIEN_PHU_1954',
    factType: FactType.MILITARY,
    date: exactDate(1954, 5, 7),
    certainty: FactCertainty.CONFIRMED,
    vi: 'Chiến dịch Điện Biên Phủ, do tướng Võ Nguyên Giáp chỉ huy, kết thúc ngày 7/5/1954 với thắng lợi của Quân đội nhân dân Việt Nam, chấm dứt sự hiện diện quân sự của Pháp tại Đông Dương.',
    en: 'The Dien Bien Phu campaign, commanded by General Vo Nguyen Giap, concluded on 7 May 1954 with a Vietnamese People\'s Army victory, ending the French military presence in Indochina.',
    eventKeys: ['EVENT_DIEN_BIEN_PHU_1954'],
    personKeys: ['PERSON_VO_NGUYEN_GIAP'],
    placeKeys: ['PLACE_DIEN_BIEN_PHU'],
    citations: [verified('SRC_BRITANNICA_DIEN_BIEN_PHU'), verified('SRC_BRITANNICA_VO_NGUYEN_GIAP')],
    publish: true,
  },
  {
    key: 'FACT_30_THANG_4_1975',
    factType: FactType.EVENT_DETAIL,
    date: exactDate(1975, 4, 30),
    certainty: FactCertainty.CONFIRMED,
    vi: 'Vào lúc 10h45 ngày 30/4/1975, xe tăng của Quân Giải phóng tiến vào Dinh Độc Lập, đánh dấu sự kiện thống nhất đất nước Việt Nam.',
    en: 'At 10:45am on 30 April 1975, tanks of the Liberation Army entered Independence Palace, marking the reunification of Vietnam.',
    eventKeys: ['EVENT_30_THANG_4'],
    placeKeys: ['PLACE_DINH_DOC_LAP'],
    citations: [verified('SRC_GOV_DOC_LAP')],
    publish: true,
  },

  // ---- Hoang Sa / Truong Sa dossier (spec sections 12/57 - TERRITORIAL
  // sensitivity, careful neutral framing: each fact reports a documented
  // position/event/administrative arrangement, never an unqualified legal
  // conclusion asserted in Dau Viet's own voice). ---------------------------
  {
    key: 'FACT_HS_TS_HISTORICAL_DOCUMENTS',
    factType: FactType.TERRITORIAL,
    date: UNKNOWN_DATE,
    certainty: FactCertainty.HIGH_CONFIDENCE,
    sensitivity: FactSensitivity.TERRITORIAL,
    vi: 'Theo lập trường chính thức của Bộ Ngoại giao Việt Nam, các tài liệu cổ như "Toàn tập Thiên Nam tứ chí lộ đồ thư" (1686) và "Đại Nam nhất thống toàn đồ" (1838) được dẫn chứng như bằng chứng cho thấy hai quần đảo Hoàng Sa và Trường Sa đã được ghi nhận là một phần lãnh thổ Việt Nam.',
    en: 'Per the official position of Vietnam\'s Ministry of Foreign Affairs, historical documents including the "Toan tap Thien Nam tu chi lo do thu" (1686) route atlas and the "Dai Nam nhat thong toan do" (1838) unified map are cited as evidence that the Hoang Sa and Truong Sa archipelagoes were recorded as Vietnamese territory.',
    placeKeys: ['PLACE_HOANG_SA', 'PLACE_TRUONG_SA'],
    citations: [verified('SRC_MOFA_VN_HOANG_SA_TRUONG_SA', { editorNote: 'Reports Vietnam\'s stated position and the documents it cites - not an independent adjudication of sovereignty.' })],
    publish: true,
  },
  {
    key: 'FACT_HS_PARACELS_1974_BATTLE',
    factType: FactType.TERRITORIAL,
    date: exactDate(1974, 1, 19),
    certainty: FactCertainty.CONFIRMED,
    sensitivity: FactSensitivity.TERRITORIAL,
    vi: 'Ngày 19/1/1974, xảy ra xung đột hải quân giữa lực lượng Trung Quốc và lực lượng Việt Nam Cộng hòa tại quần đảo Hoàng Sa; sau trận chiến, Trung Quốc kiểm soát toàn bộ quần đảo.',
    en: 'On 19 January 1974, a naval engagement took place between Chinese and Republic of Vietnam (South Vietnamese) forces near the Paracel Islands (Hoang Sa); China subsequently established control over the entire archipelago.',
    placeKeys: ['PLACE_HOANG_SA'],
    citations: [verified('SRC_NAVALHISTORY_PARACELS_1974')],
    publish: true,
  },
  {
    key: 'FACT_TS_MULTIPLE_CLAIMANTS',
    factType: FactType.TERRITORIAL,
    date: UNKNOWN_DATE,
    certainty: FactCertainty.CONFIRMED,
    sensitivity: FactSensitivity.TERRITORIAL,
    vi: 'Quần đảo Trường Sa hiện là đối tượng tuyên bố chủ quyền của nhiều bên, bao gồm Việt Nam, Trung Quốc, Đài Loan, và một phần bởi Philippines, Malaysia và Brunei.',
    en: 'The Spratly Islands (Truong Sa) are currently claimed by multiple parties, including Vietnam, China, and Taiwan, with Malaysia, the Philippines, and Brunei claiming parts of the group.',
    placeKeys: ['PLACE_TRUONG_SA'],
    citations: [verified('SRC_BRITANNICA_SPRATLY')],
    publish: true,
  },
  {
    key: 'FACT_HS_TS_CURRENT_ADMINISTRATION',
    factType: FactType.ADMINISTRATIVE,
    date: UNKNOWN_DATE,
    certainty: FactCertainty.HIGH_CONFIDENCE,
    sensitivity: FactSensitivity.TERRITORIAL,
    vi: 'Về mặt hành chính, Việt Nam hiện tổ chức quần đảo Hoàng Sa trực thuộc thành phố Đà Nẵng và quần đảo Trường Sa trực thuộc tỉnh Khánh Hòa (từ năm 1982). Đây là tổ chức hành chính theo pháp luật Việt Nam, không phải là sự công nhận quốc tế về chủ quyền.',
    en: 'For Vietnamese domestic administrative purposes, Hoang Sa has been organized under Da Nang City and Truong Sa under Khanh Hoa Province since 1982. This reflects Vietnam\'s own administrative arrangement, not an internationally settled sovereignty determination.',
    placeKeys: ['PLACE_HOANG_SA', 'PLACE_TRUONG_SA'],
    citations: [verified('SRC_VNA_HS_TS_ADMIN')],
    publish: true,
  },
];
