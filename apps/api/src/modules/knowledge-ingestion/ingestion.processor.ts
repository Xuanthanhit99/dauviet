import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { IngestionRunService } from './ingestion-run.service';
import { INGESTION_QUEUE } from './knowledge-ingestion.constants';

export interface RunIngestionJobPayload {
  jobId: string;
  triggeredById?: string;
}

/**
 * Background worker for the ingestion queue (spec section 39/71 - public
 * request threads never wait on an external source call). A crashed/
 * restarted worker resumes from `IngestionCheckpoint`/re-derives idempotent
 * state from `IngestionRecord`'s unique key rather than restarting a large
 * job from zero (spec section 42) - see `IngestionRunService`'s per-record
 * idempotency check.
 */
@Processor(INGESTION_QUEUE)
export class IngestionProcessor extends WorkerHost {
  private readonly logger = new Logger(IngestionProcessor.name);

  constructor(
    private readonly runner: IngestionRunService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<RunIngestionJobPayload>): Promise<void> {
    const { jobId, triggeredById } = job.data;

    const run = await this.prisma.ingestionRun.findFirst({ where: { jobId }, orderBy: { createdAt: 'desc' } });
    if (run?.status === 'CANCELLED') {
      this.logger.log(`Skipping job ${jobId} - most recent run was cancelled.`);
      return;
    }

    await this.runner.runJob(jobId, triggeredById);
  }
}
