import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

export interface MediaProcessingJob {
  mediaAssetId: string;
  storageKey: string;
}

/**
 * Background job foundation (spec section 43). Idempotent by design: re-running
 * the same mediaAssetId is safe since derivative generation just overwrites the
 * same derived keys. Actual thumbnail/optimized-image generation is not wired
 * up yet - this is the extension point (see docs/backend/BACKEND_HANDOFF.md
 * "Known limitations").
 */
@Processor('media-processing')
export class MediaProcessor extends WorkerHost {
  private readonly logger = new Logger(MediaProcessor.name);

  async process(job: Job<MediaProcessingJob>): Promise<void> {
    this.logger.log(`Processing media derivatives for ${job.data.mediaAssetId} (not yet implemented)`);
  }
}
