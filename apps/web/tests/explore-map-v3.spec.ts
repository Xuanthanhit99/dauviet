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
    await expect(page.getByRole("complementary", { name: "Danh sách đồng bộ với bản đồ" })).toBeVisible();
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
