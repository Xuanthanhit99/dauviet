import { ConfigService } from '@nestjs/config';
import { TripLocationsService } from './trip-locations.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TripAuthorizationService } from './trip-authorization.service';
import { AppConfig } from '../../config/configuration';

const TRIP_LOCATION_SETTINGS: AppConfig['tripLocation'] = {
  sharingMinDurationMinutes: 5,
  sharingMaxDurationMinutes: 720,
  ttlSeconds: 300,
  freshnessSeconds: 90,
  maxFutureClockSkewSeconds: 120,
};

function makeHarness() {
  const prisma: any = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    tripMemberLocation: { findUniqueOrThrow: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    tripLocationSharing: { findMany: jest.fn().mockResolvedValue([]) },
    tripMember: { findMany: jest.fn().mockResolvedValue([]) },
    user: { findUnique: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn((arg: unknown) => (typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as Promise<unknown>[]))),
  };
  const authz = { authorize: jest.fn().mockResolvedValue({ trip: { id: 't1', ownerId: 'owner-1', archivedAt: null }, role: 'EDITOR' }) } as unknown as TripAuthorizationService;
  const config = { get: jest.fn().mockReturnValue(TRIP_LOCATION_SETTINGS) } as unknown as ConfigService<AppConfig, true>;
  const service = new TripLocationsService(prisma as unknown as PrismaService, authz, config);
  return { service, prisma, authz };
}

describe('TripLocationsService.update (spec sections 16, 20-23, 61)', () => {
  it('rejects a capturedAt too far in the future - device-reported evidence is never blindly trusted', async () => {
    const { service } = makeHarness();
    const future = new Date(Date.now() + 10 * 60_000).toISOString();
    await expect(service.update('t1', 'u1', { latitude: 1, longitude: 1, accuracyMeters: 5, capturedAt: future })).rejects.toMatchObject({
      response: { code: 'TRIP_LOCATION_INVALID' },
    });
  });

  it('rejects when no ACTIVE sharing session exists for this user in this trip', async () => {
    const { service, prisma } = makeHarness();
    prisma.$queryRaw.mockResolvedValue([]);
    await expect(service.update('t1', 'u1', { latitude: 1, longitude: 1, accuracyMeters: 5, capturedAt: new Date().toISOString() })).rejects.toMatchObject({
      response: { code: 'TRIP_LOCATION_SHARING_NOT_ACTIVE' },
    });
  });

  it('rejects when the sharing session has expired even though the stored status column still says ACTIVE', async () => {
    const { service, prisma } = makeHarness();
    prisma.$queryRaw.mockResolvedValue([{ status: 'ACTIVE', expiresAt: new Date(Date.now() - 1000) }]);
    await expect(service.update('t1', 'u1', { latitude: 1, longitude: 1, accuracyMeters: 5, capturedAt: new Date().toISOString() })).rejects.toMatchObject({
      response: { code: 'TRIP_LOCATION_SHARING_EXPIRED' },
    });
  });

  it('accepts and upserts a valid update when ACTIVE and unexpired (the INSERT..ON CONFLICT row is returned)', async () => {
    const { service, prisma } = makeHarness();
    const capturedAt = new Date();
    prisma.$queryRaw
      .mockResolvedValueOnce([{ status: 'ACTIVE', expiresAt: new Date(Date.now() + 60_000) }]) // the FOR UPDATE lock read
      .mockResolvedValueOnce([{ id: 'loc-1', capturedAt }]); // the INSERT..ON CONFLICT..RETURNING

    const result = await service.update('t1', 'u1', { latitude: 10, longitude: 20, accuracyMeters: 5, capturedAt: capturedAt.toISOString() });
    expect(result.accepted).toBe(true);
    expect(result.availability).toBe('FRESH');
  });

  it('treats a retry with the SAME capturedAt as an idempotent no-op, not an error (spec section 23)', async () => {
    const { service, prisma } = makeHarness();
    const capturedAt = new Date();
    prisma.$queryRaw
      .mockResolvedValueOnce([{ status: 'ACTIVE', expiresAt: new Date(Date.now() + 60_000) }])
      .mockResolvedValueOnce([]); // ON CONFLICT WHERE guard rejected it (not strictly newer)
    prisma.tripMemberLocation.findUniqueOrThrow.mockResolvedValue({ capturedAt });

    const result = await service.update('t1', 'u1', { latitude: 10, longitude: 20, accuracyMeters: 5, capturedAt: capturedAt.toISOString() });
    expect(result.accepted).toBe(true);
  });

  it('rejects a strictly-older capturedAt as TRIP_LOCATION_STALE_UPDATE without ever touching the stored row (spec sections 21/22/76)', async () => {
    const { service, prisma } = makeHarness();
    const stored = new Date();
    const older = new Date(stored.getTime() - 60_000);
    prisma.$queryRaw
      .mockResolvedValueOnce([{ status: 'ACTIVE', expiresAt: new Date(Date.now() + 60_000) }])
      .mockResolvedValueOnce([]); // rejected by the WHERE guard
    prisma.tripMemberLocation.findUniqueOrThrow.mockResolvedValue({ capturedAt: stored });

    await expect(service.update('t1', 'u1', { latitude: 10, longitude: 20, accuracyMeters: 5, capturedAt: older.toISOString() })).rejects.toMatchObject({
      response: { code: 'TRIP_LOCATION_STALE_UPDATE' },
    });
  });
});

