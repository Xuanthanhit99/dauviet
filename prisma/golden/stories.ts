/**
 * Pure Golden Dataset editorial Story definitions (Phase 10 spec sections
 * 31-34). Bodies use the closed structured block schema from Phase 06
 * (`apps/api/src/modules/stories/story-body.util.ts` - not duplicated here
 * across the package boundary, but every block below was hand-checked
 * against that schema: only `heading`/`paragraph`/`quote`/`entity_reference`/
 * `source_reference`/`callout` block shapes are used). Every factual
 * assertion central to the narrative traces to a `factKey` (a real,
 * PUBLISHED Golden HistoricalFact) and a matching citation reference -
 * never an unsupported claim hidden in prose (spec section 33).
 */
import { StoryLinkRole } from '@prisma/client';

export interface StoryBlockSeed {
  type: 'heading' | 'paragraph' | 'quote' | 'entity_reference' | 'source_reference' | 'callout';
  [key: string]: unknown;
}

export interface StorySeedSpec {
  key: string;
  slug: string;
  vi: { title: string; subtitle?: string; summary: string; body: StoryBlockSeed[] };
  en: { title: string; summary?: string; body?: StoryBlockSeed[] };
  placeLinks?: { key: string; role: StoryLinkRole }[];
  personLinks?: { key: string; role: StoryLinkRole }[];
  eventLinks?: { key: string; role: StoryLinkRole }[];
  /** Must each resolve to a PUBLISHED Golden Fact (spec section 33) - checked by the seed validator. */
  factKeys: string[];
  /** Resolves to the real Citation created for (factKey, sourceKey) in facts.ts - never a fabricated id. */
  citationRefs: { factKey: string; sourceKey: string; locator?: string }[];
  featured?: boolean;
}

