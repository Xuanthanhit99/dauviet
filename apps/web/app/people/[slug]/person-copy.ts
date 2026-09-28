import type { RelatedCopy } from "../../components/editorial-related";

const shared = {
  vi: {
    stories: "Đọc tiếp câu chuyện", storiesNote: "Những câu chuyện được liên kết với nhân vật. Danh sách có thể chỉ là một phần nội dung hiện có.", noStories: "Chưa có câu chuyện được trả về cho nhân vật này.",
    supportLoading: "Đang tải nội dung…", retry: "Thử lại", storiesError: "Chưa tải được câu chuyện. Hồ sơ nhân vật vẫn có thể đọc ở trên.", sourcesError: "Chưa tải được nguồn tham chiếu. Hồ sơ nhân vật vẫn có thể đọc ở trên.",
    sources: "Nguồn tham chiếu", sourceIntro: "Nguồn được liên kết qua các dữ kiện đã xuất bản về nhân vật. Hồ sơ này chưa cung cấp trích dẫn cho từng đoạn văn.", noSources: "Chưa có nguồn tham chiếu được trả về.",
    sourceType: "Loại nguồn", author: "Tác giả", organization: "Tổ chức", publisher: "Nhà xuất bản", year: "Năm xuất bản", credibility: "Độ tin cậy của nguồn", sourceUntitled: "Nguồn chưa có tiêu đề", sourceUrlUnavailable: "Liên kết nguồn không khả dụng.",
    trust: "Đọc cùng bối cảnh bằng chứng", trustNote: "Độ tin cậy của nguồn không phải mức độ chắc chắn của toàn bộ hồ sơ nhân vật. Chưa có đánh giá mức độ chắc chắn tổng thể hoặc liên kết trích dẫn tới từng khẳng định trong hồ sơ này.", external: "Mở nguồn tham chiếu", unknownCredibility: "Chưa rõ",
  },
  en: {
    stories: "Read related stories", storiesNote: "Stories linked to this person. This list may show only part of the available content.", noStories: "No stories were returned for this person.",
    supportLoading: "Loading content…", retry: "Try again", storiesError: "Related stories could not be loaded. The person profile remains readable above.", sourcesError: "Reference sources could not be loaded. The person profile remains readable above.",
    sources: "Reference sources", sourceIntro: "Sources linked through published facts about this person. Paragraph-level citations are not supplied in this profile.", noSources: "No reference sources were returned.",
    sourceType: "Source type", author: "Author", organization: "Organization", publisher: "Publisher", year: "Publication year", credibility: "Source credibility", sourceUntitled: "Untitled source", sourceUrlUnavailable: "The source link is unavailable.",
    trust: "Read with the evidence in context", trustNote: "Source credibility is not the certainty of the entire person profile. An overall confidence assessment and claim-level citation links are not supplied in this profile.", external: "Open reference source", unknownCredibility: "Unknown",
  },
} satisfies Record<"vi" | "en", RelatedCopy>;

export const personCopy = {
  vi: {
    ...shared.vi,
    person: "Nhân vật", home: "Trang chủ", language: "Ngôn ngữ giao diện", map: "Khám phá bản đồ", breadcrumb: "Điều hướng nhân vật",
    loading: "Đang mở hồ sơ nhân vật…", missing: "Không tìm thấy nhân vật", error: "Chưa thể mở hồ sơ nhân vật", errorBody: "Hồ sơ hiện chưa khả dụng. Bạn có thể thử lại hoặc tiếp tục khám phá.",
    untitled: "Chưa có tên được cung cấp. Đang hiển thị mã định danh của hồ sơ.", alternateNames: "Tên gọi khác", noSummary: "Chưa có tóm tắt cho nhân vật này.", noDescription: "Nội dung tiểu sử chi tiết chưa được cung cấp.",
    life: "Dấu mốc cuộc đời", birth: "Sinh", death: "Mất", unknownDate: "Chưa rõ thời gian", dateNote: "Giữ nguyên thời gian được ghi nhận, kể cả khoảng thời gian và mức độ chính xác.",
    fallback: "Ngôn ngữ dự phòng", requested: "Ngôn ngữ yêu cầu", unknown: "Chưa cung cấp",
    noMedia: "Chưa có hình ảnh gắn với hồ sơ nhân vật.", media: "Hình ảnh & nguồn gốc", mediaNote: "Đọc thông tin nguồn gốc và loại hình bên dưới mỗi hình ảnh.",
    inside: "Trong hồ sơ", understand: "Đọc hồ sơ", narrative: "Điều được ghi lại", places: "Những nơi kết nối", role: "Vai trò liên kết", noPlaces: "Chưa có địa điểm được liên kết.",
    relationNote: "Những địa điểm gắn với nhân vật theo vai trò được ghi nhận trong hồ sơ.", relationLocale: "Hồ sơ chưa cung cấp ngôn ngữ và trạng thái xuất bản riêng của từng địa điểm liên quan.",
    timeline: "Sự kiện kết nối", timelineNote: "Các sự kiện đã xuất bản được liên kết với nhân vật. Mối liên hệ không tự giải thích vai trò của nhân vật trong sự kiện.", timelineLocale: "Ngôn ngữ riêng của từng tiêu đề sự kiện chưa được cung cấp.", timelineEmpty: "Chưa có sự kiện được trả về trong dòng thời gian.", timelineError: "Chưa tải được sự kiện kết nối. Hồ sơ nhân vật vẫn có thể đọc ở trên.",
    continue: "Tiếp tục khám phá", backEvents: "Đến các sự kiện kết nối",
  },
  en: {
    ...shared.en,
    person: "Person", home: "Home", language: "Interface language", map: "Explore the map", breadcrumb: "Person navigation",
    loading: "Opening person profile…", missing: "Person not found", error: "Person profile unavailable", errorBody: "This profile is currently unavailable. Try again or continue exploring.",
    untitled: "No name has been supplied. The profile identifier is shown instead.", alternateNames: "Other names", noSummary: "No summary is available for this person.", noDescription: "A detailed biography has not been supplied.",
    life: "Life dates", birth: "Born", death: "Died", unknownDate: "Date unknown", dateNote: "Time is shown as recorded, preserving date ranges and precision.",
    fallback: "Fallback language", requested: "Requested language", unknown: "Not supplied",
    noMedia: "No imagery is linked to this person profile.", media: "Imagery & provenance", mediaNote: "Read the provenance and media classification beneath each image.",
    inside: "In this profile", understand: "Read the profile", narrative: "What is recorded", places: "Connected places", role: "Relationship role", noPlaces: "No places are linked.",
    relationNote: "Places connected to this person through the roles recorded in the profile.", relationLocale: "Individual language and publication metadata for related places are not supplied in this profile.",
    timeline: "Connected events", timelineNote: "Published events linked to this person. A connection does not itself explain the person's role in an event.", timelineLocale: "Individual language metadata for event titles is not supplied.", timelineEmpty: "No events were returned in the timeline.", timelineError: "Connected events could not be loaded. The person profile remains readable above.",
    continue: "Continue exploring", backEvents: "Go to connected events",
  },
};
export type PersonLocale = keyof typeof personCopy;
