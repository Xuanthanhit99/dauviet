import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, ProviderStatus } from '@prisma/client';
import { ProvidersService } from './providers.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('ProvidersService', () => {
  let prisma: any;
  let audit: { log: jest.Mock };
  let service: ProvidersService;

  beforeEach(() => {
    prisma = {
      externalProvider: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
      providerCapability: { create: jest.fn() },
      $transaction: jest.fn((arg: unknown) => (Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(prisma))),
    };
    audit = { log: jest.fn() };
    service = new ProvidersService(prisma as unknown as PrismaService, audit as unknown as AuditService);
  });

  describe('create', () => {
    const dto = { code: 'GOOGLE_PLACES', name: 'Google Places' } as any;

    it('creates a DRAFT provider and logs an audit entry', async () => {
      prisma.externalProvider.create.mockResolvedValue({ id: 'p1', code: 'GOOGLE_PLACES', status: ProviderStatus.DRAFT });
      const result = await service.create(dto, 'actor-1');
      expect(prisma.externalProvider.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: ProviderStatus.DRAFT }) }),
      );
      expect(result.id).toBe('p1');
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'provider.created', entityType: 'PROVIDER' }));
    });

    it('maps a duplicate code (P2002) to PROVIDER_CODE_CONFLICT', async () => {
      prisma.externalProvider.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '5.20.0' }),
      );
      await expect(service.create(dto, 'actor-1')).rejects.toThrow(ConflictException);
    });
  });

  describe('declareCapability', () => {
    it('404s when the provider does not exist', async () => {
      prisma.externalProvider.findUnique.mockResolvedValue(null);
      await expect(service.declareCapability('missing', { capability: 'PLACE_DETAIL' } as any, 'actor-1')).rejects.toThrow(NotFoundException);
    });

    it('maps a duplicate (providerId, capability) to PROVIDER_CAPABILITY_ALREADY_DECLARED', async () => {
      prisma.externalProvider.findUnique.mockResolvedValue({ id: 'p1' });
      prisma.providerCapability.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '5.20.0' }),
      );
      await expect(service.declareCapability('p1', { capability: 'PLACE_DETAIL' } as any, 'actor-1')).rejects.toThrow(ConflictException);
    });

    it('declares a new capability and audits it', async () => {
      prisma.externalProvider.findUnique.mockResolvedValue({ id: 'p1' });
      prisma.providerCapability.create.mockResolvedValue({ id: 'cap-1', providerId: 'p1', capability: 'PLACE_DETAIL' });
      const result = await service.declareCapability('p1', { capability: 'PLACE_DETAIL' } as any, 'actor-1');
      expect(result.id).toBe('cap-1');
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'provider.capability.declared' }));
    });
  });

  describe('setStatus', () => {
    it('404s for a missing provider', async () => {
      prisma.externalProvider.findUnique.mockResolvedValue(null);
      await expect(service.setStatus('missing', ProviderStatus.ACTIVE, 'actor-1')).rejects.toThrow(NotFoundException);
    });

    it('updates status and audits the change', async () => {
      prisma.externalProvider.findUnique.mockResolvedValue({ id: 'p1' });
      prisma.externalProvider.update.mockResolvedValue({ id: 'p1', status: ProviderStatus.ACTIVE });
      await service.setStatus('p1', ProviderStatus.ACTIVE, 'actor-1');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'provider.status.changed', metadata: { status: ProviderStatus.ACTIVE } }),
      );
    });
  });

  describe('list', () => {
    it('paginates and applies an optional status filter', async () => {
      prisma.$transaction.mockResolvedValue([0, []]);
      await service.list({ page: 1, pageSize: 20, status: ProviderStatus.DRAFT });
      expect(prisma.externalProvider.count).toHaveBeenCalledWith({ where: { status: ProviderStatus.DRAFT } });
    });
  });
});
