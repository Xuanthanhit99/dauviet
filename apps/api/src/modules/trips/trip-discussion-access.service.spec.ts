import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TripDiscussionAccessService } from './trip-discussion-access.service';
import { TripAuthorizationService, TripCapability } from './trip-authorization.service';

describe('TripDiscussionAccessService', () => {
  const authorize = jest.fn();
  const access = new TripDiscussionAccessService({ authorize } as unknown as TripAuthorizationService);

  beforeEach(() => authorize.mockReset());

  it.each(['owner', 'editor', 'viewer'])('allows current %s to read and post using VIEW_TRIP', async (userId) => {
    authorize.mockResolvedValue({ role: userId.toUpperCase() });
    await access.assertCanRead('trip-1', userId);
    await access.assertCanPost('trip-1', userId);
    expect(authorize).toHaveBeenNthCalledWith(1, 'trip-1', userId, TripCapability.VIEW_TRIP);
    expect(authorize).toHaveBeenNthCalledWith(2, 'trip-1', userId, TripCapability.VIEW_TRIP);
  });

  it('does not cache authorization after a member is removed', async () => {
    authorize.mockResolvedValueOnce({ role: 'VIEWER' }).mockRejectedValueOnce(new ForbiddenException());
    await access.assertCanRead('trip-1', 'removed');
    await expect(access.assertCanPost('trip-1', 'removed')).rejects.toThrow(ForbiddenException);
    expect(authorize).toHaveBeenCalledTimes(2);
  });

  it.each(['stranger', 'pending-invite'])('denies %s when underlying trip authorization denies', async (userId) => {
    authorize.mockRejectedValue(new ForbiddenException());
    await expect(access.assertCanRead('trip-1', userId)).rejects.toThrow(ForbiddenException);
    await expect(access.assertCanPost('trip-1', userId)).rejects.toThrow(ForbiddenException);
  });

  it('preserves missing-trip 404 rather than granting discussion access', async () => {
    authorize.mockRejectedValue(new NotFoundException());
    await expect(access.assertCanRead('missing', 'user')).rejects.toThrow(NotFoundException);
  });
});
