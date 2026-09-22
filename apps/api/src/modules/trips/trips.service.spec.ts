import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PublicationStatus } from '@prisma/client';
import { TripsService } from './trips.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TripAuthorizationService } from './trip-authorization.service';
import { TripCollaborationEventService } from './trip-collaboration-event.service';

function makePrismaStub() {
  const prisma: any = {
    trip: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn(), findMany: jest.fn() },
    tripDay: { createMany: jest.fn().mockResolvedValue({ count: 0 }), findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn(), update: jest.fn() },
    tripMember: { findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
    user: { findUnique: jest.fn().mockResolvedValue(null) },
    country: { findFirst: jest.fn() },
    region: { findFirst: jest.fn() },
    city: { findFirst: jest.fn() },
    $transaction: jest.fn((arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg as Promise<unknown>[]);
      return (arg as (tx: unknown) => Promise<unknown>)(prisma);
    }),
  };
  return prisma;
}

function makeService(prisma = makePrismaStub()) {
  const audit = { log: jest.fn() };
  // Real TripAuthorizationService wired to the SAME mocked prisma, so the
  // existing owner/non-owner 404-then-403 test behavior below is preserved
  // exactly (G07 delegates authorization to this service - see
  // docs/backend/G07_PRE_IMPLEMENTATION_REPORT.md section 10) rather than
  // being re-mocked away from the real permission-matrix logic.
  const authz = new TripAuthorizationService(prisma as unknown as PrismaService);
  const collaborationEvents = { record: jest.fn() };
  const service = new TripsService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    authz,
    collaborationEvents as unknown as TripCollaborationEventService,
  );
  return { service, prisma, audit };
}

const baseDto = { title: 'Kyoto trip', startDate: '2026-11-01', endDate: '2026-11-05', primaryCurrency: 'jpy' as any };

describe('TripsService.create', () => {
  it('rejects endDate before startDate (spec section 11)', async () => {
    const { service } = makeService();
    await expect(service.create({ ...baseDto, startDate: '2026-11-05', endDate: '2026-11-01' }, 'owner-1')).rejects.toThrow(BadRequestException);
  });

  it('allows a one-day trip where startDate === endDate', async () => {
    const { service, prisma } = makeService();
    prisma.trip.create.mockResolvedValue({ id: 't1' });
    await expect(service.create({ ...baseDto, startDate: '2026-11-01', endDate: '2026-11-01' }, 'owner-1')).resolves.toEqual({ id: 't1' });
  });

  it('defaults travelerCount to 1 when omitted', async () => {
    const { service, prisma } = makeService();
    prisma.trip.create.mockResolvedValue({ id: 't1' });
    await service.create(baseDto, 'owner-1');
    expect(prisma.trip.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ travelerCount: 1 }) }));
  });

  it('404s with COUNTRY_NOT_FOUND when originCountrySlug does not resolve', async () => {
    const { service, prisma } = makeService();
    prisma.country.findFirst.mockResolvedValue(null);
    await expect(service.create({ ...baseDto, originCountrySlug: 'nowhere' }, 'owner-1')).rejects.toThrow(NotFoundException);
    expect(prisma.trip.create).not.toHaveBeenCalled();
  });

  it('resolves a real origin country slug to its id and audits the creation inside the same transaction', async () => {
    const { service, prisma, audit } = makeService();
    prisma.country.findFirst.mockResolvedValue({ id: 'country-1', status: PublicationStatus.PUBLISHED });
    prisma.trip.create.mockResolvedValue({ id: 't1' });

    await service.create({ ...baseDto, originCountrySlug: 'japan' }, 'owner-1');

    expect(prisma.trip.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ originCountryId: 'country-1' }) }));
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'trip.created', entityType: 'TRIP' }), prisma);
  });

  it('materializes one TripDay per calendar day in range (spec section 16)', async () => {
    const { service, prisma } = makeService();
    prisma.trip.create.mockResolvedValue({ id: 't1' });

    await service.create({ ...baseDto, startDate: '2026-11-01', endDate: '2026-11-03' }, 'owner-1');

    expect(prisma.tripDay.createMany).toHaveBeenCalledWith({
      data: [
        { tripId: 't1', date: new Date('2026-11-01'), dayNumber: 1 },
        { tripId: 't1', date: new Date('2026-11-02'), dayNumber: 2 },
        { tripId: 't1', date: new Date('2026-11-03'), dayNumber: 3 },
      ],
    });
  });

  it('materializes exactly one TripDay for a one-day trip', async () => {
    const { service, prisma } = makeService();
    prisma.trip.create.mockResolvedValue({ id: 't1' });

    await service.create({ ...baseDto, startDate: '2026-11-01', endDate: '2026-11-01' }, 'owner-1');

    expect(prisma.tripDay.createMany).toHaveBeenCalledWith({ data: [{ tripId: 't1', date: new Date('2026-11-01'), dayNumber: 1 }] });
  });
});

