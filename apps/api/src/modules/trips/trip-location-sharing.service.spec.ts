import { ConfigService } from '@nestjs/config';
import { TripLocationSharingService } from './trip-location-sharing.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TripAuthorizationService } from './trip-authorization.service';
import { TripCollaborationEventService } from './trip-collaboration-event.service';
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
    $executeRaw: jest.fn().mockResolvedValue(0),
    tripLocationSharing: {
      update: jest.fn((args) => ({ id: 'sharing-1', tripId: 't1', userId: 'u1', ...args.data })),
      create: jest.fn((args) => ({ id: 'sharing-1', ...args.data })),
      findUnique: jest.fn().mockResolvedValue(null),
      findUniqueOrThrow: jest.fn(),
    },
    tripMemberLocation: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }), findUnique: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn((arg: unknown) => (typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as Promise<unknown>[]))),
  };
  const audit = { log: jest.fn() } as unknown as AuditService;
  const authz = { authorize: jest.fn().mockResolvedValue({ trip: { id: 't1', ownerId: 'owner-1', archivedAt: null }, role: 'EDITOR' }) } as unknown as TripAuthorizationService;
  const collaborationEvents = { record: jest.fn() } as unknown as TripCollaborationEventService;
  const config = { get: jest.fn().mockReturnValue(TRIP_LOCATION_SETTINGS) } as unknown as ConfigService<AppConfig, true>;
  const service = new TripLocationSharingService(prisma as unknown as PrismaService, audit, authz, collaborationEvents, config);
  return { service, prisma, audit, authz, collaborationEvents };
}

describe('TripLocationSharingService.start (spec sections 6-8, 56, 63)', () => {
  it('rejects on an archived trip - location sharing can never be started on a read-only trip', async () => {
    const { service, authz } = makeHarness();
    (authz.authorize as jest.Mock).mockResolvedValue({ trip: { id: 't1', ownerId: 'owner-1', archivedAt: new Date() }, role: 'EDITOR' });
    await expect(service.start('t1', 'u1', { durationMinutes: 60 })).rejects.toMatchObject({ response: { code: 'TRIP_ARCHIVED' } });
  });

  it('rejects a duration below the configured minimum', async () => {
    const { service } = makeHarness();
    await expect(service.start('t1', 'u1', { durationMinutes: 1 })).rejects.toMatchObject({ response: { code: 'TRIP_LOCATION_INVALID' } });
  });

  it('rejects a duration above the configured maximum - never silently clamped', async () => {
    const { service } = makeHarness();
    await expect(service.start('t1', 'u1', { durationMinutes: 10_000 })).rejects.toMatchObject({ response: { code: 'TRIP_LOCATION_INVALID' } });
  });

  it('creates a new ACTIVE session when none existed, audits and records collaboration activity', async () => {
    const { service, prisma, audit, collaborationEvents } = makeHarness();
    prisma.$queryRaw.mockResolvedValue([]); // no existing row

    const result = await service.start('t1', 'u1', { durationMinutes: 60 });

    expect(prisma.tripLocationSharing.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tripId: 't1', userId: 'u1', status: 'ACTIVE' }) }),
    );
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ actorId: 'u1', action: 'tripLocationSharing.started' }), prisma);
    expect(collaborationEvents.record).toHaveBeenCalledWith(expect.objectContaining({ tripId: 't1', type: 'LOCATION_SHARING_STARTED', actorUserId: 'u1' }), prisma);
    expect(result.status).toBe('ACTIVE');
  });

  it('rejects starting a new session while a currently-ACTIVE-and-unexpired one exists (never a silent extension)', async () => {
    const { service, prisma } = makeHarness();
    prisma.$queryRaw.mockResolvedValue([{ id: 'sharing-1', status: 'ACTIVE', expiresAt: new Date(Date.now() + 60_000) }]);
    await expect(service.start('t1', 'u1', { durationMinutes: 60 })).rejects.toMatchObject({ response: { code: 'TRIP_LOCATION_SHARING_ALREADY_ACTIVE' } });
    expect(prisma.tripLocationSharing.update).not.toHaveBeenCalled();
    expect(prisma.tripLocationSharing.create).not.toHaveBeenCalled();
  });

  it('reactivates the same row (never inserts a second one) when the prior session already expired', async () => {
    const { service, prisma } = makeHarness();
    prisma.$queryRaw.mockResolvedValue([{ id: 'sharing-1', status: 'ACTIVE', expiresAt: new Date(Date.now() - 60_000) }]);
    await service.start('t1', 'u1', { durationMinutes: 60 });
    expect(prisma.tripLocationSharing.update).toHaveBeenCalledWith({
      where: { id: 'sharing-1' },
      data: expect.objectContaining({ status: 'ACTIVE', stoppedAt: null }),
    });
    expect(prisma.tripLocationSharing.create).not.toHaveBeenCalled();
  });

  it('reactivates a STOPPED row in place - no session history row is ever inserted', async () => {
    const { service, prisma } = makeHarness();
    prisma.$queryRaw.mockResolvedValue([{ id: 'sharing-1', status: 'STOPPED', expiresAt: new Date(Date.now() - 1000) }]);
    await service.start('t1', 'u1', { durationMinutes: 30 });
    expect(prisma.tripLocationSharing.update).toHaveBeenCalledWith({ where: { id: 'sharing-1' }, data: expect.objectContaining({ status: 'ACTIVE' }) });
  });
});

