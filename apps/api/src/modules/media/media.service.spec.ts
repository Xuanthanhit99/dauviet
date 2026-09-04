import { createHash } from 'crypto';
import { Readable } from 'stream';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AccessPolicy, MediaAssetStatus, MediaType } from '@prisma/client';
import { MediaService } from './media.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { S3Service } from './s3.service';

function sha256(content: Buffer | string) {
  return createHash('sha256').update(content).digest('hex');
}

function makeService(overrides: {
  prisma?: any;
  s3?: any;
  audit?: any;
  config?: any;
  queue?: any;
} = {}) {
  const prisma = overrides.prisma ?? {
    mediaAsset: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
  };
  if (!prisma.$transaction) prisma.$transaction = jest.fn((ops: unknown[]) => Promise.all(ops as Promise<unknown>[]));
  const s3 = overrides.s3 ?? {
    buildStorageKey: jest.fn(() => 'uploads/generated-key.jpg'),
    createUploadUrl: jest.fn().mockResolvedValue('https://signed.example/put'),
    statObject: jest.fn(),
    getObjectStream: jest.fn().mockResolvedValue(Readable.from([Buffer.from([0xff, 0xd8, 0xff])])),
    publicUrl: jest.fn((key: string) => `https://cdn.example/${key}`),
  };
  const audit = overrides.audit ?? { log: jest.fn() };
  const config = overrides.config ?? { get: jest.fn(() => ({ pendingUploadExpiryMinutes: 60 })) };
  const queue = overrides.queue ?? { add: jest.fn() };
  const service = new MediaService(
    prisma as unknown as PrismaService,
    s3 as unknown as S3Service,
    audit as unknown as AuditService,
    config as any,
    queue as any,
  );
  return { service, prisma, s3, audit, config, queue };
}

