import { BadRequestException } from '@nestjs/common';
import { FixtureAffiliateAdapter } from './fixture-affiliate-adapter';

describe('FixtureAffiliateAdapter', () => {
  const adapter = new FixtureAffiliateAdapter();

  it('builds a redirect URL on the fixture host with the campaign key as label (spec section 20/76)', () => {
    const result = adapter.buildAffiliateRedirect({ providerOfferId: 'offer-1', campaignKey: 'camp-xyz' } as any);
    const url = new URL(result.redirectUrl);
    expect(url.hostname).toBe('www.fixture-provider.example');
    expect(url.protocol).toBe('https:');
    expect(url.searchParams.get('label')).toBe('camp-xyz');
    expect(url.searchParams.get('offer')).toBe('offer-1');
  });

  it('requires at least one of providerEntityReferenceId/providerOfferId', () => {
    expect(() => adapter.buildAffiliateRedirect({ campaignKey: 'x' } as any)).toThrow(BadRequestException);
  });

  it('normalizes a valid fixture evidence payload', () => {
    const normalized = adapter.normalizeConversion({ conversionId: 'c1', status: 'confirmed', providerOccurredAt: '2026-01-01T00:00:00Z', reportedAt: '2026-01-01T01:00:00Z' });
    expect(normalized.status).toBe('CONFIRMED');
    expect(normalized.providerConversionId).toBe('c1');
  });

  it('rejects an unrecognized status', () => {
    expect(() => adapter.normalizeConversion({ conversionId: 'c1', status: 'weird', providerOccurredAt: '2026-01-01T00:00:00Z', reportedAt: '2026-01-01T01:00:00Z' })).toThrow(BadRequestException);
  });

  it('rejects evidence missing required fields', () => {
    expect(() => adapter.normalizeConversion({ status: 'confirmed' })).toThrow(BadRequestException);
  });
});
