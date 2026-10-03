import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
const evidenceDir = path.join(process.cwd(), "qa-evidence", "map-v4");
for (const viewport of [{ name: "mobile-390", width: 390, height: 844 }, { name: "desktop-1536", width: 1536, height: 960 }]) {
  test(`Map V4 visual evidence — ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/map", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: /Đi đến một nơi/ })).toBeVisible();
    await expect(page.getByLabel("Bản đồ khám phá Dấu Việt")).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Địa điểm trong khu vực" })).toBeVisible();
    fs.mkdirSync(evidenceDir, { recursive: true });
    await page.screenshot({ path: path.join(evidenceDir, `map-v4-${viewport.name}.png`), fullPage: true, animations: "disabled" });
  });
}
