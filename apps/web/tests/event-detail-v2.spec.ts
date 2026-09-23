import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

// Synthetic QA data, kept outside the production application.
const event = {
  id: "event-qa", slug: "su-kien-thu-nghiem",
  date: { year: 120, month: null, day: null, precision: "YEAR", qualifier: "CIRCA", era: "BCE", rangeEnd: null, display: "Khoảng năm 120 TCN" },
  translation: { title: "Dấu mốc bên dòng sông", summary: "Tóm tắt sự kiện từ dữ liệu kiểm thử, dùng để kiểm tra cách trình bày nội dung lịch sử.", description: "Đoạn diễn giải thứ nhất được cung cấp nguyên văn trong dữ liệu kiểm thử.\n\nĐoạn thứ hai giữ nguyên những giới hạn của hồ sơ, không bổ sung diễn giải lịch sử bên ngoài." },
  heroMedia: null,
  countries: [{ id: "c1", slug: "quoc-gia-a", iso2: "QA", role: "RELATED" }, { id: "c2", slug: "quoc-gia-b", iso2: "QB", role: "OCCURRED_IN" }],
  places: [{ id: "p1", slug: "dia-diem-qa", name: "Địa điểm bên dòng sông" }, { id: "p2", slug: "dia-diem-khac", name: "Không gian ghi dấu ký ức" }],
  people: [{ id: "person1", slug: "nhan-vat-qa", displayName: "Nhân vật trong hồ sơ thử nghiệm" }],
  themes: [{ id: "theme1", slug: "chu-de-qa", category: "OTHER", name: "Chủ đề được liên kết" }],
  era: { id: "era1", slug: "thoi-ky-thu-nghiem" }, territory: { id: "territory1", slug: "lanh-tho-thu-nghiem" },
  meta: { requestedLocale: "vi", resolvedLocale: "vi", fallbackApplied: false },
};
const stories = [{ id: "s1", slug: "cau-chuyen-qa", type: "EDITORIAL", title: "Đọc tiếp những lớp ký ức của nơi chốn" }, { id: "s2", slug: "cau-chuyen-khac", type: "EDITORIAL", title: "Câu chuyện thứ hai trong hồ sơ" }];
const sources = [{ id: "src1", title: "Tư liệu tham chiếu dùng trong kiểm thử", sourceType: "BOOK", author: "Tác giả thử nghiệm", publisher: "Nhà xuất bản thử nghiệm", publicationYear: 2001, credibilityLevel: "PRIMARY", url: "https://example.org/reference/long-source-address-for-responsive-testing" }, { id: "src2", title: "Nguồn chưa được đánh giá", sourceType: "WEBSITE", credibilityLevel: "UNKNOWN", url: "javascript:alert(1)" }];
const media = { id: "event-image", type: "ARCHIVAL_PHOTO", mimeType: "image/svg+xml", status: "READY", accessPolicy: "PUBLIC", rightsStatus: "PUBLIC_DOMAIN", provenanceNote: "Nguồn gốc ảnh kiểm thử.", isHistorical: true, isAiGenerated: false, url: "https://media.example.test/event-image.svg", altText: "Hình ảnh kiểm thử của sự kiện", creatorName: "Tác giả hình ảnh thử nghiệm" };
const routePath = "/events/su-kien-thu-nghiem";
type Options = { detail?: unknown; mainStatus?: number; stories?: unknown; storiesStatus?: number; sources?: unknown; sourcesStatus?: number; media?: unknown; mediaStatus?: number };
async function mock(page: Page, options: Options = {}) {
  await page.route("https://media.example.test/**", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="640"><rect width="1200" height="640" fill="#EADDC7"/><text x="70" y="340" fill="#062A24" font-size="50">Synthetic media fixture</text></svg>' }));
  await page.route("**/v1/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/v1/events/su-kien-thu-nghiem") return route.fulfill({ status: options.mainStatus ?? 200, json: { data: options.detail ?? event } });
    if (path === "/v1/events/su-kien-thu-nghiem/stories") return route.fulfill({ status: options.storiesStatus ?? 200, json: { data: options.stories ?? stories } });
    if (path === "/v1/events/su-kien-thu-nghiem/sources") return route.fulfill({ status: options.sourcesStatus ?? 200, json: { data: options.sources ?? sources } });
    if (path === "/v1/media/event-image") return route.fulfill({ status: options.mediaStatus ?? 200, json: { data: options.media ?? media } });
    return route.fulfill({ status: 400, json: { error: "Unexpected endpoint" } });
  });
}

