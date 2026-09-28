import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

// Synthetic QA fixtures only. Never imported by the production application.
const region = {
  id: "region-fixture", slug: "vung-thu-nghiem", type: "PROVINCE", code: "QA-10",
  country: { id: "country-fixture", slug: "quoc-gia-thu-nghiem", iso2: "QA" },
  parentRegion: { id: "parent", slug: "vung-cha-thu-nghiem" },
  location: { latitude: 16.2, longitude: 107.8 },
  translation: { name: "Vùng thử nghiệm ven sông", summary: "Nội dung tóm tắt thử nghiệm để kiểm tra giao diện vùng.", description: "Đoạn giới thiệu thứ nhất từ hợp đồng thử nghiệm.\n\nĐoạn thứ hai giữ nguyên nội dung được cung cấp." },
  meta: { requestedLocale: "vi", resolvedLocale: "vi", fallbackApplied: false },
};
const list = (items: object[]) => ({ items, page: 1, pageSize: 12, total: items.length, totalPages: items.length ? 1 : 0 });
const destinations = list([{ id: "d1", slug: "diem-den-qa", type: "HISTORIC_DISTRICT", name: "Điểm đến bên dòng sông", tagline: "Một mô tả điểm đến trong dữ liệu kiểm thử." }, { id: "d2", slug: "diem-den-khac", type: "OTHER", name: "Không gian khám phá thứ hai", tagline: "Nội dung được trả về cùng danh sách điểm đến." }]);
const cities = list([{ id: "c1", slug: "city-qa", name: "Thành phố thử nghiệm", timezone: "Asia/Bangkok" }]);
const children = list([{ id: "r1", slug: "vung-con-qa", name: "Vùng trực thuộc thử nghiệm", type: "OTHER" }]);
const path = "/regions/vung-thu-nghiem";
async function mock(page: Page, options: { detail?: unknown; status?: number; empty?: boolean; listError?: boolean; mapError?: boolean } = {}) {
  await page.route("https://tiles.openfreemap.org/**", route => options.mapError ? route.abort() : route.fulfill({ json: { version: 8, sources: {}, layers: [] } }));
  await page.route("**/v1/**", route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/v1/regions/vung-thu-nghiem") return route.fulfill({ status: options.status ?? 200, json: { data: options.detail ?? region } });
    const collections: Record<string, unknown> = { "/v1/destinations": destinations, "/v1/cities": cities, "/v1/regions": children };
    const expectedFilter = url.pathname === "/v1/regions" ? "parentRegion" : "region";
    if (url.searchParams.get(expectedFilter) !== region.slug || !collections[url.pathname]) return route.fulfill({ status: 400, json: { error: "Unexpected API request" } });
    return route.fulfill({ status: options.listError ? 503 : 200, json: { data: options.empty ? list([]) : collections[url.pathname] } });
  });
}

for (const viewport of [{ width: 390, height: 844 }, { width: 834, height: 1112 }, { width: 1536, height: 960 }]) {
  test(`Region V2 responsive ${viewport.width}`, async ({ page }) => {
    await mock(page); await page.setViewportSize(viewport); await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: region.translation.name })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Đường dẫn", exact: true }).getByRole("link", { name: "QA", exact: true })).toHaveAttribute("href", "/countries/quoc-gia-thu-nghiem");
    await expect(page.getByRole("region", { name: "Khám phá điểm đến", exact: true }).getByRole("link", { name: /Điểm đến bên dòng sông/ })).toHaveAttribute("href", "/destinations/diem-den-qa");
    await expect(page.getByRole("region", { name: "Thành phố trong vùng", exact: true }).getByRole("heading", { level: 3 })).toHaveText("Thành phố thử nghiệm");
    await expect(page.getByText("Bản đồ tham chiếu · một điểm đại diện", { exact: true })).toBeVisible();
    await expect.poll(async () => page.locator(".region-map-dot").evaluate(marker => {
      const dot = marker.getBoundingClientRect();
      const map = marker.closest(".region-map")!.getBoundingClientRect();
      return Math.abs((dot.x + dot.width / 2) - (map.x + map.width / 2));
    })).toBeLessThan(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    mkdirSync("qa-evidence/pass-10", { recursive: true });
    await page.screenshot({ path: `qa-evidence/pass-10/region-${viewport.width}.png`, fullPage: true });
  });
}

test("only contracted content, relationships, media and spatial point", async ({ page }) => {
  const requests: string[] = []; page.on("request", request => { if (request.url().includes("/v1/")) requests.push(new URL(request.url()).pathname); });
  await mock(page); await page.goto(path);
  await expect(page.getByText("Đoạn giới thiệu thứ nhất từ hợp đồng thử nghiệm.", { exact: true })).toBeVisible();
  await expect(page.getByText("16.2000, 107.8000", { exact: true })).toBeVisible();
  await expect(page.getByText("Chưa có hình ảnh tư liệu của vùng.", { exact: true })).toBeVisible();
  await expect(page.locator("main img")).toHaveCount(0);
  await expect(page.locator('a[href^="/places/"], a[href^="/stories/"], a[href^="/journeys/"], a[href^="/cities/"]')).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Các vùng trực thuộc", exact: true }).getByRole("link")).toHaveAttribute("href", "/regions/vung-con-qa?locale=vi");
  await expect(page.getByText(/Chưa có nguồn trích dẫn hoặc đánh giá/)).toBeVisible();
  expect(new Set(requests)).toEqual(new Set(["/v1/regions/vung-thu-nghiem", "/v1/destinations", "/v1/cities", "/v1/regions"]));
  await expect(page.locator(".region-map-dot")).toHaveCount(1);
});

