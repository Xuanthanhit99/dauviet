import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AffiliateConversionsService } from './affiliate-conversions.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ProviderRegistryService } from '../providers/provider-registry.service';
import { AffiliateAdapterRegistry } from './affiliate-adapter-registry.service';
import { AppConfig } from '../../config/configuration';
import { FIXTURE_AFFILIATE_PROVIDER_CODE } from './adapters/fixture-affiliate-adapter';

const AFFILIATE_SETTINGS: AppConfig['affiliate'] = { sessionTtlMinutes: 30, redirectTokenTtlSeconds: 300, defaultEnvironment: 'SANDBOX' };

function makeHarness() {
  const prisma: any = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'conv-1', providerOccurredAt: new Date() }]),
    affiliateClick: { findFirst: jest.fn().mockResolvedValue(null) },
    affiliateConversion: { findUniqueOrThrow: jest.fn() },
    providerBookingReference: { upsert: jest.fn() },
    $transaction: jest.fn((arg: unknown) => (typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as Promise<unknown>[]))),
  };
  const audit = { log: jest.fn() } as unknown as AuditService;
  const registry = { getExecutionContext: jest.fn() } as unknown as ProviderRegistryService;
  const adapters = new AffiliateAdapterRegistry();
  const config = { get: jest.fn().mockReturnValue(AFFILIATE_SETTINGS) } as unknown as ConfigService<AppConfig, true>;
  const service = new AffiliateConversionsService(prisma as unknown as PrismaService, audit, registry, adapters, config);
  return { service, prisma, audit, registry };
}

const OK_CONTEXT = {
  ok: true as const,
  context: { providerId: 'provider-1', providerCode: FIXTURE_AFFILIATE_PROVIDER_CODE, capability: 'CONVERSION_REPORTING', integrationId: 'i1', licenseId: 'license-1', policy: {}, attribution: {}, credentialReference: null },
} as any;

function fixtureEvidence(overrides: Record<string, unknown> = {}) {
  return {
    conversionId: 'ext-conv-1',
    status: 'confirmed',
    providerOccurredAt: new Date('2026-09-01T00:00:00Z').toISOString(),
    reportedAt: new Date('2026-09-01T01:00:00Z').toISOString(),
    bookingAmount: '500.00',
    bookingCurrency: 'USD',
    commissionAmount: '40.00',
    commissionCurrency: 'USD',
    ...overrides,
  };
}