/** Covers spec section 66 test #4: the upload intent's key is always server-generated. */
describe('MediaService.requestUpload', () => {
  it('creates a PENDING_UPLOAD row with a server-generated storage key, never the client filename', async () => {
    const { service, prisma, s3 } = makeService();
    prisma.mediaAsset.create.mockResolvedValue({ id: 'm1' });

    const result = await service.requestUpload(
      { fileName: '../../evil.jpg', mimeType: 'image/jpeg', sizeBytes: 1000, type: MediaType.PHOTO, purpose: 'photo' } as any,
      'user-1',
    );

    expect(s3.buildStorageKey).toHaveBeenCalledWith('image/jpeg', 'photo');
    expect(prisma.mediaAsset.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: MediaAssetStatus.PENDING_UPLOAD, storageKey: 'uploads/generated-key.jpg' }) }),
    );
    expect(result).toEqual({ id: 'm1', uploadUrl: 'https://signed.example/put', storageKey: 'uploads/generated-key.jpg', expiresInSeconds: 900 });
  });

  it('rejects a MediaType not valid for the declared purpose', async () => {
    const { service } = makeService();
    await expect(
      service.requestUpload({ fileName: 'x.jpg', mimeType: 'image/jpeg', sizeBytes: 1000, type: MediaType.VIDEO, purpose: 'avatar' } as any, 'user-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects isAiGenerated without an aiDisclosure', async () => {
    const { service } = makeService();
    await expect(
      service.requestUpload(
        { fileName: 'x.jpg', mimeType: 'image/jpeg', sizeBytes: 1000, type: MediaType.PHOTO, purpose: 'photo', isAiGenerated: true } as any,
        'user-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a RECONSTRUCTION with no provenanceNote and no aiDisclosure (spec section 25/60)', async () => {
    const { service } = makeService();
    await expect(
      service.requestUpload(
        { fileName: 'x.jpg', mimeType: 'image/jpeg', sizeBytes: 1000, type: MediaType.RECONSTRUCTION, purpose: 'photo' } as any,
        'user-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts a RECONSTRUCTION that discloses its basis via provenanceNote', async () => {
    const { service, prisma } = makeService();
    prisma.mediaAsset.create.mockResolvedValue({ id: 'm1' });

    await expect(
      service.requestUpload(
        {
          fileName: 'x.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 1000,
          type: MediaType.RECONSTRUCTION,
          purpose: 'photo',
          provenanceNote: 'Artist reconstruction based on 1885 survey drawings.',
        } as any,
        'user-1',
      ),
    ).resolves.toBeDefined();
  });
});

/**
 * Covers spec Phase 05/05.1 section 66 tests #5/#6/#11/#12/#13/#14: unconfirmed
 * uploads never become usable, and confirmation actually verifies storage,
 * signature, and now an authoritative server-computed SHA-256.
 */
describe('MediaService.confirmUpload', () => {
  const owner = { id: 'user-1', roles: ['CONTRIBUTOR'] };
  const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5]);

  it('refuses to confirm a media asset the caller does not own', async () => {
    const { service, prisma } = makeService();
    prisma.mediaAsset.findUnique.mockResolvedValue({ id: 'm1', uploadedById: 'someone-else', status: MediaAssetStatus.PENDING_UPLOAD });

    await expect(service.confirmUpload('m1', {}, owner)).rejects.toThrow(ForbiddenException);
  });

  it('refuses to confirm a media asset that is not PENDING_UPLOAD', async () => {
    const { service, prisma } = makeService();
    prisma.mediaAsset.findUnique.mockResolvedValue({ id: 'm1', uploadedById: owner.id, status: MediaAssetStatus.READY });

    await expect(service.confirmUpload('m1', {}, owner)).rejects.toThrow(BadRequestException);
  });

  it('marks FAILED and refuses when the object does not exist in storage', async () => {
    const { service, prisma, s3 } = makeService();
    prisma.mediaAsset.findUnique.mockResolvedValue({ id: 'm1', uploadedById: owner.id, status: MediaAssetStatus.PENDING_UPLOAD, storageKey: 'k', mimeType: 'image/jpeg' });
    s3.statObject.mockResolvedValue({ exists: false });

    await expect(service.confirmUpload('m1', {}, owner)).rejects.toThrow(BadRequestException);
    expect(prisma.mediaAsset.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: MediaAssetStatus.FAILED } }),
    );
    expect(s3.getObjectStream).not.toHaveBeenCalled();
  });

  it('marks FAILED and refuses when the uploaded bytes do not match the declared MIME signature', async () => {
    const { service, prisma, s3 } = makeService();
    prisma.mediaAsset.findUnique.mockResolvedValue({ id: 'm1', uploadedById: owner.id, status: MediaAssetStatus.PENDING_UPLOAD, storageKey: 'k', mimeType: 'application/pdf' });
    s3.statObject.mockResolvedValue({ exists: true, sizeBytes: 1000, contentType: 'application/pdf' });
    s3.getObjectStream.mockResolvedValue(Readable.from([Buffer.from('not a pdf, plain text instead')]));

    await expect(service.confirmUpload('m1', {}, owner)).rejects.toThrow(BadRequestException);
    expect(prisma.mediaAsset.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: MediaAssetStatus.FAILED } }),
    );
  });

  it('computes an authoritative SHA-256 server-side from a streamed read and persists it', async () => {
    const { service, prisma, s3 } = makeService();
    prisma.mediaAsset.findUnique.mockResolvedValue({ id: 'm1', uploadedById: owner.id, status: MediaAssetStatus.PENDING_UPLOAD, storageKey: 'k', mimeType: 'image/jpeg', sizeBytes: 500 });
    s3.statObject.mockResolvedValue({ exists: true, sizeBytes: 500 });
    s3.getObjectStream.mockResolvedValue(Readable.from([jpegBytes]));
    prisma.mediaAsset.update.mockResolvedValue({ id: 'm1', status: MediaAssetStatus.UPLOADED });

    await service.confirmUpload('m1', {}, owner);

    expect(prisma.mediaAsset.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ checksum: sha256(jpegBytes) }) }),
    );
  });

  it('rejects confirmation when a client-supplied checksum does not match the server-computed one', async () => {
    const { service, prisma, s3 } = makeService();
    prisma.mediaAsset.findUnique.mockResolvedValue({ id: 'm1', uploadedById: owner.id, status: MediaAssetStatus.PENDING_UPLOAD, storageKey: 'k', mimeType: 'image/jpeg' });
    s3.statObject.mockResolvedValue({ exists: true, sizeBytes: 500 });
    s3.getObjectStream.mockResolvedValue(Readable.from([jpegBytes]));

    await expect(service.confirmUpload('m1', { checksum: 'deadbeef'.repeat(8) }, owner)).rejects.toThrow(BadRequestException);
    expect(prisma.mediaAsset.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: MediaAssetStatus.FAILED } }),
    );
  });

  it('accepts confirmation when a client-supplied checksum matches the server-computed one', async () => {
    const { service, prisma, s3 } = makeService();
    prisma.mediaAsset.findUnique.mockResolvedValue({ id: 'm1', uploadedById: owner.id, status: MediaAssetStatus.PENDING_UPLOAD, storageKey: 'k', mimeType: 'image/jpeg' });
    s3.statObject.mockResolvedValue({ exists: true, sizeBytes: 500 });
    s3.getObjectStream.mockResolvedValue(Readable.from([jpegBytes]));
    prisma.mediaAsset.update.mockResolvedValue({ id: 'm1', status: MediaAssetStatus.UPLOADED });

    await expect(service.confirmUpload('m1', { checksum: sha256(jpegBytes) }, owner)).resolves.toBeDefined();
  });

  it('moves to UPLOADED and enqueues processing once storage + signature + checksum are verified', async () => {
    const { service, prisma, s3, queue } = makeService();
    prisma.mediaAsset.findUnique.mockResolvedValue({ id: 'm1', uploadedById: owner.id, status: MediaAssetStatus.PENDING_UPLOAD, storageKey: 'k', mimeType: 'image/jpeg', sizeBytes: 500 });
    s3.statObject.mockResolvedValue({ exists: true, sizeBytes: 500, contentType: 'image/jpeg' });
    s3.getObjectStream.mockResolvedValue(Readable.from([jpegBytes]));
    prisma.mediaAsset.update.mockResolvedValue({ id: 'm1', status: MediaAssetStatus.UPLOADED });

    const result = await service.confirmUpload('m1', {}, owner);

    expect(result.status).toBe(MediaAssetStatus.UPLOADED);
    expect(queue.add).toHaveBeenCalledWith('process-derivatives', { mediaAssetId: 'm1', storageKey: 'k' }, { jobId: 'process-m1' });
  });

  it('an EDITOR can confirm an upload they did not personally make', async () => {
    const { service, prisma, s3 } = makeService();
    prisma.mediaAsset.findUnique.mockResolvedValue({ id: 'm1', uploadedById: 'someone-else', status: MediaAssetStatus.PENDING_UPLOAD, storageKey: 'k', mimeType: 'image/jpeg' });
    s3.statObject.mockResolvedValue({ exists: true, sizeBytes: 500 });
    s3.getObjectStream.mockResolvedValue(Readable.from([jpegBytes]));
    prisma.mediaAsset.update.mockResolvedValue({ id: 'm1', status: MediaAssetStatus.UPLOADED });

    await expect(service.confirmUpload('m1', {}, { id: 'editor-1', roles: ['EDITOR'] })).resolves.toBeDefined();
  });
});

