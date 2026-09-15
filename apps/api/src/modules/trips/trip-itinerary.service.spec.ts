import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PublicationStatus, TripItemType } from '@prisma/client';
import { TripItineraryService } from './trip-itinerary.service';
import { TripsService } from './trips.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const trip = { id: 't1', ownerId: 'owner-1', version: 2, archivedAt: null, startDate: new Date('2026-11-01'), endDate: new Date('2026-11-05') };

function makePrismaStub() {
  const prisma: any = {
    destination: { findFirst: jest.fn() },
    accommodation: { findFirst: jest.fn() },
    restaurant: { findFirst: jest.fn() },
    activity: { findFirst: jest.fn() },
    attraction: { findFirst: jest.fn() },
    place: { findFirst: jest.fn() },
    tripDay: { findFirst: jest.fn() },
    tripTransportLeg: { findFirst: jest.fn(), deleteMany: jest.fn(), createMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    tripDestination: { deleteMany: jest.fn(), createMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    tripItem: { deleteMany: jest.fn(), createMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn(), count: jest.fn().mockResolvedValue(0) },
    trip: { update: jest.fn() },
    $transaction: jest.fn((arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg as Promise<unknown>[]);
      return (arg as (tx: unknown) => Promise<unknown>)(prisma);
    }),
  };
  return prisma;
}

function makeService(prisma = makePrismaStub()) {
  const audit = { log: jest.fn() };
  const tripsService = { getOwnedOrThrow: jest.fn().mockResolvedValue(trip), assertMutable: jest.fn() };
  const service = new TripItineraryService(prisma as unknown as PrismaService, audit as unknown as AuditService, tripsService as unknown as TripsService);
  return { service, prisma, audit, tripsService };
}

describe('TripItineraryService.replaceDestinations', () => {
  it('calls trips.assertMutable so archive/version gating is enforced exactly once, not duplicated', async () => {
    const { service, tripsService } = makeService();
    tripsService.assertMutable.mockImplementation(() => {
      throw new ConflictException('archived');
    });
    await expect(service.replaceDestinations('t1', 'owner-1', { expectedVersion: 2, destinations: [] })).rejects.toThrow(ConflictException);
  });

  it('404s with DESTINATION_NOT_FOUND for an unresolvable slug', async () => {
    const { service, prisma } = makeService();
    prisma.destination.findFirst.mockResolvedValue(null);
    await expect(
      service.replaceDestinations('t1', 'owner-1', { expectedVersion: 2, destinations: [{ destinationSlug: 'nowhere' }] }),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects an arrivalDate/departureDate pair outside the trip range', async () => {
    const { service, prisma } = makeService();
    prisma.destination.findFirst.mockResolvedValue({ id: 'dest-1' });
    await expect(
      service.replaceDestinations('t1', 'owner-1', { expectedVersion: 2, destinations: [{ destinationSlug: 'gion', arrivalDate: '2026-10-01' }] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects departureDate before arrivalDate', async () => {
    const { service, prisma } = makeService();
    prisma.destination.findFirst.mockResolvedValue({ id: 'dest-1' });
    await expect(
      service.replaceDestinations('t1', 'owner-1', {
        expectedVersion: 2,
        destinations: [{ destinationSlug: 'gion', arrivalDate: '2026-11-03', departureDate: '2026-11-02' }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('replaces the full set transactionally, assigning sortOrder by array position, and bumps Trip.version', async () => {
    const { service, prisma, audit } = makeService();
    prisma.destination.findFirst.mockResolvedValueOnce({ id: 'dest-a' }).mockResolvedValueOnce({ id: 'dest-b' });

    await service.replaceDestinations('t1', 'owner-1', {
      expectedVersion: 2,
      destinations: [{ destinationSlug: 'a' }, { destinationSlug: 'b', notes: 'second stop' }],
    });

    expect(prisma.tripDestination.deleteMany).toHaveBeenCalledWith({ where: { tripId: 't1' } });
    expect(prisma.tripDestination.createMany).toHaveBeenCalledWith({
      data: [
        { tripId: 't1', destinationId: 'dest-a', sortOrder: 0, arrivalDate: null, departureDate: null, notes: undefined },
        { tripId: 't1', destinationId: 'dest-b', sortOrder: 1, arrivalDate: null, departureDate: null, notes: 'second stop' },
      ],
    });
    expect(prisma.trip.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { version: { increment: 1 } } });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'trip.destinations.replaced' }), prisma);
  });

  it('clearing the destination list (empty array) deletes without recreating', async () => {
    const { service, prisma } = makeService();
    await service.replaceDestinations('t1', 'owner-1', { expectedVersion: 2, destinations: [] });
    expect(prisma.tripDestination.deleteMany).toHaveBeenCalled();
    expect(prisma.tripDestination.createMany).not.toHaveBeenCalled();
  });
});

describe('TripItineraryService.replaceDayItems - target integrity (spec section 17/18)', () => {
  it('404s with TRIP_DAY_NOT_FOUND when the day does not belong to this trip', async () => {
    const { service, prisma } = makeService();
    prisma.tripDay.findFirst.mockResolvedValue(null);
    await expect(service.replaceDayItems('t1', 'day-x', 'owner-1', { expectedVersion: 2, items: [] })).rejects.toThrow(NotFoundException);
  });

  it('rejects an ACCOMMODATION item with no accommodationSlug', async () => {
    const { service, prisma } = makeService();
    prisma.tripDay.findFirst.mockResolvedValue({ id: 'day-1', tripId: 't1' });
    await expect(
      service.replaceDayItems('t1', 'day-1', 'owner-1', { expectedVersion: 2, items: [{ type: TripItemType.ACCOMMODATION }] as any }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects an item that sets two canonical target fields at once', async () => {
    const { service, prisma } = makeService();
    prisma.tripDay.findFirst.mockResolvedValue({ id: 'day-1', tripId: 't1' });
    await expect(
      service.replaceDayItems('t1', 'day-1', 'owner-1', {
        expectedVersion: 2,
        items: [{ type: TripItemType.ACCOMMODATION, accommodationSlug: 'a', restaurantSlug: 'b' } as any],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a CUSTOM item that sets a canonical target field', async () => {
    const { service, prisma } = makeService();
    prisma.tripDay.findFirst.mockResolvedValue({ id: 'day-1', tripId: 't1' });
    await expect(
      service.replaceDayItems('t1', 'day-1', 'owner-1', { expectedVersion: 2, items: [{ type: TripItemType.CUSTOM, placeSlug: 'x', title: 'x' } as any] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a CUSTOM item with no title', async () => {
    const { service, prisma } = makeService();
    prisma.tripDay.findFirst.mockResolvedValue({ id: 'day-1', tripId: 't1' });
    await expect(service.replaceDayItems('t1', 'day-1', 'owner-1', { expectedVersion: 2, items: [{ type: TripItemType.CUSTOM } as any] })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('accepts a valid CUSTOM item with only a title', async () => {
    const { service, prisma } = makeService();
    prisma.tripDay.findFirst.mockResolvedValue({ id: 'day-1', tripId: 't1' });
    await expect(
      service.replaceDayItems('t1', 'day-1', 'owner-1', { expectedVersion: 2, items: [{ type: TripItemType.CUSTOM, title: 'Free time' } as any] }),
    ).resolves.toBeDefined();
    expect(prisma.tripItem.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ type: TripItemType.CUSTOM, title: 'Free time', sortOrder: 0, allDay: false }),
      ],
    });
  });

  it('404s with the type-specific not-found code when the canonical slug does not resolve', async () => {
    const { service, prisma } = makeService();
    prisma.tripDay.findFirst.mockResolvedValue({ id: 'day-1', tripId: 't1' });
    prisma.accommodation.findFirst.mockResolvedValue(null);
    await expect(
      service.replaceDayItems('t1', 'day-1', 'owner-1', { expectedVersion: 2, items: [{ type: TripItemType.ACCOMMODATION, accommodationSlug: 'nowhere' } as any] }),
    ).rejects.toThrow(NotFoundException);
  });

  it('a TRANSPORT item must reference a TripTransportLeg belonging to THIS trip', async () => {
    const { service, prisma } = makeService();
    prisma.tripDay.findFirst.mockResolvedValue({ id: 'day-1', tripId: 't1' });
    prisma.tripTransportLeg.findFirst.mockResolvedValue(null);

    await expect(
      service.replaceDayItems('t1', 'day-1', 'owner-1', { expectedVersion: 2, items: [{ type: TripItemType.TRANSPORT, transportLegId: 'leg-from-another-trip' } as any] }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.tripTransportLeg.findFirst).toHaveBeenCalledWith({ where: { id: 'leg-from-another-trip', tripId: 't1' } });
  });

  it('resolves a PUBLISHED activity and creates the item with activityId set, sortOrder by position, inside one transaction', async () => {
    const { service, prisma, audit } = makeService();
    prisma.tripDay.findFirst.mockResolvedValue({ id: 'day-1', tripId: 't1' });
    prisma.activity.findFirst.mockResolvedValue({ id: 'activity-1', status: PublicationStatus.PUBLISHED });

    await service.replaceDayItems('t1', 'day-1', 'owner-1', {
      expectedVersion: 2,
      items: [{ type: TripItemType.ACTIVITY, activitySlug: 'tea-ceremony', startLocalTime: '09:00' } as any],
    });

    expect(prisma.tripItem.deleteMany).toHaveBeenCalledWith({ where: { tripDayId: 'day-1' } });
    expect(prisma.tripItem.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ tripId: 't1', tripDayId: 'day-1', type: TripItemType.ACTIVITY, activityId: 'activity-1', sortOrder: 0, startLocalTime: '09:00' })],
    });
    expect(prisma.trip.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { version: { increment: 1 } } });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'trip.day.items.replaced' }), prisma);
  });
});

describe('TripItineraryService.reorderDayItems (spec section 20 - reorder-only, two-phase write)', () => {
  it('404s with TRIP_DAY_NOT_FOUND when the day does not belong to this trip', async () => {
    const { service, prisma } = makeService();
    prisma.tripDay.findFirst.mockResolvedValue(null);
    await expect(service.reorderDayItems('t1', 'day-x', 'owner-1', { expectedVersion: 2, itemIds: [] })).rejects.toThrow(NotFoundException);
  });

  it('rejects a reorder list missing an existing item', async () => {
    const { service, prisma } = makeService();
    prisma.tripDay.findFirst.mockResolvedValue({ id: 'day-1', tripId: 't1' });
    prisma.tripItem.findMany.mockResolvedValue([{ id: 'i1' }, { id: 'i2' }]);
    await expect(service.reorderDayItems('t1', 'day-1', 'owner-1', { expectedVersion: 2, itemIds: ['i1'] })).rejects.toThrow(BadRequestException);
  });

  it('rejects a reorder list containing an id from a different day', async () => {
    const { service, prisma } = makeService();
    prisma.tripDay.findFirst.mockResolvedValue({ id: 'day-1', tripId: 't1' });
    prisma.tripItem.findMany.mockResolvedValue([{ id: 'i1' }, { id: 'i2' }]);
    await expect(service.reorderDayItems('t1', 'day-1', 'owner-1', { expectedVersion: 2, itemIds: ['i1', 'i3'] })).rejects.toThrow(BadRequestException);
  });

  it('applies a two-phase write: every id first to a unique negative sortOrder, then to its final position', async () => {
    const { service, prisma, audit } = makeService();
    prisma.tripDay.findFirst.mockResolvedValue({ id: 'day-1', tripId: 't1' });
    prisma.tripItem.findMany.mockResolvedValueOnce([{ id: 'i1' }, { id: 'i2' }]).mockResolvedValueOnce([{ id: 'i2', sortOrder: 0 }, { id: 'i1', sortOrder: 1 }]);

    await service.reorderDayItems('t1', 'day-1', 'owner-1', { expectedVersion: 2, itemIds: ['i2', 'i1'] });

    expect(prisma.tripItem.update).toHaveBeenCalledWith({ where: { id: 'i2' }, data: { sortOrder: -1 } });
    expect(prisma.tripItem.update).toHaveBeenCalledWith({ where: { id: 'i1' }, data: { sortOrder: -2 } });
    expect(prisma.tripItem.update).toHaveBeenCalledWith({ where: { id: 'i2' }, data: { sortOrder: 0 } });
    expect(prisma.tripItem.update).toHaveBeenCalledWith({ where: { id: 'i1' }, data: { sortOrder: 1 } });
    expect(prisma.trip.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { version: { increment: 1 } } });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'trip.day.items.reordered' }), prisma);
  });
});

describe('TripItineraryService.replaceTransportLegs', () => {
  it('rejects the replace if a TRANSPORT item still references an existing leg (never silently orphans it)', async () => {
    const { service, prisma } = makeService();
    prisma.tripItem.count.mockResolvedValue(1);
    await expect(service.replaceTransportLegs('t1', 'owner-1', { expectedVersion: 2, transportLegs: [] })).rejects.toThrow(BadRequestException);
    expect(prisma.tripTransportLeg.deleteMany).not.toHaveBeenCalled();
  });

  it('404s with DESTINATION_NOT_FOUND for an unresolvable fromDestinationSlug', async () => {
    const { service, prisma } = makeService();
    prisma.destination.findFirst.mockResolvedValue(null);
    await expect(
      service.replaceTransportLegs('t1', 'owner-1', {
        expectedVersion: 2,
        transportLegs: [{ mode: 'TRAIN', fromLabel: 'Tokyo', toLabel: 'Kyoto', fromDestinationSlug: 'nowhere' } as any],
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects a plannedDate outside the trip range', async () => {
    const { service } = makeService();
    await expect(
      service.replaceTransportLegs('t1', 'owner-1', {
        expectedVersion: 2,
        transportLegs: [{ mode: 'TRAIN', fromLabel: 'Tokyo', toLabel: 'Kyoto', plannedDate: '2026-12-01' } as any],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('replaces legs transactionally, sets provenance USER_INPUT when a plannedAmount is given (else UNKNOWN), and bumps Trip.version', async () => {
    const { service, prisma, audit } = makeService();

    await service.replaceTransportLegs('t1', 'owner-1', {
      expectedVersion: 2,
      transportLegs: [
        { mode: 'TRAIN', fromLabel: 'Tokyo', toLabel: 'Kyoto', plannedAmount: '13000', plannedCurrency: 'JPY' } as any,
        { mode: 'WALK', fromLabel: 'Kyoto Station', toLabel: 'Gion' } as any,
      ],
    });

    expect(prisma.tripTransportLeg.deleteMany).toHaveBeenCalledWith({ where: { tripId: 't1' } });
    expect(prisma.tripTransportLeg.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ mode: 'TRAIN', sortOrder: 0, provenance: 'USER_INPUT', plannedAmount: '13000' }),
        expect.objectContaining({ mode: 'WALK', sortOrder: 1, provenance: 'UNKNOWN' }),
      ],
    });
    expect(prisma.trip.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { version: { increment: 1 } } });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'trip.transportLegs.replaced' }), prisma);
  });
});