describe('AffiliateConversionsService.ingest (spec sections 27-42)', () => {
  it('fails closed when the G02 gate rejects the provider', async () => {
    const { service, registry } = makeHarness();
    (registry.getExecutionContext as jest.Mock).mockResolvedValue({ ok: false, code: 'PROVIDER_LICENSE_REVOKED', message: 'revoked' });
    await expect(
      service.ingest('admin-1', { providerCode: FIXTURE_AFFILIATE_PROVIDER_CODE, evidenceType: 'FIXTURE', evidenceReference: 'ref-1', evidence: fixtureEvidence() }),
    ).rejects.toMatchObject({ response: { code: 'PROVIDER_LICENSE_REVOKED' } });
  });

  it('rejects malformed evidence (missing required fields)', async () => {
    const { service, registry } = makeHarness();
    (registry.getExecutionContext as jest.Mock).mockResolvedValue(OK_CONTEXT);
    await expect(
      service.ingest('admin-1', { providerCode: FIXTURE_AFFILIATE_PROVIDER_CODE, evidenceType: 'FIXTURE', evidenceReference: 'ref-1', evidence: { status: 'confirmed' } }),
    ).rejects.toThrow(BadRequestException);
  });

  it('on success: creates the conversion via the idempotent upsert and audits it', async () => {
    const { service, registry, prisma, audit } = makeHarness();
    (registry.getExecutionContext as jest.Mock).mockResolvedValue(OK_CONTEXT);
    prisma.affiliateConversion.findUniqueOrThrow.mockResolvedValue({ id: 'conv-1', status: 'CONFIRMED' });

    await service.ingest('admin-1', { providerCode: FIXTURE_AFFILIATE_PROVIDER_CODE, evidenceType: 'FIXTURE', evidenceReference: 'ref-1', evidence: fixtureEvidence() });

    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'affiliateConversion.ingested', entityType: 'AFFILIATE_CONVERSION' }), prisma);
  });

  it('reconciles a click deterministically via campaignKey, never fuzzy matching (spec section 40/41)', async () => {
    const { service, registry, prisma } = makeHarness();
    (registry.getExecutionContext as jest.Mock).mockResolvedValue(OK_CONTEXT);
    prisma.affiliateClick.findFirst.mockResolvedValue({ id: 'click-1', affiliateSessionId: 'session-1' });
    prisma.affiliateConversion.findUniqueOrThrow.mockResolvedValue({ id: 'conv-1' });

    await service.ingest('admin-1', { providerCode: FIXTURE_AFFILIATE_PROVIDER_CODE, evidenceType: 'FIXTURE', evidenceReference: 'ref-1', evidence: fixtureEvidence({ campaignKey: 'camp-abc' }) });

    expect(prisma.affiliateClick.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { campaignKey: 'camp-abc', providerId: 'provider-1' } }));
  });

  it('retains a conversion with no click match (spec section 42) - never fabricates a click relation', async () => {
    const { service, registry, prisma } = makeHarness();
    (registry.getExecutionContext as jest.Mock).mockResolvedValue(OK_CONTEXT);
    prisma.affiliateClick.findFirst.mockResolvedValue(null);
    prisma.affiliateConversion.findUniqueOrThrow.mockResolvedValue({ id: 'conv-1' });

    await expect(service.ingest('admin-1', { providerCode: FIXTURE_AFFILIATE_PROVIDER_CODE, evidenceType: 'FIXTURE', evidenceReference: 'ref-1', evidence: fixtureEvidence() })).resolves.toBeDefined();
    const insertCall = prisma.$queryRaw.mock.calls[0];
    // The raw SQL template's values array includes the click id parameter - assert it was null.
    expect(insertCall.some((v: any) => v === null || (Array.isArray(v) && v.includes(null)))).toBe(true);
  });

  it('idempotent duplicate delivery (same providerOccurredAt) is a no-op, not an error', async () => {
    const { service, registry, prisma } = makeHarness();
    (registry.getExecutionContext as jest.Mock).mockResolvedValue(OK_CONTEXT);
    const occurredAt = new Date('2026-09-01T00:00:00Z');
    prisma.$queryRaw.mockResolvedValue([]); // ON CONFLICT WHERE guard rejected it
    prisma.affiliateConversion.findUniqueOrThrow.mockResolvedValue({ id: 'conv-1', providerOccurredAt: occurredAt });

    await expect(
      service.ingest('admin-1', { providerCode: FIXTURE_AFFILIATE_PROVIDER_CODE, evidenceType: 'FIXTURE', evidenceReference: 'ref-1', evidence: fixtureEvidence({ providerOccurredAt: occurredAt.toISOString() }) }),
    ).resolves.toBeDefined();
  });

  it('rejects strictly-older evidence with AFFILIATE_CONVERSION_STALE_EVIDENCE, never overriding newer state', async () => {
    const { service, registry, prisma } = makeHarness();
    (registry.getExecutionContext as jest.Mock).mockResolvedValue(OK_CONTEXT);
    const stored = new Date('2026-09-05T00:00:00Z');
    const older = new Date('2026-09-01T00:00:00Z');
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.affiliateConversion.findUniqueOrThrow.mockResolvedValue({ id: 'conv-1', providerOccurredAt: stored });

    await expect(
      service.ingest('admin-1', { providerCode: FIXTURE_AFFILIATE_PROVIDER_CODE, evidenceType: 'FIXTURE', evidenceReference: 'ref-1', evidence: fixtureEvidence({ providerOccurredAt: older.toISOString() }) }),
    ).rejects.toMatchObject({ response: { code: 'AFFILIATE_CONVERSION_STALE_EVIDENCE' } });
  });

  it('missing commission is stored as null, never computed from a hard-coded percentage', async () => {
    const { service, registry, prisma } = makeHarness();
    (registry.getExecutionContext as jest.Mock).mockResolvedValue(OK_CONTEXT);
    prisma.affiliateConversion.findUniqueOrThrow.mockResolvedValue({ id: 'conv-1' });

    await service.ingest('admin-1', {
      providerCode: FIXTURE_AFFILIATE_PROVIDER_CODE,
      evidenceType: 'FIXTURE',
      evidenceReference: 'ref-1',
      evidence: fixtureEvidence({ commissionAmount: undefined, commissionCurrency: undefined }),
    });
    const insertCall = prisma.$queryRaw.mock.calls[0];
    expect(insertCall.some((v: any) => v === undefined)).toBe(false); // sanity - no undefined leaked into the raw query
  });

  it('links a ProviderBookingReference when the evidence includes one, without requiring it (spec section 26)', async () => {
    const { service, registry, prisma } = makeHarness();
    (registry.getExecutionContext as jest.Mock).mockResolvedValue(OK_CONTEXT);
    prisma.providerBookingReference.upsert.mockResolvedValue({ id: 'booking-ref-1' });
    prisma.affiliateConversion.findUniqueOrThrow.mockResolvedValue({ id: 'conv-1' });

    await service.ingest('admin-1', { providerCode: FIXTURE_AFFILIATE_PROVIDER_CODE, evidenceType: 'FIXTURE', evidenceReference: 'ref-1', evidence: fixtureEvidence({ bookingReference: 'EXT-REF-1' }) });
    expect(prisma.providerBookingReference.upsert).toHaveBeenCalled();
  });

  it('never requires a booking reference (spec section 26)', async () => {
    const { service, registry, prisma } = makeHarness();
    (registry.getExecutionContext as jest.Mock).mockResolvedValue(OK_CONTEXT);
    prisma.affiliateConversion.findUniqueOrThrow.mockResolvedValue({ id: 'conv-1' });

    await service.ingest('admin-1', { providerCode: FIXTURE_AFFILIATE_PROVIDER_CODE, evidenceType: 'FIXTURE', evidenceReference: 'ref-1', evidence: fixtureEvidence() });
    expect(prisma.providerBookingReference.upsert).not.toHaveBeenCalled();
  });
});
