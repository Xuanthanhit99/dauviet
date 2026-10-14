import { NotFoundException } from '@nestjs/common';
import { PublicationStatus } from '@prisma/client';
import { DestinationWatchService } from './destination-watch.service';

describe('DestinationWatchService owner boundaries', () => {
  const prisma = {
    destination: { findFirst: jest.fn() },
    destinationWatch: { findMany: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn(), findUnique: jest.fn() },
    watchPreference: { findUnique: jest.fn(), upsert: jest.fn() },
    watchNotification: { findMany: jest.fn(), updateMany: jest.fn(), findFirst: jest.fn() },
  };
  const service = new DestinationWatchService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('rejects unpublished destinations', async () => {
    prisma.destination.findFirst.mockResolvedValue(null);
    await expect(service.follow('owner', 'draft')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.destination.findFirst).toHaveBeenCalledWith({
      where: { id: 'draft', status: PublicationStatus.PUBLISHED },
      select: { id: true },
    });
    expect(prisma.destinationWatch.upsert).not.toHaveBeenCalled();
  });

  it('follows with server-derived owner and unique key', async () => {
    prisma.destination.findFirst.mockResolvedValue({ id: 'dest' });
    prisma.destinationWatch.upsert.mockResolvedValue({ id: 'watch' });
    await service.follow('owner', 'dest');
    expect(prisma.destinationWatch.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_destinationId: { userId: 'owner', destinationId: 'dest' } },
      create: { userId: 'owner', destinationId: 'dest' },
    }));
  });

  it('unfollows only owner relation and is idempotent', async () => {
    prisma.destinationWatch.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.unfollow('owner', 'dest')).resolves.toEqual({ following: false, destinationId: 'dest' });
    expect(prisma.destinationWatch.deleteMany).toHaveBeenCalledWith({ where: { userId: 'owner', destinationId: 'dest' } });
  });

  it('lists notifications only for owner', async () => {
    prisma.watchNotification.findMany.mockResolvedValue([]);
    await service.listNotifications('owner', 20);
    expect(prisma.watchNotification.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'owner' }, take: 20 }));
  });

  it('cannot mark outsider notification read', async () => {
    prisma.watchNotification.updateMany.mockResolvedValue({ count: 0 });
    prisma.watchNotification.findFirst.mockResolvedValue(null);
    await expect(service.markRead('owner', 'outsider-notification')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.watchNotification.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'outsider-notification', userId: 'owner', readAt: null },
    }));
  });

  it('returns preference defaults without creating a row', async () => {
    prisma.watchPreference.findUnique.mockResolvedValue(null);
    await expect(service.getPreferences('owner')).resolves.toEqual({ eventUpdates: true, editorialUpdates: false });
  });
});