for (const viewport of [{ width: 390, height: 844 }, { width: 834, height: 1112 }, { width: 1536, height: 960 }]) {
  test(`Event V2 responsive ${viewport.width}`, async ({ page }) => {
    await mock(page); await page.setViewportSize(viewport); await page.goto(routePath);
    await expect(page.getByRole("heading", { level: 1, name: event.translation.title })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Thời gian lịch sử", exact: true }).getByText(event.date.display, { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Đọc tiếp câu chuyện", exact: true }).getByRole("link")).toHaveCount(2);
    await expect(page.getByRole("region", { name: "Nguồn tham chiếu", exact: true }).getByRole("heading", { name: sources[0].title, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    mkdirSync("qa-evidence/pass-11", { recursive: true });
    await page.screenshot({ path: `qa-evidence/pass-11/event-${viewport.width}.png`, fullPage: true });
  });
}

test("narrative, country roles, actual links and non-link context", async ({ page }) => {
  const requests: string[] = []; page.on("request", req => { if (req.url().includes("/v1/")) requests.push(new URL(req.url()).pathname); });
  await mock(page); await page.goto(routePath);
  await expect(page.getByText(event.translation.summary, { exact: true })).toBeVisible();
  await expect(page.getByText(event.translation.description.split("\n\n")[0], { exact: true })).toBeVisible();
  const countries = page.getByRole("region", { name: "Quốc gia liên quan", exact: true });
  await expect(countries.getByRole("link", { name: "QA Vai trò liên kết: RELATED", exact: true })).toHaveAttribute("href", "/countries/quoc-gia-a");
  await expect(countries.getByRole("link", { name: "QB Vai trò liên kết: OCCURRED_IN", exact: true })).toHaveAttribute("href", "/countries/quoc-gia-b");
  await expect(page.getByRole("navigation", { name: "Điều hướng sự kiện", exact: true }).getByRole("link")).toHaveCount(1);
  await expect(page.getByRole("region", { name: "Địa điểm liên quan", exact: true }).getByRole("link", { name: "Địa điểm bên dòng sông", exact: true })).toHaveAttribute("href", "/places/dia-diem-qa");
  const context = page.getByRole("region", { name: "Con người & bối cảnh", exact: true });
  await expect(context.getByText(event.people[0].displayName, { exact: true })).toBeVisible();
  await expect(context.getByText(event.themes[0].name, { exact: false })).toBeVisible();
  await expect(context.getByText(event.era.slug, { exact: true })).toBeVisible();
  await expect(context.getByText(event.territory.slug, { exact: true })).toBeVisible();
  await expect(context.getByRole("link")).toHaveCount(0);
  await expect(page.locator('a[href^="/people/"],a[href^="/themes/"],a[href^="/cultures/"],a[href^="/eras/"],a[href^="/territories/"]')).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Đọc tiếp câu chuyện", exact: true }).getByRole("link").first()).toHaveAttribute("href", "/stories/cau-chuyen-qa");
  await expect(page.locator("canvas,.maplibregl-map,main img")).toHaveCount(0);
  expect(new Set(requests)).toEqual(new Set(["/v1/events/su-kien-thu-nghiem", "/v1/events/su-kien-thu-nghiem/stories", "/v1/events/su-kien-thu-nghiem/sources"]));
});

for (const date of [
  { display: "Giữa năm 120 TCN và năm 110 TCN", precision: "YEAR", qualifier: "BETWEEN", era: "BCE", year: 120, rangeEnd: { year: 110, month: null, day: null } },
  { display: "Năm 1288", precision: "YEAR", qualifier: "EXACT", era: "CE", year: 1288 },
  { display: "Không rõ ngày tháng", precision: "UNKNOWN", qualifier: "UNCERTAIN", era: "CE", year: null },
]) test(`preserves historical meaning: ${date.qualifier}`, async ({ page }) => {
  await mock(page, { detail: { ...event, date } }); await page.goto(routePath);
  const time = page.getByRole("complementary", { name: "Thời gian lịch sử", exact: true });
  await expect(time.locator("strong")).toHaveText(date.display);
  await expect(time.locator("time[datetime]")).toHaveCount(0);
});

test("sources remain source context with safe external links and no event certainty claim", async ({ page }) => {
  await mock(page); await page.goto(routePath);
  const section = page.getByRole("region", { name: "Nguồn tham chiếu", exact: true });
  await expect(section.getByText("PRIMARY", { exact: true })).toBeVisible();
  await expect(section.getByText("UNKNOWN", { exact: true })).toBeVisible();
  const link = section.getByRole("link", { name: `Mở nguồn tham chiếu: ${sources[0].title}`, exact: true });
  await expect(link).toHaveAttribute("href", sources[0].url); await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(section.getByText("Liên kết nguồn không khả dụng.", { exact: true })).toBeVisible();
  await expect(section.getByText(/Độ tin cậy của nguồn không phải mức độ chắc chắn/)).toBeVisible();
  await expect(page.locator('a[href^="javascript:"],a[href^="/facts/"],a[href^="#citation-"]')).toHaveCount(0);
  await expect(page.getByText("Verified", { exact: true })).toHaveCount(0);
});

test("exact media ID only; raw hero URL is ignored", async ({ page }, testInfo) => {
  const requested: string[] = []; page.on("request", req => requested.push(req.url()));
  await mock(page, { detail: { ...event, heroMedia: { id: "event-image", url: "https://untrusted.example.test/raw.jpg" } } });
  await page.goto(routePath);
  const section = page.getByRole("region", { name: "Hình ảnh & nguồn gốc", exact: true });
  await expect(section.getByRole("img", { name: media.altText })).toHaveAttribute("src", media.url);
  await expect(section.getByText(media.provenanceNote, { exact: false })).toBeVisible();
  expect(requested.some(url => url.endsWith("/v1/media/event-image"))).toBe(true);
  expect(requested.some(url => url.includes("untrusted.example.test"))).toBe(false);
  await expect(section.getByRole("img")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("event-media.png"), fullPage: true });
});

