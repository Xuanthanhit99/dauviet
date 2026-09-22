import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PublicationStatus, Trip } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TRIP_ERROR_CODES } from '../../common/errors/trip-error-codes';
import { GEOGRAPHY_ERROR_CODES } from '../../common/errors/geography-error-codes';
import { ArchiveTripDto, CreateTripDto, ListTripsQueryDto, UpdateTripDto } from './dto/trip.dto';
import { enumerateDates } from './trip-dates.util';
import { TripAuthorizationService, TripCapability } from './trip-authorization.service';
import { TripCollaborationEventService } from './trip-collaboration-event.service';

/**
 * Trip ownership + lifecycle (spec section 9/10/59/60, corrected per
 * docs/backend/G06_PRE_IMPLEMENTATION_REPORT.md section 3.8/7 for
 * `archivedAt`). Pattern B ownership (pre-implementation report section
 * 1.6/4.2, mirroring `ContributionsService.getOr404`/
 * `assertOwnerOrPrivileged`): fetch by bare id regardless of caller, 404 if
 * it does not exist at all, then 403 if it exists but belongs to someone
 * else - existence is never hidden, matching this codebase's established
 * convention.
 *
 * G07 (docs/backend/G07_PRE_IMPLEMENTATION_REPORT.md section 10):
 * `getOwnedOrThrow`/`getOwnedActiveOrThrow` are now thin wrappers around
 * `TripAuthorizationService.authorize` - every call site's *capability*
 * argument is what actually changed (view-only routes pass the default
 * `VIEW_TRIP`; mutation routes pass `EDIT_TRIP`/`ARCHIVE_TRIP`/etc.), never
 * the surrounding control flow. The old bare-ownerId-equality check is
 * gone; a caller who is a `TripMember` (not just the owner) now passes
 * exactly when their role grants the requested capability.
 */
