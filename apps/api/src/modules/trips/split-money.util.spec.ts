import { Prisma } from '@prisma/client';
import { InvalidMoneyError, exactSplitSumMatches, isPositive, parseMoney, resolveEqualSplit, resolvePercentageSplit } from './split-money.util';

const D = (v: string | number) => new Prisma.Decimal(v);
const sum = (shares: Map<string, Prisma.Decimal>) => [...shares.values()].reduce((acc, v) => acc.plus(v), new Prisma.Decimal(0));

describe('parseMoney (spec sections 9/15/54/56/57)', () => {
  it('parses a valid 2dp amount', () => {
    expect(parseMoney('100.00').toString()).toBe('100');
  });

  it('rejects more than 2 decimal places rather than silently rounding', () => {
    expect(() => parseMoney('100.001')).toThrow(InvalidMoneyError);
  });

  it('rejects a non-numeric string', () => {
    expect(() => parseMoney('abc')).toThrow(InvalidMoneyError);
  });

  it('rejects NaN/Infinity-shaped input', () => {
    expect(() => parseMoney('NaN')).toThrow(InvalidMoneyError);
    expect(() => parseMoney('Infinity')).toThrow(InvalidMoneyError);
  });

  it('rejects an amount exceeding Decimal(12,2)s maximum magnitude', () => {
    expect(() => parseMoney('99999999999.99')).toThrow(InvalidMoneyError);
  });

  it('accepts the maximum representable amount', () => {
    expect(() => parseMoney('9999999999.99')).not.toThrow();
  });
});

describe('isPositive', () => {
  it('rejects zero and negative amounts', () => {
    expect(isPositive(D(0))).toBe(false);
    expect(isPositive(D(-5))).toBe(false);
  });
  it('accepts a positive amount', () => {
    expect(isPositive(D(0.01))).toBe(true);
  });
});

describe('resolveEqualSplit (spec section 17 - deterministic remainder distribution)', () => {
  it('splits evenly when it divides exactly', () => {
    const shares = resolveEqualSplit(D(300), ['a', 'b', 'c']);
    expect(shares.get('a')!.toString()).toBe('100');
    expect(shares.get('b')!.toString()).toBe('100');
    expect(shares.get('c')!.toString()).toBe('100');
    expect(sum(shares).equals(D(300))).toBe(true);
  });

  it('100/3: distributes the 0.01 remainder to the lexicographically-first userId, sum stays exact', () => {
    const shares = resolveEqualSplit(D(100), ['charlie', 'alice', 'bob']);
    // floor(100/3) = 33.33 each -> 99.99, remainder = 0.01 -> goes to "alice" (sorted first)
    expect(shares.get('alice')!.toString()).toBe('33.34');
    expect(shares.get('bob')!.toString()).toBe('33.33');
    expect(shares.get('charlie')!.toString()).toBe('33.33');
    expect(sum(shares).equals(D(100))).toBe(true);
  });

  it('1/3-style thirds with a larger remainder (2 cents over 3 people)', () => {
    const shares = resolveEqualSplit(D(10), ['z', 'y', 'x']);
    // 10/3 = 3.3333... -> floor 3.33 each = 9.99, remainder = 0.01 -> "x" (sorted first)
    const values = [...shares.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
    expect(sum(shares).equals(D(10))).toBe(true);
    expect(values[0][0]).toBe('x');
    expect(values[0][1].toString()).toBe('3.34');
  });

  it('is deterministic regardless of input array order (same participant set, same total)', () => {
    const a = resolveEqualSplit(D(100), ['charlie', 'alice', 'bob']);
    const b = resolveEqualSplit(D(100), ['bob', 'charlie', 'alice']);
    expect([...a.entries()].sort()).toEqual([...b.entries()].sort());
  });

  it('large amount: sum stays exact for a big total split many ways', () => {
    const userIds = Array.from({ length: 7 }, (_, i) => `user-${i}`);
    const shares = resolveEqualSplit(D('9999999999.99'), userIds);
    expect(sum(shares).equals(D('9999999999.99'))).toBe(true);
  });

  it('zero-decimal-currency-shaped amount (e.g. a whole-number JPY value stored at 2dp) still resolves exactly', () => {
    const shares = resolveEqualSplit(D(1000), ['a', 'b', 'c']);
    expect(sum(shares).equals(D(1000))).toBe(true);
  });

  it('two-decimal currency (e.g. USD) with an uneven split resolves exactly', () => {
    const shares = resolveEqualSplit(D('10.01'), ['a', 'b']);
    expect(sum(shares).equals(D('10.01'))).toBe(true);
  });

  it('single participant gets the whole amount', () => {
    const shares = resolveEqualSplit(D(50), ['solo']);
    expect(shares.get('solo')!.toString()).toBe('50');
  });
});

describe('resolvePercentageSplit (spec section 19)', () => {
  it('resolves 33.34/33.33/33.33 percentages exactly, remainder distributed deterministically', () => {
    const shares = resolvePercentageSplit(D(100), [
      { userId: 'alice', percentage: D('33.34') },
      { userId: 'bob', percentage: D('33.33') },
      { userId: 'charlie', percentage: D('33.33') },
    ]);
    expect(sum(shares).equals(D(100))).toBe(true);
    expect(shares.get('alice')!.toString()).toBe('33.34');
  });

  it('percentage remainder case: uneven percentages still sum exactly to total', () => {
    const shares = resolvePercentageSplit(D('250.50'), [
      { userId: 'a', percentage: D('50') },
      { userId: 'b', percentage: D('30') },
      { userId: 'c', percentage: D('20') },
    ]);
    expect(sum(shares).equals(D('250.50'))).toBe(true);
  });

  it('a 100% single-participant percentage resolves to the full amount', () => {
    const shares = resolvePercentageSplit(D('75.33'), [{ userId: 'solo', percentage: D(100) }]);
    expect(shares.get('solo')!.toString()).toBe('75.33');
  });
});

describe('exactSplitSumMatches (spec section 18)', () => {
  it('accepts shares that sum exactly to the total', () => {
    expect(
      exactSplitSumMatches(D(100), [
        { userId: 'a', amount: D(60) },
        { userId: 'b', amount: D(40) },
      ]),
    ).toBe(true);
  });

  it('rejects shares that do not sum exactly (a 1-cent mismatch)', () => {
    expect(
      exactSplitSumMatches(D(100), [
        { userId: 'a', amount: D(60) },
        { userId: 'b', amount: D('39.99') },
      ]),
    ).toBe(false);
  });
});
