import { buildPrefixTsQuery, escapeLikePattern, normalizeSearchText, tokenizeNormalized } from './search-normalization.util';

describe('normalizeSearchText (G11 spec 17-19)', () => {
  it.each([
    ['Hội An', 'hoi an'],
    ['Đà Nẵng', 'da nang'],
    ['Thăng Long', 'thang long'],
    ['Hoàng Sa', 'hoang sa'],
    ['Trường Sa', 'truong sa'],
    ['Huế', 'hue'],
    ['Nguyễn Trãi', 'nguyen trai'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeSearchText(input)).toBe(expected);
  });

  it('folds đ/Đ to d in both directions (query "da nang" and "đà nẵng" converge)', () => {
    expect(normalizeSearchText('đ')).toBe('d');
    expect(normalizeSearchText('Đ')).toBe('d');
    expect(normalizeSearchText('đường Đồng Khởi')).toBe('duong dong khoi');
    expect(normalizeSearchText('da nang')).toBe(normalizeSearchText('Đà Nẵng'));
  });

  it('NFC and NFD forms of the same text normalize identically', () => {
    const nfc = 'Hội An'.normalize('NFC');
    const nfd = 'Hội An'.normalize('NFD');
    expect(nfc).not.toBe(nfd);
    expect(normalizeSearchText(nfc)).toBe(normalizeSearchText(nfd));
    expect(normalizeSearchText(nfd)).toBe('hoi an');
  });

  it('case folds, collapses whitespace and controlled punctuation, and trims', () => {
    expect(normalizeSearchText('  HÀ   NỘI  ')).toBe('ha noi');
    expect(normalizeSearchText('Bạch-Đằng, 1288!')).toBe('bach dang 1288');
    expect(normalizeSearchText("St. John's")).toBe('st john s');
    expect(normalizeSearchText('a\t\nb')).toBe('a b');
  });

  it('is idempotent', () => {
    const once = normalizeSearchText('Thăng   Long — Hà Nội');
    expect(normalizeSearchText(once)).toBe(once);
  });

  it('returns an empty string for punctuation-only or blank input', () => {
    expect(normalizeSearchText('')).toBe('');
    expect(normalizeSearchText('   ')).toBe('');
    expect(normalizeSearchText('---!!!')).toBe('');
  });

  it('keeps non-Latin letters (no lossy ASCII coercion)', () => {
    expect(normalizeSearchText('東京')).toBe('東京');
  });
});

describe('buildPrefixTsQuery (tsquery injection safety, G11 spec 40)', () => {
  it('joins tokens with & and marks the last one as a prefix', () => {
    expect(buildPrefixTsQuery('thang lo')).toBe('thang & lo:*');
    expect(buildPrefixTsQuery('hue')).toBe('hue:*');
  });

  it('never lets tsquery operators, quotes, colons or backslashes through', () => {
    const q = buildPrefixTsQuery(normalizeSearchText("a' | b & !c :* \\ <-> (d)"));
    expect(q).not.toMatch(/['|!<>()\\]/);
    expect(q).toBe('a & b & c & d:*');
  });

  it('returns null when nothing usable remains', () => {
    expect(buildPrefixTsQuery('')).toBeNull();
    expect(buildPrefixTsQuery(normalizeSearchText("'; DROP TABLE x; --"))).toBe('drop & table & x:*');
  });
});

describe('tokenizeNormalized / escapeLikePattern', () => {
  it('tokenizes normalized text', () => {
    expect(tokenizeNormalized('thang long')).toEqual(['thang', 'long']);
    expect(tokenizeNormalized('')).toEqual([]);
  });

  it('escapes LIKE metacharacters', () => {
    expect(escapeLikePattern('100%_\\')).toBe('100\\%\\_\\\\');
  });
});