@Injectable()
export class TripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly authz: TripAuthorizationService,
    private readonly collaborationEvents: TripCollaborationEventService,
  ) {}

  /** The one shared "load and authorize" guard every Trip sub-resource route (destinations/days/items/transport/estimates) also calls, now capability-parameterized (default VIEW_TRIP for plain reads). */
  async getOwnedOrThrow(tripId: string, userId: string, capability: TripCapability = TripCapability.VIEW_TRIP): Promise<Trip> {
    const { trip } = await this.authz.authorize(tripId, userId, capability);
    return trip;
  }

  /** An archived Trip is not an active planning Trip (spec correction) - every itinerary/transport/estimate mutation route calls this after `getOwnedOrThrow`. */
  private assertNotArchived(trip: Trip) {
    if (trip.archivedAt) {
      throw new ConflictException({ code: TRIP_ERROR_CODES.TRIP_ARCHIVED, message: 'This trip is archived and read-only. Nothing about it can be changed.' });
    }
  }

  private assertVersion(trip: Trip, expectedVersion: number) {
    if (trip.version !== expectedVersion) {
      throw new ConflictException({
        code: TRIP_ERROR_CODES.TRIP_VERSION_CONFLICT,
        message: `This trip changed since you last read it (expected version ${expectedVersion}, current is ${trip.version}) - reload and retry.`,
      });
    }
  }

  /** Public composition of the two checks above - the one guard every itinerary/transport sub-resource mutation (`TripItineraryService`) shares, so the archive/version rule is defined exactly once. */
  assertMutable(trip: Trip, expectedVersion: number) {
    this.assertNotArchived(trip);
    this.assertVersion(trip, expectedVersion);
  }

  /**
   * Owned + not-archived, with no `expectedVersion` check - for operations
   * like estimate generation that don't mutate the Trip's own editable
   * fields (idempotency is handled separately via `inputHash`, not
   * optimistic concurrency) but must still be blocked once archived (spec
   * correction: an archived trip is read-only).
   */
  async getOwnedActiveOrThrow(tripId: string, userId: string, capability: TripCapability = TripCapability.VIEW_TRIP): Promise<Trip> {
    const trip = await this.getOwnedOrThrow(tripId, userId, capability);
    this.assertNotArchived(trip);
    return trip;
  }

  private assertDateRange(startDate: string, endDate: string) {
    // Both are validated YYYY-MM-DD strings by this point, so a plain
    // lexicographic comparison is a correct calendar-date comparison -
    // never parse through Date/UTC for this (pre-implementation report
    // section 1.5/3.1).
    if (endDate < startDate) {
      throw new BadRequestException({ code: TRIP_ERROR_CODES.TRIP_INVALID_DATE_RANGE, message: 'endDate must be on or after startDate.' });
    }
  }

  /** Resolves an optional origin Country/Region/City slug to its id - unresolvable -> 404, exactly like every other canonical geography reference in this codebase (pre-implementation report section 1.10). */
  private async resolveOrigin(input: { originCountrySlug?: string; originRegionSlug?: string; originCitySlug?: string }) {
    const [country, region, city] = await Promise.all([
      input.originCountrySlug
        ? this.prisma.country.findFirst({ where: { status: PublicationStatus.PUBLISHED, OR: [{ canonicalSlug: input.originCountrySlug }, { id: input.originCountrySlug }] } })
        : Promise.resolve(undefined),
      input.originRegionSlug
        ? this.prisma.region.findFirst({ where: { status: PublicationStatus.PUBLISHED, OR: [{ canonicalSlug: input.originRegionSlug }, { id: input.originRegionSlug }] } })
        : Promise.resolve(undefined),
      input.originCitySlug
        ? this.prisma.city.findFirst({ where: { status: PublicationStatus.PUBLISHED, OR: [{ canonicalSlug: input.originCitySlug }, { id: input.originCitySlug }] } })
        : Promise.resolve(undefined),
    ]);

    if (input.originCountrySlug && !country) {
      throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.COUNTRY_NOT_FOUND, message: 'Origin country not found.' });
    }
    if (input.originRegionSlug && !region) {
      throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.REGION_NOT_FOUND, message: 'Origin region not found.' });
    }
    if (input.originCitySlug && !city) {
      throw new NotFoundException({ code: GEOGRAPHY_ERROR_CODES.CITY_NOT_FOUND, message: 'Origin city not found.' });
    }

    return { originCountryId: country?.id ?? null, originRegionId: region?.id ?? null, originCityId: city?.id ?? null };
  }

  async create(dto: CreateTripDto, ownerId: string): Promise<Trip> {
    this.assertDateRange(dto.startDate, dto.endDate);
    const origin = await this.resolveOrigin(dto);
    const dates = enumerateDates(dto.startDate, dto.endDate);

    return this.prisma.$transaction(async (tx) => {
      const trip = await tx.trip.create({
        data: {
          ownerId,
          title: dto.title,
          startDate: new Date(dto.startDate),
          endDate: new Date(dto.endDate),
          primaryCurrency: dto.primaryCurrency,
          travelerCount: dto.travelerCount ?? 1,
          roomCount: dto.roomCount,
          originCountryId: origin.originCountryId,
          originRegionId: origin.originRegionId,
          originCityId: origin.originCityId,
          originLabel: dto.originLabel,
          targetBudgetAmount: dto.targetBudgetAmount,
          targetBudgetCurrency: dto.targetBudgetCurrency,
          notes: dto.notes,
        },
      });
      // One TripDay per calendar day in range (spec section 16) - never
      // materialized lazily, so `PUT .../days/:dayId/items` always has a
      // real day to target from the moment the trip exists.
      await tx.tripDay.createMany({
        data: dates.map((date, index) => ({ tripId: trip.id, date: new Date(date), dayNumber: index + 1 })),
      });
      await this.audit.log({ actorId: ownerId, action: 'trip.created', entityType: 'TRIP', entityId: trip.id }, tx);
      return trip;
    });
  }

  /**
   * OWNED + accepted-MEMBER trips (spec section 12), paginated and bounded
   * (spec section 87), excludes archived by default (spec correction: an
   * archived trip is not an active planning trip). Each item carries a
   * `relationship: 'OWNED' | 'MEMBER'` tag so a client can distinguish them
   * without the response changing ownership semantics - a PENDING
   * invitation is never included here (spec section 12 - "do not expose
   * pending invitations as accepted trips"), only rows from `Trip.ownerId`
   * or an existing `TripMember`.
   */
  async list(userId: string, query: ListTripsQueryDto) {
    const memberTripIds = await this.prisma.tripMember.findMany({ where: { userId }, select: { tripId: true } });
    const where: Prisma.TripWhereInput = {
      archivedAt: null,
      status: query.status,
      OR: [{ ownerId: userId }, { id: { in: memberTripIds.map((m) => m.tripId) } }],
    };
    const [total, trips] = await this.prisma.$transaction([
      this.prisma.trip.count({ where }),
      this.prisma.trip.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    const items = trips.map((trip) => ({ ...trip, relationship: trip.ownerId === userId ? ('OWNED' as const) : ('MEMBER' as const) }));
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  /** Detail remains readable once archived (spec correction) - viewing history is exactly the use case archiving exists for. Owner and any accepted member (VIEW_TRIP) may read it. */
  async findOwned(tripId: string, userId: string): Promise<Trip> {
    return this.getOwnedOrThrow(tripId, userId, TripCapability.VIEW_TRIP);
  }

  async update(tripId: string, userId: string, dto: UpdateTripDto): Promise<Trip> {
    const trip = await this.getOwnedOrThrow(tripId, userId, TripCapability.EDIT_TRIP);
    this.assertNotArchived(trip);
    this.assertVersion(trip, dto.expectedVersion);

    const startDate = dto.startDate ?? trip.startDate.toISOString().slice(0, 10);
    const endDate = dto.endDate ?? trip.endDate.toISOString().slice(0, 10);
    this.assertDateRange(startDate, endDate);

    const origin = await this.resolveOrigin(dto);
    const datesChanged = dto.startDate !== undefined || dto.endDate !== undefined;

    return this.prisma.$transaction(async (tx) => {
      if (datesChanged) {
        await this.reconcileDays(tx, tripId, enumerateDates(startDate, endDate));
      }

      const updated = await tx.trip.update({
        where: { id: tripId },
        data: {
          title: dto.title,
          status: dto.status,
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          endDate: dto.endDate ? new Date(dto.endDate) : undefined,
          primaryCurrency: dto.primaryCurrency,
          travelerCount: dto.travelerCount,
          roomCount: dto.roomCount,
          originCountryId: dto.originCountrySlug !== undefined ? origin.originCountryId : undefined,
          originRegionId: dto.originRegionSlug !== undefined ? origin.originRegionId : undefined,
          originCityId: dto.originCitySlug !== undefined ? origin.originCityId : undefined,
          originLabel: dto.originLabel,
          targetBudgetAmount: dto.targetBudgetAmount,
          targetBudgetCurrency: dto.targetBudgetCurrency,
          notes: dto.notes,
          version: { increment: 1 },
        },
      });
      await this.audit.log({ actorId: userId, action: 'trip.updated', entityType: 'TRIP', entityId: tripId }, tx);
      await this.collaborationEvents.record({ tripId, type: 'TRIP_UPDATED', actorUserId: userId }, tx);
      return updated;
    });
  }

  /**
   * Reconciles `TripDay` rows when Trip dates change (spec section 16: "do
   * not materialize impossible days"). Expanding the range only adds new
   * days. Shrinking the range removes days that fall outside it - but only
   * if they hold no `TripItem`s: silently deleting a day's planned items
   * because the trip got shorter would be a real, surprising data loss the
   * brief never asked for, so this rejects instead (`TRIP_INVALID_DATE_RANGE`)
   * and lets the owner remove those items first. `dayNumber` is
   * recomputed for every remaining/added day from its sorted date position -
   * no `@@unique([tripId, dayNumber])` constraint exists (only
   * `[tripId, date]` does), so this never needs a two-phase write.
   */
  private async reconcileDays(tx: Prisma.TransactionClient, tripId: string, newDates: string[]) {
    const existingDays = await tx.tripDay.findMany({ where: { tripId }, include: { _count: { select: { items: true } } } });
    const newDateSet = new Set(newDates);
    const existingDateSet = new Set(existingDays.map((d) => d.date.toISOString().slice(0, 10)));

    const daysToRemove = existingDays.filter((d) => !newDateSet.has(d.date.toISOString().slice(0, 10)));
    const nonEmptyRemovals = daysToRemove.filter((d) => d._count.items > 0);
    if (nonEmptyRemovals.length > 0) {
      throw new BadRequestException({
        code: TRIP_ERROR_CODES.TRIP_INVALID_DATE_RANGE,
        message: `Cannot shrink the trip dates: ${nonEmptyRemovals.length} day(s) outside the new range still have itinerary items. Remove those items first.`,
      });
    }
    if (daysToRemove.length > 0) {
      await tx.tripDay.deleteMany({ where: { id: { in: daysToRemove.map((d) => d.id) } } });
    }

    const datesToAdd = newDates.filter((date) => !existingDateSet.has(date));
    if (datesToAdd.length > 0) {
      await tx.tripDay.createMany({ data: datesToAdd.map((date) => ({ tripId, date: new Date(date), dayNumber: 0 })) });
    }

    const finalDays = await tx.tripDay.findMany({ where: { tripId }, orderBy: { date: 'asc' } });
    await Promise.all(finalDays.map((day, index) => tx.tripDay.update({ where: { id: day.id }, data: { dayNumber: index + 1 } })));
  }

  /** Owner-only (spec section 32/78) - ARCHIVE_TRIP is not in EDITOR's/VIEWER's capability set. */
  async archive(tripId: string, userId: string, dto: ArchiveTripDto): Promise<Trip> {
    const trip = await this.getOwnedOrThrow(tripId, userId, TripCapability.ARCHIVE_TRIP);
    this.assertVersion(trip, dto.expectedVersion);
    if (trip.archivedAt) {
      throw new ConflictException({ code: TRIP_ERROR_CODES.TRIP_ARCHIVED, message: 'This trip is already archived.' });
    }

    return this.prisma.$transaction(async (tx) => {
      const archived = await tx.trip.update({
        where: { id: tripId },
        data: { archivedAt: new Date(), version: { increment: 1 } },
      });
      await this.audit.log({ actorId: userId, action: 'trip.archived', entityType: 'TRIP', entityId: tripId }, tx);
      return archived;
    });
  }
}
