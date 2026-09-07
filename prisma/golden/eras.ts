/**
 * Pure Golden Dataset Era/Dynasty definitions (Phase 10 spec sections 4/27).
 * Diacritics restored (see `places.ts` header note). Era/dynasty date
 * ranges are the standard, uncontroversial textbook periodization used
 * consistently across every source consulted in this phase (see
 * docs/backend/golden-data/sources-manifest.md) - not independently
 * fact-checked line-by-line the way individual HistoricalFacts are, since
 * they are gazetteer-level classification, not citable claims in
 * themselves (same convention Phase 03 already established).
 */
import { HistoricalDateSeed, yearOnly } from './helpers';

export interface EraSeedSpec {
  key: string;
  vi: { name: string; summary?: string };
  en?: { name: string };
  start: HistoricalDateSeed;
  end?: HistoricalDateSeed;
}

export interface DynastySeedSpec {
  key: string;
  vi: { name: string; summary?: string };
  en?: { name: string };
  start: HistoricalDateSeed;
  end?: HistoricalDateSeed;
}

export const GOLDEN_ERAS: EraSeedSpec[] = [
  { key: 'ERA_LY', vi: { name: 'Thời Lý', summary: 'Triều đại phong kiến Việt Nam, kinh đô tại Thăng Long (1009-1225).' }, en: { name: 'Ly Dynasty Period' }, start: yearOnly(1009), end: yearOnly(1225) },
  { key: 'ERA_TRAN', vi: { name: 'Thời Trần', summary: 'Triều đại phong kiến Việt Nam (1225-1400), ba lần đánh bại quân Nguyên Mông.' }, en: { name: 'Tran Dynasty Period' }, start: yearOnly(1225), end: yearOnly(1400) },
  { key: 'ERA_LE_SO', vi: { name: 'Thời Lê sơ', summary: 'Giai đoạn đầu của nhà Lê, thành lập sau khởi nghĩa Lam Sơn (1428-1527).' }, en: { name: 'Early Le Dynasty Period' }, start: yearOnly(1428), end: yearOnly(1527) },
  { key: 'ERA_TAY_SON', vi: { name: 'Thời Tây Sơn', summary: 'Triều đại Tây Sơn (1778-1802).' }, en: { name: 'Tay Son Dynasty Period' }, start: yearOnly(1778), end: yearOnly(1802) },
  { key: 'ERA_NGUYEN', vi: { name: 'Thời Nguyễn', summary: 'Triều đại phong kiến cuối cùng của Việt Nam, kinh đô tại Huế (1802-1945).' }, en: { name: 'Nguyen Dynasty Period' }, start: yearOnly(1802), end: yearOnly(1945) },
  // No `end`: still ongoing, not an unknown end - deliberate (Phase 03 convention).
  { key: 'ERA_MODERN', vi: { name: 'Thời kỳ hiện đại', summary: 'Từ năm 1945 đến nay.' }, en: { name: 'Modern Period' }, start: yearOnly(1945) },
];

export const GOLDEN_DYNASTIES: DynastySeedSpec[] = [
  { key: 'DYNASTY_LY', vi: { name: 'Nhà Lý', summary: 'Triều đại phong kiến Việt Nam (1009-1225), người sáng lập là Lý Công Uẩn.' }, en: { name: 'Ly Dynasty' }, start: yearOnly(1009), end: yearOnly(1225) },
  { key: 'DYNASTY_TRAN', vi: { name: 'Nhà Trần', summary: 'Triều đại phong kiến Việt Nam (1225-1400).' }, en: { name: 'Tran Dynasty' }, start: yearOnly(1225), end: yearOnly(1400) },
  { key: 'DYNASTY_NGUYEN', vi: { name: 'Nhà Nguyễn', summary: 'Triều đại phong kiến cuối cùng của Việt Nam (1802-1945), người sáng lập là Gia Long.' }, en: { name: 'Nguyen Dynasty' }, start: yearOnly(1802), end: yearOnly(1945) },
];
