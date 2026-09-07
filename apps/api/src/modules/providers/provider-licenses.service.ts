import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProviderLicenseStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PROVIDER_ERROR_CODES } from '../../common/errors/provider-error-codes';
import {
  CreateProviderAttributionRuleDto,
  CreateProviderDataPolicyDto,
  CreateProviderLicenseDto,
  CreateProviderPolicyEvidenceDto,
  SetProviderLicenseRightsDto,
  UpdateProviderLicenseDto,
} from './dto/provider-license.dto';

/**
 * The legal/contractual rights layer (spec sections 10-18). Every
 * substantive rights determination is snapshotted into the existing
 * generic `Revision` model (spec section 17 - audit existing mechanisms
 * before inventing a parallel one) so "what did we believe applied when
 * this was activated" stays answerable.
 */
@Injectable()
export class ProviderLicensesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private async findOrThrow(id: string) {
    const license = await this.prisma.providerLicense.findUnique({ where: { id } });
    if (!license) throw new NotFoundException({ code: PROVIDER_ERROR_CODES.PROVIDER_LICENSE_NOT_FOUND, message: 'License not found.' });
    return license;
  }

  private async snapshot(licenseId: string, changeNote: string, changedById: string, tx: Prisma.TransactionClient = this.prisma) {
    const current = await tx.providerLicense.findUnique({ where: { id: licenseId } });
    await tx.revision.create({
      data: { entityType: 'PROVIDER_LICENSE', entityId: licenseId, snapshot: current as unknown as Prisma.InputJsonValue, changeNote, changedById },
    });
  }

  async create(providerId: string, dto: CreateProviderLicenseDto, actorId: string) {
    const provider = await this.prisma.externalProvider.findUnique({ where: { id: providerId } });
    if (!provider) throw new NotFoundException({ code: PROVIDER_ERROR_CODES.PROVIDER_NOT_FOUND, message: 'Provider not found.' });

    const license = await this.prisma.providerLicense.create({
      data: {
        providerId,
        datasetOrProduct: dto.datasetOrProduct,
        capability: dto.capability,
        licenseType: dto.licenseType,
        termsUrl: dto.termsUrl,
        privacyUrl: dto.privacyUrl,
        developerTermsUrl: dto.developerTermsUrl,
        effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : undefined,
        effectiveUntil: dto.effectiveUntil ? new Date(dto.effectiveUntil) : undefined,
        notes: dto.notes,
        status: ProviderLicenseStatus.DRAFT,
      },
    });
    await this.audit.log({ actorId, action: 'provider.license.created', entityType: 'PROVIDER_LICENSE', entityId: license.id });
    return license;
  }

  async update(id: string, dto: UpdateProviderLicenseDto, actorId: string) {
    await this.findOrThrow(id);
    const updated = await this.prisma.providerLicense.update({
      where: { id },
      data: {
        datasetOrProduct: dto.datasetOrProduct,
        licenseType: dto.licenseType,
        termsUrl: dto.termsUrl,
        privacyUrl: dto.privacyUrl,
        developerTermsUrl: dto.developerTermsUrl,
        effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : undefined,
        effectiveUntil: dto.effectiveUntil ? new Date(dto.effectiveUntil) : undefined,
        notes: dto.notes,
      },
    });
    await this.audit.log({ actorId, action: 'provider.license.updated', entityType: 'PROVIDER_LICENSE', entityId: id });
    return updated;
  }

  /** The dedicated reviewed-rights action (spec section 11/21) - never a bare field PATCH. */
  async setRights(id: string, dto: SetProviderLicenseRightsDto, actorId: string) {
    await this.findOrThrow(id);

    const rights = [dto.rightsDisplay, dto.rightsCache, dto.rightsStore, dto.rightsModify, dto.rightsRedistribute, dto.rightsCommercialUse];
    if (rights.includes('CONDITIONAL') && !dto.conditionalNotes?.trim()) {
      throw new BadRequestException({
        code: PROVIDER_ERROR_CODES.PROVIDER_LICENSE_CONDITIONAL_NOTES_REQUIRED,
        message: 'conditionalNotes is required when any right is CONDITIONAL.',
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const license = await tx.providerLicense.update({
        where: { id },
        data: {
          rightsDisplay: dto.rightsDisplay,
          rightsCache: dto.rightsCache,
          rightsStore: dto.rightsStore,
          rightsModify: dto.rightsModify,
          rightsRedistribute: dto.rightsRedistribute,
          rightsCommercialUse: dto.rightsCommercialUse,
          conditionalNotes: dto.conditionalNotes,
          attributionRequirement: dto.attributionRequirement,
          reviewedAt: new Date(),
          reviewedById: actorId,
        },
      });
      await this.snapshot(id, 'rights reviewed/updated', actorId, tx);
      await this.audit.log({ actorId, action: 'provider.license.reviewed', entityType: 'PROVIDER_LICENSE', entityId: id }, tx);
      return license;
    });

    return updated;
  }

  async setStatus(id: string, status: ProviderLicenseStatus, actorId: string) {
    const license = await this.findOrThrow(id);

    if (status === ProviderLicenseStatus.APPROVED && !license.reviewedAt) {
      throw new BadRequestException({
        code: PROVIDER_ERROR_CODES.PROVIDER_LICENSE_NOT_REVIEWED,
        message: 'A license cannot be APPROVED before its rights have been reviewed via PATCH .../rights.',
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.providerLicense.update({ where: { id }, data: { status } });
      const action = status === 'APPROVED' ? 'provider.license.approved' : status === 'REVOKED' ? 'provider.license.revoked' : 'provider.license.status.changed';
      await this.snapshot(id, `status -> ${status}`, actorId, tx);
      await this.audit.log({ actorId, action, entityType: 'PROVIDER_LICENSE', entityId: id, metadata: { status } }, tx);
      return result;
    });

    return updated;
  }

  async addEvidence(licenseId: string, dto: CreateProviderPolicyEvidenceDto, actorId: string) {
    await this.findOrThrow(licenseId);
    const evidence = await this.prisma.providerPolicyEvidence.create({
      data: {
        licenseId,
        title: dto.title,
        sourceUrl: dto.sourceUrl,
        accessedAt: new Date(dto.accessedAt),
        sourceType: dto.sourceType,
        notes: dto.notes,
        createdById: actorId,
      },
    });
    await this.audit.log({ actorId, action: 'provider.license.evidence.added', entityType: 'PROVIDER_LICENSE', entityId: licenseId });
    return evidence;
  }

  async createDataPolicy(licenseId: string, dto: CreateProviderDataPolicyDto, actorId: string) {
    const license = await this.findOrThrow(licenseId);
    const policy = await this.prisma.providerDataPolicy.upsert({
      where: { licenseId_capability: { licenseId, capability: dto.capability } },
      update: {
        cacheAllowed: dto.cacheAllowed,
        maxCacheSeconds: dto.maxCacheSeconds,
        storeIdentityAllowed: dto.storeIdentityAllowed,
        storeContentAllowed: dto.storeContentAllowed,
        refreshRequiredAfterSeconds: dto.refreshRequiredAfterSeconds,
        deleteAfterSeconds: dto.deleteAfterSeconds,
        persistentIdentifierAllowed: dto.persistentIdentifierAllowed,
        policySourceUrl: dto.policySourceUrl,
        reviewedAt: new Date(),
        reviewedById: actorId,
      },
      create: {
        providerId: license.providerId,
        licenseId,
        capability: dto.capability,
        cacheAllowed: dto.cacheAllowed,
        maxCacheSeconds: dto.maxCacheSeconds,
        storeIdentityAllowed: dto.storeIdentityAllowed,
        storeContentAllowed: dto.storeContentAllowed,
        refreshRequiredAfterSeconds: dto.refreshRequiredAfterSeconds,
        deleteAfterSeconds: dto.deleteAfterSeconds,
        persistentIdentifierAllowed: dto.persistentIdentifierAllowed,
        policySourceUrl: dto.policySourceUrl,
        reviewedAt: new Date(),
        reviewedById: actorId,
      },
    });
    await this.audit.log({ actorId, action: 'provider.policy.updated', entityType: 'PROVIDER_LICENSE', entityId: licenseId, metadata: { capability: dto.capability } });
    return policy;
  }

  async createAttributionRule(providerId: string, dto: CreateProviderAttributionRuleDto, actorId: string) {
    const provider = await this.prisma.externalProvider.findUnique({ where: { id: providerId } });
    if (!provider) throw new NotFoundException({ code: PROVIDER_ERROR_CODES.PROVIDER_NOT_FOUND, message: 'Provider not found.' });

    if (dto.licenseId) {
      const license = await this.prisma.providerLicense.findUnique({ where: { id: dto.licenseId } });
      if (!license || license.providerId !== providerId) {
        throw new NotFoundException({ code: PROVIDER_ERROR_CODES.PROVIDER_LICENSE_NOT_FOUND, message: 'licenseId must belong to this provider.' });
      }
    }

    const rule = await this.prisma.providerAttributionRule.create({
      data: {
        providerId,
        licenseId: dto.licenseId,
        capability: dto.capability,
        requirement: dto.requirement,
        displayText: dto.displayText,
        logoRequired: dto.logoRequired ?? false,
        linkUrl: dto.linkUrl,
        placementNotes: dto.placementNotes,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      },
    });
    await this.audit.log({ actorId, action: 'provider.attribution.updated', entityType: 'PROVIDER', entityId: providerId });
    return rule;
  }

  async getDetail(id: string) {
    const license = await this.prisma.providerLicense.findUnique({
      where: { id },
      include: { dataPolicies: true, attributionRules: true, evidence: true },
    });
    if (!license) throw new NotFoundException({ code: PROVIDER_ERROR_CODES.PROVIDER_LICENSE_NOT_FOUND, message: 'License not found.' });
    return license;
  }
}
