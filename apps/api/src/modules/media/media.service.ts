import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AccessPolicy, MediaAssetStatus, MediaType, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { buildHistoricalDateColumns } from '../../common/historical-date/historical-date.util';
import { AppConfig } from '../../config/configuration';
import { S3Service } from './s3.service';
import { assertWithinPolicy, matchesSignature, ALLOWED_MEDIA_TYPES_BY_PURPOSE } from './file-signature.util';
import { hashStream } from './checksum.util';
import { MEDIA_ERROR_CODES } from './media-error-codes';
import {
  ArchiveMediaDto,
  ConfirmUploadDto,
  QuarantineMediaDto,
  RequestUploadDto,
  UpdateAccessPolicyDto,
  UpdateMediaRightsDto,
} from './dto/media.dto';

const EDITOR_ROLES: Role[] = [Role.EDITOR, Role.HISTORIAN_REVIEWER, Role.ADMIN];

/**
 * Media upload/lifecycle/rights service (spec Phase 05). The core invariant:
 * a MediaAsset is never implicitly usable. It is created PENDING_UPLOAD,
 * only `confirmUpload` (after verifying the object actually exists in
 * storage) can move it to UPLOADED/PROCESSING, and only the background
 * processor moves it to READY - the only status the public API will ever
 * serve. See docs/backend/MEDIA_ARCHITECTURE.md for the full contract.
 */
