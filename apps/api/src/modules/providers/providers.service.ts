import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProviderStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PROVIDER_ERROR_CODES } from '../../common/errors/provider-error-codes';
import { CreateProviderDto, DeclareProviderCapabilityDto, UpdateProviderDto } from './dto/provider.dto';

/**
 * Provider identity + declared (SUPPORTED_BY_PROVIDER) capabilities (spec
 * sections 5-7). Never activates anything and never touches licensing -
 * see `ProviderIntegrationsService`/`ProviderLicensesService`/
 * `ProviderRegistryService` for the gated path.
 */
@Injectable()
export class ProvidersService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async create(dto: CreateProviderDto, actorId: string) {
    try {
      const provider = await this.prisma.externalProvider.create({
        data: {
          code: dto.code,
          name: dto.name,
          websiteUrl: dto.websiteUrl,
          developerUrl: dto.developerUrl,
          partnerPortalUrl: dto.partnerPortalUrl,
          credentialMode: dto.credentialMode ?? 'NONE',
          supportedEnvironments: dto.supportedEnvironments ?? [],
          status: ProviderStatus.DRAFT,
        },
      });
      await this.audit.log({ actorId, action: 'provider.created', entityType: 'PROVIDER', entityId: provider.id });
      return provider;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({ code: PROVIDER_ERROR_CODES.PROVIDER_CODE_CONFLICT, message: 'A provider with this code already exists.' });
      }
      throw err;
    }
  }

  private async findOrThrow(id: string) {
    const provider = await this.prisma.externalProvider.findUnique({ where: { id } });
    if (!provider) throw new NotFoundException({ code: PROVIDER_ERROR_CODES.PROVIDER_NOT_FOUND, message: 'Provider not found.' });
    return provider;
  }

  async update(id: string, dto: UpdateProviderDto, actorId: string) {
    await this.findOrThrow(id);
    const updated = await this.prisma.externalProvider.update({
      where: { id },
      data: {
        name: dto.name,
        websiteUrl: dto.websiteUrl,
        developerUrl: dto.developerUrl,
        partnerPortalUrl: dto.partnerPortalUrl,
        credentialMode: dto.credentialMode,
        supportedEnvironments: dto.supportedEnvironments,
      },
    });
    await this.audit.log({ actorId, action: 'provider.updated', entityType: 'PROVIDER', entityId: id });
    return updated;
  }

  async setStatus(id: string, status: ProviderStatus, actorId: string) {
    await this.findOrThrow(id);
    const updated = await this.prisma.externalProvider.update({ where: { id }, data: { status } });
    await this.audit.log({ actorId, action: 'provider.status.changed', entityType: 'PROVIDER', entityId: id, metadata: { status } });
    return updated;
  }

  async declareCapability(id: string, dto: DeclareProviderCapabilityDto, actorId: string) {
    await this.findOrThrow(id);
    try {
      const capability = await this.prisma.providerCapability.create({
        data: { providerId: id, capability: dto.capability, notes: dto.notes },
      });
      await this.audit.log({
        actorId,
        action: 'provider.capability.declared',
        entityType: 'PROVIDER',
        entityId: id,
        metadata: { capability: dto.capability },
      });
      return capability;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          code: PROVIDER_ERROR_CODES.PROVIDER_CAPABILITY_ALREADY_DECLARED,
          message: 'This capability is already declared for this provider.',
        });
      }
      throw err;
    }
  }

  /** Admin read-model (spec section 52) - never includes secrets (there are none stored on this model). */
  async getDetail(id: string) {
    const provider = await this.prisma.externalProvider.findUnique({
      where: { id },
      include: {
        capabilities: true,
        integrations: { include: { enabledCapabilities: true } },
        licenses: { include: { dataPolicies: true, attributionRules: true, evidence: true } },
      },
    });
    if (!provider) throw new NotFoundException({ code: PROVIDER_ERROR_CODES.PROVIDER_NOT_FOUND, message: 'Provider not found.' });
    return provider;
  }

  async list(params: { page: number; pageSize: number; status?: ProviderStatus }) {
    const { page, pageSize, status } = params;
    const where: Prisma.ExternalProviderWhereInput = { status };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.externalProvider.count({ where }),
      this.prisma.externalProvider.findMany({
        where,
        orderBy: { id: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { capabilities: true },
      }),
    ]);
    return { items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
  }
}
