import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PublicationStatus, TripItemType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TripsService } from './trips.service';
import { TripCapability } from './trip-authorization.service';
import { TRIP_ERROR_CODES } from '../../common/errors/trip-error-codes';
import { GEOGRAPHY_ERROR_CODES } from '../../common/errors/geography-error-codes';
import { STAY_FOOD_ACTIVITY_ERROR_CODES } from '../../common/errors/stay-food-activity-error-codes';
import { ReorderTripDayItemsDto, ReplaceTripDayItemsDto, ReplaceTripDestinationsDto, ReplaceTripTransportLegsDto, TripItemInputDto } from './dto/trip.dto';

/** Which slug field on `TripItemInputDto` is required for each `TripItemType`, and which Trip error code to raise if it's missing. */
const REQUIRED_TARGET_FIELD: Partial<Record<TripItemType, keyof TripItemInputDto>> = {
  ACCOMMODATION: 'accommodationSlug',
  RESTAURANT: 'restaurantSlug',
  ACTIVITY: 'activitySlug',
  ATTRACTION: 'attractionSlug',
  PLACE: 'placeSlug',
  TRANSPORT: 'transportLegId',
};

const ALL_TARGET_FIELDS: (keyof TripItemInputDto)[] = ['accommodationSlug', 'restaurantSlug', 'activitySlug', 'attractionSlug', 'placeSlug', 'transportLegId'];

/**
 * Itinerary sub-resources (`TripDestination`/`TripDay`/`TripItem`) - split
 * out from `TripsService` to keep that file focused on the aggregate root
 * itself (pre-implementation report section 6). Every mutation here follows
 * the same "delete-then-recreate in one `$transaction`" replace-all idiom
 * `DestinationCollectionsService.setMembers` already established, and
 * ownership/archive/version gating is delegated to `TripsService` rather
 * than duplicated.
 */
