import { ForbiddenException } from '@nestjs/common';
import { ContributionsService } from './contributions.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MediaService } from '../media/media.service';

/**
 * Covers spec section 57/66 test #11: a user cannot attach a MediaAsset they
 * do not own to their own Contribution just by knowing its id.
 */
describe('ContributionsService.create ownership guard', () => {
  let prisma: { contribution: { create: jest.Mock } };
  let audit: { log: jest.Mock };
  let media: { assertOwnedByOrPrivileged: jest.Mock };
  let service: ContributionsService;

  beforeEach(() => {
    prisma = { contribution: { create: jest.fn() } };
    audit = { log: jest.fn() };
    media = { assertOwnedByOrPrivileged: jest.fn() };
    service = new ContributionsService(prisma as unknown as PrismaService, audit as unknown as AuditService, media as unknown as MediaService);
  });

  it('rejects a mediaAssetId the caller does not own', async () => {
    media.assertOwnedByOrPrivileged.mockRejectedValue(new ForbiddenException('You do not own this media asset.'));

    await expect(
      service.create({ title: 'Old photo', mediaAssetIds: ['someone-elses-media'] } as any, { id: 'user-1', roles: ['USER'] }),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.contribution.create).not.toHaveBeenCalled();
  });

  it('creates a contribution once every referenced media asset is owned by the caller', async () => {
    media.assertOwnedByOrPrivileged.mockResolvedValue(undefined);
    prisma.contribution.create.mockResolvedValue({ id: 'contribution-1' });

    const result = await service.create(
      { title: 'Old photo', mediaAssetIds: ['my-media-1'] } as any,
      { id: 'user-1', roles: ['USER'] },
    );
    expect(result.id).toBe('contribution-1');
    expect(media.assertOwnedByOrPrivileged).toHaveBeenCalledWith('my-media-1', { id: 'user-1', roles: ['USER'] });
  });

  it('creates a contribution with no media without touching the ownership check', async () => {
    prisma.contribution.create.mockResolvedValue({ id: 'contribution-2' });

    await service.create({ title: 'No photo yet' } as any, { id: 'user-1', roles: ['USER'] });
    expect(media.assertOwnedByOrPrivileged).not.toHaveBeenCalled();
  });
});
