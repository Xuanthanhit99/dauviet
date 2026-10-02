import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const evidenceDir = path.join(process.cwd(), "qa-evidence", "home-v5");

for (const viewport of [
  { name: "mobile-390", width: 390, height: 844 },
  { name: "desktop-1536", width: 1536, height: 960 },
]) {
  test(`Home V5 visual evidence — ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/", { waitUntil: "networkidle" });

    await expect(page.locator(".home-v5")).toBeVisible();
    await expect(page.locator(".home-hero h1")).toContainText("Explore Places.");
    await expect(page.locator(".home-trace")).toBeVisible();
    await expect(page.locator(".home-discover")).toBeVisible();
    await expect(page.locator(".home-story")).toBeVisible();

    if (viewport.width >= 961) {
      await expect(page.locator(".home-rail")).toBeVisible();
      await expect(page.locator(".home-mobile-header")).toBeHidden();
    } else {
      await expect(page.locator(".home-rail")).toBeHidden();
      await expect(page.locator(".home-mobile-header")).toBeVisible();
    }

    fs.mkdirSync(evidenceDir, { recursive: true });
    await page.screenshot({
      path: path.join(evidenceDir, `home-v5-${viewport.name}.png`),
      fullPage: true,
      animations: "disabled",
    });
  });
}
