import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { MediaAssetStatus } from '@prisma/client';
import { ThenNowService } from './then-now.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MediaService } from '../media/media.service';

/** Covers spec section 63: Then & Now integrity - distinct assets, both usable, real Place, ownership enforced. */
describe('ThenNowService.create', () => {
  let prisma: {
    place: { findUnique: jest.Mock };
    mediaAsset: { findUnique: jest.Mock };
    thenNowComparison: { create: jest.Mock };
  };
  let audit: { log: jest.Mock };
  let media: { assertOwnedByOrPrivileged: jest.Mock };
  let service: ThenNowService;

  const actor = { id: 'user-1', roles: ['USER'] };

  beforeEach(() => {
    prisma = {
      place: { findUnique: jest.fn() },
      mediaAsset: { findUnique: jest.fn() },
      thenNowComparison: { create: jest.fn() },
    };
    audit = { log: jest.fn() };
    media = { assertOwnedByOrPrivileged: jest.fn().mockResolvedValue(undefined) };
    service = new ThenNowService(prisma as unknown as PrismaService, audit as unknown as AuditService, media as unknown as MediaService);
  });

  it('rejects when before and after reference the same media asset', async () => {
    await expect(
      service.create({ placeId: 'p1', beforeMediaId: 'm1', afterMediaId: 'm1' } as any, actor),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.thenNowComparison.create).not.toHaveBeenCalled();
  });

  it('rejects when the caller does not own the media', async () => {
    media.assertOwnedByOrPrivileged.mockRejectedValueOnce(new ForbiddenException());
    await expect(
      service.create({ placeId: 'p1', beforeMediaId: 'm1', afterMediaId: 'm2' } as any, actor),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects when placeId does not reference a real Place', async () => {
    prisma.place.findUnique.mockResolvedValue(null);
    prisma.mediaAsset.findUnique.mockResolvedValue({ id: 'm', status: MediaAssetStatus.READY });

    await expect(
      service.create({ placeId: 'missing', beforeMediaId: 'm1', afterMediaId: 'm2' } as any, actor),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects when a referenced media asset is not READY', async () => {
    prisma.place.findUnique.mockResolvedValue({ id: 'p1' });
    prisma.mediaAsset.findUnique
      .mockResolvedValueOnce({ id: 'm1', status: MediaAssetStatus.PROCESSING })
      .mockResolvedValueOnce({ id: 'm2', status: MediaAssetStatus.READY });

    await expect(
      service.create({ placeId: 'p1', beforeMediaId: 'm1', afterMediaId: 'm2' } as any, actor),
    ).rejects.toThrow(BadRequestException);
  });

  it('creates a DRAFT comparison when everything checks out', async () => {
    prisma.place.findUnique.mockResolvedValue({ id: 'p1' });
    prisma.mediaAsset.findUnique
      .mockResolvedValueOnce({ id: 'm1', status: MediaAssetStatus.READY })
      .mockResolvedValueOnce({ id: 'm2', status: MediaAssetStatus.READY });
    prisma.thenNowComparison.create.mockResolvedValue({ id: 'c1' });

    const result = await service.create({ placeId: 'p1', beforeMediaId: 'm1', afterMediaId: 'm2' } as any, actor);
    expect(result.id).toBe('c1');
    expect(prisma.thenNowComparison.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ placeId: 'p1', beforeMediaId: 'm1', afterMediaId: 'm2', createdById: 'user-1' }) }),
    );
  });
});
