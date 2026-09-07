/**
 * Pure Golden Dataset Theme definitions (Phase 10 spec section 26) - a
 * small, coherent set, no synonym duplication. Follows the existing
 * `Theme`/`ThemeCategory` model from Phase 03 as-is.
 */
import { ThemeCategory } from '@prisma/client';

export interface ThemeSeedSpec {
  slug: string;
  category: ThemeCategory;
  vi: string;
  en?: string;
}

export const GOLDEN_THEMES: ThemeSeedSpec[] = [
  { slug: 'political', category: ThemeCategory.POLITICAL, vi: 'Chính trị - Nhà nước', en: 'State & Politics' },
  { slug: 'military', category: ThemeCategory.MILITARY, vi: 'Quân sự', en: 'Military' },
  { slug: 'heritage', category: ThemeCategory.HERITAGE, vi: 'Di sản văn hóa', en: 'Cultural Heritage' },
  { slug: 'territorial', category: ThemeCategory.TERRITORIAL, vi: 'Biển đảo - Lãnh thổ', en: 'Sea & Islands' },
];