@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly audit: AuditService,
    private readonly config: ConfigService<AppConfig, true>,
    @InjectQueue('media-processing') private readonly queue: Queue,
  ) {}

  async requestUpload(dto: RequestUploadDto, actorId: string) {
    const policyError = assertWithinPolicy(dto.purpose, dto.mimeType, dto.sizeBytes);
    if (policyError) throw new BadRequestException(policyError);

    if (!ALLOWED_MEDIA_TYPES_BY_PURPOSE[dto.purpose].includes(dto.type)) {
      throw new BadRequestException(`Media type ${dto.type} is not valid for purpose ${dto.purpose}.`);
    }

    if (dto.isAiGenerated && !dto.aiDisclosure) {
      throw new BadRequestException('AI-generated or reconstructed media requires an aiDisclosure note.');
    }

    // A RECONSTRUCTION must disclose that it is one, and its basis, whether
    // or not AI was involved (spec section 25/26/60) - a hand-drawn artist
    // reconstruction still cannot masquerade as an unlabeled archival photo.
    // Reuses `provenanceNote` for the method/basis rather than adding a
    // dedicated `reconstructionMethod` column - see docs/backend/
    // MEDIA_ARCHITECTURE.md for the reuse rationale.
    if (dto.type === 'RECONSTRUCTION' && !dto.provenanceNote && !dto.aiDisclosure) {
      throw new BadRequestException(
        'RECONSTRUCTION media requires a provenanceNote describing its method/basis (and an aiDisclosure if AI-assisted).',
      );
    }

    const capture = dto.captureDate ? buildHistoricalDateColumns(dto.captureDate) : undefined;
    const storageKey = this.s3.buildStorageKey(dto.mimeType, dto.purpose);

    const media = await this.prisma.mediaAsset.create({
      data: {
        type: dto.type,
        status: MediaAssetStatus.PENDING_UPLOAD,
        storageKey,
        mimeType: dto.mimeType,
        sizeBytes: dto.sizeBytes,
        title: dto.title,
        caption: dto.caption,
        altText: dto.altText,
        creatorName: dto.creatorName,
        sourceId: dto.sourceId,
        captureYear: capture?.year,
        captureMonth: capture?.month,
        captureDay: capture?.day,
        capturePrecision: capture?.precision,
        license: dto.license,
        rightsHolder: dto.rightsHolder,
        attributionText: dto.attributionText,
        provenanceNote: dto.provenanceNote,
        isHistorical: dto.isHistorical ?? false,
        isAiGenerated: dto.isAiGenerated ?? false,
        aiDisclosure: dto.aiDisclosure,
        accessPolicy: dto.accessPolicy ?? AccessPolicy.PUBLIC,
        uploadedById: actorId,
      },
    });

    const uploadUrl = await this.s3.createUploadUrl(storageKey, dto.mimeType);
    await this.audit.log({
      actorId,
      action: 'media.upload.requested',
      entityType: 'MEDIA_ASSET',
      entityId: media.id,
      metadata: { storageKey, mimeType: dto.mimeType, purpose: dto.purpose },
    });
    return { id: media.id, uploadUrl, storageKey, expiresInSeconds: 900 };
  }

  /**
   * Verifies the object actually landed in storage before trusting it (spec
   * section 11/15) - existence + real size via `HeadObject`, then a single
   * streamed pass over the object that produces both the magic-byte
   * signature check and the authoritative server-side SHA-256 (spec section
   * 14/16) - one object read, not two. Never marks READY here - that is the
   * background processor's job (spec section 13/54).
   */
  async confirmUpload(mediaAssetId: string, dto: ConfirmUploadDto, actor: { id: string; roles: string[] }) {
    const media = await this.getOwned(mediaAssetId, actor);
    if (media.status !== MediaAssetStatus.PENDING_UPLOAD) {
      throw new BadRequestException(`Media ${mediaAssetId} is not awaiting upload confirmation (status: ${media.status}).`);
    }

    const stats = await this.s3.statObject(media.storageKey);
    if (!stats.exists) {
      await this.failConfirmation(mediaAssetId, actor.id, 'object_not_found');
      throw new BadRequestException({
        code: MEDIA_ERROR_CODES.OBJECT_NOT_FOUND,
        message: 'Upload could not be confirmed - object not found in storage.',
      });
    }

    // Single streamed pass: computes the authoritative SHA-256 over the
    // whole object (constant memory regardless of file size) and captures
    // the leading bytes for signature checking along the way.
    const stream = await this.s3.getObjectStream(media.storageKey);
    const { checksum, leadingBytes } = await hashStream(stream);

    if (!matchesSignature(media.mimeType, leadingBytes)) {
      await this.failConfirmation(mediaAssetId, actor.id, 'signature_mismatch');
      throw new BadRequestException({
        code: MEDIA_ERROR_CODES.SIGNATURE_MISMATCH,
        message: 'Upload could not be confirmed - file content does not match the declared type.',
      });
    }

    // The server-computed digest is authoritative (spec section 15) - a
    // client-supplied checksum is only ever compared against it, never
    // stored in its place.
    if (dto.checksum && dto.checksum.toLowerCase() !== checksum) {
      await this.failConfirmation(mediaAssetId, actor.id, 'checksum_mismatch');
      throw new BadRequestException({
        code: MEDIA_ERROR_CODES.CHECKSUM_MISMATCH,
        message: 'Upload could not be confirmed - client-provided checksum does not match the stored object.',
      });
    }

    const updated = await this.prisma.mediaAsset.update({
      where: { id: mediaAssetId },
      data: {
        status: MediaAssetStatus.UPLOADED,
        uploadConfirmedAt: new Date(),
        sizeBytes: stats.sizeBytes ?? media.sizeBytes,
        checksum,
      },
    });

    await this.queue.add('process-derivatives', { mediaAssetId, storageKey: media.storageKey }, { jobId: `process-${mediaAssetId}` });
    await this.audit.log({ actorId: actor.id, action: 'media.upload.confirmed', entityType: 'MEDIA_ASSET', entityId: mediaAssetId, metadata: { checksum } });
    return updated;
  }

  /** Confirmation failed validation - the asset must never become UPLOADED/usable (spec section 19). */
  private async failConfirmation(mediaAssetId: string, actorId: string, reason: string) {
    await this.prisma.mediaAsset.update({ where: { id: mediaAssetId }, data: { status: MediaAssetStatus.FAILED } });
    await this.audit.log({ actorId, action: 'media.upload.failed', entityType: 'MEDIA_ASSET', entityId: mediaAssetId, metadata: { reason } });
  }

  /**
   * Public read path - never exposes a MediaAsset that isn't READY (spec
   * section 13/38). Includes any generated derivatives (spec section 9/48)
   * - each variant is still individually filtered through `withPublicUrl`,
   * so a variant never resolves a URL the parent's own policy wouldn't
   * allow (spec section 24).
   */
  async findPublicById(id: string) {
    const media = await this.prisma.mediaAsset.findUnique({ where: { id }, include: { derivatives: true } });
    if (!media || media.status !== MediaAssetStatus.READY) {
      throw new NotFoundException('Media asset not found.');
    }
    const variants = media.derivatives
      .filter((d) => d.status === MediaAssetStatus.READY)
      .map((d) => this.withPublicUrl(d));
    return { ...this.withPublicUrl(media), derivatives: undefined, variants };
  }

  /** Owner or EDITOR+ can inspect a MediaAsset regardless of lifecycle state (e.g. to poll upload status). */
  async getOwned(id: string, actor: { id: string; roles: string[] }) {
    const media = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!media) throw new NotFoundException('Media asset not found.');
    const isOwner = media.uploadedById === actor.id;
    const isPrivileged = actor.roles.some((r) => EDITOR_ROLES.includes(r as Role));
    if (!isOwner && !isPrivileged) {
      throw new ForbiddenException('You do not own this media asset.');
    }
    return media;
  }

  /**
   * Ownership check reused by other modules (Contribution, etc.) so a user
   * cannot attach a MediaAsset they did not upload (spec section 29/30).
   */
  async assertOwnedByOrPrivileged(mediaAssetId: string, actor: { id: string; roles: string[] }) {
    await this.getOwned(mediaAssetId, actor);
  }

  async attachToEntity(entityType: string, entityId: string, mediaAssetId: string, role = 'gallery', order = 0) {
    const media = await this.prisma.mediaAsset.findUnique({ where: { id: mediaAssetId } });
    if (!media) throw new NotFoundException('Media asset not found.');
    if (media.status !== MediaAssetStatus.READY) {
      throw new BadRequestException(`Media asset ${mediaAssetId} is not READY (status: ${media.status}) and cannot be attached yet.`);
    }
    return this.prisma.entityMedia.create({
      data: { entityType: entityType as any, entityId, mediaAssetId, role, order },
    });
  }

  /** Never self-service - only EDITOR/HISTORIAN_REVIEWER/ADMIN, never the uploader alone (spec section 46). */
  async updateRights(mediaAssetId: string, dto: UpdateMediaRightsDto, actorId: string) {
    const media = await this.prisma.mediaAsset.findUnique({ where: { id: mediaAssetId } });
    if (!media) throw new NotFoundException('Media asset not found.');

    const updated = await this.prisma.mediaAsset.update({
      where: { id: mediaAssetId },
      data: {
        rightsStatus: dto.rightsStatus,
        license: dto.license,
        rightsHolder: dto.rightsHolder,
        attributionText: dto.attributionText,
        rightsReviewedById: actorId,
        rightsReviewedAt: new Date(),
      },
    });
    await this.audit.log({
      actorId,
      action: 'media.rights.changed',
      entityType: 'MEDIA_ASSET',
      entityId: mediaAssetId,
      metadata: { before: { rightsStatus: media.rightsStatus }, after: { rightsStatus: dto.rightsStatus } },
    });
    return updated;
  }

  /**
   * Reviewer-only promotion of a contributed MediaAsset's type/source link
   * (spec Phase 09 sections 34-36) - e.g. a plain PHOTO promoted to
   * ARCHIVAL_PHOTO/MAP once provenance/rights have been reviewed, and/or
   * linked to the canonical Source a contribution was catalogued into.
   * Never touches Territory/geometry regardless of target type -
   * `MediaType.MAP` has no schema-level relation to Territory at all (see
   * `schema-graph.spec.ts`), so promoting to MAP here can never create
   * reviewed spatial geometry by itself. Callers (ContributionsService) are
   * responsible for the role/self-review gate; this method trusts its caller
   * the same way `updateRights`/`updateAccessPolicy` do.
   */
  async promote(mediaAssetId: string, changes: { type?: MediaType; sourceId?: string }, actorId: string, db: PrismaService | Prisma.TransactionClient = this.prisma) {
    const media = await db.mediaAsset.findUnique({ where: { id: mediaAssetId } });
    if (!media) throw new NotFoundException('Media asset not found.');

    const updated = await db.mediaAsset.update({
      where: { id: mediaAssetId },
      data: { type: changes.type, sourceId: changes.sourceId },
    });
    await this.audit.log(
      {
        actorId,
        action: 'media.promoted',
        entityType: 'MEDIA_ASSET',
        entityId: mediaAssetId,
        metadata: { before: { type: media.type, sourceId: media.sourceId }, after: changes },
      },
      db,
    );
    return updated;
  }

  /**
   * Optional locale-specific editorial caption/alt text (spec section 34) -
   * only curated editorial media is expected to gain rows here; most
   * uploads keep only the flat, uploader-locale caption/altText.
   */
  async setTranslation(mediaAssetId: string, locale: string, caption: string | undefined, altText: string | undefined, actorId: string) {
    const media = await this.prisma.mediaAsset.findUnique({ where: { id: mediaAssetId } });
    if (!media) throw new NotFoundException('Media asset not found.');

    const translation = await this.prisma.mediaAssetTranslation.upsert({
      where: { mediaAssetId_locale: { mediaAssetId, locale } },
      update: { caption, altText },
      create: { mediaAssetId, locale, caption, altText },
    });
    await this.audit.log({ actorId, action: 'media.translation.upserted', entityType: 'MEDIA_ASSET', entityId: mediaAssetId, metadata: { locale } });
    return translation;
  }

  /**
   * Cascades to every derivative (spec section 24/25) - a derivative was
   * created inheriting the parent's accessPolicy at the time, so tightening
   * (or loosening) the parent afterwards must update existing derivatives
   * too, or a stale PUBLIC derivative could keep leaking a full-size image
   * after the parent (or an owning SourceDocument) was tightened.
   */
  async updateAccessPolicy(mediaAssetId: string, dto: UpdateAccessPolicyDto, actorId: string) {
    const media = await this.prisma.mediaAsset.findUnique({ where: { id: mediaAssetId } });
    if (!media) throw new NotFoundException('Media asset not found.');

    const [updated] = await this.prisma.$transaction([
      this.prisma.mediaAsset.update({ where: { id: mediaAssetId }, data: { accessPolicy: dto.accessPolicy } }),
      this.prisma.mediaAsset.updateMany({ where: { parentAssetId: mediaAssetId }, data: { accessPolicy: dto.accessPolicy } }),
    ]);
    await this.audit.log({
      actorId,
      action: 'media.accessPolicy.changed',
      entityType: 'MEDIA_ASSET',
      entityId: mediaAssetId,
      metadata: { before: media.accessPolicy, after: dto.accessPolicy },
    });
    return updated;
  }

  /** QUARANTINED media is never publicly served regardless of accessPolicy (spec section 41) - cascades to derivatives so a thumbnail of quarantined content isn't still servable. */
  async quarantine(mediaAssetId: string, dto: QuarantineMediaDto, actorId: string) {
    const media = await this.prisma.mediaAsset.findUnique({ where: { id: mediaAssetId } });
    if (!media) throw new NotFoundException('Media asset not found.');

    const quarantineData = {
      status: MediaAssetStatus.QUARANTINED,
      quarantinedAt: new Date(),
      quarantinedById: actorId,
      quarantineReason: dto.reason,
    };
    const [updated] = await this.prisma.$transaction([
      this.prisma.mediaAsset.update({ where: { id: mediaAssetId }, data: quarantineData }),
      this.prisma.mediaAsset.updateMany({ where: { parentAssetId: mediaAssetId }, data: quarantineData }),
    ]);
    await this.audit.log({ actorId, action: 'media.quarantined', entityType: 'MEDIA_ASSET', entityId: mediaAssetId, metadata: { reason: dto.reason } });
    return updated;
  }

  /** Archive/deactivate, never hard-delete a referenced asset (spec section 39) - cascades to derivatives. */
  async archive(mediaAssetId: string, dto: ArchiveMediaDto, actorId: string) {
    const media = await this.prisma.mediaAsset.findUnique({ where: { id: mediaAssetId } });
    if (!media) throw new NotFoundException('Media asset not found.');

    const archiveData = { status: MediaAssetStatus.ARCHIVED, archivedAt: new Date(), archivedById: actorId };
    const [updated] = await this.prisma.$transaction([
      this.prisma.mediaAsset.update({ where: { id: mediaAssetId }, data: archiveData }),
      this.prisma.mediaAsset.updateMany({ where: { parentAssetId: mediaAssetId }, data: archiveData }),
    ]);
    await this.audit.log({ actorId, action: 'media.archived', entityType: 'MEDIA_ASSET', entityId: mediaAssetId, metadata: { reason: dto.reason } });
    return updated;
  }

  /**
   * Orphan cleanup (spec section 40) - a PENDING_UPLOAD row whose signed PUT
   * URL has long since expired and was never confirmed is marked FAILED so
   * it stops cluttering admin listings. Never touches anything past
   * PENDING_UPLOAD - a confirmed/processed asset is never "cleaned up" by
   * age alone.
   */
  async cleanupExpiredPendingUploads(actorId: string, olderThanMinutes?: number) {
    const minutes = olderThanMinutes ?? this.config.get('s3', { infer: true }).pendingUploadExpiryMinutes;
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    const stale = await this.prisma.mediaAsset.findMany({
      where: { status: MediaAssetStatus.PENDING_UPLOAD, createdAt: { lt: cutoff } },
      select: { id: true },
    });
    if (stale.length === 0) return { cleaned: 0 };

    await this.prisma.mediaAsset.updateMany({
      where: { id: { in: stale.map((s) => s.id) } },
      data: { status: MediaAssetStatus.FAILED },
    });
    await this.audit.log({ actorId, action: 'media.cleanup.expiredPendingUploads', metadata: { count: stale.length, mediaAssetIds: stale.map((s) => s.id) } });
    return { cleaned: stale.length };
  }

  /**
   * Only PUBLIC assets resolve to a usable URL through this unauthenticated
   * path (spec section 8/27) - PREVIEW_ONLY/METADATA_ONLY/RESTRICTED must
   * never hand back a full-download link. Full access to a non-public asset
   * is a privileged, role-gated read elsewhere (see
   * `SourcesService.getDocumentForViewer` for the SourceDocument case).
   */
  /**
   * Resolves the public `url` AND strips internal/private fields before a
   * MediaAsset reaches a public response (spec Phase 11 section 6/33) -
   * found during the Phase 11 private-field-leak audit: this previously
   * spread the *entire* raw Prisma row (including the raw S3 `storageKey`
   * object path, `uploadedById`, `rightsReviewedById`, and quarantine/
   * archive workflow fields) into `GET /media/:id`'s public response. Only
   * used by `findPublicById`; every other privileged caller in this file
   * still reads the full row directly, unaffected.
   */
  private withPublicUrl<T extends { storageKey: string; accessPolicy: AccessPolicy }>(media: T) {
    const publicFields = omitKeys(media, ['storageKey', 'checksum', 'uploadedById', 'rightsReviewedById', 'quarantinedById', 'quarantineReason', 'archivedById']);
    const url = media.accessPolicy === AccessPolicy.PUBLIC ? this.s3.publicUrl(media.storageKey) : null;
    return { ...publicFields, url };
  }
}

/** Shallow-omits the given keys without ever binding an unused local (avoids the `_prefixed`-destructure lint noise this codebase's eslint config doesn't suppress). */
function omitKeys<T extends object, K extends string>(obj: T, keys: readonly K[]): Omit<T, K> {
  const result = { ...obj } as Record<string, unknown>;
  for (const key of keys) delete result[key];
  return result as Omit<T, K>;
}