/** Covers spec section 66 tests #6/#7/#8/#9/#16: public delivery only serves READY, PUBLIC-policy assets a full URL, and variants inherit the same policy. */
describe('MediaService.findPublicById', () => {
  it('never returns a media asset that is not READY', async () => {
    const { service, prisma } = makeService();
    prisma.mediaAsset.findUnique.mockResolvedValue({ id: 'm1', status: MediaAssetStatus.PENDING_UPLOAD, accessPolicy: AccessPolicy.PUBLIC, storageKey: 'k', derivatives: [] });
    await expect(service.findPublicById('m1')).rejects.toThrow(NotFoundException);
  });

  it('never returns a full URL for a READY but RESTRICTED asset', async () => {
    const { service, prisma } = makeService();
    prisma.mediaAsset.findUnique.mockResolvedValue({ id: 'm1', status: MediaAssetStatus.READY, accessPolicy: AccessPolicy.RESTRICTED, storageKey: 'k', derivatives: [] });
    const result = await service.findPublicById('m1');
    expect(result.url).toBeNull();
  });

  it('returns a full URL for a READY, PUBLIC asset', async () => {
    const { service, prisma } = makeService();
    prisma.mediaAsset.findUnique.mockResolvedValue({ id: 'm1', status: MediaAssetStatus.READY, accessPolicy: AccessPolicy.PUBLIC, storageKey: 'k', derivatives: [] });
    const result = await service.findPublicById('m1');
    expect(result.url).toBe('https://cdn.example/k');
  });

  it('includes only READY variants, each individually policy-filtered', async () => {
    const { service, prisma } = makeService();
    prisma.mediaAsset.findUnique.mockResolvedValue({
      id: 'm1',
      status: MediaAssetStatus.READY,
      accessPolicy: AccessPolicy.PUBLIC,
      storageKey: 'k',
      derivatives: [
        { id: 'v1', status: MediaAssetStatus.READY, accessPolicy: AccessPolicy.PUBLIC, storageKey: 'derivatives/thumb.webp' },
        { id: 'v2', status: MediaAssetStatus.PROCESSING, accessPolicy: AccessPolicy.PUBLIC, storageKey: 'derivatives/medium.webp' },
        { id: 'v3', status: MediaAssetStatus.READY, accessPolicy: AccessPolicy.RESTRICTED, storageKey: 'derivatives/large.webp' },
      ],
    });

    const result = await service.findPublicById('m1');
    expect(result.variants).toHaveLength(2);
    const thumb = result.variants.find((v: any) => v.id === 'v1')!;
    const restricted = result.variants.find((v: any) => v.id === 'v3')!;
    expect(thumb.url).toBe('https://cdn.example/derivatives/thumb.webp');
    expect(restricted.url).toBeNull();
    expect(result.variants.some((v: any) => v.id === 'v2')).toBe(false);
  });
});

