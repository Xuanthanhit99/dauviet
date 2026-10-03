import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const evidenceDir = path.join(process.cwd(), "qa-evidence", "map-v4");
const features = [
  { type: "Feature", geometry: { type: "Point", coordinates: [105.834, 21.028] }, properties: { entityType: "PLACE", id: "hanoi", slug: "ha-noi", name: "Hà Nội", placeType: "Thành phố" } },
  { type: "Feature", geometry: { type: "Point", coordinates: [106.316, 20.938] }, properties: { entityType: "PLACE", id: "con-son", slug: "con-son-kiep-bac", name: "Côn Sơn – Kiếp Bạc", placeType: "Di tích quốc gia đặc biệt" } },
  { type: "Feature", geometry: { type: "Point", coordinates: [107.59, 16.463] }, properties: { entityType: "PLACE", id: "hue", slug: "hue", name: "Huế", placeType: "Di sản" } },
  { type: "Feature", geometry: { type: "Point", coordinates: [108.328, 15.88] }, properties: { entityType: "PLACE", id: "hoi-an", slug: "hoi-an", name: "Hội An", placeType: "Đô thị cổ" } },
  { type: "Feature", geometry: { type: "Point", coordinates: [105.342, 20.25] }, properties: { entityType: "PLACE", id: "hoa-lu", slug: "hoa-lu", name: "Hoa Lư", placeType: "Di tích" } },
  { type: "Feature", geometry: { type: "Point", coordinates: [106.72, 20.95] }, properties: { entityType: "PLACE", id: "bach-dang", slug: "bach-dang", name: "Bạch Đằng", placeType: "Không gian lịch sử" } },
  { type: "Feature", geometry: { type: "Point", coordinates: [106.7, 20.94] }, properties: { entityType: "EVENT", id: "event-bach-dang", slug: "bach-dang-1288", title: "Bạch Đằng năm 1288" } },
  { type: "Feature", geometry: { type: "Point", coordinates: [106.31, 20.94] }, properties: { entityType: "EVENT", id: "event-kiep-bac", slug: "van-kiep", title: "Vạn Kiếp và tuyến phòng thủ Đông Bắc" } },
  { type: "Feature", geometry: { type: "Point", coordinates: [105.84, 21.03] }, properties: { entityType: "EVENT", id: "event-thang-long", slug: "thang-long", title: "Thăng Long qua các lớp thời gian" } },
  { type: "Feature", geometry: { type: "Point", coordinates: [107.59, 16.46] }, properties: { entityType: "EVENT", id: "event-hue", slug: "kinh-thanh-hue", title: "Kinh thành Huế và dấu ấn triều Nguyễn" } }
];

for (const viewport of [
  { name: "mobile-390", width: 390, height: 844 },
  { name: "desktop-1536", width: 1536, height: 960 },
]) {
  test(`Map V4 visual evidence — ${viewport.name}`, async ({ page }) => {
    await page.route("**/v1/map/features?**", route => route.fulfill({ json: { success: true, data: { type: "FeatureCollection", features }, meta: { truncated: false, limit: 100 } } }));
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/map", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: /Đi đến một nơi/ })).toBeVisible();
    await expect(page.getByLabel("Bản đồ khám phá Dấu Việt")).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Địa điểm trong khu vực" })).toBeVisible();
    await expect(page.getByText("Hà Nội", { exact: true })).toBeVisible();
    await expect(page.getByText("Bạch Đằng năm 1288", { exact: true })).toBeVisible();
    fs.mkdirSync(evidenceDir, { recursive: true });
    await page.screenshot({ path: path.join(evidenceDir, `map-v4-${viewport.name}.png`), fullPage: true, animations: "disabled" });
  });
}
