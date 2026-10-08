import { ForbiddenException } from '@nestjs/common';
import { TripDiscussionService } from './trip-discussion.service';
import { TripDiscussionAccessService } from './trip-discussion-access.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('TripDiscussionService security', () => {
  const assertCanRead = jest.fn();
  const assertCanPost = jest.fn();
  const findMany = jest.fn();
  const create = jest.fn();
  const service = new TripDiscussionService(
    { tripDiscussionMessage: { findMany, create } } as unknown as PrismaService,
    { assertCanRead, assertCanPost } as unknown as TripDiscussionAccessService,
  );

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('denies unrelated users before querying any messages', async () => {
    assertCanRead.mockRejectedValue(new ForbiddenException());
    await expect(service.list('private-trip', 'stranger')).rejects.toThrow(ForbiddenException);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('denies removed members before creating messages', async () => {
    assertCanPost.mockRejectedValue(new ForbiddenException());
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
    assertCanPost.mockResolvedValue(undefined);
    create.mockResolvedValue({ id: 'msg' });
    await service.post('trip-a', 'member', '  hello  ');
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: { tripId: 'trip-a', authorId: 'member', body: 'hello' },
    }));
  });

  it('rejects empty messages before touching the database', async () => {
    await expect(service.post('trip-a', 'member', '   ')).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });
});
