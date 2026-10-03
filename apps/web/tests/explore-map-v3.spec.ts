import { expect, test } from "@playwright/test";

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 834, height: 1112 },
  { name: "desktop", width: 1536, height: 960 },
];

for (const viewport of viewports) {
  test(`Explore Map V3 responsive — ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/map");
    await expect(page.getByRole("heading", { name: "Khám phá không gian qua thời gian" })).toBeVisible();
    await expect(page.getByLabel("Bản đồ khám phá Dấu Việt")).toBeVisible();
    const results=page.getByRole("complementary", { name: "Danh sách đồng bộ với bản đồ" });\n    await expect(results).toBeVisible();\n    if (viewport.width <= 960) { await expect(page.getByRole("button", { name: /Ẩn danh sách|Xem .* dấu vết/ })).toBeVisible(); }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
  });
}

test("Explore Map V3 keyboard and focus", async ({ page }) => {
  await page.goto("/map");
  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => document.activeElement?.tagName);
  expect(focused).not.toBe("BODY");
  await page.getByLabel("Năm lịch sử").focus();
  await expect(page.getByLabel("Năm lịch sử")).toBeFocused();
  await page.getByRole("button", { name: "Áp dụng" }).focus();
  await expect(page.getByRole("button", { name: "Áp dụng" })).toBeFocused();
});

test("Explore Map V3 reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/map");
  const behavior = await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior);
  expect(behavior).toBe("auto");
  await expect(page.getByLabel("Bản đồ khám phá Dấu Việt")).toBeVisible();
});


test("Explore Map V3 canonical detail links and Territory safe degradation", async ({ page }) => {
  await page.route("**/v1/map/features?**", route => route.fulfill({ json: { success: true, data: { type: "FeatureCollection", features: [
    { type: "Feature", geometry: { type: "Point", coordinates: [105.8, 21.0] }, properties: { entityType: "EVENT", id: "event-qa", slug: "event-qa", title: "Sự kiện QA" } },
    { type: "Feature", geometry: { type: "Polygon", coordinates: [[[105,20],[106,20],[106,21],[105,21],[105,20]]] }, properties: { entityType: "TERRITORY", id: "territory-qa", slug: "territory-qa", name: "Lãnh thổ QA" } }
  ] }, meta: {} } }));
  await page.goto("/map");
  await page.getByRole("button", { name: /Sự kiện QA/ }).click();
  await expect(page.getByRole("link", { name: /Mở hồ sơ chi tiết/ })).toHaveAttribute("href", "/events/event-qa");
  await page.getByRole("button", { name: /Lãnh thổ QA/ }).click();
  await expect(page.getByText(/không suy diễn thành biên giới hiện tại/)).toBeVisible();
  await expect(page.locator('a[href^="/territories/"]')).toHaveCount(0);
});
