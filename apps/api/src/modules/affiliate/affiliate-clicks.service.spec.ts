import { BadRequestException, ForbiddenException, GoneException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AffiliateClicksService } from './affiliate-clicks.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ProviderRegistryService } from '../providers/provider-registry.service';
import { AffiliateAdapterRegistry } from './affiliate-adapter-registry.service';
import { TripAuthorizationService } from '../trips/trip-authorization.service';
import { AppConfig } from '../../config/configuration';
import { FIXTURE_AFFILIATE_PROVIDER_CODE } from './adapters/fixture-affiliate-adapter';

const AFFILIATE_SETTINGS: AppConfig['affiliate'] = { sessionTtlMinutes: 30, redirectTokenTtlSeconds: 300, defaultEnvironment: 'SANDBOX' };

function makeHarness() {
  const prisma: any = {
    affiliateSession: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn((args) => ({ id: 'session-1', ...args.data })) },
    affiliateClick: { create: jest.fn((args) => ({ id: 'click-1', ...args.data })), findUnique: jest.fn() },
  };
  // G12: default to an eligible gate (resolveRedirect now re-checks it); tests that need a failing gate set it explicitly.
  const registry = { getExecutionContext: jest.fn().mockResolvedValue(OK_CONTEXT) } as unknown as ProviderRegistryService;
  const adapters = new AffiliateAdapterRegistry();
  const config = { get: jest.fn().mockReturnValue(AFFILIATE_SETTINGS) } as unknown as ConfigService<AppConfig, true>;
  const tripAuthz = { authorize: jest.fn().mockResolvedValue({ trip: {}, role: 'VIEWER' }) } as unknown as TripAuthorizationService;
  const service = new AffiliateClicksService(prisma as unknown as PrismaService, registry, adapters, config, tripAuthz);
  return { service, prisma, registry, adapters, tripAuthz };
}

const OK_CONTEXT = {
  ok: true as const,
  context: {
    providerId: 'provider-1',
    providerCode: FIXTURE_AFFILIATE_PROVIDER_CODE,
    capability: 'AFFILIATE_LINK' as const,
    integrationId: 'integ-1',
    licenseId: 'license-1',
    policy: { display: 'ALLOWED', cache: 'ALLOWED', maxCacheSeconds: null, store: 'ALLOWED', storeIdentity: 'ALLOWED', modify: 'ALLOWED', redistribute: 'ALLOWED', commercialUse: 'ALLOWED', conditionalNotes: null },
    attribution: { requirement: 'NOT_REQUIRED', displayText: null, logoRequired: false, linkUrl: null },
    credentialReference: null,
  },
} as any;

describe('AffiliateClicksService.createClick (spec sections 6, 16-18, 76)', () => {
  it('fails closed when the G02 gate rejects the provider (spec section 17)', async () => {
    const { service, registry } = makeHarness();
    (registry.getExecutionContext as jest.Mock).mockResolvedValue({ ok: false, code: 'PROVIDER_NOT_ACTIVE', message: 'not active' });
    await expect(service.createClick(undefined, { providerCode: 'X', surface: 'DESTINATION_STAY' } as any)).rejects.toMatchObject({ response: { code: 'PROVIDER_NOT_ACTIVE' } });
  });

  it('allows an anonymous caller (spec section 6) - userId is undefined throughout', async () => {
    const { service, registry, prisma } = makeHarness();
    (registry.getExecutionContext as jest.Mock).mockResolvedValue(OK_CONTEXT);
    const result = await service.createClick(undefined, { providerCode: FIXTURE_AFFILIATE_PROVIDER_CODE, providerOfferId: 'offer-1', surface: 'DESTINATION_STAY' } as any);
    expect(result.sessionId).toBe('session-1');
    expect(result.redirectToken).toBeTruthy();
    expect(prisma.affiliateSession.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: undefined }) }));
  });

  it('requires authentication to attribute a click to a trip (fails closed for anonymous + tripId)', async () => {
    const { service, registry } = makeHarness();
    (registry.getExecutionContext as jest.Mock).mockResolvedValue(OK_CONTEXT);
    await expect(
      service.createClick(undefined, { providerCode: FIXTURE_AFFILIATE_PROVIDER_CODE, providerOfferId: 'offer-1', surface: 'TRIP_STAY', tripId: 't1' } as any),
    ).rejects.toThrow(ForbiddenException);
  });

  it('reuses trip authorization for a tripId-scoped click (VIEW_TRIP)', async () => {
    const { service, registry, tripAuthz } = makeHarness();
    (registry.getExecutionContext as jest.Mock).mockResolvedValue(OK_CONTEXT);
    await service.createClick('user-1', { providerCode: FIXTURE_AFFILIATE_PROVIDER_CODE, providerOfferId: 'offer-1', surface: 'TRIP_STAY', tripId: 't1' } as any);
    expect(tripAuthz.authorize).toHaveBeenCalledWith('t1', 'user-1', 'VIEW_TRIP');
  });

  it('rejects when neither providerEntityReferenceId nor providerOfferId is supplied (adapter-level validation)', async () => {
    const { service, registry } = makeHarness();
    (registry.getExecutionContext as jest.Mock).mockResolvedValue(OK_CONTEXT);
    await expect(service.createClick(undefined, { providerCode: FIXTURE_AFFILIATE_PROVIDER_CODE, surface: 'DESTINATION_STAY' } as any)).rejects.toThrow(BadRequestException);
  });

  it('reuses a valid, unexpired session id for continuity (spec section 57)', async () => {
    const { service, registry, prisma } = makeHarness();
    (registry.getExecutionContext as jest.Mock).mockResolvedValue(OK_CONTEXT);
    prisma.affiliateSession.findUnique.mockResolvedValue({ id: 'existing-session', providerId: 'provider-1', campaignKey: 'existing-key', expiresAt: new Date(Date.now() + 60_000) });
    const result = await service.createClick(undefined, { providerCode: FIXTURE_AFFILIATE_PROVIDER_CODE, providerOfferId: 'offer-1', surface: 'DESTINATION_STAY', sessionId: 'existing-session' } as any);
    expect(result.sessionId).toBe('existing-session');
    expect(prisma.affiliateSession.create).not.toHaveBeenCalled();
  });

  it('falls through to a fresh session when the supplied session id is expired', async () => {
    const { service, registry, prisma } = makeHarness();
    (registry.getExecutionContext as jest.Mock).mockResolvedValue(OK_CONTEXT);
    prisma.affiliateSession.findUnique.mockResolvedValue({ id: 'expired-session', providerId: 'provider-1', campaignKey: 'old-key', expiresAt: new Date(Date.now() - 1000) });
    const result = await service.createClick(undefined, { providerCode: FIXTURE_AFFILIATE_PROVIDER_CODE, providerOfferId: 'offer-1', surface: 'DESTINATION_STAY', sessionId: 'expired-session' } as any);
    expect(result.sessionId).toBe('session-1');
    expect(prisma.affiliateSession.create).toHaveBeenCalled();
  });

  it('never lets the client build the redirect URL - the stored click.redirectUrl is always the adapter-built, validated one', async () => {
    const { service, registry, prisma } = makeHarness();
    (registry.getExecutionContext as jest.Mock).mockResolvedValue(OK_CONTEXT);
    await service.createClick(undefined, { providerCode: FIXTURE_AFFILIATE_PROVIDER_CODE, providerOfferId: 'offer-1', surface: 'DESTINATION_STAY' } as any);
    const createArgs = prisma.affiliateClick.create.mock.calls[0][0];
    expect(createArgs.data.redirectUrl).toContain('www.fixture-provider.example');
    expect(createArgs.data.redirectUrl).toContain('offer=offer-1');
  });
});

