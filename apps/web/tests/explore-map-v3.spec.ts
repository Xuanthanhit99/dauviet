import { expect, test } from "@playwright/test";

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 834, height: 1112 },
  { name: "desktop", width: 1536, height: 960 },
];

for (const viewport of viewports) {
  test(`Explore Map V4 locked-master responsive — ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/map");
    await expect(page.locator(".lm-hero h1")).toBeVisible();
    await expect(page.getByLabel("Bản đồ khám phá Dấu Việt")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Những địa điểm nổi bật tại Hà Nội" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Trải nghiệm tại Hà Nội" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
  });
}

test("Explore Map V4 locked-master keyboard and focus", async ({ page }) => {
  await page.goto("/map");
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe("BODY");
  await page.getByLabel("Thời điểm lịch sử").focus();
  await expect(page.getByLabel("Thời điểm lịch sử")).toBeFocused();
  await page.getByRole("button", { name: /Chủ đề/ }).focus();
  await expect(page.getByRole("button", { name: /Chủ đề/ })).toBeFocused();
});

test("Explore Map V4 reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/map");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe("auto");
  await expect(page.getByLabel("Bản đồ khám phá Dấu Việt")).toBeVisible();
});

test("Explore Map V4 canonical event link and Territory safe degradation", async ({ page }) => {
  await page.route("**/v1/map/features?**", route => route.fulfill({ json: { success: true, data: { type: "FeatureCollection", features: [
    { type: "Feature", geometry: { type: "Point", coordinates: [105.8, 21.0] }, properties: { entityType: "EVENT", id: "event-qa", slug: "event-qa", title: "Sự kiện QA" } },
    { type: "Feature", geometry: { type: "Polygon", coordinates: [[[105,20],[106,20],[106,21],[105,21],[105,20]]] }, properties: { entityType: "TERRITORY", id: "territory-qa", slug: "territory-qa", name: "Lãnh thổ QA" } }
  ] }, meta: {} } }));
  await page.goto("/map");
  await expect(page.locator('a[href="/events/event-qa"]')).toHaveCount(1);
  await expect(page.locator('a[href^="/territories/"]')).toHaveCount(0);
  await expect(page.getByText(/không suy diễn thành biên giới hiện tại/)).toHaveCount(0);
});