import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProviderLicenseStatus } from '@prisma/client';
import { ProviderLicensesService } from './provider-licenses.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PROVIDER_ERROR_CODES } from '../../common/errors/provider-error-codes';

describe('ProviderLicensesService', () => {
  let prisma: any;
  let audit: { log: jest.Mock };
  let service: ProviderLicensesService;

  beforeEach(() => {
    prisma = {
      externalProvider: { findUnique: jest.fn() },
      providerLicense: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
      revision: { create: jest.fn() },
      providerDataPolicy: { upsert: jest.fn() },
      providerAttributionRule: { create: jest.fn() },
      providerPolicyEvidence: { create: jest.fn() },
      $transaction: jest.fn((arg: unknown) => (Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(prisma))),
    };
    audit = { log: jest.fn() };
    service = new ProviderLicensesService(prisma as unknown as PrismaService, audit as unknown as AuditService);
  });

  const rightsDto = {
    rightsDisplay: 'ALLOWED',
    rightsCache: 'PROHIBITED',
    rightsStore: 'UNKNOWN',
    rightsModify: 'PROHIBITED',
    rightsRedistribute: 'PROHIBITED',
    rightsCommercialUse: 'UNKNOWN',
    attributionRequirement: 'REQUIRED',
  } as any;

  describe('setRights', () => {
    it('404s for a missing license', async () => {
      prisma.providerLicense.findUnique.mockResolvedValue(null);
      await expect(service.setRights('missing', rightsDto, 'actor-1')).rejects.toThrow(NotFoundException);
    });

    it('rejects a CONDITIONAL right with no conditionalNotes', async () => {
      prisma.providerLicense.findUnique.mockResolvedValue({ id: 'lic-1' });
      await expect(
        service.setRights('lic-1', { ...rightsDto, rightsDisplay: 'CONDITIONAL' }, 'actor-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts a CONDITIONAL right when conditionalNotes is provided, snapshots a Revision, and audits the review', async () => {
      prisma.providerLicense.findUnique.mockResolvedValueOnce({ id: 'lic-1' }).mockResolvedValueOnce({ id: 'lic-1', rightsDisplay: 'CONDITIONAL' });
      prisma.providerLicense.update.mockResolvedValue({ id: 'lic-1', rightsDisplay: 'CONDITIONAL', reviewedById: 'actor-1' });

      await service.setRights('lic-1', { ...rightsDto, rightsDisplay: 'CONDITIONAL', conditionalNotes: 'Logo must be visible.' }, 'actor-1');

      expect(prisma.providerLicense.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ reviewedById: 'actor-1' }) }),
      );
      expect(prisma.revision.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ entityType: 'PROVIDER_LICENSE', entityId: 'lic-1' }) }),
      );
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'provider.license.reviewed' }), prisma);
    });
  });

  describe('setStatus', () => {
    it('refuses to APPROVE a license whose rights were never reviewed (reviewedAt null)', async () => {
      prisma.providerLicense.findUnique.mockResolvedValue({ id: 'lic-1', reviewedAt: null });
      const result = service.setStatus('lic-1', ProviderLicenseStatus.APPROVED, 'actor-1');
      await expect(result).rejects.toThrow(BadRequestException);
      await expect(result).rejects.toMatchObject({ response: expect.objectContaining({ code: PROVIDER_ERROR_CODES.PROVIDER_LICENSE_NOT_REVIEWED }) });
    });

    it('approves a reviewed license, snapshots a Revision, and audits provider.license.approved', async () => {
      prisma.providerLicense.findUnique.mockResolvedValueOnce({ id: 'lic-1', reviewedAt: new Date() }).mockResolvedValueOnce({ id: 'lic-1', status: 'APPROVED' });
      prisma.providerLicense.update.mockResolvedValue({ id: 'lic-1', status: 'APPROVED' });

      await service.setStatus('lic-1', ProviderLicenseStatus.APPROVED, 'actor-1');

      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'provider.license.approved' }), prisma);
    });

    it('allows REVOKED regardless of review history and audits provider.license.revoked', async () => {
      prisma.providerLicense.findUnique.mockResolvedValueOnce({ id: 'lic-1', reviewedAt: null }).mockResolvedValueOnce({ id: 'lic-1', status: 'REVOKED' });
      prisma.providerLicense.update.mockResolvedValue({ id: 'lic-1', status: 'REVOKED' });

      await service.setStatus('lic-1', ProviderLicenseStatus.REVOKED, 'actor-1');

      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'provider.license.revoked' }), prisma);
    });
  });

  describe('createDataPolicy', () => {
    it('404s for a missing license', async () => {
      prisma.providerLicense.findUnique.mockResolvedValue(null);
      await expect(service.createDataPolicy('missing', { capability: 'PLACE_DETAIL' } as any, 'actor-1')).rejects.toThrow(NotFoundException);
    });

    it('upserts scoped by (licenseId, capability) and stamps reviewedAt/reviewedById from the caller', async () => {
      prisma.providerLicense.findUnique.mockResolvedValue({ id: 'lic-1', providerId: 'p1' });
      prisma.providerDataPolicy.upsert.mockResolvedValue({ id: 'dp1' });

      await service.createDataPolicy('lic-1', { capability: 'PLACE_DETAIL', cacheAllowed: 'ALLOWED', storeIdentityAllowed: 'ALLOWED', storeContentAllowed: 'PROHIBITED', persistentIdentifierAllowed: 'ALLOWED' } as any, 'actor-1');

      expect(prisma.providerDataPolicy.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { licenseId_capability: { licenseId: 'lic-1', capability: 'PLACE_DETAIL' } },
          update: expect.objectContaining({ reviewedById: 'actor-1' }),
          create: expect.objectContaining({ reviewedById: 'actor-1', providerId: 'p1' }),
        }),
      );
    });
  });
});
