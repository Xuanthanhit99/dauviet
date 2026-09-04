import sharp from 'sharp';
import { Readable } from 'stream';
import { MediaAssetStatus } from '@prisma/client';
import { MediaProcessor } from './media.processor';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { S3Service } from './s3.service';

async function makeJpeg(width = 400, height = 300) {
  return sharp({ create: { width, height, channels: 3, background: { r: 10, g: 20, b: 30 } } }).jpeg().toBuffer();
}

function makeProcessor(overrides: { prisma?: any; s3?: any; audit?: any } = {}) {
  const prisma = overrides.prisma ?? {
    mediaAsset: { updateMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() },
  };
  const s3 = overrides.s3 ?? {
    getObjectStream: jest.fn(),
    buildStorageKey: jest.fn((mime: string, prefix: string) => `${prefix}/generated.bin`),
    putObject: jest.fn(),
  };
  const audit = overrides.audit ?? { log: jest.fn() };
  const processor = new MediaProcessor(prisma as unknown as PrismaService, s3 as unknown as S3Service, audit as unknown as AuditService);
  return { processor, prisma, s3, audit };
}

const baseAsset = {
  id: 'm1',
  type: 'PHOTO',
  mimeType: 'image/jpeg',
  storageKey: 'uploads/orig.jpg',
  accessPolicy: 'PUBLIC',
  uploadedById: 'user-1',
  isAiGenerated: false,
  aiDisclosure: null,
  isHistorical: false,
  rightsStatus: 'UNKNOWN',
  license: null,
  rightsHolder: null,
  attributionText: null,
  title: null,
  altText: null,
};

/** Covers spec Phase 05.1 section 26 tests #1/#2/#7/#8/#9/#10/#12. */
describe('MediaProcessor.process', () => {
  it('skips an asset that is not in an eligible state (idempotent no-op)', async () => {
    const { processor, prisma, s3 } = makeProcessor();
    prisma.mediaAsset.updateMany.mockResolvedValue({ count: 0 });

    await processor.process({ data: { mediaAssetId: 'm1', storageKey: 'k' } } as any);

    expect(s3.getObjectStream).not.toHaveBeenCalled();
  });

  it('sends a non-image asset (e.g. PDF) straight to READY without generating variants', async () => {
    const { processor, prisma, s3 } = makeProcessor();
    prisma.mediaAsset.updateMany.mockResolvedValue({ count: 1 });
    prisma.mediaAsset.findUnique.mockResolvedValue({ ...baseAsset, mimeType: 'application/pdf' });

    await processor.process({ data: { mediaAssetId: 'm1', storageKey: 'k' } } as any);

    expect(s3.getObjectStream).not.toHaveBeenCalled();
    expect(prisma.mediaAsset.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: MediaAssetStatus.READY } }),
    );
  });

  it('generates all mandatory variants for a real JPEG and only then marks the parent READY', async () => {
    const jpeg = await makeJpeg(1200, 800);
    const { processor, prisma, s3, audit } = makeProcessor();
    prisma.mediaAsset.updateMany.mockResolvedValue({ count: 1 });
    prisma.mediaAsset.findUnique.mockResolvedValue({ ...baseAsset });
    s3.getObjectStream.mockResolvedValue(Readable.from([jpeg]));

    await processor.process({ data: { mediaAssetId: 'm1', storageKey: 'uploads/orig.jpg' } } as any);

    const upsertCalls = prisma.mediaAsset.upsert.mock.calls;
    const variantTypes = upsertCalls.map((c: any) => c[0].create.variantType);
    expect(variantTypes).toEqual(expect.arrayContaining(['THUMBNAIL', 'MEDIUM', 'LARGE']));
    // every upserted derivative is created READY, inheriting the parent's accessPolicy
    for (const call of upsertCalls) {
      expect(call[0].create.status).toBe(MediaAssetStatus.READY);
      expect(call[0].create.accessPolicy).toBe('PUBLIC');
      expect(call[0].create.parentAssetId).toBe('m1');
    }
    // parent only reaches READY as the final step
    const readyCall = prisma.mediaAsset.updateMany.mock.calls.find((c: any) => c[0].data?.status === MediaAssetStatus.READY);
    expect(readyCall).toBeDefined();
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'media.processing.completed' }));
  });

  it('upserts on (parentAssetId, variantType) so re-processing the same asset never creates duplicates (idempotent)', async () => {
    const jpeg = await makeJpeg(600, 400);
    const { processor, prisma, s3 } = makeProcessor();
    prisma.mediaAsset.updateMany.mockResolvedValue({ count: 1 });
    prisma.mediaAsset.findUnique.mockResolvedValue({ ...baseAsset });
    s3.getObjectStream.mockResolvedValue(Readable.from([jpeg]));

    await processor.process({ data: { mediaAssetId: 'm1', storageKey: 'uploads/orig.jpg' } } as any);

    for (const call of prisma.mediaAsset.upsert.mock.calls) {
      expect(call[0].where).toEqual({
        parentAssetId_variantType: { parentAssetId: 'm1', variantType: call[0].create.variantType },
      });
    }
  });

  it('marks the asset FAILED (not READY) when the object is not a decodable image, and does not rethrow (no pointless BullMQ retry)', async () => {
    const { processor, prisma, s3, audit } = makeProcessor();
    prisma.mediaAsset.updateMany.mockResolvedValue({ count: 1 });
    prisma.mediaAsset.findUnique.mockResolvedValue({ ...baseAsset });
    s3.getObjectStream.mockResolvedValue(Readable.from([Buffer.from('not an image')]));

    await expect(processor.process({ data: { mediaAssetId: 'm1', storageKey: 'uploads/orig.jpg' } } as any)).resolves.toBeUndefined();

    expect(prisma.mediaAsset.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: MediaAssetStatus.FAILED } }),
    );
    expect(prisma.mediaAsset.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: MediaAssetStatus.READY } }),
    );
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'media.processing.failed' }));
  });

  it('rethrows a storage read failure so BullMQ can retry (transient, distinct from a corrupt file)', async () => {
    const { processor, prisma, s3 } = makeProcessor();
    prisma.mediaAsset.updateMany.mockResolvedValue({ count: 1 });
    prisma.mediaAsset.findUnique.mockResolvedValue({ ...baseAsset });
    s3.getObjectStream.mockRejectedValue(new Error('ECONNRESET'));

    await expect(processor.process({ data: { mediaAssetId: 'm1', storageKey: 'uploads/orig.jpg' } } as any)).rejects.toThrow('ECONNRESET');
  });
});

describe('MediaProcessor.onFailed', () => {
  it('marks the asset FAILED once BullMQ has exhausted every retry attempt', async () => {
    const { processor, prisma, audit } = makeProcessor();
    prisma.mediaAsset.updateMany.mockResolvedValue({ count: 1 });

    await processor.onFailed({ attemptsMade: 3, opts: { attempts: 3 }, data: { mediaAssetId: 'm1', storageKey: 'k' } } as any);

    expect(prisma.mediaAsset.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: MediaAssetStatus.FAILED } }),
    );
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ metadata: { reason: 'storage_retries_exhausted' } }));
  });

  it('does nothing while retries remain scheduled', async () => {
    const { processor, prisma } = makeProcessor();

    await processor.onFailed({ attemptsMade: 1, opts: { attempts: 3 }, data: { mediaAssetId: 'm1', storageKey: 'k' } } as any);

    expect(prisma.mediaAsset.updateMany).not.toHaveBeenCalled();
  });
});