describe('TripLocationSharingService.stop (spec sections 9, 71)', () => {
  it('rejects when no session is currently ACTIVE', async () => {
    const { service, prisma } = makeHarness();
    prisma.$executeRaw.mockResolvedValue(0);
    await expect(service.stop('t1', 'u1')).rejects.toMatchObject({ response: { code: 'TRIP_LOCATION_SHARING_NOT_ACTIVE' } });
    expect(prisma.tripMemberLocation.deleteMany).not.toHaveBeenCalled();
  });

  it('on success: stops the session, deletes the latest-location row in the SAME transaction, audits, records collaboration activity', async () => {
    const { service, prisma, audit, collaborationEvents } = makeHarness();
    prisma.$executeRaw.mockResolvedValue(1);
    prisma.tripLocationSharing.findUniqueOrThrow.mockResolvedValue({ id: 'sharing-1', status: 'STOPPED', startedAt: new Date(), expiresAt: new Date(), stoppedAt: new Date() });

    const result = await service.stop('t1', 'u1');

    expect(prisma.tripMemberLocation.deleteMany).toHaveBeenCalledWith({ where: { tripId: 't1', userId: 'u1' } });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'tripLocationSharing.stopped', entityId: 'sharing-1' }), prisma);
    expect(collaborationEvents.record).toHaveBeenCalledWith(expect.objectContaining({ type: 'LOCATION_SHARING_STOPPED' }), prisma);
    expect(result.status).toBe('STOPPED');
    expect(result.locationAvailability).toBe('UNAVAILABLE');
  });
});

describe('TripLocationSharingService.me (spec section 26 - safe self-inspection)', () => {
  it('reports NEVER_SHARED when no consent row exists at all', async () => {
    const { service } = makeHarness();
    const result = await service.me('t1', 'u1');
    expect(result).toEqual({ status: 'NEVER_SHARED', startedAt: null, expiresAt: null, stoppedAt: null, locationAvailability: 'UNAVAILABLE' });
  });

  it('reports ACTIVE + FRESH for a live, recently-updated location', async () => {
    const { service, prisma } = makeHarness();
    const now = Date.now();
    (prisma.tripLocationSharing.findUnique as jest.Mock).mockResolvedValue({ id: 's1', status: 'ACTIVE', startedAt: new Date(now - 1000), expiresAt: new Date(now + 60_000), stoppedAt: null });
    (prisma.tripMemberLocation.findUnique as jest.Mock).mockResolvedValue({ capturedAt: new Date(now - 5000), expiresAt: new Date(now + 60_000) });

    const result = await service.me('t1', 'u1');
    expect(result.status).toBe('ACTIVE');
    expect(result.locationAvailability).toBe('FRESH');
  });

  it('derives EXPIRED at read time even if the stored status column is still ACTIVE (spec section 55 - no lazy DB write required)', async () => {
    const { service, prisma } = makeHarness();
    const now = Date.now();
    (prisma.tripLocationSharing.findUnique as jest.Mock).mockResolvedValue({ id: 's1', status: 'ACTIVE', startedAt: new Date(now - 100_000), expiresAt: new Date(now - 1000), stoppedAt: null });

    const result = await service.me('t1', 'u1');
    expect(result.status).toBe('EXPIRED');
    expect(result.locationAvailability).toBe('UNAVAILABLE');
  });
});