describe('AffiliateClicksService.resolveRedirect (spec section 14)', () => {
  it('rejects an unknown token', async () => {
    const { service, prisma } = makeHarness();
    prisma.affiliateClick.findUnique.mockResolvedValue(null);
    await expect(service.resolveRedirect('bad-token')).rejects.toThrow(NotFoundException);
  });

  it('rejects an expired token', async () => {
    const { service, prisma } = makeHarness();
    prisma.affiliateClick.findUnique.mockResolvedValue({ redirectUrl: 'https://x', redirectTokenExpiresAt: new Date(Date.now() - 1000) });
    await expect(service.resolveRedirect('token')).rejects.toThrow(GoneException);
  });

  it('resolves a valid token to its stored, pre-validated URL', async () => {
    const { service, prisma } = makeHarness();
    prisma.affiliateClick.findUnique.mockResolvedValue({ redirectUrl: 'https://www.fixture-provider.example/deeplink?offer=1', redirectTokenExpiresAt: new Date(Date.now() + 60_000) });
    await expect(service.resolveRedirect('token')).resolves.toBe('https://www.fixture-provider.example/deeplink?offer=1');
  });

  it('G12: re-evaluates the G02 gate on every redirect with the click own environment (AFFILIATE_LINK, commercialUse)', async () => {
    const { service, prisma, registry } = makeHarness();
    prisma.affiliateClick.findUnique.mockResolvedValue({ redirectUrl: 'https://www.fixture-provider.example/d', redirectTokenExpiresAt: new Date(Date.now() + 60_000), environment: 'SANDBOX', provider: { code: 'PROV_X' } });
    await service.resolveRedirect('token');
    expect(registry.getExecutionContext).toHaveBeenCalledWith({ providerCode: 'PROV_X', environment: 'SANDBOX', capability: 'AFFILIATE_LINK', usage: 'commercialUse' });
  });

  it('G12: a token minted before a license revocation / provider disable no longer redirects (403 with the gate code)', async () => {
    const { service, prisma, registry } = makeHarness();
    prisma.affiliateClick.findUnique.mockResolvedValue({ redirectUrl: 'https://www.fixture-provider.example/d', redirectTokenExpiresAt: new Date(Date.now() + 60_000), environment: 'SANDBOX', provider: { code: 'PROV_X' } });
    (registry.getExecutionContext as jest.Mock).mockResolvedValue({ ok: false, code: 'PROVIDER_LICENSE_REVOKED', message: 'revoked' });
    await expect(service.resolveRedirect('token')).rejects.toMatchObject({ response: { code: 'PROVIDER_LICENSE_REVOKED' } });
    await expect(service.resolveRedirect('token')).rejects.toThrow(ForbiddenException);
  });
});
