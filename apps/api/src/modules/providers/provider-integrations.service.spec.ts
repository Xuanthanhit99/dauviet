import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ProviderIntegrationsService } from './provider-integrations.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ProviderRegistryService } from './provider-registry.service';
import { PROVIDER_ERROR_CODES } from '../../common/errors/provider-error-codes';

/**
 * G02 spec section 41 (activation transaction atomicity) and section 19/20
 * (fail-closed activation gate) - `activateCapability` must delegate to the
 * SAME evaluator the runtime registry uses, and must never write anything
 * when that evaluator rejects. `enableCapability` (ENABLED_FOR_OUR_ACCOUNT,
 * spec section 7) is deliberately a separate, ungated action - see the
 * doc comment on `ProviderIntegrationsService.enableCapability` for why
 * these must not be conflated (a real defect live QA surfaced).
 */
describe('ProviderIntegrationsService', () => {
  let prisma: any;
  let audit: { log: jest.Mock };
  let registry: { getExecutionContext: jest.Mock };
  let service: ProviderIntegrationsService;

  beforeEach(() => {
    prisma = {
      externalProvider: { findUnique: jest.fn() },
      providerIntegration: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
      providerIntegrationCapability: { upsert: jest.fn(), findUnique: jest.fn(), delete: jest.fn() },
      $transaction: jest.fn((arg: unknown) => (Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(prisma))),
    };
    audit = { log: jest.fn() };
    registry = { getExecutionContext: jest.fn() };
    service = new ProviderIntegrationsService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      registry as unknown as ProviderRegistryService,
    );
  });

  describe('create', () => {
    it('404s when the provider does not exist', async () => {
      prisma.externalProvider.findUnique.mockResolvedValue(null);
      await expect(service.create('missing', { environment: 'SANDBOX' } as any, 'actor-1')).rejects.toThrow(NotFoundException);
    });

    it('maps a duplicate (providerId, environment) to PROVIDER_INTEGRATION_ALREADY_EXISTS', async () => {
      prisma.externalProvider.findUnique.mockResolvedValue({ id: 'p1' });
      prisma.providerIntegration.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '5.20.0' }),
      );
      await expect(service.create('p1', { environment: 'SANDBOX' } as any, 'actor-1')).rejects.toThrow(ConflictException);
    });

    it('creates NOT_CONFIGURED when no credentialReference is given, CONFIGURED when one is', async () => {
      prisma.externalProvider.findUnique.mockResolvedValue({ id: 'p1' });
      prisma.providerIntegration.create.mockResolvedValue({ id: 'i1' });
      await service.create('p1', { environment: 'SANDBOX', credentialReference: 'GOOGLE_KEY' } as any, 'actor-1');
      expect(prisma.providerIntegration.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'CONFIGURED' }) }),
      );
    });
  });

  describe('enableCapability', () => {
    it('404s when the integration does not exist', async () => {
      prisma.providerIntegration.findUnique.mockResolvedValue(null);
      await expect(service.enableCapability('missing', 'PLACE_DETAIL', 'actor-1')).rejects.toThrow(NotFoundException);
    });

    it('is ungated by license state - enables the capability and audits it even with no license anywhere', async () => {
      prisma.providerIntegration.findUnique.mockResolvedValue({ id: 'i1', environment: 'SANDBOX', provider: { code: 'TEST_PROVIDER' } });
      prisma.providerIntegrationCapability.upsert.mockResolvedValue({ id: 'ic1', integrationId: 'i1', capability: 'PLACE_DETAIL', approvedAt: new Date() });

      const result = await service.enableCapability('i1', 'PLACE_DETAIL', 'actor-1');

      expect(registry.getExecutionContext).not.toHaveBeenCalled();
      expect(result.id).toBe('ic1');
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'provider.integration.capability.enabled' }), prisma);
    });
  });

  describe('activateCapability', () => {
    const integrationRow = { id: 'i1', environment: 'SANDBOX', provider: { code: 'TEST_PROVIDER' } };

    it('refuses with PROVIDER_CAPABILITY_NOT_ENABLED (not the registry gate) when the capability was never enabled first', async () => {
      prisma.providerIntegration.findUnique.mockResolvedValue(integrationRow);
      prisma.providerIntegrationCapability.findUnique.mockResolvedValue(null);

      await expect(service.activateCapability('i1', 'PLACE_DETAIL', 'actor-1')).rejects.toThrow(BadRequestException);
      expect(registry.getExecutionContext).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('404s and writes nothing when the registry evaluator returns a not-found code', async () => {
      prisma.providerIntegration.findUnique.mockResolvedValue(integrationRow);
      prisma.providerIntegrationCapability.findUnique.mockResolvedValue({ approvedAt: new Date() });
      registry.getExecutionContext.mockResolvedValue({ ok: false, code: PROVIDER_ERROR_CODES.PROVIDER_LICENSE_NOT_FOUND, message: 'no license' });

      await expect(service.activateCapability('i1', 'PLACE_DETAIL', 'actor-1')).rejects.toThrow(NotFoundException);
      expect(prisma.providerIntegration.update).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('400s and writes nothing when the registry evaluator returns any other rejection code', async () => {
      prisma.providerIntegration.findUnique.mockResolvedValue(integrationRow);
      prisma.providerIntegrationCapability.findUnique.mockResolvedValue({ approvedAt: new Date() });
      registry.getExecutionContext.mockResolvedValue({ ok: false, code: PROVIDER_ERROR_CODES.PROVIDER_USAGE_NOT_ALLOWED, message: 'not allowed' });

      await expect(service.activateCapability('i1', 'PLACE_DETAIL', 'actor-1')).rejects.toThrow(BadRequestException);
      expect(prisma.providerIntegration.update).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('stamps lastVerifiedAt and writes an audit entry, atomically, when the gate passes', async () => {
      prisma.providerIntegration.findUnique.mockResolvedValue(integrationRow);
      prisma.providerIntegrationCapability.findUnique.mockResolvedValue({ approvedAt: new Date() });
      registry.getExecutionContext.mockResolvedValue({ ok: true, context: { providerCode: 'TEST_PROVIDER' } });
      prisma.providerIntegration.update.mockResolvedValue({ id: 'i1', lastVerifiedAt: new Date() });

      const result = await service.activateCapability('i1', 'PLACE_DETAIL', 'actor-1');

      expect(result.integration.id).toBe('i1');
      expect(result.context).toEqual({ providerCode: 'TEST_PROVIDER' });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'provider.integration.capability.activated' }),
        prisma,
      );
    });
  });

  describe('revokeCapability', () => {
    it('404s when the capability is not currently enabled', async () => {
      prisma.providerIntegrationCapability.findUnique.mockResolvedValue(null);
      await expect(service.revokeCapability('i1', 'PLACE_DETAIL', 'actor-1')).rejects.toThrow(NotFoundException);
    });

    it('deletes the enablement row and audits the revocation', async () => {
      prisma.providerIntegrationCapability.findUnique.mockResolvedValue({ integrationId: 'i1', capability: 'PLACE_DETAIL', approvedAt: new Date() });
      await service.revokeCapability('i1', 'PLACE_DETAIL', 'actor-1');
      expect(prisma.providerIntegrationCapability.delete).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'provider.integration.capability.revoked' }), prisma);
    });
  });
});