test("English UI and explicit backend fallback with CJK text", async ({ page }) => {
  await mock(page, { detail: { ...region, translation: { ...region.translation, name: "長い地域名の表示確認・歴史と文化の地域資料" }, meta: { requestedLocale: "en", resolvedLocale: "ja", fallbackApplied: true } } });
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`${path}?locale=en`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveAttribute("lang", "ja");
  await expect(page.getByText("Fallback language: ja · Requested language: en", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Explore destinations", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("empty collections, absent media, editorial content and coordinates", async ({ page }) => {
  await mock(page, { empty: true, detail: { ...region, location: null, translation: null, parentRegion: null, code: null, meta: { requestedLocale: "vi", resolvedLocale: null, fallbackApplied: false } } });
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(region.slug);
  await expect(page.getByText("Chưa có tọa độ đại diện hợp lệ cho vùng này.", { exact: true })).toBeVisible();
  await expect(page.getByText("Chưa có nội dung được công bố trong danh sách này.", { exact: true })).toHaveCount(3);
  await expect(page.locator(".region-map")).toHaveCount(0);
});

test("reject invalid representative coordinates", async ({ page }) => {
  await mock(page, { detail: { ...region, location: { latitude: 91, longitude: 107 } } }); await page.goto(path);
  await expect(page.locator(".region-map")).toHaveCount(0);
  await expect(page.getByText("Chưa có tọa độ đại diện hợp lệ cho vùng này.", { exact: true })).toBeVisible();
});

test("loading and 404 are distinct and retry recovers", async ({ page }) => {
  await mock(page, { status: 404 });
  await page.route("**/v1/regions/vung-thu-nghiem?**", async route => { await new Promise(resolve => setTimeout(resolve, 500)); await route.fallback(); });
  await page.goto(path); await expect(page.getByRole("status")).toHaveText("Đang mở hồ sơ vùng…");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Không tìm thấy vùng");
  await page.unrouteAll(); await mock(page); await page.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(region.translation.name);
});

test("API failure and independent relationship retry", async ({ page }) => {
  await mock(page, { status: 503 }); await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Chưa thể mở hồ sơ vùng");
  await page.unrouteAll(); await mock(page, { listError: true }); await page.getByRole("button", { name: "Thử lại", exact: true }).click();
  const section = page.getByRole("region", { name: "Khám phá điểm đến", exact: true });
  await expect(section.getByText("Chưa tải được danh sách. Vui lòng thử lại.", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(region.translation.name);
  await page.unrouteAll(); await mock(page); await section.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(section.getByRole("link", { name: /Điểm đến bên dòng sông/ })).toBeVisible();
});

test("pagination failure keeps previous entries then retries same page", async ({ page }) => {
  await mock(page); let secondFails = true;
  await page.route("**/v1/destinations?**", route => {
    const pageNumber = new URL(route.request().url()).searchParams.get("page");
    if (pageNumber === "2" && secondFails) return route.fulfill({ status: 503, json: {} });
    return route.fulfill({ json: { data: pageNumber === "1" ? { ...destinations, total: 3, totalPages: 2 } : { items: [{ id: "d3", slug: "third", name: "Điểm đến trang hai" }], page: 2, pageSize: 12, total: 3, totalPages: 2 } } });
  });
  await page.goto(path); const section = page.getByRole("region", { name: "Khám phá điểm đến", exact: true });
  await section.getByRole("button", { name: "Xem thêm", exact: true }).click();
  await expect(section.getByRole("link", { name: /Điểm đến bên dòng sông/ })).toBeVisible();
  secondFails = false; await section.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(section.getByRole("link", { name: "Điểm đến trang hai", exact: true })).toBeVisible();
  await expect(section.getByRole("link")).toHaveCount(3);
});

test("basemap failure preserves readable coordinates and destinations", async ({ page }) => {
  await mock(page, { mapError: true }); await page.goto(path);
  await expect(page.getByText(/Bản đồ nền chưa khả dụng/)).toBeVisible();
  await expect(page.getByText("16.2000, 107.8000", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Khám phá điểm đến", exact: true }).getByRole("link")).toHaveCount(2);
});

test("keyboard focus, touch targets, long text and reduced motion", async ({ page }) => {
  await mock(page, { detail: { ...region, translation: { ...region.translation, name: "Tên vùng rất dài để kiểm tra khả năng xuống dòng trên thiết bị di động và máy tính bảng" } } });
  await page.emulateMedia({ reducedMotion: "reduce" }); await page.setViewportSize({ width: 390, height: 844 }); await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.keyboard.press("Tab"); await expect(page.getByRole("link", { name: "Bỏ qua đến nội dung", exact: true })).toBeFocused();
  await page.keyboard.press("Tab"); const focused = page.locator(":focus");
  expect(await focused.evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe("none");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe("auto");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const tooSmall = await page.locator(".region-page a, .region-page button").evaluateAll(nodes => nodes.filter(node => node.getBoundingClientRect().height > 0 && node.getBoundingClientRect().height < 44).map(node => node.textContent));
  expect(tooSmall).toEqual([]);
});
