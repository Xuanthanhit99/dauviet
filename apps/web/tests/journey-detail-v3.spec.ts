import { expect, test, type Page } from "@playwright/test";

// Contract-only QA content. Nothing in this file is shipped as product data.
const journey = {
  id: "j1", slug: "hanh-trinh-qa", region: "Vùng thử nghiệm", durationMinutes: 180, distanceMeters: 12000,
  difficulty: "MODERATE", publishedAt: "2026-09-20T00:00:00.000Z", routeGeometrySource: "EDITORIAL",
  heroMedia: { id: "jm1", type: "RECONSTRUCTION", isAiGenerated: true, aiDisclosure: "Minh họa tái dựng QA", accessPolicy: "PUBLIC", status: "READY" },
  translation: { title: "Theo những lớp ký ức", summary: "Hành trình QA qua các điểm dừng được biên tập.", description: "Bối cảnh hành trình từ dữ liệu thử nghiệm.\n\nMỗi điểm dừng nối đến nội dung được cung cấp." },
  meta: { requestedLocale: "vi", resolvedLocale: "vi", fallbackApplied: false },
  stops: [
    { order: 2, place: { id: "p3", slug: "diem-ba", name: "Điểm thứ ba", location: null }, stopTitle: null, recommendedDurationMinutes: null, notes: null, story: null, event: null },
    { order: 0, place: { id: "p1", slug: "diem-mot", name: "Điểm thứ nhất", location: { latitude: 21.02, longitude: 105.83 } }, stopTitle: "Khởi đầu hành trình", recommendedDurationMinutes: 45, notes: "Ghi chú biên tập tại điểm đầu.", story: { id: "s1", slug: "cau-chuyen-qa" }, event: null },
    { order: 1, place: { id: "p2", slug: "diem-hai", name: "Điểm thứ hai", location: { latitude: 21.12, longitude: 105.87 } }, stopTitle: null, recommendedDurationMinutes: 30, notes: "Ghi chú tại điểm thứ hai.", story: null, event: { id: "e1", slug: "su-kien-qa" } },
  ],
};

