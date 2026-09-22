import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityKind } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { INGESTION_ERROR_CODES } from '../../common/errors/ingestion-error-codes';
import { CreateIngestionSourceDto, CreateIngestionSourcePolicyEvidenceDto, UpsertIngestionSourcePolicyDto } from './dto/ingestion.dto';

/**
 * ADMIN-only source/policy configuration (spec section 45 - same tier as
 * G02's Providers module, no EDITOR carve-out, since this gates commercial/
 * legal/rate-limit/credential-adjacent configuration).
 */
@Injectable()
export class IngestionSourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.ingestionSource.findMany({ include: { policy: true }, orderBy: { code: 'asc' } });
  }

  async getDetail(id: string) {
    const source = await this.prisma.ingestionSource.findUnique({
      where: { id },
      include: { policy: { include: { evidence: true } } },
    });
    if (!source) throw new NotFoundException(INGESTION_ERROR_CODES.INGESTION_SOURCE_NOT_FOUND);
    return source;
  }

  async create(dto: CreateIngestionSourceDto, actorId: string) {
    const existing = await this.prisma.ingestionSource.findUnique({ where: { code: dto.code } });
    if (existing) throw new ConflictException(INGESTION_ERROR_CODES.INGESTION_SOURCE_CODE_CONFLICT);

    const source = await this.prisma.$transaction(async (tx) => {
      const created = await tx.ingestionSource.create({
        data: { code: dto.code, name: dto.name, sourceClass: dto.sourceClass, enabled: dto.enabled ?? false },
      });
      await this.audit.log(
        { actorId, action: 'ingestionSource.created', entityType: EntityKind.INGESTION_SOURCE, entityId: created.id, metadata: { code: created.code } },
        tx,
      );
      return created;
    });
    return source;
  }

  async setEnabled(id: string, enabled: boolean, actorId: string) {
    const source = await this.prisma.ingestionSource.findUnique({ where: { id } });
    if (!source) throw new NotFoundException(INGESTION_ERROR_CODES.INGESTION_SOURCE_NOT_FOUND);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.ingestionSource.update({ where: { id }, data: { enabled } });
      await this.audit.log(
        { actorId, action: 'ingestionSource.setEnabled', entityType: EntityKind.INGESTION_SOURCE, entityId: id, metadata: { enabled } },
        tx,
      );
      return updated;
    });
  }

  async upsertPolicy(sourceId: string, dto: UpsertIngestionSourcePolicyDto, actorId: string) {
    const source = await this.prisma.ingestionSource.findUnique({ where: { id: sourceId } });
    if (!source) throw new NotFoundException(INGESTION_ERROR_CODES.INGESTION_SOURCE_NOT_FOUND);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.ingestionSourcePolicy.findUnique({ where: { sourceId } });
      const policy = await tx.ingestionSourcePolicy.upsert({
        where: { sourceId },
        create: { sourceId, ...dto, lastPolicyReviewAt: new Date(), policyVersion: 1 },
        update: { ...dto, lastPolicyReviewAt: new Date(), policyVersion: (existing?.policyVersion ?? 0) + 1 },
      });
      await this.audit.log(
        {
          actorId,
          action: existing ? 'ingestionSourcePolicy.updated' : 'ingestionSourcePolicy.created',
          entityType: EntityKind.INGESTION_SOURCE,
          entityId: sourceId,
          metadata: { policyVersion: policy.policyVersion },
        },
        tx,
      );
      return policy;
    });
  }

  async addPolicyEvidence(sourceId: string, dto: CreateIngestionSourcePolicyEvidenceDto, actorId: string) {
    const policy = await this.prisma.ingestionSourcePolicy.findUnique({ where: { sourceId } });
    if (!policy) throw new NotFoundException(INGESTION_ERROR_CODES.INGESTION_POLICY_NOT_FOUND);

    return this.prisma.$transaction(async (tx) => {
      const evidence = await tx.ingestionSourcePolicyEvidence.create({
        data: { sourcePolicyId: policy.id, title: dto.title, sourceUrl: dto.sourceUrl, accessedAt: dto.accessedAt, sourceType: dto.sourceType as any, notes: dto.notes, createdById: actorId },
      });
      await this.audit.log(
        { actorId, action: 'ingestionSourcePolicyEvidence.created', entityType: EntityKind.INGESTION_SOURCE, entityId: sourceId, metadata: { title: dto.title } },
        tx,
      );
      return evidence;
    });
  }
}