describe('TripLocationsService.list (spec sections 24-25, 38, 54, 93)', () => {
  it('returns an empty list for an archived trip regardless of any lingering rows (defense in depth on top of archive() already deleting them)', async () => {
    const { service, authz, prisma } = makeHarness();
    (authz.authorize as jest.Mock).mockResolvedValue({ trip: { id: 't1', ownerId: 'owner-1', archivedAt: new Date() }, role: 'EDITOR' });
    const result = await service.list('t1', 'u1');
    expect(result).toEqual([]);
    expect(prisma.tripMember.findMany).not.toHaveBeenCalled();
  });

  it('marks a member with no sharing row at all as UNAVAILABLE and omits coordinates', async () => {
    const { service, prisma } = makeHarness();
    prisma.user.findUnique.mockResolvedValue({ id: 'owner-1', displayName: 'Owner', avatarMediaId: null });
    prisma.tripMember.findMany.mockResolvedValue([{ userId: 'editor-1', joinedAt: new Date(), user: { id: 'editor-1', displayName: 'Editor', avatarMediaId: null } }]);
    prisma.tripLocationSharing.findMany.mockResolvedValue([]);
    prisma.tripMemberLocation.findMany.mockResolvedValue([]);

    const result = await service.list('t1', 'u1');
    const editorEntry: any = result.find((r: any) => r.userId === 'editor-1');
    expect(editorEntry.availability).toBe('UNAVAILABLE');
    expect(editorEntry.latitude).toBeUndefined();
  });

  it('discloses coordinates for a member with ACTIVE sharing and a fresh location', async () => {
    const { service, prisma } = makeHarness();
    const now = Date.now();
    prisma.user.findUnique.mockResolvedValue({ id: 'owner-1', displayName: 'Owner', avatarMediaId: null });
    prisma.tripMember.findMany.mockResolvedValue([{ userId: 'editor-1', joinedAt: new Date(), user: { id: 'editor-1', displayName: 'Editor', avatarMediaId: null } }]);
    prisma.tripLocationSharing.findMany.mockResolvedValue([{ userId: 'editor-1', status: 'ACTIVE', expiresAt: new Date(now + 60_000) }]);
    prisma.tripMemberLocation.findMany.mockResolvedValue([{ userId: 'editor-1', latitude: 10, longitude: 20, accuracyMeters: 5, capturedAt: new Date(now - 1000), expiresAt: new Date(now + 60_000) }]);

    const result = await service.list('t1', 'u1');
    const editorEntry: any = result.find((r: any) => r.userId === 'editor-1');
    expect(editorEntry.availability).toBe('FRESH');
    expect(editorEntry.latitude).toBe(10);
  });

  it('never discloses coordinates for a STOPPED session even if a location row somehow still exists', async () => {
    const { service, prisma } = makeHarness();
    const now = Date.now();
    prisma.user.findUnique.mockResolvedValue({ id: 'owner-1', displayName: 'Owner', avatarMediaId: null });
    prisma.tripMember.findMany.mockResolvedValue([{ userId: 'editor-1', joinedAt: new Date(), user: { id: 'editor-1', displayName: 'Editor', avatarMediaId: null } }]);
    prisma.tripLocationSharing.findMany.mockResolvedValue([{ userId: 'editor-1', status: 'STOPPED', expiresAt: new Date(now + 60_000) }]);
    prisma.tripMemberLocation.findMany.mockResolvedValue([{ userId: 'editor-1', latitude: 10, longitude: 20, accuracyMeters: 5, capturedAt: new Date(now - 1000), expiresAt: new Date(now + 60_000) }]);

    const result = await service.list('t1', 'u1');
    const editorEntry: any = result.find((r: any) => r.userId === 'editor-1');
    expect(editorEntry.availability).toBe('UNAVAILABLE');
    expect(editorEntry.latitude).toBeUndefined();
  });
});