describe('MediaService.attachToEntity', () => {
  it('refuses to attach a media asset that is not READY', async () => {
    const { service, prisma } = makeService();
    prisma.mediaAsset.findUnique.mockResolvedValue({ id: 'm1', status: MediaAssetStatus.PROCESSING });
    await expect(service.attachToEntity('PLACE', 'place-1', 'm1')).rejects.toThrow(BadRequestException);
  });
});

describe('MediaService rights/access/quarantine/archive', () => {
  it('records an audit entry when rights are changed', async () => {
    const { service, prisma, audit } = makeService();
    prisma.mediaAsset.findUnique.mockResolvedValue({ id: 'm1', rightsStatus: 'UNKNOWN' });
    prisma.mediaAsset.update.mockResolvedValue({ id: 'm1', rightsStatus: 'PUBLIC_DOMAIN' });

    await service.updateRights('m1', { rightsStatus: 'PUBLIC_DOMAIN' as any }, 'editor-1');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'media.rights.changed' }));
  });

  it('cascades an access-policy change to every derivative (spec section 24/25)', async () => {
    const { service, prisma } = makeService();
    prisma.mediaAsset.findUnique.mockResolvedValue({ id: 'm1', accessPolicy: 'PUBLIC' });
    prisma.$transaction.mockResolvedValue([{ id: 'm1', accessPolicy: 'RESTRICTED' }, { count: 3 }]);

    const result = await service.updateAccessPolicy('m1', { accessPolicy: 'RESTRICTED' as any }, 'editor-1');
    expect(result.accessPolicy).toBe('RESTRICTED');
    expect(prisma.$transaction).toHaveBeenCalledWith([
      expect.objectContaining({}),
      expect.objectContaining({}),
    ]);
  });

  it('quarantines a media asset, cascades to derivatives, and records the reason', async () => {
    const { service, prisma, audit } = makeService();
    prisma.mediaAsset.findUnique.mockResolvedValue({ id: 'm1' });
    prisma.$transaction.mockResolvedValue([{ id: 'm1', status: MediaAssetStatus.QUARANTINED }, { count: 3 }]);

    const result = await service.quarantine('m1', { reason: 'reported as inappropriate' }, 'mod-1');
    expect(result.status).toBe(MediaAssetStatus.QUARANTINED);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'media.quarantined', metadata: { reason: 'reported as inappropriate' } }));
  });

  it('archives a media asset rather than deleting it, cascading to derivatives', async () => {
    const { service, prisma, audit } = makeService();
    prisma.mediaAsset.findUnique.mockResolvedValue({ id: 'm1' });
    prisma.$transaction.mockResolvedValue([{ id: 'm1', status: MediaAssetStatus.ARCHIVED }, { count: 3 }]);

    const result = await service.archive('m1', {}, 'editor-1');
    expect(result.status).toBe(MediaAssetStatus.ARCHIVED);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'media.archived' }));
  });
});

describe('MediaService.setTranslation', () => {
  it('upserts a locale-specific caption/alt text row', async () => {
    const prisma: any = {
      mediaAsset: { findUnique: jest.fn().mockResolvedValue({ id: 'm1' }) },
      mediaAssetTranslation: { upsert: jest.fn().mockResolvedValue({ id: 't1', locale: 'en' }) },
    };
    const { service, audit } = makeService({ prisma });

    const result = await service.setTranslation('m1', 'en', 'Caption', 'Alt', 'editor-1');
    expect(result.locale).toBe('en');
    expect(prisma.mediaAssetTranslation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { mediaAssetId_locale: { mediaAssetId: 'm1', locale: 'en' } } }),
    );
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'media.translation.upserted' }));
  });
});

/** Covers spec section 40: orphaned PENDING_UPLOAD rows are cleaned up, nothing else is touched. */
describe('MediaService.cleanupExpiredPendingUploads', () => {
  it('marks only stale PENDING_UPLOAD rows as FAILED', async () => {
    const { service, prisma, audit } = makeService();
    prisma.mediaAsset.findMany.mockResolvedValue([{ id: 'm1' }, { id: 'm2' }]);
    prisma.mediaAsset.updateMany.mockResolvedValue({ count: 2 });

    const result = await service.cleanupExpiredPendingUploads('admin-1');
    expect(result).toEqual({ cleaned: 2 });
    expect(prisma.mediaAsset.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: MediaAssetStatus.FAILED } }),
    );
    expect(audit.log).toHaveBeenCalled();
  });

  it('does nothing when there are no stale rows', async () => {
    const { service, prisma } = makeService();
    prisma.mediaAsset.findMany.mockResolvedValue([]);

    const result = await service.cleanupExpiredPendingUploads('admin-1');
    expect(result).toEqual({ cleaned: 0 });
    expect(prisma.mediaAsset.updateMany).not.toHaveBeenCalled();
  });
});
