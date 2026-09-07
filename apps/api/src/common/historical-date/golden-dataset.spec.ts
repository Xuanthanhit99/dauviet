import { PlaceType } from '@prisma/client';
// Cross-package relative import by design: this asserts against the SAME
// data `prisma/seed.ts` actually loads (prisma/golden-dataset.ts), not a
// hand-copied duplicate, so the check can't silently drift from what a real
// `pnpm db:seed` run would insert. No live database is touched here - this
// is a pure data-structure assertion (spec section 39's "tests may use
// mocked repositories/services if live DB is unavailable").
import { GOLDEN_PLACES, PlaceSeedSpec } from '../../../../../prisma/golden-dataset';

/**
 * Spec sections 7 & 39 (tests #1/#2): Hoang Sa and Truong Sa must always be
 * present in the Golden Dataset as real ARCHIPELAGO Place entries - never
 * silently dropped, retyped, or replaced by a hard-coded frontend label.
 */
describe('Golden Dataset - Hoang Sa / Truong Sa regression (spec section 7)', () => {
  function findBySlugName(name: string): PlaceSeedSpec | undefined {
    return GOLDEN_PLACES.find((p) => p.vi.name === name);
  }

  it('includes Hoang Sa as an ARCHIPELAGO', () => {
    const hoangSa = findBySlugName('Hoàng Sa');
    expect(hoangSa).toBeDefined();
    expect(hoangSa!.type).toBe(PlaceType.ARCHIPELAGO);
  });

  it('includes Truong Sa as an ARCHIPELAGO', () => {
    const truongSa = findBySlugName('Trường Sa');
    expect(truongSa).toBeDefined();
    expect(truongSa!.type).toBe(PlaceType.ARCHIPELAGO);
  });

  it('gives both archipelagos coordinates and an English alias, without asserting any territorial claim', () => {
    for (const name of ['Hoàng Sa', 'Trường Sa']) {
      const place = findBySlugName(name)!;
      expect(place.lat).toBeDefined();
      expect(place.lng).toBeDefined();
      expect(place.en).toBeDefined();
      expect(place.aliases?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('requires every golden place to declare a recognised PlaceType (no drift into a free-text category)', () => {
    for (const place of GOLDEN_PLACES) {
      expect(Object.values(PlaceType)).toContain(place.type);
    }
  });

  it('covers the required-core place list from spec section 38', () => {
    const requiredNames = [
      'Hoàng thành Thăng Long',
      'Văn Miếu – Quốc Tử Giám',
      'Cổ Loa',
      'Hoa Lư',
      'Cố đô Huế',
      'Mỹ Sơn',
      'Hội An',
      'Điện Biên Phủ',
      'Địa đạo Củ Chi',
      'Dinh Độc Lập',
      'Hoàng Sa',
      'Trường Sa',
    ];
    const seededNames = GOLDEN_PLACES.map((p) => p.vi.name);
    for (const name of requiredNames) {
      expect(seededNames).toContain(name);
    }
  });
});
