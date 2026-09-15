import { Prisma } from '@prisma/client';
import { computeInputHash } from './input-hash';

describe('computeInputHash (spec section 46/48/93 - deterministic, idempotency key)', () => {
  it('is stable across different key orderings of the same object', () => {
    const a = computeInputHash({ tripId: 't1', startDate: 'x', travelerCount: 2 });
    const b = computeInputHash({ travelerCount: 2, tripId: 't1', startDate: 'x' });
    expect(a).toBe(b);
  });

  it('is stable across nested key orderings', () => {
    const a = computeInputHash({ trip: { a: 1, b: 2 }, items: [{ x: 1, y: 2 }] });
    const b = computeInputHash({ items: [{ y: 2, x: 1 }], trip: { b: 2, a: 1 } });
    expect(a).toBe(b);
  });

  it('changes when a value changes', () => {
    const a = computeInputHash({ tripId: 't1', travelerCount: 2 });
    const b = computeInputHash({ tripId: 't1', travelerCount: 3 });
    expect(a).not.toBe(b);
  });

  it('hashes Prisma.Decimal by numeric value, not internal representation - equal amounts built differently hash identically', () => {
    const a = computeInputHash({ amount: new Prisma.Decimal('1.50') });
    const b = computeInputHash({ amount: new Prisma.Decimal('1.5') });
    expect(a).toBe(b);
  });

  it('distinguishes different Decimal amounts', () => {
    const a = computeInputHash({ amount: new Prisma.Decimal('1.50') });
    const b = computeInputHash({ amount: new Prisma.Decimal('1.51') });
    expect(a).not.toBe(b);
  });

  it('hashes Date by ISO instant, never as an empty object', () => {
    const a = computeInputHash({ fetchedAt: new Date('2026-01-01T00:00:00.000Z') });
    const b = computeInputHash({ fetchedAt: new Date('2026-01-02T00:00:00.000Z') });
    expect(a).not.toBe(b);
    expect(a).not.toBe(computeInputHash({ fetchedAt: {} }));
  });

  it('never depends on the current wall-clock time (pure, no I/O - spec section 46)', () => {
    const input = { tripId: 't1' };
    const a = computeInputHash(input);
    const b = computeInputHash(input);
    expect(a).toBe(b);
  });

  it('distinguishes an empty array from null/undefined', () => {
    expect(computeInputHash({ items: [] })).not.toBe(computeInputHash({ items: null }));
  });
});