describe('TripsService.getOwnedOrThrow (ownership - pre-implementation report section 1.6/4.2)', () => {
  it('404s when the trip does not exist at all', async () => {
    const { service, prisma } = makeService();
    prisma.trip.findUnique.mockResolvedValue(null);
    await expect(service.getOwnedOrThrow('t1', 'owner-1')).rejects.toThrow(NotFoundException);
  });

  it('403s when the trip exists but belongs to someone else - existence is never hidden', async () => {
    const { service, prisma } = makeService();
    prisma.trip.findUnique.mockResolvedValue({ id: 't1', ownerId: 'someone-else' });
    await expect(service.getOwnedOrThrow('t1', 'owner-1')).rejects.toThrow(ForbiddenException);
  });

  it('returns the trip when the caller is the owner', async () => {
    const { service, prisma } = makeService();
    prisma.trip.findUnique.mockResolvedValue({ id: 't1', ownerId: 'owner-1' });
    await expect(service.getOwnedOrThrow('t1', 'owner-1')).resolves.toEqual({ id: 't1', ownerId: 'owner-1' });
  });
});

describe('TripsService.update (optimistic concurrency + archive gating)', () => {
  const trip = { id: 't1', ownerId: 'owner-1', version: 3, archivedAt: null, startDate: new Date('2026-11-01'), endDate: new Date('2026-11-05') };

  it('409s with TRIP_VERSION_CONFLICT on a stale expectedVersion (spec section 62, deliberately 409 not 400)', async () => {
    const { service, prisma } = makeService();
    prisma.trip.findUnique.mockResolvedValue(trip);
    await expect(service.update('t1', 'owner-1', { expectedVersion: 1, title: 'x' })).rejects.toThrow(ConflictException);
  });

  it('409s with TRIP_ARCHIVED when the trip is archived - archived trips are read-only', async () => {
    const { service, prisma } = makeService();
    prisma.trip.findUnique.mockResolvedValue({ ...trip, archivedAt: new Date() });
    await expect(service.update('t1', 'owner-1', { expectedVersion: 3, title: 'x' })).rejects.toThrow(ConflictException);
  });

  it('increments version on a successful update, inside the same transaction as the audit write', async () => {
    const { service, prisma, audit } = makeService();
    prisma.trip.findUnique.mockResolvedValue(trip);
    prisma.trip.update.mockResolvedValue({ ...trip, title: 'renamed', version: 4 });

    await service.update('t1', 'owner-1', { expectedVersion: 3, title: 'renamed' });

    expect(prisma.trip.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ version: { increment: 1 } }) }));
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'trip.updated' }), prisma);
  });

  it('does not touch TripDay rows when neither startDate nor endDate is part of the update', async () => {
    const { service, prisma } = makeService();
    prisma.trip.findUnique.mockResolvedValue(trip);
    prisma.trip.update.mockResolvedValue(trip);

    await service.update('t1', 'owner-1', { expectedVersion: 3, title: 'renamed' });

    expect(prisma.tripDay.findMany).not.toHaveBeenCalled();
  });

  it('extending the date range only adds new TripDay rows, never removes existing ones', async () => {
    const { service, prisma } = makeService();
    prisma.trip.findUnique.mockResolvedValue(trip); // 2026-11-01..2026-11-05
    prisma.trip.update.mockResolvedValue({ ...trip, endDate: new Date('2026-11-07') });
    prisma.tripDay.findMany
      .mockResolvedValueOnce([
        { id: 'd1', date: new Date('2026-11-01'), _count: { items: 0 } },
        { id: 'd2', date: new Date('2026-11-02'), _count: { items: 0 } },
        { id: 'd3', date: new Date('2026-11-03'), _count: { items: 0 } },
        { id: 'd4', date: new Date('2026-11-04'), _count: { items: 0 } },
        { id: 'd5', date: new Date('2026-11-05'), _count: { items: 0 } },
      ])
      .mockResolvedValueOnce([
        { id: 'd1', date: new Date('2026-11-01') },
        { id: 'd2', date: new Date('2026-11-02') },
        { id: 'd3', date: new Date('2026-11-03') },
        { id: 'd4', date: new Date('2026-11-04') },
        { id: 'd5', date: new Date('2026-11-05') },
        { id: 'd6', date: new Date('2026-11-06') },
        { id: 'd7', date: new Date('2026-11-07') },
      ]);

    await service.update('t1', 'owner-1', { expectedVersion: 3, endDate: '2026-11-07' });

    expect(prisma.tripDay.deleteMany).not.toHaveBeenCalled();
    expect(prisma.tripDay.createMany).toHaveBeenCalledWith({
      data: [
        { tripId: 't1', date: new Date('2026-11-06'), dayNumber: 0 },
        { tripId: 't1', date: new Date('2026-11-07'), dayNumber: 0 },
      ],
    });
  });

  it('shrinking the date range removes the now-out-of-range empty days', async () => {
    const { service, prisma } = makeService();
    prisma.trip.findUnique.mockResolvedValue(trip); // 2026-11-01..2026-11-05
    prisma.trip.update.mockResolvedValue({ ...trip, endDate: new Date('2026-11-02') });
    prisma.tripDay.findMany
      .mockResolvedValueOnce([
        { id: 'd1', date: new Date('2026-11-01'), _count: { items: 0 } },
        { id: 'd2', date: new Date('2026-11-02'), _count: { items: 0 } },
        { id: 'd3', date: new Date('2026-11-03'), _count: { items: 0 } },
        { id: 'd4', date: new Date('2026-11-04'), _count: { items: 0 } },
        { id: 'd5', date: new Date('2026-11-05'), _count: { items: 0 } },
      ])
      .mockResolvedValueOnce([
        { id: 'd1', date: new Date('2026-11-01') },
        { id: 'd2', date: new Date('2026-11-02') },
      ]);

    await service.update('t1', 'owner-1', { expectedVersion: 3, endDate: '2026-11-02' });

    expect(prisma.tripDay.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['d3', 'd4', 'd5'] } } });
  });

  it('rejects shrinking the date range when a day being removed still has itinerary items - never silently deletes them', async () => {
    const { service, prisma } = makeService();
    prisma.trip.findUnique.mockResolvedValue(trip); // 2026-11-01..2026-11-05
    prisma.tripDay.findMany.mockResolvedValueOnce([
      { id: 'd1', date: new Date('2026-11-01'), _count: { items: 0 } },
      { id: 'd2', date: new Date('2026-11-02'), _count: { items: 0 } },
      { id: 'd5', date: new Date('2026-11-05'), _count: { items: 2 } },
    ]);

    await expect(service.update('t1', 'owner-1', { expectedVersion: 3, endDate: '2026-11-02' })).rejects.toThrow(BadRequestException);
    expect(prisma.tripDay.deleteMany).not.toHaveBeenCalled();
    expect(prisma.trip.update).not.toHaveBeenCalled();
  });
});

