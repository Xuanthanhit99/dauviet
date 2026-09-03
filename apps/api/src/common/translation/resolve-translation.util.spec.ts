import { resolveTranslation } from './resolve-translation.util';

/** Covers spec section 57 test #6: translation fallback behaves predictably. */
describe('resolveTranslation', () => {
  const translations = [
    { locale: 'vi', name: 'Ha Noi' },
    { locale: 'en', name: 'Hanoi' },
  ];

  it('returns the exact locale match with no fallback', () => {
    const result = resolveTranslation(translations, 'en');
    expect(result.translation?.name).toBe('Hanoi');
    expect(result.resolvedLocale).toBe('en');
    expect(result.fallbackApplied).toBe(false);
  });

  it('falls back to the canonical vi locale when the requested locale is missing', () => {
    const result = resolveTranslation(translations, 'fr');
    expect(result.translation?.name).toBe('Ha Noi');
    expect(result.resolvedLocale).toBe('vi');
    expect(result.fallbackApplied).toBe(true);
  });

  it('falls back to any available translation when even vi is missing', () => {
    const result = resolveTranslation([{ locale: 'en', name: 'Hanoi' }], 'fr');
    expect(result.translation?.name).toBe('Hanoi');
    expect(result.fallbackApplied).toBe(true);
  });

  it('returns null when there are no translations at all', () => {
    const result = resolveTranslation([], 'vi');
    expect(result.translation).toBeNull();
    expect(result.resolvedLocale).toBeNull();
  });
});
