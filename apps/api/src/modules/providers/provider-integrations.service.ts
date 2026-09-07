import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProviderCapabilityType, ProviderIntegrationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PROVIDER_ERROR_CODES } from '../../common/errors/provider-error-codes';
import { ProviderRegistryService } from './provider-registry.service';
import { CreateProviderIntegrationDto, UpdateProviderIntegrationDto } from './dto/provider-integration.dto';

const NOT_FOUND_CODES: string[] = [PROVIDER_ERROR_CODES.PROVIDER_NOT_FOUND, PROVIDER_ERROR_CODES.PROVIDER_LICENSE_NOT_FOUND];

@Injectable()
export class ProviderIntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly registry: ProviderRegistryService,
  ) {}

  private async findOrThrow(id: string) {
    const integration = await this.prisma.providerIntegration.findUnique({ where: { id }, include: { provider: true } });
    if (!integration) {
      throw new NotFoundException({ code: PROVIDER_ERROR_CODES.PROVIDER_INTEGRATION_NOT_FOUND, message: 'Integration not found.' });
    }
    return integration;
  }

  async create(providerId: string, dto: CreateProviderIntegrationDto, actorId: string) {
    const provider = await this.prisma.externalProvider.findUnique({ where: { id: providerId } });
    if (!provider) throw new NotFoundException({ code: PROVIDER_ERROR_CODES.PROVIDER_NOT_FOUND, message: 'Provider not found.' });

    try {
      const integration = await this.prisma.providerIntegration.create({
        data: {
          providerId,
          environment: dto.environment,
          credentialReference: dto.credentialReference,
          notes: dto.notes,
          status: dto.credentialReference ? 'CONFIGURED' : 'NOT_CONFIGURED',
          configuredAt: dto.credentialReference ? new Date() : null,
        },
      });
      await this.audit.log({
        actorId,
        action: 'provider.integration.configured',
        entityType: 'PROVIDER_INTEGRATION',
        entityId: integration.id,
        metadata: { providerId, environment: dto.environment },
      });
      return integration;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          code: PROVIDER_ERROR_CODES.PROVIDER_INTEGRATION_ALREADY_EXISTS,
          message: 'An integration for this provider/environment already exists.',
        });
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateProviderIntegrationDto, actorId: string) {
    await this.findOrThrow(id);
    const updated = await this.prisma.providerIntegration.update({
      where: { id },
      data: {
        credentialReference: dto.credentialReference,
        notes: dto.notes,
        configuredAt: dto.credentialReference ? new Date() : undefined,
      },
    });
    await this.audit.log({ actorId, action: 'provider.integration.updated', entityType: 'PROVIDER_INTEGRATION', entityId: id });
    return updated;
  }

  async setStatus(id: string, status: ProviderIntegrationStatus, actorId: string) {
    await this.findOrThrow(id);
    const updated = await this.prisma.providerIntegration.update({ where: { id }, data: { status } });
    const action = status === 'ACTIVE' ? 'provider.integration.activated' : status === 'SUSPENDED' ? 'provider.integration.suspended' : 'provider.integration.status.changed';
    await this.audit.log({ actorId, action, entityType: 'PROVIDER_INTEGRATION', entityId: id, metadata: { status } });
    return updated;
  }

  /**
   * ENABLED_FOR_OUR_ACCOUNT (spec section 7/19 item 4) - a plain
   * administrative declaration, deliberately UNGATED by license state.
   * This is conceptually independent of internal rights review: "our
   * Booking.com account has API access to BOOKING_REDIRECT" is a fact
   * about external account/API approval, not about whether OUR OWN
   * licensing review permits us to display/cache/store the resulting
   * data - that second, separate question is answered only by
   * `activateCapability` below (which requires this to already be true).
   *
   * Found via live QA (spec section 19's own listed order: item 4
   * "enabled for account" precedes item 6 "license approved" as
   * independent checklist entries) - the first implementation of this
   * method incorrectly required a pre-approved license before recording
   * account-level enablement, making it impossible to ever observe
   * "enabled but not yet licensed" as the mandated live-QA flow requires,
   * and meant every activation attempt failed with the misleading
   * PROVIDER_CAPABILITY_NOT_ENABLED regardless of the actual blocking
   * reason. Fixed by splitting enable (this method, ungated) from
   * activate (below, fully gated) - no schema change was needed, since
   * `ProviderIntegrationCapability.approvedAt` already meant "this account
   * is approved for this capability," never "our license is approved."
   */
  async enableCapability(integrationId: string, capability: ProviderCapabilityType, actorId: string) {
    await this.findOrThrow(integrationId);
    const row = await this.prisma.$transaction(async (tx) => {
      const enabled = await tx.providerIntegrationCapability.upsert({
        where: { integrationId_capability: { integrationId, capability } },
        update: { approvedAt: new Date() },
        create: { integrationId, capability, approvedAt: new Date() },
      });
      await this.audit.log(
        { actorId, action: 'provider.integration.capability.enabled', entityType: 'PROVIDER_INTEGRATION', entityId: integrationId, metadata: { capability } },
        tx,
      );
      return enabled;
    });
    return row;
  }

  /**
   * The fully gated activation path (spec sections 19/41) - re-uses the
   * exact same evaluator the runtime registry uses
   * (`ProviderRegistryService`), so "can this be activated" and "can this
   * actually be served" can never silently disagree. Requires the
   * capability to already be enabled (`enableCapability` above) - if not,
   * fails with `PROVIDER_CAPABILITY_NOT_ENABLED` telling the caller to
   * enable it first, rather than silently enabling it as a side effect.
   * Atomic: the `lastVerifiedAt` timestamp and the audit entry are written
   * in one transaction, or neither is (Phase 12.1 lesson - audit must
   * participate in the same transaction as the data it describes).
   */
  async activateCapability(integrationId: string, capability: ProviderCapabilityType, actorId: string) {
    const integration = await this.findOrThrow(integrationId);

    const enabled = await this.prisma.providerIntegrationCapability.findUnique({
      where: { integrationId_capability: { integrationId, capability } },
    });
    if (!enabled || !enabled.approvedAt) {
      throw new BadRequestException({
        code: PROVIDER_ERROR_CODES.PROVIDER_CAPABILITY_NOT_ENABLED,
        message: 'Enable this capability for the integration first (POST .../capabilities/:capability/enable).',
      });
    }

    const result = await this.registry.getExecutionContext({
      providerCode: integration.provider.code,
      environment: integration.environment,
      capability,
    });

    if (!result.ok) {
      if (NOT_FOUND_CODES.includes(result.code)) {
        throw new NotFoundException({ code: result.code, message: result.message });
      }
      throw new BadRequestException({ code: result.code, message: result.message });
    }

    const activated = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.providerIntegration.update({ where: { id: integrationId }, data: { lastVerifiedAt: new Date() } });
      await this.audit.log(
        { actorId, action: 'provider.integration.capability.activated', entityType: 'PROVIDER_INTEGRATION', entityId: integrationId, metadata: { capability } },
        tx,
      );
      return updated;
    });

    return { integration: activated, context: result.context };
  }

  /** Revoking an enablement is an admin toggle, not deletion of published content - unlike geography/editorial entities, a plain delete is appropriate here (spec section 62 - document this deviation). */
  async revokeCapability(integrationId: string, capability: ProviderCapabilityType, actorId: string) {
    const row = await this.prisma.providerIntegrationCapability.findUnique({
      where: { integrationId_capability: { integrationId, capability } },
    });
    if (!row) {
      throw new NotFoundException({ code: PROVIDER_ERROR_CODES.PROVIDER_CAPABILITY_NOT_ENABLED, message: 'Capability is not currently enabled for this integration.' });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.providerIntegrationCapability.delete({ where: { integrationId_capability: { integrationId, capability } } });
      await this.audit.log(
        { actorId, action: 'provider.integration.capability.revoked', entityType: 'PROVIDER_INTEGRATION', entityId: integrationId, metadata: { capability } },
        tx,
      );
    });
    return { integrationId, capability };
  }

  /** The read-only, always-fresh execution-context lookup future G05 code will call - exposed here for admin/diagnostic verification too. */
  async checkAccess(providerCode: string, environment: Parameters<ProviderRegistryService['getExecutionContext']>[0]['environment'], capability: ProviderCapabilityType) {
    return this.registry.getExecutionContext({ providerCode, environment, capability });
  }
}
