import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { AccessPolicy, MediaAsset, MediaAssetStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { S3Service } from './s3.service';
import { generateImageVariants, PROCESSABLE_IMAGE_MIME_TYPES } from './image-processing.util';

export interface MediaProcessingJob {
  mediaAssetId: string;
  storageKey: string;
}

/**
 * Background job foundation (spec Phase 05/05.1). Drives the real
 * UPLOADED -> PROCESSING -> READY lifecycle transition, idempotently
 * (status-predicated `updateMany` - a duplicate/redelivered job is a safe
 * no-op) and now actually generates image derivatives for supported raster
 * types (spec section 2/11): THUMBNAIL/MEDIUM/LARGE WebP (all mandatory -
 * READY is only reached once every mandatory variant succeeds) plus a
 * best-effort AVIF OPTIMIZED_WEB variant (never blocks READY).
 *
 * Non-image assets (PDF/audio/video/anything outside
 * `PROCESSABLE_IMAGE_MIME_TYPES`) skip derivative generation entirely and go
 * straight to READY - this pipeline is deliberately image-only (spec
 * section 21/22); see docs/backend/MEDIA_ARCHITECTURE.md for the documented
 * extensibility point for audio/video/OCR.
 */
@Processor('media-processing')
export class MediaProcessor extends WorkerHost {
  private readonly logger = new Logger(MediaProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly audit: AuditService,
  ) {
    super();
  }

  async process(job: Job<MediaProcessingJob>): Promise<void> {
    const { mediaAssetId } = job.data;

    // Allows both a fresh UPLOADED asset and a bounded BullMQ retry of a
    // previously FAILED attempt to proceed; anything already PROCESSING/
    // READY/etc. is left alone (idempotent - spec section 53).
    const toProcessing = await this.prisma.mediaAsset.updateMany({
      where: { id: mediaAssetId, status: { in: [MediaAssetStatus.UPLOADED, MediaAssetStatus.FAILED] } },
      data: { status: MediaAssetStatus.PROCESSING },
    });
    if (toProcessing.count === 0) {
      this.logger.log(`Media ${mediaAssetId} not in a processable state - skipping (already processed or not confirmed).`);
      return;
    }

    const media = await this.prisma.mediaAsset.findUnique({ where: { id: mediaAssetId } });
    if (!media) {
      this.logger.warn(`Media ${mediaAssetId} disappeared mid-processing.`);
      return;
    }

    if (!PROCESSABLE_IMAGE_MIME_TYPES.includes(media.mimeType)) {
      this.logger.log(`Media ${mediaAssetId} (${media.mimeType}) has no image-derivative pipeline - marking READY as-is.`);
      await this.markReady(mediaAssetId);
      return;
    }

    let original: Buffer;
    try {
      // Transient/storage errors here are rethrown below and left to
      // BullMQ's configured retry/backoff (spec section 12) - a network
      // blip is not the asset's fault.
      original = await this.downloadObject(media.storageKey);
    } catch (err) {
      this.logger.error(`Storage read failed for ${mediaAssetId}, will retry per BullMQ policy: ${(err as Error).message}`);
      throw err;
    }

    try {
      const variants = await generateImageVariants(original);
      await this.persistVariants(media, variants);
    } catch (err) {
      // Everything past a successful download is pure sharp decode/resize/
      // encode work on an in-memory buffer - a failure here means the bytes
      // are corrupt or not really the declared type, not a transient
      // storage problem. Retrying will never succeed, so this is marked
      // FAILED directly rather than rethrown for BullMQ to retry (spec
      // section 12: "malformed file should ultimately become failed").
      const reason = err instanceof Error ? err.message.slice(0, 200) : 'invalid_or_corrupt_image';
      this.logger.warn(`Derivative generation failed for ${mediaAssetId}: ${reason}`);
      await this.prisma.mediaAsset.updateMany({
        where: { id: mediaAssetId, status: MediaAssetStatus.PROCESSING },
        data: { status: MediaAssetStatus.FAILED },
      });
      // Operational breadcrumb (spec section 13) - a short, non-secret
      // reason only, never a raw stack trace.
      await this.audit.log({ action: 'media.processing.failed', entityType: 'MEDIA_ASSET', entityId: mediaAssetId, metadata: { reason } });
      return;
    }

    await this.markReady(mediaAssetId);
    await this.audit.log({ action: 'media.processing.completed', entityType: 'MEDIA_ASSET', entityId: mediaAssetId });
  }

  /**
   * A persistently-failing transient error (storage down for the entire
   * retry window) must not leave an asset stuck in PROCESSING forever - once
   * BullMQ has exhausted every configured attempt for a job, this fires and
   * the asset is finally marked FAILED (spec section 12 - "malformed file
   * should ultimately become failed", extended here to "a job that can never
   * succeed must ultimately become failed" too).
   */
  @OnWorkerEvent('failed')
  async onFailed(job: Job<MediaProcessingJob> | undefined) {
    if (!job) return;
    const attemptsMade = job.attemptsMade ?? 0;
    const maxAttempts = job.opts?.attempts ?? 1;
    if (attemptsMade < maxAttempts) return;

    const { mediaAssetId } = job.data;
    const result = await this.prisma.mediaAsset.updateMany({
      where: { id: mediaAssetId, status: MediaAssetStatus.PROCESSING },
      data: { status: MediaAssetStatus.FAILED },
    });
    if (result.count > 0) {
      await this.audit.log({
        action: 'media.processing.failed',
        entityType: 'MEDIA_ASSET',
        entityId: mediaAssetId,
        metadata: { reason: 'storage_retries_exhausted' },
      });
    }
  }

  private async downloadObject(storageKey: string): Promise<Buffer> {
    const stream = await this.s3.getObjectStream(storageKey);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks);
  }

  private async markReady(mediaAssetId: string) {
    await this.prisma.mediaAsset.updateMany({
      where: { id: mediaAssetId, status: MediaAssetStatus.PROCESSING },
      data: { status: MediaAssetStatus.READY },
    });
  }

  /**
   * Each variant is upserted on the (parentAssetId, variantType) unique
   * constraint (spec section 10) - re-running this job for the same asset
   * overwrites the existing derivative row rather than creating a
   * duplicate. Every derivative inherits the parent's access/rights/
   * disclosure fields at creation time (spec section 23/24) - never a bare
   * `PUBLIC`/undisclosed row regardless of the parent's real policy.
   */
  private async persistVariants(parent: MediaAsset, variants: Awaited<ReturnType<typeof generateImageVariants>>) {
    for (const variant of variants) {
      const storageKey = this.s3.buildStorageKey(variant.mimeType, `derivatives/${variant.variantType.toLowerCase()}`);
      await this.s3.putObject(storageKey, variant.buffer, variant.mimeType);

      const shared = {
        type: parent.type,
        status: MediaAssetStatus.READY,
        storageKey,
        mimeType: variant.mimeType,
        sizeBytes: variant.buffer.length,
        width: variant.width,
        height: variant.height,
        checksum: variant.checksum,
        parentAssetId: parent.id,
        variantType: variant.variantType,
        accessPolicy: parent.accessPolicy as AccessPolicy,
        uploadedById: parent.uploadedById,
        // Disclosure/provenance/rights travel with the derivative - a
        // reconstruction's thumbnail is still a reconstruction (spec
        // section 23), and rights metadata stays consistent for review.
        isAiGenerated: parent.isAiGenerated,
        aiDisclosure: parent.aiDisclosure,
        isHistorical: parent.isHistorical,
        rightsStatus: parent.rightsStatus,
        license: parent.license,
        rightsHolder: parent.rightsHolder,
        attributionText: parent.attributionText,
        title: parent.title,
        altText: parent.altText,
      };

      await this.prisma.mediaAsset.upsert({
        where: { parentAssetId_variantType: { parentAssetId: parent.id, variantType: variant.variantType } },
        create: shared,
        update: shared,
      });
    }
  }
}
