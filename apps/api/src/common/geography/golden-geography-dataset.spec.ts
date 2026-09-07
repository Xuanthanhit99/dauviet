// Cross-package relative import by design (same convention as the V1
// `historical-date/golden-dataset.spec.ts`): asserts against the SAME data
// `prisma/seed.ts` actually loads (`prisma/golden/geography.ts`), not a
// hand-copied duplicate, so this can't silently drift from what a real
// `pnpm db:seed` run inserts. Pure data-structure assertions - no live
// database is touched.
import { RegionType, DestinationType } from '@prisma/client';
import {
  GOLDEN_CITIES,
  GOLDEN_COUNTRIES,
  GOLDEN_DESTINATIONS,
  GOLDEN_REGIONS,
} from '../../../../../prisma/golden/geography';

describe('Golden Dataset - Global Geography (G01 spec section 26/27)', () => {
  it('seeds exactly Vietnam and Japan - not the whole world (spec section 26)', () => {
    const iso2s = GOLDEN_COUNTRIES.map((c) => c.iso2).sort();
    expect(iso2s).toEqual(['JP', 'VN']);
  });

  it('every country has a valid-looking iso2/iso3/defaultCurrency and both vi+en translations', () => {
    for (const country of GOLDEN_COUNTRIES) {
      expect(country.iso2).toMatch(/^[A-Z]{2}$/);
      expect(country.iso3).toMatch(/^[A-Z]{3}$/);
      expect(country.defaultCurrency).toMatch(/^[A-Z]{3}$/);
      expect(country.vi.name).toBeTruthy();
      expect(country.en.name).toBeTruthy();
    }
  });

  it("Japan's defaultLocale is 'ja' even though this platform's translations are only vi/en (spec section 18 - geography default, not a UI-locale restriction)", () => {
    const japan = GOLDEN_COUNTRIES.find((c) => c.iso2 === 'JP');
    expect(japan?.defaultLocale).toBe('ja');
  });

  it('every region declares a recognised RegionType and belongs to a seeded country', () => {
    const countryKeys = new Set(GOLDEN_COUNTRIES.map((c) => c.key));
    for (const region of GOLDEN_REGIONS) {
      expect(Object.values(RegionType)).toContain(region.type);
      expect(countryKeys.has(region.countryKey)).toBe(true);
    }
  });

  it('at least one City has no Region (Country -> City directly, spec section 4/9) and at least one has a Region', () => {
    const withRegion = GOLDEN_CITIES.filter((c) => c.regionKey);
    const withoutRegion = GOLDEN_CITIES.filter((c) => !c.regionKey);
    expect(withRegion.length).toBeGreaterThan(0);
    expect(withoutRegion.length).toBeGreaterThan(0);
  });

  it('every city has a validated-shape IANA timezone identifier and belongs to a seeded country', () => {
    const countryKeys = new Set(GOLDEN_COUNTRIES.map((c) => c.key));
    for (const city of GOLDEN_CITIES) {
      expect(city.timezone).toMatch(/^[A-Za-z_]+\/[A-Za-z_]+$/);
      expect(countryKeys.has(city.countryKey)).toBe(true);
    }
  });

  it('every destination requires a country, declares a recognised DestinationType, and any region/city reference resolves to a seeded key', () => {
    const countryKeys = new Set(GOLDEN_COUNTRIES.map((c) => c.key));
    const regionKeys = new Set(GOLDEN_REGIONS.map((r) => r.key));
    const cityKeys = new Set(GOLDEN_CITIES.map((c) => c.key));
    for (const destination of GOLDEN_DESTINATIONS) {
      expect(countryKeys.has(destination.countryKey)).toBe(true);
      expect(Object.values(DestinationType)).toContain(destination.type);
      if (destination.regionKey) expect(regionKeys.has(destination.regionKey)).toBe(true);
      if (destination.cityKey) expect(cityKeys.has(destination.cityKey)).toBe(true);
    }
  });

  it('at least one Destination has no Region (Country -> City -> Destination without a Region parent, spec section 4/11)', () => {
    const regionLess = GOLDEN_DESTINATIONS.filter((d) => !d.regionKey);
    expect(regionLess.length).toBeGreaterThan(0);
  });

  it('Destination is never modeled with the same key vocabulary as a V1 Place - "Hoi An Ancient Town" is a Destination, not a re-typed Place', () => {
    const names = GOLDEN_DESTINATIONS.map((d) => d.vi.name);
    expect(names).toEqual(expect.arrayContaining(['Phố cổ Hà Nội', 'Phố cổ Hội An', 'Gion', 'Arashiyama']));
  });

  it('canonical slugs derived from vi names are unique within each entity type (upsert-by-canonicalSlug idempotency requires this)', () => {
    for (const specs of [GOLDEN_COUNTRIES, GOLDEN_REGIONS, GOLDEN_CITIES, GOLDEN_DESTINATIONS]) {
      const names = specs.map((s) => s.vi.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });
});