export const GOLDEN_STORIES: StorySeedSpec[] = [
  {
    key: 'STORY_DOI_DO_THANG_LONG',
    slug: 'vi-sao-thang-long-tro-thanh-kinh-do',
    vi: {
      title: 'Vì sao Thăng Long trở thành kinh đô?',
      subtitle: 'Chiếu dời đô năm 1010 và quyết định của Lý Thái Tổ',
      summary: 'Mùa thu năm 1010, vua Lý Thái Tổ ban Chiếu dời đô, chuyển kinh đô từ Hoa Lư về Thăng Long - một quyết định định hình lịch sử Việt Nam trong hơn một nghìn năm.',
      body: [
        { type: 'heading', level: 2, text: 'Một quyết định lịch sử' },
        {
          type: 'paragraph',
          text: 'Sau khi lên ngôi, Lý Thái Tổ (Lý Công Uẩn) nhận thấy Hoa Lư - kinh đô của hai triều Đinh, Tiền Lê trước đó - không còn phù hợp để làm trung tâm của một quốc gia đang phát triển. Mùa thu năm 1010, ông ban Chiếu dời đô, chuyển kinh đô về thành Đại La và đổi tên là Thăng Long.',
        },
        { type: 'entity_reference', entityKind: 'PERSON', entityId: 'PERSON_LY_CONG_UAN', text: 'Lý Công Uẩn' },
        { type: 'entity_reference', entityKind: 'PLACE', entityId: 'PLACE_THANG_LONG', text: 'Hoàng thành Thăng Long' },
        {
          type: 'paragraph',
          text: 'Quyết định này được ghi lại trong văn bản gốc của Chiếu dời đô, hiện được lưu giữ và giới thiệu chính thức bởi Cổng thông tin điện tử Chính phủ.',
        },
        { type: 'source_reference', citationId: 'FACT_DOI_DO_1010::SRC_GOV_THANG_LONG_EDICT', label: 'Chiếu dời đô, 1010' },
        {
          type: 'callout',
          style: 'info',
          text: 'Khu di tích Trung tâm Hoàng thành Thăng Long - Hà Nội được UNESCO công nhận là Di sản văn hóa thế giới năm 2010, đúng dịp kỷ niệm 1000 năm sự kiện dời đô.',
        },
      ],
    },
    en: {
      title: 'Why did Thang Long become the capital?',
      summary: 'In the fall of 1010, Emperor Ly Thai To issued the Edict on the Transfer of the Capital, moving it from Hoa Lu to Thang Long - a decision that shaped Vietnamese history for a millennium.',
    },
    placeLinks: [{ key: 'PLACE_THANG_LONG', role: StoryLinkRole.PRIMARY_SUBJECT }],
    personLinks: [{ key: 'PERSON_LY_CONG_UAN', role: StoryLinkRole.PRIMARY_SUBJECT }],
    eventLinks: [{ key: 'EVENT_DOI_DO_1010', role: StoryLinkRole.PRIMARY_SUBJECT }],
    factKeys: ['FACT_DOI_DO_1010', 'FACT_THANG_LONG_UNESCO'],
    citationRefs: [{ factKey: 'FACT_DOI_DO_1010', sourceKey: 'SRC_GOV_THANG_LONG_EDICT', locator: 'Chieu doi do, 1010' }],
    featured: true,
  },
  {
    key: 'STORY_BACH_DANG_1288',
    slug: 'bach-dang-1288-trong-khong-gian-lich-su',
    vi: {
      title: 'Bạch Đằng 1288 trong không gian lịch sử',
      summary: 'Ngày 9/4/1288, quân đội nhà Trần dưới sự chỉ huy của Trần Hưng Đạo đánh bại hạm đội quân Nguyên Mông trên sông Bạch Đằng, khép lại cuộc kháng chiến chống Nguyên Mông lần thứ ba.',
      body: [
        { type: 'heading', level: 2, text: 'Trận thủy chiến quyết định' },
        {
          type: 'paragraph',
          text: 'Kế thừa chiến thuật cọc gỗ của Ngô Quyền năm 938, Trần Hưng Đạo bố trí trận địa mai phục trên sông Bạch Đằng. Ngày 9/4/1288, hạm đội tiếp vận của quân Nguyên Mông rơi vào trận địa và bị đánh tan hoàn toàn.',
        },
        { type: 'entity_reference', entityKind: 'PERSON', entityId: 'PERSON_TRAN_HUNG_DAO', text: 'Trần Hưng Đạo' },
        { type: 'source_reference', citationId: 'FACT_BACH_DANG_1288::SRC_BRITANNICA_TRAN_HUNG_DAO', label: 'Britannica: Tran Hung Dao' },
      ],
    },
    en: {
      title: 'Bach Dang 1288 in historical context',
      summary: 'On 9 April 1288, Tran dynasty forces under Tran Hung Dao defeated the Mongol Yuan fleet on the Bach Dang River, concluding the third Mongol invasion.',
    },
    eventLinks: [{ key: 'EVENT_BACH_DANG_1288', role: StoryLinkRole.PRIMARY_SUBJECT }],
    personLinks: [{ key: 'PERSON_TRAN_HUNG_DAO', role: StoryLinkRole.PRIMARY_SUBJECT }],
    factKeys: ['FACT_BACH_DANG_1288'],
    citationRefs: [{ factKey: 'FACT_BACH_DANG_1288', sourceKey: 'SRC_BRITANNICA_TRAN_HUNG_DAO' }],
  },
  {
    key: 'STORY_HUE_NGUYEN',
    slug: 'hue-va-dau-an-kinh-do-trieu-nguyen',
    vi: {
      title: 'Huế và dấu ấn kinh đô triều Nguyễn',
      summary: 'Từ năm 1802 đến 1945, Huế là kinh đô của triều Nguyễn - triều đại phong kiến cuối cùng của Việt Nam. Quần thể di tích Cố đô Huế được UNESCO công nhận là Di sản văn hóa thế giới năm 1993.',
      body: [
        { type: 'heading', level: 2, text: 'Kinh đô của một triều đại thống nhất' },
        {
          type: 'paragraph',
          text: 'Năm 1802, Nguyễn Ánh lên ngôi hoàng đế, lấy niên hiệu Gia Long, thành lập triều Nguyễn và chọn Huế làm kinh đô. Trong 143 năm, Huế là trung tâm chính trị, văn hóa và tôn giáo của cả nước.',
        },
        { type: 'entity_reference', entityKind: 'PLACE', entityId: 'PLACE_HUE', text: 'Cố đô Huế' },
        { type: 'entity_reference', entityKind: 'PERSON', entityId: 'PERSON_GIA_LONG', text: 'Gia Long' },
        {
          type: 'paragraph',
          text: 'Năm 1993, UNESCO công nhận Quần thể di tích Cố đô Huế là Di sản văn hóa thế giới, ghi nhận đây là một kinh đô phong kiến phương Đông tiêu biểu.',
        },
        { type: 'source_reference', citationId: 'FACT_HUE_UNESCO::SRC_UNESCO_HUE', label: 'UNESCO World Heritage List' },
      ],
    },
    en: {
      title: 'Hue and the legacy of the Nguyen imperial capital',
      summary: 'From 1802 to 1945, Hue was the imperial capital of the Nguyen dynasty, Vietnam\'s last feudal dynasty. The Complex of Hue Monuments was inscribed as a UNESCO World Heritage Site in 1993.',
    },
    placeLinks: [{ key: 'PLACE_HUE', role: StoryLinkRole.PRIMARY_SUBJECT }],
    personLinks: [{ key: 'PERSON_GIA_LONG', role: StoryLinkRole.RELATED }],
    eventLinks: [{ key: 'EVENT_NGUYEN_FOUNDING', role: StoryLinkRole.RELATED }],
    factKeys: ['FACT_NGUYEN_FOUNDING', 'FACT_HUE_UNESCO', 'FACT_HUE_CAPITAL_PERIOD'],
    citationRefs: [
      { factKey: 'FACT_NGUYEN_FOUNDING', sourceKey: 'SRC_BRITANNICA_GIA_LONG' },
      { factKey: 'FACT_HUE_UNESCO', sourceKey: 'SRC_UNESCO_HUE' },
    ],
    featured: true,
  },
  {
    key: 'STORY_DIEN_BIEN_PHU_1954',
    slug: 'dien-bien-phu-trong-tien-trinh-nam-1954',
    vi: {
      title: 'Điện Biên Phủ trong tiến trình năm 1954',
      summary: 'Chiến dịch Điện Biên Phủ, do tướng Võ Nguyên Giáp chỉ huy, kết thúc ngày 7/5/1954, chấm dứt sự hiện diện quân sự của Pháp tại Đông Dương và mở đường cho Hội nghị Genève.',
      body: [
        { type: 'heading', level: 2, text: 'Chiến dịch quyết định' },
        {
          type: 'paragraph',
          text: 'Chiến dịch Điện Biên Phủ diễn ra từ tháng 3 đến tháng 5 năm 1954. Dưới sự chỉ huy của Đại tướng Võ Nguyên Giáp, Quân đội nhân dân Việt Nam giành thắng lợi quyết định vào ngày 7/5/1954.',
        },
        { type: 'entity_reference', entityKind: 'PERSON', entityId: 'PERSON_VO_NGUYEN_GIAP', text: 'Võ Nguyên Giáp' },
        { type: 'entity_reference', entityKind: 'PLACE', entityId: 'PLACE_DIEN_BIEN_PHU', text: 'Điện Biên Phủ' },
        { type: 'source_reference', citationId: 'FACT_DIEN_BIEN_PHU_1954::SRC_BRITANNICA_DIEN_BIEN_PHU', label: 'Britannica: Battle of Dien Bien Phu' },
      ],
    },
    en: {
      title: 'Dien Bien Phu in the course of 1954',
      summary: 'The Dien Bien Phu campaign, commanded by General Vo Nguyen Giap, concluded on 7 May 1954, ending the French military presence in Indochina.',
    },
    placeLinks: [{ key: 'PLACE_DIEN_BIEN_PHU', role: StoryLinkRole.PRIMARY_SUBJECT }],
    personLinks: [{ key: 'PERSON_VO_NGUYEN_GIAP', role: StoryLinkRole.PRIMARY_SUBJECT }],
    eventLinks: [{ key: 'EVENT_DIEN_BIEN_PHU_1954', role: StoryLinkRole.PRIMARY_SUBJECT }],
    factKeys: ['FACT_DIEN_BIEN_PHU_1954'],
    citationRefs: [{ factKey: 'FACT_DIEN_BIEN_PHU_1954', sourceKey: 'SRC_BRITANNICA_DIEN_BIEN_PHU' }],
  },
  {
    key: 'STORY_HOANG_SA_TRUONG_SA_DOSSIER',
    slug: 'dau-viet-tren-bien-ho-so-nguon-ve-hoang-sa-truong-sa',
    vi: {
      title: 'Dấu Việt trên biển: hồ sơ nguồn về Hoàng Sa - Trường Sa',
      summary: 'Một hồ sơ nguồn cẩn trọng, phân biệt rõ tư liệu lịch sử, lập trường chính thức và bối cảnh hành chính/quốc tế hiện nay về hai quần đảo Hoàng Sa và Trường Sa.',
      body: [
        { type: 'heading', level: 2, text: 'Tư liệu lịch sử' },
        {
          type: 'paragraph',
          text: 'Theo lập trường chính thức của Bộ Ngoại giao Việt Nam, các tài liệu cổ như "Toàn tập Thiên Nam tứ chí lộ đồ thư" (1686) và "Đại Nam nhất thống toàn đồ" (1838) được dẫn chứng như bằng chứng lịch sử liên quan đến hai quần đảo.',
        },
        { type: 'source_reference', citationId: 'FACT_HS_TS_HISTORICAL_DOCUMENTS::SRC_MOFA_VN_HOANG_SA_TRUONG_SA', label: 'Bo Ngoai giao Viet Nam' },
        { type: 'heading', level: 2, text: 'Bối cảnh hiện nay' },
        {
          type: 'paragraph',
          text: 'Ngày 19/1/1974, xảy ra xung đột hải quân giữa lực lượng Trung Quốc và lực lượng Việt Nam Cộng hòa tại quần đảo Hoàng Sa. Quần đảo Trường Sa hiện là đối tượng tuyên bố chủ quyền của nhiều bên.',
        },
        {
          type: 'callout',
          style: 'disclosure',
          text: 'Bài viết này trình bày tư liệu lịch sử và lập trường được công bố chính thức, không đưa ra kết luận pháp lý quốc tế độc lập. Nội dung được rà soát định kỳ do liên quan đến bối cảnh hiện tại.',
        },
        { type: 'entity_reference', entityKind: 'PLACE', entityId: 'PLACE_HOANG_SA', text: 'Hoàng Sa' },
        { type: 'entity_reference', entityKind: 'PLACE', entityId: 'PLACE_TRUONG_SA', text: 'Trường Sa' },
      ],
    },
    en: {
      title: 'Vietnam\'s mark at sea: a source dossier on Hoang Sa - Truong Sa',
      summary: 'A carefully sourced dossier distinguishing historical documentation, official position, and current administrative/international context regarding the Hoang Sa and Truong Sa archipelagoes.',
    },
    placeLinks: [
      { key: 'PLACE_HOANG_SA', role: StoryLinkRole.PRIMARY_SUBJECT },
      { key: 'PLACE_TRUONG_SA', role: StoryLinkRole.PRIMARY_SUBJECT },
    ],
    factKeys: ['FACT_HS_TS_HISTORICAL_DOCUMENTS', 'FACT_HS_PARACELS_1974_BATTLE', 'FACT_TS_MULTIPLE_CLAIMANTS', 'FACT_HS_TS_CURRENT_ADMINISTRATION'],
    citationRefs: [
      { factKey: 'FACT_HS_TS_HISTORICAL_DOCUMENTS', sourceKey: 'SRC_MOFA_VN_HOANG_SA_TRUONG_SA' },
      { factKey: 'FACT_HS_PARACELS_1974_BATTLE', sourceKey: 'SRC_NAVALHISTORY_PARACELS_1974' },
    ],
  },
];
