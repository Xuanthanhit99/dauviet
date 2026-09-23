import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

// Synthetic fixtures only; no biographical claims are added to production content.
const person = {
  id: "person-qa", slug: "nhan-vat-qa",
  birth: { display: "Khoảng năm 120 TCN", year: 120, precision: "YEAR", qualifier: "CIRCA", era: "BCE" },
  death: { display: "Giữa năm 80 TCN và năm 70 TCN", year: 80, precision: "YEAR", qualifier: "BETWEEN", era: "BCE", rangeEnd: { year: 70 } },
  translation: { displayName: "Người lưu giữ ký ức", alternateNames: "Tên gọi thứ nhất; Tên gọi thứ hai", summary: "Một hồ sơ nhân vật từ dữ liệu kiểm thử, dùng để kiểm tra cách trình bày nội dung lịch sử.", description: "Đoạn tiểu sử thứ nhất được cung cấp nguyên văn trong dữ liệu kiểm thử.\n\nĐoạn thứ hai giữ nguyên những giới hạn của hồ sơ, không bổ sung lịch sử bên ngoài." },
  heroMedia: null,
  places: [{ id: "p1", slug: "dia-diem-qa", name: "Không gian lưu dấu ký ức", role: "ACTIVITY" }, { id: "p2", slug: "dia-diem-khac", name: "Địa điểm được kết nối", role: "OTHER" }],
  meta: { requestedLocale: "vi", resolvedLocale: "vi", fallbackApplied: false },
};
const timeline = [{ id: "e1", slug: "su-kien-qa", title: "Dấu mốc được ghi lại bên dòng sông", date: { display: "Khoảng năm 100 TCN", year: 100, precision: "YEAR", qualifier: "CIRCA", era: "BCE" } }, { id: "e2", slug: "su-kien-khac", title: "Một sự kiện kết nối khác trong hồ sơ", date: { display: "Không rõ ngày tháng", precision: "UNKNOWN" } }];
const stories = [{ id: "s1", slug: "cau-chuyen-qa", type: "EDITORIAL", title: "Những lớp ký ức trong câu chuyện" }];
const sources = [{ id: "src1", title: "Tư liệu tham chiếu dùng trong kiểm thử", sourceType: "BOOK", author: "Tác giả thử nghiệm", publisher: "Nhà xuất bản thử nghiệm", publicationYear: 2001, credibilityLevel: "PRIMARY", url: "https://example.org/reference/long-source-address-for-responsive-testing" }, { id: "src2", title: "Nguồn chưa được đánh giá", sourceType: "WEBSITE", credibilityLevel: "UNKNOWN", url: "javascript:alert(1)" }];
const media = { id: "person-image", type: "ARCHIVAL_PHOTO", mimeType: "image/svg+xml", status: "READY", accessPolicy: "PUBLIC", rightsStatus: "PUBLIC_DOMAIN", provenanceNote: "Nguồn gốc ảnh kiểm thử.", isHistorical: true, isAiGenerated: false, url: "https://media.example.test/person-image.svg", altText: "Hình ảnh kiểm thử của nhân vật", creatorName: "Tác giả hình ảnh thử nghiệm" };
const path = "/people/nhan-vat-qa";
type Options = { detail?: unknown; mainStatus?: number; timeline?: unknown; timelineStatus?: number; stories?: unknown; storiesStatus?: number; sources?: unknown; sourcesStatus?: number; media?: unknown; mediaStatus?: number };
async function mock(page: Page, options: Options = {}) {
  await page.route("https://media.example.test/**", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="#EADDC7"/><text x="40" y="500" fill="#062A24" font-size="38">Synthetic media fixture</text></svg>' }));
  await page.route("**/v1/**", route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/v1/people/nhan-vat-qa") return route.fulfill({ status: options.mainStatus ?? 200, json: { data: options.detail ?? person } });
    for (const name of ["timeline", "stories", "sources"] as const) if (url.pathname === `/v1/people/nhan-vat-qa/${name}`) return route.fulfill({ status: options[`${name}Status`] ?? 200, json: { data: options[name] ?? { timeline, stories, sources }[name] } });
    if (url.pathname === "/v1/media/person-image") return route.fulfill({ status: options.mediaStatus ?? 200, json: { data: options.media ?? media } });
    return route.fulfill({ status: 400, json: { error: "Unexpected endpoint" } });
  });
}
const region = (page: Page, name: string) => page.getByRole("region", { name, exact: true });
for (const viewport of [{ width: 390, height: 844 }, { width: 834, height: 1112 }, { width: 1536, height: 960 }]) test(`Person V2 responsive ${viewport.width}`, async ({ page }) => {
  await mock(page); await page.setViewportSize(viewport); await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(person.translation.displayName);
  await page.getByText("Tên gọi khác", { exact: true }).click();
  await expect(page.getByText(person.translation.alternateNames, { exact: true })).toBeVisible();
  await expect(region(page, "Sự kiện kết nối").getByRole("link")).toHaveCount(2);
  await expect(region(page, "Nguồn tham chiếu").getByRole("heading", { name: sources[0].title, exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  mkdirSync("qa-evidence/pass-12", { recursive: true }); await page.screenshot({ path: `qa-evidence/pass-12/person-${viewport.width}.png`, fullPage: true });
});

test("identity, supplied narrative, roles, ordered Events, Stories and contracted requests only", async ({ page }) => {
  const requests: string[] = []; page.on("request", req => { if (req.url().includes("/v1/")) requests.push(new URL(req.url()).pathname); });
  await mock(page); await page.goto(path);
  await expect(page.getByText(person.translation.summary, { exact: true })).toBeVisible();
  await expect(page.getByText(person.translation.description.split("\n\n")[0], { exact: true })).toBeVisible();
  await expect(region(page, "Những nơi kết nối").getByRole("link").first()).toHaveAttribute("href", "/places/dia-diem-qa");
  await expect(region(page, "Những nơi kết nối").getByText("Vai trò liên kết: ACTIVITY", { exact: true })).toBeVisible();
  const events = region(page, "Sự kiện kết nối");
  await expect(events.getByRole("link").first()).toHaveAttribute("href", "/events/su-kien-qa?locale=vi");
  await expect(events.getByRole("heading", { level: 3 })).toHaveText(timeline.map(e => e.title + "↗"));
  await expect(events.getByText(timeline[0].date.display, { exact: true })).toBeVisible();
  await expect(events.getByText(timeline[1].date.display, { exact: true })).toBeVisible();
  await expect(region(page, "Đọc tiếp câu chuyện").getByRole("link")).toHaveAttribute("href", "/stories/cau-chuyen-qa");
  await expect(page.locator('main img,canvas,.maplibregl-map,a[href^="/cultures/"],a[href^="/countries/"],a[href^="/journeys/"],time[datetime]')).toHaveCount(0);
  expect(new Set(requests)).toEqual(new Set(["/v1/people/nhan-vat-qa", "/v1/people/nhan-vat-qa/timeline", "/v1/people/nhan-vat-qa/stories", "/v1/people/nhan-vat-qa/sources"]));
});

for (const dates of [
  { birth: person.birth, death: person.death },
  { birth: { display: "Tháng 3 năm 1288", year: 1288, month: 3, precision: "MONTH" }, death: { display: "Không rõ ngày tháng", precision: "UNKNOWN" } },
  { birth: { year: 1200, precision: "YEAR" }, death: null },
]) test(`historical displays preserved without age: ${JSON.stringify(dates)}`, async ({ page }) => {
  await mock(page, { detail: { ...person, ...dates } }); await page.goto(path);
  const life = page.getByRole("complementary", { name: "Dấu mốc cuộc đời", exact: true });
  await expect(life.locator("dd")).toHaveText([("display" in dates.birth ? dates.birth.display : undefined) || "Chưa rõ thời gian", dates.death?.display || "Chưa rõ thời gian"]);
  await expect(page.getByText(/\d+ (tuổi|years old)/)).toHaveCount(0);
});

test("sources have safe links, credibility context and no invented citations", async ({ page }) => {
  await mock(page, { sources: [...sources, { id: "bad", title: "Credential URL", url: "https://user:password@example.org/" }] }); await page.goto(path);
  const section = region(page, "Nguồn tham chiếu");
  await expect(section.getByText("PRIMARY", { exact: true })).toBeVisible();
  await expect(section.getByText("UNKNOWN", { exact: true })).toBeVisible();
  const link = section.getByRole("link", { name: `Mở nguồn tham chiếu: ${sources[0].title}`, exact: true });
  await expect(link).toHaveAttribute("href", sources[0].url); await expect(link).toHaveAttribute("rel", "noopener noreferrer"); await expect(link).toHaveAttribute("target", "_blank");
  await expect(section.getByRole("link")).toHaveCount(1);
  await expect(section.getByText(/Độ tin cậy của nguồn không phải mức độ chắc chắn/)).toBeVisible();
  await expect(page.locator('a[href^="javascript:"],a[href^="/facts/"],a[href^="#citation-"]')).toHaveCount(0);
});

test("exact hero ID ignores raw URL and preserves provenance", async ({ page }, testInfo) => {
  const requests: string[] = []; page.on("request", req => requests.push(req.url()));
  await mock(page, { detail: { ...person, heroMedia: { id: "person-image", url: "https://untrusted.example.test/raw.jpg" } } }); await page.goto(path);
  const section = region(page, "Hình ảnh & nguồn gốc");
  await expect(section.getByRole("img", { name: media.altText })).toHaveAttribute("src", media.url);
  await expect(section.getByText(media.provenanceNote, { exact: false })).toBeVisible();
  expect(requests.some(url => url.endsWith("/v1/media/person-image"))).toBe(true); expect(requests.some(url => url.includes("untrusted.example.test"))).toBe(false);
  await page.screenshot({ path: testInfo.outputPath("person-media.png"), fullPage: true });
});

test("AI and reconstruction remain visibly disclosed", async ({ page }) => {
  await mock(page, { detail: { ...person, heroMedia: { id: "person-image" } }, media: { ...media, type: "RECONSTRUCTION", isAiGenerated: true, aiDisclosure: "Synthetic portrait fixture" } }); await page.goto(`${path}?locale=en`);
  const section = region(page, "Imagery & provenance");
  await expect(section.getByText("AI / Reconstruction: Synthetic portrait fixture", { exact: true })).toBeVisible();
  await expect(section.getByText("AI content is not documentary evidence.", { exact: true })).toBeVisible();
});
for (const condition of ["restricted", "missing-provenance", "rights-unknown", "not-ready", "mismatched-id", "failure"] as const) test(`media refusal: ${condition}`, async ({ page }) => {
  const value = { ...media, ...(condition === "restricted" ? { accessPolicy: "RESTRICTED" } : condition === "missing-provenance" ? { provenanceNote: null } : condition === "rights-unknown" ? { rightsStatus: "UNKNOWN" } : condition === "not-ready" ? { status: "UPLOADED" } : condition === "mismatched-id" ? { id: "unrelated" } : {}) };
  await mock(page, { detail: { ...person, heroMedia: { id: "person-image" } }, media: value, mediaStatus: condition === "failure" ? 503 : 200 }); await page.goto(path);
  await expect(region(page, "Hình ảnh & nguồn gốc").getByRole("status")).toHaveText("Media chưa khả dụng hoặc chưa đủ thông tin quyền sử dụng / nguồn gốc để hiển thị.");
  await expect(region(page, "Hình ảnh & nguồn gốc").getByRole("img")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(person.translation.displayName);
});

test("sparse content stays sparse, including all empty resources", async ({ page }, testInfo) => {
  await mock(page, { detail: { ...person, translation: null, birth: null, death: null, places: [] }, timeline: [], stories: [], sources: [] }); await page.setViewportSize({ width: 390, height: 844 }); await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(person.slug);
  for (const text of ["Chưa có tên được cung cấp. Đang hiển thị mã định danh của hồ sơ.", "Chưa có tóm tắt cho nhân vật này.", "Nội dung tiểu sử chi tiết chưa được cung cấp.", "Chưa có hình ảnh gắn với hồ sơ nhân vật.", "Chưa có địa điểm được liên kết.", "Chưa có sự kiện được trả về trong dòng thời gian.", "Chưa có câu chuyện được trả về cho nhân vật này.", "Chưa có nguồn tham chiếu được trả về."]) await expect(page.getByText(text, { exact: true })).toBeVisible();
  await expect(page.locator("summary,main img,canvas")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("person-empty.png"), fullPage: true });
});

test("timeline, stories and sources retry independently without losing identity", async ({ page }) => {
  await mock(page, { timelineStatus: 503, storiesStatus: 503, sourcesStatus: 503 }); await page.goto(path);
  const sections = [region(page, "Sự kiện kết nối"), region(page, "Đọc tiếp câu chuyện"), region(page, "Nguồn tham chiếu")];
  for (const section of sections) await expect(section.getByRole("button", { name: "Thử lại", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(person.translation.displayName);
  await page.unrouteAll(); await mock(page);
  for (let i = 0; i < sections.length; i++) {
    await sections[i].getByRole("button", { name: "Thử lại", exact: true }).click();
    await expect(sections[i].getByRole("button")).toHaveCount(0);
    for (let j = i + 1; j < sections.length; j++) await expect(sections[j].getByRole("button")).toBeVisible();
  }
  await expect(sections[0].getByRole("link")).toHaveCount(2); await expect(sections[1].getByRole("link")).toHaveCount(1); await expect(sections[2].getByRole("link")).toHaveCount(1);
});

test("loading, 404, main error and retry", async ({ page }) => {
  await mock(page, { mainStatus: 404 }); await page.route("**/v1/people/nhan-vat-qa?**", async route => { await new Promise(resolve => setTimeout(resolve, 700)); await route.fallback(); });
  await page.goto(path); await expect(page.getByRole("status")).toHaveText("Đang mở hồ sơ nhân vật…"); await expect(page.getByRole("heading", { level: 1 })).toHaveText("Không tìm thấy nhân vật");
  await page.unrouteAll(); await mock(page, { mainStatus: 503 }); await page.getByRole("button", { name: "Thử lại", exact: true }).click(); await expect(page.getByRole("heading", { level: 1 })).toHaveText("Chưa thể mở hồ sơ nhân vật");
  await page.unrouteAll(); await mock(page); await page.getByRole("button", { name: "Thử lại", exact: true }).click(); await expect(page.getByRole("heading", { level: 1 })).toHaveText(person.translation.displayName);
});

test("English requests, fallback and long multilingual content wrap", async ({ page }) => {
  const locales: string[] = []; page.on("request", req => { const u = new URL(req.url()); if (u.pathname.startsWith("/v1/people") && !u.pathname.endsWith("/sources")) locales.push(u.searchParams.get("locale") ?? ""); });
  await mock(page, { detail: { ...person, translation: { ...person.translation, displayName: "A long name for multilingual reading 歷史人物と地域の記憶を読み解く".repeat(3), alternateNames: "Tên khác 歷史人物 ".repeat(40) }, meta: { requestedLocale: "en", resolvedLocale: "vi", fallbackApplied: true } }, timeline: [{ ...timeline[0], title: "LongEventTitleWithoutSpaces".repeat(20) }], sources: [{ ...sources[0], url: `https://example.org/${"long-source-address".repeat(30)}` }] });
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`${path}?locale=en`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveAttribute("lang", "vi"); await expect(page.getByText("Fallback language: vi · Requested language: en", { exact: true })).toBeVisible();
  await page.getByText("Other names", { exact: true }).click();
  await expect(region(page, "Reference sources").getByRole("link")).toBeVisible(); await expect(region(page, "Connected events").getByRole("link")).toHaveAttribute("href", "/events/su-kien-qa?locale=en");
  expect(locales).toEqual(["en", "en", "en"]); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("keyboard, 44px targets and reduced motion", async ({ page }) => {
  await mock(page); await page.emulateMedia({ reducedMotion: "reduce" }); await page.setViewportSize({ width: 390, height: 844 }); await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible(); await page.keyboard.press("Tab"); await expect(page.getByRole("link", { name: "Bỏ qua đến nội dung", exact: true })).toBeFocused();
  await page.keyboard.press("Tab"); expect(await page.locator(":focus").evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe("none");
  await page.locator("summary").focus(); await page.keyboard.press("Enter"); await expect(page.getByText(person.translation.alternateNames, { exact: true })).toBeVisible();
  for (const selector of ['a[href="/places/dia-diem-qa"]', 'a[href="/events/su-kien-qa?locale=vi"]', 'a[href="/stories/cau-chuyen-qa"]', '.person-source-link']) { await page.locator(selector).focus(); await expect(page.locator(selector)).toBeFocused(); }
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe("auto");
  expect(await page.locator(".person-page a,.person-page button,.person-page summary").evaluateAll(nodes => nodes.filter(el => el.getBoundingClientRect().height > 0 && el.getBoundingClientRect().height < 44).map(el => el.textContent))).toEqual([]);
});

test("Event Person link opens the supplied Person profile", async ({ page }) => {
  await mock(page);
  await page.route("**/v1/events/entry**", route => {
    const url = new URL(route.request().url());
    return route.fulfill({ json: { data: url.pathname === "/v1/events/entry" ? { id: "entry", slug: "entry", translation: { title: "Event entry fixture" }, people: [{ id: person.id, slug: person.slug, displayName: person.translation.displayName }], meta: person.meta } : [] } });
  });
  await page.goto("/events/entry");
  await region(page, "Con người & bối cảnh").getByRole("link", { name: person.translation.displayName, exact: true }).click();
  await expect(page).toHaveURL(/\/people\/nhan-vat-qa\?locale=vi$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(person.translation.displayName);
});
