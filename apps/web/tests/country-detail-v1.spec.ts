import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

const country = {
  id: "vn",
  slug: "viet-nam",
  iso2: "VN",
  iso3: "VNM",
  defaultLocale: "vi",
  defaultCurrency: "VND",
  status: "PUBLISHED",
  location: { latitude: 16.1667, longitude: 107.8333 },
  translation: {
    name: "Viet Nam",
    shortDescription: "Mot quoc gia duoc mo ta bang du lieu da xuat ban.",
    description: "Boi canh quoc gia duoc bien tap tu backend.\n\nDoan thu hai giu dung van ban hop dong.",
  },
  meta: { requestedLocale: "vi", resolvedLocale: "vi", fallbackApplied: false },
};
const regions = { items: [{ id: "r1", slug: "dong-bang-song-hong", type: "PROVINCE", name: "Dong bang song Hong" }, { id: "r2", slug: "mien-trung", type: "OTHER", name: "Mien Trung" }], page: 1, pageSize: 24, total: 2, totalPages: 1 };
const cities = { items: [{ id: "c1", slug: "ha-noi", timezone: "Asia/Bangkok", name: "Ha Noi" }], page: 1, pageSize: 18, total: 1, totalPages: 1 };
const destinations = { items: [{ id: "d1", slug: "pho-co-ha-noi", type: "HISTORIC_DISTRICT", name: "Pho co Ha Noi", tagline: "Khong gian do thi nhieu lop.", placeCount: 3, storyCount: 2 }], page: 1, pageSize: 12, total: 1, totalPages: 1 };

async function mock(page: Page, overrides: { country?: unknown; regions?: unknown; cities?: unknown; destinations?: unknown; countryStatus?: number; relationshipStatus?: number } = {}) {
  await page.route("**/v1/countries/viet-nam?**", route => route.fulfill({ status: overrides.countryStatus ?? 200, json: overrides.countryStatus ? { error: { message: "Country unavailable" } } : { data: overrides.country ?? country } }));
  await page.route("**/v1/countries/viet-nam/regions?**", route => route.fulfill({ status: overrides.relationshipStatus ?? 200, json: { data: overrides.regions ?? regions } }));
  await page.route("**/v1/countries/viet-nam/cities?**", route => route.fulfill({ status: overrides.relationshipStatus ?? 200, json: { data: overrides.cities ?? cities } }));
  await page.route("**/v1/countries/viet-nam/destinations?**", route => route.fulfill({ status: overrides.relationshipStatus ?? 200, json: { data: overrides.destinations ?? destinations } }));
}

for (const viewport of [{ width: 390, height: 844 }, { width: 834, height: 1112 }, { width: 1536, height: 960 }]) {
  test(`Country V1 responsive ${viewport.width}`, async ({ page }, testInfo) => {
    await mock(page);
    await page.setViewportSize(viewport);
    await page.goto("/countries/viet-nam");
    await expect(page.getByRole("heading", { name: "Viet Nam", level: 1 })).toBeVisible();
    await expect(page.getByText("World", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Cac vung da xuat ban" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Pho co Ha Noi/ })).toHaveAttribute("href", "/destinations/pho-co-ha-noi");
    await expect(page.getByText("Country V1 khong co truong hero media cong khai.")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
    mkdirSync("qa-evidence/pass-09", { recursive: true });
    await page.screenshot({ path: `qa-evidence/pass-09/country-${viewport.width}.png`, fullPage: true });
    await page.screenshot({ path: testInfo.outputPath(`country-${viewport.width}.png`), fullPage: true });
  });
}

test("truthful hierarchy, no fabricated downstream relationships and coordinates", async ({ page }) => {
  await mock(page);
  await page.goto("/countries/viet-nam");
  await expect(page.getByText("2", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Dong bang song Hong")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ha Noi", exact: true })).toBeVisible();
  await expect(page.getByText("16.1667, 107.8333")).toBeVisible();
  await expect(page.getByRole("link", { name: "Places Chua duoc expose" })).toBeVisible();
  await expect(page.getByText("Khong co Country hero media, Places, Stories, Journeys, People, Events, Culture, citations, provenance hay boundary geometry truc tiep.")).toBeVisible();
});

test("empty relationship lists, no coordinate and fallback stay explicit", async ({ page }) => {
  await mock(page, {
    country: { ...country, location: null, translation: { name: "Vietnam" }, meta: { requestedLocale: "en", resolvedLocale: "vi", fallbackApplied: true } },
    regions: { items: [], page: 1, pageSize: 24, total: 0, totalPages: 0 },
    cities: { items: [], page: 1, pageSize: 18, total: 0, totalPages: 0 },
    destinations: { items: [], page: 1, pageSize: 12, total: 0, totalPages: 0 },
  });
  await page.goto("/countries/viet-nam");
  await expect(page.getByText("Ngon ngu du phong: vi")).toBeVisible();
  await expect(page.getByText("Chua co region da xuat ban cho quoc gia nay.")).toBeVisible();
  await expect(page.getByText("Chua co destination da xuat ban cho quoc gia nay.")).toBeVisible();
  await expect(page.getByText("Ban do duoc bo qua de tranh tao bien gioi hoac vi tri suy dien.")).toBeVisible();
});

test("relationship API failures degrade to empty sections while country remains usable", async ({ page }) => {
  await mock(page, { relationshipStatus: 503 });
  await page.goto("/countries/viet-nam");
  await expect(page.getByRole("heading", { name: "Viet Nam", level: 1 })).toBeVisible();
  await expect(page.getByText("Chua co region da xuat ban cho quoc gia nay.")).toBeVisible();
  await expect(page.getByText("Chua co destination da xuat ban cho quoc gia nay.")).toBeVisible();
});

test("country API errors can be retried", async ({ page }) => {
  let fail = true;
  await page.route("**/v1/countries/viet-nam?**", route => fail ? route.fulfill({ status: 404, json: { error: { message: "Country unavailable" } } }) : route.fulfill({ json: { data: country } }));
  await page.route("**/v1/countries/viet-nam/regions?**", route => route.fulfill({ json: { data: regions } }));
  await page.route("**/v1/countries/viet-nam/cities?**", route => route.fulfill({ json: { data: cities } }));
  await page.route("**/v1/countries/viet-nam/destinations?**", route => route.fulfill({ json: { data: destinations } }));
  await page.goto("/countries/viet-nam");
  await expect(page.getByRole("heading", { name: "Khong the mo quoc gia" })).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Thu lai" }).click();
  await expect(page.getByRole("heading", { name: "Viet Nam", level: 1 })).toBeVisible();
});

test("keyboard focus and reduced motion remain accessible", async ({ page }) => {
  await mock(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/countries/viet-nam");
  const link = page.getByRole("link", { name: /Pho co Ha Noi/ });
  await link.focus();
  await expect(link).toBeFocused();
  expect(await link.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe("auto");
});