test("AI reconstruction disclosure and English media labels", async ({ page }) => {
  await mock(page, { detail: { ...event, heroMedia: { id: "event-image" } }, media: { ...media, type: "RECONSTRUCTION", isAiGenerated: true, aiDisclosure: "Synthetic reconstruction fixture" } });
  await page.goto(`${routePath}?locale=en`);
  const section = page.getByRole("region", { name: "Imagery & provenance", exact: true });
  await expect(section.getByText("AI / Reconstruction: Synthetic reconstruction fixture", { exact: true })).toBeVisible();
  await expect(section.getByText("AI content is not documentary evidence.", { exact: true })).toBeVisible();
  await expect(section.getByText(`Provenance: ${media.provenanceNote}`, { exact: true })).toBeVisible();
});

for (const condition of ["restricted", "missing-provenance", "not-ready", "mismatched-id", "failure"] as const) test(`refuses unsafe media: ${condition}`, async ({ page }) => {
  const value = { ...media, ...(condition === "restricted" ? { accessPolicy: "RESTRICTED" } : condition === "missing-provenance" ? { provenanceNote: null } : condition === "not-ready" ? { status: "UPLOADED" } : condition === "mismatched-id" ? { id: "unrelated-media" } : {}) };
  await mock(page, { detail: { ...event, heroMedia: { id: "event-image" } }, media: value, mediaStatus: condition === "failure" ? 503 : 200 }); await page.goto(routePath);
  const section = page.getByRole("region", { name: "Hình ảnh & nguồn gốc", exact: true });
  await expect(section.getByRole("status")).toHaveText("Media chưa khả dụng hoặc chưa đủ thông tin quyền sử dụng / nguồn gốc để hiển thị.");
  await expect(section.getByRole("img")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(event.translation.title);
});

test("missing content, date, media and all relationships remain truthful", async ({ page }) => {
  await mock(page, { detail: { ...event, translation: null, date: null, countries: [], places: [], people: [], themes: [], era: null, territory: null }, stories: [], sources: [] }); await page.goto(routePath);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(event.slug);
  for (const text of ["Thời gian chưa được cung cấp", "Chưa có tóm tắt cho sự kiện này.", "Nội dung diễn giải chi tiết chưa được cung cấp.", "Chưa có hình ảnh gắn với hồ sơ sự kiện.", "Chưa có địa điểm được liên kết.", "Chưa có quốc gia được liên kết.", "Chưa có con người, chủ đề, thời kỳ hoặc lãnh thổ lịch sử được liên kết.", "Chưa có câu chuyện được trả về cho sự kiện này.", "Chưa có nguồn tham chiếu được trả về."]) await expect(page.getByText(text, { exact: true })).toBeVisible();
  await expect(page.locator("main img,canvas")).toHaveCount(0);
});

test("independent stories/sources failures and retries preserve identity", async ({ page }) => {
  await mock(page, { storiesStatus: 503, sourcesStatus: 503 }); await page.goto(routePath);
  const storySection = page.getByRole("region", { name: "Đọc tiếp câu chuyện", exact: true });
  const sourceSection = page.getByRole("region", { name: "Nguồn tham chiếu", exact: true });
  await expect(storySection.getByRole("status")).toHaveText(/Chưa tải được câu chuyện/);
  await expect(sourceSection.getByRole("status")).toHaveText(/Chưa tải được nguồn tham chiếu/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(event.translation.title);
  await page.unrouteAll(); await mock(page);
  await storySection.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(storySection.getByRole("link")).toHaveCount(2);
  await expect(sourceSection.getByRole("button", { name: "Thử lại", exact: true })).toBeVisible();
  await sourceSection.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(sourceSection.getByRole("heading", { name: sources[0].title, exact: true })).toBeVisible();
});

test("loading, 404 and main API error can recover", async ({ page }) => {
  await mock(page, { mainStatus: 404 });
  await page.route("**/v1/events/su-kien-thu-nghiem?**", async route => { await new Promise(resolve => setTimeout(resolve, 700)); await route.fallback(); });
  await page.goto(routePath); await expect(page.getByRole("status")).toHaveText("Đang mở hồ sơ sự kiện…");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Không tìm thấy sự kiện");
  await page.unrouteAll(); await mock(page, { mainStatus: 503 }); await page.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Chưa thể mở hồ sơ sự kiện");
  await page.unrouteAll(); await mock(page); await page.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(event.translation.title);
});

test("English locale, backend fallback and long multilingual wrapping", async ({ page }) => {
  await mock(page, { detail: { ...event, translation: { ...event.translation, title: "A very long historical event title for multilingual responsive reading 歷史事件と地域の記憶を読み解く" }, meta: { requestedLocale: "en", resolvedLocale: "vi", fallbackApplied: true } }, sources: [{ ...sources[0], url: `https://example.org/${"long-source-address".repeat(30)}` }] });
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`${routePath}?locale=en`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveAttribute("lang", "vi");
  await expect(page.getByText("Fallback language: vi · Requested language: en", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Reference sources", exact: true }).getByRole("link")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("keyboard focus, 44px controls and reduced motion", async ({ page }) => {
  await mock(page); await page.emulateMedia({ reducedMotion: "reduce" }); await page.setViewportSize({ width: 390, height: 844 }); await page.goto(routePath);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.keyboard.press("Tab"); await expect(page.getByRole("link", { name: "Bỏ qua đến nội dung", exact: true })).toBeFocused();
  await page.keyboard.press("Tab"); expect(await page.locator(":focus").evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe("none");
  for (const selector of ['a[href="/places/dia-diem-qa"]', 'a[href="/countries/quoc-gia-a"]', 'a[href="/stories/cau-chuyen-qa"]', '.event-source-link']) {
    await page.locator(selector).focus(); await expect(page.locator(selector)).toBeFocused();
  }
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe("auto");
  expect(await page.locator(".event-page a,.event-page button").evaluateAll(nodes => nodes.filter(el => el.getBoundingClientRect().height > 0 && el.getBoundingClientRect().height < 44).map(el => el.textContent))).toEqual([]);
});
