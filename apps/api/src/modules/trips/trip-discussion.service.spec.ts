import { ForbiddenException } from '@nestjs/common';
import { TripDiscussionService } from './trip-discussion.service';
import { TripDiscussionAccessService } from './trip-discussion-access.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('TripDiscussionService security', () => {
  const assertCanRead = jest.fn();
  const assertCanPost = jest.fn();
  const findMany = jest.fn();
  const create = jest.fn();
  const queryRaw = jest.fn();
  const tripFind = jest.fn();
  const memberFind = jest.fn();
  const transaction = jest.fn(async (fn) => fn({ $queryRaw: queryRaw, trip: { findUnique: tripFind }, tripMember: { findUnique: memberFind }, tripDiscussionMessage: { create } }));
  const service = new TripDiscussionService(
    { tripDiscussionMessage: { findMany, create }, $transaction: transaction } as unknown as PrismaService,
    { assertCanRead, assertCanPost } as unknown as TripDiscussionAccessService,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    transaction.mockImplementation(async (fn) => fn({ $queryRaw: queryRaw, trip: { findUnique: tripFind }, tripMember: { findUnique: memberFind }, tripDiscussionMessage: { create } }));
    tripFind.mockResolvedValue({ ownerId: 'owner' });
    memberFind.mockResolvedValue({ role: 'VIEWER' });
  });

  it('denies unrelated users before querying any messages', async () => {
    assertCanRead.mockRejectedValue(new ForbiddenException());
    await expect(service.list('private-trip', 'stranger')).rejects.toThrow(ForbiddenException);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('denies removed members before creating messages', async () => {
    memberFind.mockResolvedValue(null);
    await expect(service.post('private-trip', 'removed', 'hello')).rejects.toThrow(ForbiddenException);
    expect(create).not.toHaveBeenCalled();
  });

  it('scopes reads to authorized trip and hides deleted messages', async () => {
    assertCanRead.mockResolvedValue(undefined);
    findMany.mockResolvedValue([]);
    await service.list('trip-a', 'member');
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tripId: 'trip-a', deletedAt: null },
      take: 50,
    }));
  });

  it('creates only as the authenticated actor in the authorized trip', async () => {
    create.mockResolvedValue({ id: 'msg' });
    await service.post('trip-a', 'member', '  hello  ');
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: { tripId: 'trip-a', authorId: 'member', body: 'hello' },
    }));
  });

  it('denies a removed member inside the write transaction', async () => {
    memberFind.mockResolvedValue(null);
    await expect(service.post('trip-a', 'removed', 'hello')).rejects.toThrow(ForbiddenException);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects empty messages before touching the database', async () => {
    await expect(service.post('trip-a', 'member', '   ')).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });
});