describe('TripsService.archive (spec correction - non-destructive archive semantics)', () => {
  const trip = { id: 't1', ownerId: 'owner-1', version: 1, archivedAt: null };

  it('is owner-only (403 for a non-owner, via getOwnedOrThrow)', async () => {
    const { service, prisma } = makeService();
    prisma.trip.findUnique.mockResolvedValue({ ...trip, ownerId: 'someone-else' });
    await expect(service.archive('t1', 'owner-1', { expectedVersion: 1 })).rejects.toThrow(ForbiddenException);
  });

  it('409s on a stale expectedVersion', async () => {
    const { service, prisma } = makeService();
    prisma.trip.findUnique.mockResolvedValue(trip);
    await expect(service.archive('t1', 'owner-1', { expectedVersion: 0 })).rejects.toThrow(ConflictException);
  });

  it('409s if already archived', async () => {
    const { service, prisma } = makeService();
    prisma.trip.findUnique.mockResolvedValue({ ...trip, archivedAt: new Date() });
    await expect(service.archive('t1', 'owner-1', { expectedVersion: 1 })).rejects.toThrow(ConflictException);
  });

  it('sets archivedAt and increments version, audited inside the same transaction', async () => {
    const { service, prisma, audit } = makeService();
    prisma.trip.findUnique.mockResolvedValue(trip);
    prisma.trip.update.mockResolvedValue({ ...trip, archivedAt: new Date(), version: 2 });

    await service.archive('t1', 'owner-1', { expectedVersion: 1 });

    expect(prisma.trip.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ archivedAt: expect.any(Date), version: { increment: 1 } }) }),
    );
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'trip.archived', entityType: 'TRIP', entityId: 't1' }), prisma);
  });
});

describe('TripsService.list (spec correction - excludes archived by default; G07 - OWNED + MEMBER)', () => {
  it('filters by (ownerId OR memberTripIds) and archivedAt: null', async () => {
    const { service, prisma } = makeService();
    prisma.tripMember.findMany.mockResolvedValue([]);
    prisma.trip.count.mockResolvedValue(0);
    prisma.trip.findMany.mockResolvedValue([]);

    await service.list('owner-1', { page: 1, pageSize: 20 });

    expect(prisma.trip.count).toHaveBeenCalledWith({
      where: { archivedAt: null, status: undefined, OR: [{ ownerId: 'owner-1' }, { id: { in: [] } }] },
    });
  });

  it('includes trips where the user has an accepted TripMember row, distinct from owned trips (spec section 12)', async () => {
    const { service, prisma } = makeService();
    prisma.tripMember.findMany.mockResolvedValue([{ tripId: 'member-trip-1' }]);
    prisma.trip.count.mockResolvedValue(2);
    prisma.trip.findMany.mockResolvedValue([
      { id: 't-owned', ownerId: 'owner-1' },
      { id: 'member-trip-1', ownerId: 'someone-else' },
    ]);

    const result = await service.list('owner-1', { page: 1, pageSize: 20 });

    expect(prisma.trip.count).toHaveBeenCalledWith({
      where: { archivedAt: null, status: undefined, OR: [{ ownerId: 'owner-1' }, { id: { in: ['member-trip-1'] } }] },
    });
    expect(result.items).toEqual([
      { id: 't-owned', ownerId: 'owner-1', relationship: 'OWNED' },
      { id: 'member-trip-1', ownerId: 'someone-else', relationship: 'MEMBER' },
    ]);
  });
});
