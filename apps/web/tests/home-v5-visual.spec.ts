import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const evidenceDir = path.join(process.cwd(), "qa-evidence", "home-v5");

for (const viewport of [
  { name: "mobile-390", width: 390, height: 844 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1440", width: 1440, height: 960 },
  { name: "desktop-1536", width: 1536, height: 960 },
]) {
  test(`Home V5 source-faithful visual evidence — ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/", { waitUntil: "networkidle" });

    await expect(page.locator("header.site-header")).toBeVisible();
    await expect(page.locator(".brand-logo")).toBeVisible();
    await expect(page.locator(".hero h1")).toContainText("Explore Places. Understand Stories.");
    await expect(page.locator(".trace-visual")).toBeVisible();
    await expect(page.locator(".discovery-grid")).toBeVisible();
    await expect(page.getByText("Story Explorer", { exact: true })).toBeVisible();
    await expect(page.getByText("Connections", { exact: true })).toBeVisible();
    await expect(page.getByText("Media provenance", { exact: true })).toBeVisible();
    await expect(page.locator(".home-rail")).toHaveCount(0);
    await expect(page.getByText("Historical Flow", { exact: true })).toHaveCount(0);

    if (viewport.width > 960) {
      await expect(page.locator(".desktop-nav")).toBeVisible();
      await expect(page.locator(".header-actions")).toBeVisible();
      await expect(page.locator(".mobile-nav")).toBeHidden();
    } else {
      await expect(page.locator(".desktop-nav")).toBeHidden();
      await expect(page.locator(".header-actions")).toBeHidden();
      await expect(page.locator(".mobile-nav")).toBeVisible();
    }

    fs.mkdirSync(evidenceDir, { recursive: true });
    await page.screenshot({
      path: path.join(evidenceDir, `home-v5-${viewport.name}.png`),
      fullPage: true,
      animations: "disabled",
    });
  });
}