async function mock(page: Page, data: unknown = journey) {
  await page.route("**/v1/journeys/**", route => route.fulfill({ json: { success: true, data } }));
  await page.route("**/v1/media/**", route => route.fulfill({ status: 404, json: { error: { message: "Unavailable QA asset" } } }));
  // Deterministic basemap for browser layout checks; no invented roads or terrain.
  await page.route("https://tiles.openfreemap.org/**", route => route.fulfill({ json: { version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#EADDC7" } }] } }));
}

for (const viewport of [{ width: 390, height: 844 }, { width: 834, height: 1112 }, { width: 1536, height: 960 }]) {
  test(`Journey V3 responsive ${viewport.width}`, async ({ page }, testInfo) => {
    const pageErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await mock(page);
    await page.setViewportSize(viewport);
    await page.goto("/journeys/hanh-trinh-qa");
    await expect(page.getByRole("heading", { name: journey.translation.title, level: 1 })).toBeVisible();
    await expect(page.getByRole("region", { name: "Bản đồ hành trình" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Điểm 1: Khởi đầu hành trình", exact: true })).toBeVisible();
    await expect(page.getByText("Đang tải bản đồ nền…")).toHaveCount(0);
    await expect(page.getByText("Đang tải media…")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
    expect(pageErrors).toEqual([]);
    expect(await page.locator(".journey-stop-number").first().evaluate(element => element.getBoundingClientRect().height)).toBeLessThanOrEqual(40);
    await page.screenshot({ path: testInfo.outputPath(`journey-${viewport.width}.png`), fullPage: true });
  });
}

test("ordered stops, actual metrics, narrative and relationship links", async ({ page }) => {
  await mock(page);
  await page.goto("/journeys/hanh-trinh-qa");
  await expect(page.locator(".journey-stop h3")).toHaveText(["Khởi đầu hành trình", "Điểm thứ hai", "Điểm thứ ba"]);
  await expect(page.getByText("3 giờ", { exact: true })).toBeVisible();
  await expect(page.getByText("12 km", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Khám phá Điểm thứ nhất" })).toHaveAttribute("href", "/places/diem-mot");
  await expect(page.getByRole("link", { name: "Đọc câu chuyện · cau-chuyen-qa" })).toHaveAttribute("href", "/stories/cau-chuyen-qa");
  await expect(page.getByRole("link", { name: "Bối cảnh sự kiện · su-kien-qa" })).toHaveAttribute("href", "/events/su-kien-qa");
  await expect(page.getByText("Thời lượng gợi ý tại điểm: 45 phút")).toBeVisible();
  await expect(page.getByText("2/3 điểm dừng có tọa độ.")).toBeVisible();
  await expect(page.getByText("Tọa độ: 21.0200, 105.8300")).toBeVisible();
  await expect(page.getByText("Nguồn tuyến được ghi nhận: EDITORIAL. Chưa có dữ liệu đường tuyến để hiển thị.")).toBeVisible();
  await expect(page.getByText("AI / Reconstruction: Minh họa tái dựng QA")).toBeVisible();
  await expect(page.locator(".journey-hero img")).toHaveCount(0);
});

test("map and list selection are synchronized by keyboard with reduced motion", async ({ page }) => {
  await mock(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/journeys/hanh-trinh-qa");
  const marker = page.getByRole("button", { name: "Điểm 2: Điểm thứ hai", exact: true });
  await expect(marker).toBeVisible();
  const listButton = page.getByRole("button", { name: "Xem điểm 2 trên bản đồ", exact: true });
  await listButton.focus();
  await page.keyboard.press("Enter");
  await expect(marker).toHaveAttribute("aria-pressed", "true");
  const firstMarker = page.getByRole("button", { name: "Điểm 1: Khởi đầu hành trình", exact: true });
  await firstMarker.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#stop-p1")).toBeFocused();
  await expect(page.getByText("Đang chọn: Khởi đầu hành trình")).toBeVisible();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe("auto");
  expect(await listButton.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
});

test("unknown metrics, missing content and locale fallback stay explicit", async ({ page }) => {
  await mock(page, { ...journey, heroMedia: null, durationMinutes: null, distanceMeters: null, difficulty: null, routeGeometrySource: null, stops: [], translation: null, meta: { requestedLocale: "en", resolvedLocale: "vi", fallbackApplied: true } });
  await page.goto("/journeys/hanh-trinh-qa");
  await expect(page.getByRole("heading", { name: "hanh-trinh-qa", exact: true })).toBeVisible();
  await expect(page.locator(".journey-metrics dd")).toHaveText(["Chưa được cung cấp", "Chưa được cung cấp", "Chưa được cung cấp"]);
  await expect(page.getByText("Chưa có điểm dừng được công bố.")).toBeVisible();
  await expect(page.getByText("Ngôn ngữ dự phòng: vi")).toBeVisible();
  await expect(page.getByRole("region", { name: "Bản đồ hành trình" })).toHaveCount(0);
});

test("invalid coordinates and long text do not create map points or overflow", async ({ page }) => {
  await mock(page, { ...journey, translation: { ...journey.translation, title: "LongTitle".repeat(30) }, stops: [{ ...journey.stops[1], place: { ...journey.stops[1].place, location: { latitude: 120, longitude: null } } }] });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/journeys/hanh-trinh-qa");
  await expect(page.getByText("0/1 điểm dừng có tọa độ.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Bản đồ hành trình" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
});

test("failed basemap preserves usable stops", async ({ page }) => {
  await mock(page);
  await page.route("https://tiles.openfreemap.org/**", route => route.abort());
  await page.goto("/journeys/hanh-trinh-qa");
  await expect(page.getByText("Bản đồ nền chưa khả dụng. Danh sách điểm dừng và liên kết địa điểm vẫn sử dụng được.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Khám phá Điểm thứ nhất" })).toBeVisible();
});

test("loading is announced and API errors can be retried", async ({ page }) => {
  await mock(page);
  let release: () => void = () => {};
  const pending = new Promise<void>(resolve => { release = resolve; });
  let fail = true;
  await page.route("**/v1/journeys/**", async route => {
    if (fail) { await pending; await route.fulfill({ status: 503, json: { error: { message: "Tạm thời chưa tải được hành trình." } } }); }
    else await route.fulfill({ json: { data: journey } });
  });
  await page.goto("/journeys/hanh-trinh-qa");
  await expect(page.getByRole("status")).toHaveText("Đang mở hành trình…");
  release();
  await expect(page.getByRole("heading", { name: "Không thể mở hành trình" })).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Thử lại" }).click();
  await expect(page.getByRole("heading", { name: journey.translation.title, exact: true })).toBeVisible();
});
