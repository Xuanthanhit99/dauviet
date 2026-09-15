import { Prisma } from '@prisma/client';
import { aggregateEstimate } from './aggregate-estimate';
import { EstimateLineItem, ResolvedComponent } from './types';

function resolved(overrides: Partial<ResolvedComponent> = {}): ResolvedComponent {
  return {
    provenance: 'USER_INPUT',
    currency: 'VND',
    amounts: { LOW: new Prisma.Decimal(100), TYPICAL: new Prisma.Decimal(100), HIGH: new Prisma.Decimal(100) },
    assumptionId: null,
    assumptionScope: null,
    offerId: null,
    ...overrides,
  };
}

function item(overrides: Partial<EstimateLineItem> = {}): EstimateLineItem {
  return {
    category: 'STAY',
    targetCurrency: 'VND',
    resolved: resolved(),
    ...overrides,
  };
}

describe('aggregateEstimate', () => {
  it('sums matching-currency components into each scenario total', () => {
    const result = aggregateEstimate('VND', [
      item({ resolved: resolved({ amounts: { LOW: new Prisma.Decimal(100), TYPICAL: new Prisma.Decimal(150), HIGH: new Prisma.Decimal(200) } }) }),
      item({ resolved: resolved({ amounts: { LOW: new Prisma.Decimal(300), TYPICAL: new Prisma.Decimal(350), HIGH: new Prisma.Decimal(400) } }) }),
    ]);

    expect(result.scenarios.LOW.totalAmount.toString()).toBe('400');
    expect(result.scenarios.TYPICAL.totalAmount.toString()).toBe('500');
    expect(result.scenarios.HIGH.totalAmount.toString()).toBe('600');
    expect(result.scenarios.LOW.completeness).toBe('COMPLETE');
    expect(result.scenarios.LOW.unknownCount).toBe(0);
  });

  it('never coerces an UNKNOWN component to zero - excludes it from the sum and marks the estimate PARTIAL (spec section 42)', () => {
    const result = aggregateEstimate('VND', [
      item({ resolved: resolved({ amounts: { LOW: new Prisma.Decimal(100), TYPICAL: new Prisma.Decimal(100), HIGH: new Prisma.Decimal(100) } }) }),
      item({ resolved: resolved({ provenance: 'UNKNOWN', currency: null, amounts: { LOW: null, TYPICAL: null, HIGH: null } }) }),
    ]);

    expect(result.scenarios.LOW.totalAmount.toString()).toBe('100');
    expect(result.scenarios.LOW.completeness).toBe('PARTIAL');
    expect(result.scenarios.LOW.unknownCount).toBe(1);
  });

  it('a known-free component (explicit zero) contributes to the sum and stays COMPLETE - never confused with an excluded UNKNOWN (recovery spec gates 270/271)', () => {
    const result = aggregateEstimate('VND', [
      item({ resolved: resolved({ amounts: { LOW: new Prisma.Decimal(100), TYPICAL: new Prisma.Decimal(100), HIGH: new Prisma.Decimal(100) } }) }),
      item({ resolved: resolved({ amounts: { LOW: new Prisma.Decimal(0), TYPICAL: new Prisma.Decimal(0), HIGH: new Prisma.Decimal(0) } }) }),
    ]);

    expect(result.scenarios.LOW.totalAmount.toString()).toBe('100');
    expect(result.scenarios.LOW.completeness).toBe('COMPLETE');
    expect(result.scenarios.LOW.unknownCount).toBe(0);
  });

  it('never adds a mismatched-currency component into the total, and treats it as an unknown contribution instead of converting it (spec section 54/55)', () => {
    const result = aggregateEstimate('VND', [
      item({ resolved: resolved({ currency: 'VND', amounts: { LOW: new Prisma.Decimal(100), TYPICAL: new Prisma.Decimal(100), HIGH: new Prisma.Decimal(100) } }) }),
      item({ targetCurrency: 'JPY', resolved: resolved({ currency: 'JPY', amounts: { LOW: new Prisma.Decimal(5000), TYPICAL: new Prisma.Decimal(5000), HIGH: new Prisma.Decimal(5000) } }) }),
    ]);

    expect(result.scenarios.TYPICAL.totalAmount.toString()).toBe('100');
    expect(result.scenarios.TYPICAL.completeness).toBe('PARTIAL');
    expect(result.scenarios.TYPICAL.unknownCount).toBe(1);
  });

  it('produces a byte-equivalent LOW <= TYPICAL <= HIGH ordering across scenario totals', () => {
    const result = aggregateEstimate('VND', [
      item({ resolved: resolved({ amounts: { LOW: new Prisma.Decimal(100), TYPICAL: new Prisma.Decimal(150), HIGH: new Prisma.Decimal(200) } }) }),
    ]);

    expect(result.scenarios.LOW.totalAmount.lessThanOrEqualTo(result.scenarios.TYPICAL.totalAmount)).toBe(true);
    expect(result.scenarios.TYPICAL.totalAmount.lessThanOrEqualTo(result.scenarios.HIGH.totalAmount)).toBe(true);
  });

  describe('confidence (spec section 44 - an explicit heuristic, not a statistical measure)', () => {
    it('is HIGH when every included component is USER_INPUT or PROVIDER_EVIDENCE', () => {
      const result = aggregateEstimate('VND', [
        item({ resolved: resolved({ provenance: 'USER_INPUT' }) }),
        item({ resolved: resolved({ provenance: 'PROVIDER_EVIDENCE' }) }),
      ]);
      expect(result.scenarios.TYPICAL.confidence).toBe('HIGH');
    });

    it('is MEDIUM when a component resolves via a non-GLOBAL CostAssumption', () => {
      const result = aggregateEstimate('VND', [item({ resolved: resolved({ provenance: 'RULE_BASED_ESTIMATE', assumptionScope: 'DESTINATION' }) })]);
      expect(result.scenarios.TYPICAL.confidence).toBe('MEDIUM');
    });

    it('is LOW when any component resolves only at GLOBAL scope', () => {
      const result = aggregateEstimate('VND', [
        item({ resolved: resolved({ provenance: 'USER_INPUT' }) }),
        item({ resolved: resolved({ provenance: 'RULE_BASED_ESTIMATE', assumptionScope: 'GLOBAL' }) }),
      ]);
      expect(result.scenarios.TYPICAL.confidence).toBe('LOW');
    });

    it('is LOW when any component is UNKNOWN or currency-excluded', () => {
      const result = aggregateEstimate('VND', [
        item({ resolved: resolved({ provenance: 'USER_INPUT' }) }),
        item({ resolved: resolved({ provenance: 'UNKNOWN', currency: null, amounts: { LOW: null, TYPICAL: null, HIGH: null } }) }),
      ]);
      expect(result.scenarios.TYPICAL.confidence).toBe('LOW');
    });

    it('is LOW for an empty item list', () => {
      const result = aggregateEstimate('VND', []);
      expect(result.scenarios.TYPICAL.confidence).toBe('LOW');
      expect(result.scenarios.TYPICAL.totalAmount.toString()).toBe('0');
      expect(result.scenarios.TYPICAL.completeness).toBe('COMPLETE');
    });
  });
});