@Injectable()
export class TripItineraryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly trips: TripsService,
  ) {}

  /** Loads and authorizes the trip (EDIT_TRIP - owner or EDITOR, never a plain VIEWER, spec section 33), then asserts it is neither archived nor stale-versioned - the one guard every itinerary mutation below shares. */
  private async loadMutableTrip(tripId: string, userId: string, expectedVersion: number) {
    const trip = await this.trips.getOwnedOrThrow(tripId, userId, TripCapability.EDIT_TRIP);
    this.trips.assertMutable(trip, expectedVersion);
    return trip;
  }

  async replaceDestinations(tripId: string, ownerId: string, dto: ReplaceTripDestinationsDto) {
    const trip = await this.loadMutableTrip(tripId, ownerId, dto.expectedVersion);

    const resolved = await Promise.all(
      dto.destinations.map(async (input) => {
        const destination = await this.prisma.destination.findFirst({
          where: { status: PublicationStatus.PUBLISHED, OR: [{ canonicalSlug: input.destinationSlug }, { id: input.destinationSlug }] },
        });
        if (!destination) throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.DESTINATION_NOT_FOUND, message: `Destination not found: ${input.destinationSlug}` });

        if (input.arrivalDate && input.departureDate && input.departureDate < input.arrivalDate) {
          throw new BadRequestException({ code: TRIP_ERROR_CODES.TRIP_DESTINATION_INVALID_DATE_RANGE, message: 'departureDate must be on or after arrivalDate.' });
        }
        const tripStart = trip.startDate.toISOString().slice(0, 10);
        const tripEnd = trip.endDate.toISOString().slice(0, 10);
        for (const date of [input.arrivalDate, input.departureDate]) {
          if (date && (date < tripStart || date > tripEnd)) {
            throw new BadRequestException({ code: TRIP_ERROR_CODES.TRIP_DESTINATION_OUT_OF_TRIP_RANGE, message: `${date} falls outside the trip's ${tripStart}..${tripEnd} range.` });
          }
        }

        return { destinationId: destination.id, arrivalDate: input.arrivalDate, departureDate: input.departureDate, notes: input.notes };
      }),
    );

    return this.prisma.$transaction(async (tx) => {
      await tx.tripDestination.deleteMany({ where: { tripId } });
      if (resolved.length > 0) {
        await tx.tripDestination.createMany({
          data: resolved.map((r, index) => ({
            tripId,
            destinationId: r.destinationId,
            sortOrder: index,
            arrivalDate: r.arrivalDate ? new Date(r.arrivalDate) : null,
            departureDate: r.departureDate ? new Date(r.departureDate) : null,
            notes: r.notes,
          })),
        });
      }
      await tx.trip.update({ where: { id: tripId }, data: { version: { increment: 1 } } });
      await this.audit.log({ actorId: ownerId, action: 'trip.destinations.replaced', entityType: 'TRIP', entityId: tripId, metadata: { count: resolved.length } }, tx);
      return tx.tripDestination.findMany({ where: { tripId }, orderBy: { sortOrder: 'asc' } });
    });
  }

  /** Exactly one canonical target field must be set, consistent with `type` (spec section 17/18) - CUSTOM sets none of them and requires `title` instead. */
  private assertTargetIntegrity(item: TripItemInputDto) {
    const setFields = ALL_TARGET_FIELDS.filter((field) => item[field] !== undefined);

    if (item.type === TripItemType.CUSTOM) {
      if (setFields.length > 0) {
        throw new BadRequestException({ code: TRIP_ERROR_CODES.TRIP_ITEM_TARGET_MISMATCH, message: 'A CUSTOM item must not set any canonical target field.' });
      }
      if (!item.title) {
        throw new BadRequestException({ code: TRIP_ERROR_CODES.TRIP_ITEM_TARGET_REQUIRED, message: 'A CUSTOM item requires a title.' });
      }
      return;
    }

    const requiredField = REQUIRED_TARGET_FIELD[item.type];
    if (setFields.length === 0 || !requiredField || item[requiredField] === undefined) {
      throw new BadRequestException({ code: TRIP_ERROR_CODES.TRIP_ITEM_TARGET_REQUIRED, message: `A ${item.type} item requires ${requiredField}.` });
    }
    if (setFields.length > 1 || setFields[0] !== requiredField) {
      throw new BadRequestException({ code: TRIP_ERROR_CODES.TRIP_ITEM_TARGET_MISMATCH, message: `A ${item.type} item must set exactly ${requiredField} and no other target field.` });
    }
  }

  /** Resolves one item's canonical slug to its id (published-only), or its TripTransportLeg id (must belong to this trip). Throws the type-appropriate 404 if unresolvable. */
  private async resolveTarget(tripId: string, item: TripItemInputDto) {
    switch (item.type) {
      case TripItemType.ACCOMMODATION: {
        const row = await this.prisma.accommodation.findFirst({ where: { status: PublicationStatus.PUBLISHED, OR: [{ canonicalSlug: item.accommodationSlug }, { id: item.accommodationSlug }] } });
        if (!row) throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.ACCOMMODATION_NOT_FOUND, message: `Accommodation not found: ${item.accommodationSlug}` });
        return { accommodationId: row.id };
      }
      case TripItemType.RESTAURANT: {
        const row = await this.prisma.restaurant.findFirst({ where: { status: PublicationStatus.PUBLISHED, OR: [{ canonicalSlug: item.restaurantSlug }, { id: item.restaurantSlug }] } });
        if (!row) throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.RESTAURANT_NOT_FOUND, message: `Restaurant not found: ${item.restaurantSlug}` });
        return { restaurantId: row.id };
      }
      case TripItemType.ACTIVITY: {
        const row = await this.prisma.activity.findFirst({ where: { status: PublicationStatus.PUBLISHED, OR: [{ canonicalSlug: item.activitySlug }, { id: item.activitySlug }] } });
        if (!row) throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.ACTIVITY_NOT_FOUND, message: `Activity not found: ${item.activitySlug}` });
        return { activityId: row.id };
      }
      case TripItemType.ATTRACTION: {
        const row = await this.prisma.attraction.findFirst({ where: { status: PublicationStatus.PUBLISHED, OR: [{ canonicalSlug: item.attractionSlug }, { id: item.attractionSlug }] } });
        if (!row) throw new NotFoundException({ code: STAY_FOOD_ACTIVITY_ERROR_CODES.ATTRACTION_NOT_FOUND, message: `Attraction not found: ${item.attractionSlug}` });
        return { attractionId: row.id };
      }
      case TripItemType.PLACE: {
        const row = await this.prisma.place.findFirst({ where: { publicationStatus: PublicationStatus.PUBLISHED, OR: [{ canonicalSlug: item.placeSlug }, { id: item.placeSlug }] } });
        if (!row) throw new NotFoundException({ code: TRIP_ERROR_CODES.TRIP_ITEM_PLACE_NOT_FOUND, message: `Place not found: ${item.placeSlug}` });
        return { placeId: row.id };
      }
      case TripItemType.TRANSPORT: {
        const row = await this.prisma.tripTransportLeg.findFirst({ where: { id: item.transportLegId, tripId } });
        if (!row) throw new NotFoundException({ code: TRIP_ERROR_CODES.TRIP_TRANSPORT_LEG_NOT_FOUND, message: `Transport leg not found on this trip: ${item.transportLegId}` });
        return { transportLegId: row.id };
      }
      case TripItemType.CUSTOM:
      default:
        return {};
    }
  }

  async replaceDayItems(tripId: string, dayId: string, ownerId: string, dto: ReplaceTripDayItemsDto) {
    await this.loadMutableTrip(tripId, ownerId, dto.expectedVersion);

    const day = await this.prisma.tripDay.findFirst({ where: { id: dayId, tripId } });
    if (!day) throw new NotFoundException({ code: TRIP_ERROR_CODES.TRIP_DAY_NOT_FOUND, message: 'Trip day not found.' });

    dto.items.forEach((item) => this.assertTargetIntegrity(item));
    const resolvedTargets = await Promise.all(dto.items.map((item) => this.resolveTarget(tripId, item)));

    return this.prisma.$transaction(async (tx) => {
      await tx.tripItem.deleteMany({ where: { tripDayId: dayId } });
      if (dto.items.length > 0) {
        await tx.tripItem.createMany({
          data: dto.items.map((item, index) => ({
            tripId,
            tripDayId: dayId,
            type: item.type,
            sortOrder: index,
            ...resolvedTargets[index],
            title: item.title,
            notes: item.notes,
            startLocalTime: item.startLocalTime,
            endLocalTime: item.endLocalTime,
            allDay: item.allDay ?? false,
            plannedAmount: item.plannedAmount,
            plannedCurrency: item.plannedCurrency,
          })),
        });
      }
      await tx.trip.update({ where: { id: tripId }, data: { version: { increment: 1 } } });
      await this.audit.log({ actorId: ownerId, action: 'trip.day.items.replaced', entityType: 'TRIP', entityId: tripId, metadata: { dayId, count: dto.items.length } }, tx);
      return tx.tripItem.findMany({ where: { tripDayId: dayId }, orderBy: { sortOrder: 'asc' } });
    });
  }

  /**
   * Reorder-only (spec section 20) - no other TripItem field changes.
   * Requires every existing item id for the day exactly once, then applies
   * the exact same two-phase negative-placeholder-then-final write
   * `JourneysService.reorderStops` already established, to never transiently
   * violate `@@unique([tripDayId, sortOrder])`.
   */
  async reorderDayItems(tripId: string, dayId: string, ownerId: string, dto: ReorderTripDayItemsDto) {
    await this.loadMutableTrip(tripId, ownerId, dto.expectedVersion);

    const day = await this.prisma.tripDay.findFirst({ where: { id: dayId, tripId } });
    if (!day) throw new NotFoundException({ code: TRIP_ERROR_CODES.TRIP_DAY_NOT_FOUND, message: 'Trip day not found.' });

    const items = await this.prisma.tripItem.findMany({ where: { tripDayId: dayId } });
    if (items.length !== dto.itemIds.length || !items.every((item) => dto.itemIds.includes(item.id))) {
      throw new BadRequestException({
        code: TRIP_ERROR_CODES.TRIP_ITEM_REORDER_INVALID,
        message: 'Reorder must include every existing item for this day exactly once.',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await Promise.all(dto.itemIds.map((id, index) => tx.tripItem.update({ where: { id }, data: { sortOrder: -(index + 1) } })));
      await Promise.all(dto.itemIds.map((id, index) => tx.tripItem.update({ where: { id }, data: { sortOrder: index } })));
      await tx.trip.update({ where: { id: tripId }, data: { version: { increment: 1 } } });
      await this.audit.log({ actorId: ownerId, action: 'trip.day.items.reordered', entityType: 'TRIP', entityId: tripId, metadata: { dayId } }, tx);
    });

    return this.prisma.tripItem.findMany({ where: { tripDayId: dayId }, orderBy: { sortOrder: 'asc' } });
  }

  /**
   * Replacing legs is delete-then-recreate (same idiom as destinations), so
   * every existing leg id changes. `TripItem.transportLegId` has
   * `onDelete: SetNull` - if any TRANSPORT-type item still referenced one of
   * the legs being deleted, it would silently end up with `type: TRANSPORT`
   * but `transportLegId: null`, an inconsistent row nothing downstream
   * (cost engine included) could safely interpret. Rather than allow that,
   * this rejects the whole replace and asks the owner to remove those items
   * first - the same "never silently orphan/destroy" discipline as
   * `TripsService.reconcileDays`'s day-shrink protection.
   */
  private async assertNoTransportLegsInUse(tripId: string) {
    const inUse = await this.prisma.tripItem.count({ where: { tripId, type: TripItemType.TRANSPORT, transportLegId: { not: null } } });
    if (inUse > 0) {
      throw new BadRequestException({
        code: TRIP_ERROR_CODES.TRIP_TRANSPORT_LEG_IN_USE,
        message: `Cannot replace transport legs: ${inUse} TRANSPORT itinerary item(s) still reference an existing leg. Remove those items first.`,
      });
    }
  }

  async replaceTransportLegs(tripId: string, ownerId: string, dto: ReplaceTripTransportLegsDto) {
    const trip = await this.loadMutableTrip(tripId, ownerId, dto.expectedVersion);
    await this.assertNoTransportLegsInUse(tripId);
    const tripStart = trip.startDate.toISOString().slice(0, 10);
    const tripEnd = trip.endDate.toISOString().slice(0, 10);

    const resolved = await Promise.all(
      dto.transportLegs.map(async (input) => {
        if (input.plannedDate && (input.plannedDate < tripStart || input.plannedDate > tripEnd)) {
          throw new BadRequestException({
            code: TRIP_ERROR_CODES.TRIP_INVALID_DATE_RANGE,
            message: `plannedDate ${input.plannedDate} falls outside the trip's ${tripStart}..${tripEnd} range.`,
          });
        }

        const [fromDestination, toDestination] = await Promise.all([
          input.fromDestinationSlug
            ? this.prisma.destination.findFirst({ where: { status: PublicationStatus.PUBLISHED, OR: [{ canonicalSlug: input.fromDestinationSlug }, { id: input.fromDestinationSlug }] } })
            : Promise.resolve(undefined),
          input.toDestinationSlug
            ? this.prisma.destination.findFirst({ where: { status: PublicationStatus.PUBLISHED, OR: [{ canonicalSlug: input.toDestinationSlug }, { id: input.toDestinationSlug }] } })
            : Promise.resolve(undefined),
        ]);
        if (input.fromDestinationSlug && !fromDestination) {
          throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.DESTINATION_NOT_FOUND, message: `Destination not found: ${input.fromDestinationSlug}` });
        }
        if (input.toDestinationSlug && !toDestination) {
          throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.DESTINATION_NOT_FOUND, message: `Destination not found: ${input.toDestinationSlug}` });
        }

        return { ...input, fromDestinationId: fromDestination?.id ?? null, toDestinationId: toDestination?.id ?? null };
      }),
    );

    return this.prisma.$transaction(async (tx) => {
      await tx.tripTransportLeg.deleteMany({ where: { tripId } });
      if (resolved.length > 0) {
        await tx.tripTransportLeg.createMany({
          data: resolved.map((leg, index) => ({
            tripId,
            sortOrder: index,
            mode: leg.mode,
            fromLabel: leg.fromLabel,
            toLabel: leg.toLabel,
            fromDestinationId: leg.fromDestinationId,
            toDestinationId: leg.toDestinationId,
            plannedDate: leg.plannedDate ? new Date(leg.plannedDate) : null,
            plannedAmount: leg.plannedAmount,
            plannedCurrency: leg.plannedCurrency,
            provenance: leg.plannedAmount ? 'USER_INPUT' : 'UNKNOWN',
            notes: leg.notes,
          })),
        });
      }
      await tx.trip.update({ where: { id: tripId }, data: { version: { increment: 1 } } });
      await this.audit.log({ actorId: ownerId, action: 'trip.transportLegs.replaced', entityType: 'TRIP', entityId: tripId, metadata: { count: resolved.length } }, tx);
      return tx.tripTransportLeg.findMany({ where: { tripId }, orderBy: { sortOrder: 'asc' } });
    });
  }
}
