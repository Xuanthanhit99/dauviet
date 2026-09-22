import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EntityKind } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { INGESTION_ERROR_CODES } from '../../common/errors/ingestion-error-codes';
import { CreateIngestionJobDto } from './dto/ingestion.dto';
import { INGESTION_QUEUE } from './knowledge-ingestion.constants';

@Injectable()
export class IngestionJobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @InjectQueue(INGESTION_QUEUE) private readonly queue: Queue,
  ) {}

  list() {
    return this.prisma.ingestionJob.findMany({ include: { source: true, runs: { orderBy: { createdAt: 'desc' }, take: 5 } }, orderBy: { createdAt: 'desc' } });
  }

  async getDetail(id: string) {
    const job = await this.prisma.ingestionJob.findUnique({
      where: { id },
      include: { source: true, runs: { orderBy: { createdAt: 'desc' } }, checkpoint: true },
    });
    if (!job) throw new NotFoundException(INGESTION_ERROR_CODES.INGESTION_JOB_NOT_FOUND);
    return job;
  }

  async create(dto: CreateIngestionJobDto, actorId: string) {
    const source = await this.prisma.ingestionSource.findUnique({ where: { code: dto.sourceCode } });
    if (!source) throw new NotFoundException(INGESTION_ERROR_CODES.INGESTION_SOURCE_NOT_FOUND);

    return this.prisma.$transaction(async (tx) => {
      const job = await tx.ingestionJob.create({
        data: { sourceId: source.id, scopeType: dto.scopeType, scopeParams: dto.scopeParams as any, label: dto.label, createdById: actorId },
      });
      await this.audit.log({ actorId, action: 'ingestionJob.created', entityType: EntityKind.INGESTION_JOB, entityId: job.id, metadata: { sourceCode: source.code, scopeType: dto.scopeType } }, tx);
      return job;
    });
  }

  /** Enqueues the job for background execution via BullMQ (spec section 39/71 - never blocks the request thread). */
  async enqueue(jobId: string, actorId: string) {
    const job = await this.prisma.ingestionJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException(INGESTION_ERROR_CODES.INGESTION_JOB_NOT_FOUND);
    const bullJob = await this.queue.add('run-ingestion-job', { jobId, triggeredById: actorId }, { attempts: 1 });
    await this.audit.log({ actorId, action: 'ingestionJob.enqueued', entityType: EntityKind.INGESTION_JOB, entityId: jobId, metadata: { bullJobId: bullJob.id } });
    return { queued: true, bullJobId: bullJob.id };
  }

  async cancelRun(runId: string, actorId: string) {
    const run = await this.prisma.ingestionRun.findUnique({ where: { id: runId } });
    if (!run) throw new NotFoundException(INGESTION_ERROR_CODES.INGESTION_RUN_NOT_FOUND);
    if (['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(run.status)) {
      throw new ConflictException(INGESTION_ERROR_CODES.INGESTION_RUN_ALREADY_TERMINAL);
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.ingestionRun.update({ where: { id: runId }, data: { status: 'CANCELLED', finishedAt: new Date(), cancelledById: actorId, cancelledAt: new Date() } });
      await this.audit.log({ actorId, action: 'ingestionRun.cancelled', entityType: EntityKind.INGESTION_RUN, entityId: runId }, tx);
      return updated;
    });
  }
}
