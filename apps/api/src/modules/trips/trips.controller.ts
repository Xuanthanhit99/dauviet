import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { TripsService } from './trips.service';
import { TripItineraryService } from './trip-itinerary.service';
import { TripCostEstimatesService } from './trip-cost-estimates.service';
import {
  ArchiveTripDto,
  CreateTripDto,
  ListTripCostEstimatesQueryDto,
  ListTripsQueryDto,
  ReorderTripDayItemsDto,
  ReplaceTripDayItemsDto,
  ReplaceTripDestinationsDto,
  ReplaceTripTransportLegsDto,
  UpdateTripDto,
} from './dto/trip.dto';

/**
 * Trip is private, owner-only planning data (spec section 59) - no
 * `@Public()` route exists anywhere in this module, and none should ever be
 * added here (public sharing is a distinct, unbuilt future feature).
 */
@ApiTags('trips')
@ApiBearerAuth()
@Controller('trips')
export class TripsController {
  constructor(
    private readonly trips: TripsService,
    private readonly itinerary: TripItineraryService,
    private readonly estimates: TripCostEstimatesService,
  ) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTripDto) {
    return this.trips.create(dto, user.id);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListTripsQueryDto) {
    return this.trips.list(user.id, query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.trips.findOwned(id, user.id);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateTripDto) {
    return this.trips.update(id, user.id, dto);
  }

  @Post(':id/archive')
  archive(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ArchiveTripDto) {
    return this.trips.archive(id, user.id, dto);
  }

  @Put(':id/destinations')
  replaceDestinations(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReplaceTripDestinationsDto) {
    return this.itinerary.replaceDestinations(id, user.id, dto);
  }

  @Put(':id/transport-legs')
  replaceTransportLegs(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReplaceTripTransportLegsDto) {
    return this.itinerary.replaceTransportLegs(id, user.id, dto);
  }

  @Put(':id/days/:dayId/items')
  replaceDayItems(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('dayId') dayId: string, @Body() dto: ReplaceTripDayItemsDto) {
    return this.itinerary.replaceDayItems(id, dayId, user.id, dto);
  }

  @Patch(':id/days/:dayId/items/reorder')
  reorderDayItems(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('dayId') dayId: string, @Body() dto: ReorderTripDayItemsDto) {
    return this.itinerary.reorderDayItems(id, dayId, user.id, dto);
  }

  /** Explicit recalculation only (spec section 50/111) - never triggered automatically. Rate-limited to reduce abuse potential of a DB-heavy operation, matching the throttle discipline already used on other mutation-heavy routes (e.g. comments create/vote). */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':id/estimates')
  generateEstimate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.estimates.generate(id, user.id);
  }

  @Get(':id/estimates/latest')
  latestEstimate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.estimates.latest(id, user.id);
  }

  @Get(':id/estimates')
  listEstimates(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query() query: ListTripCostEstimatesQueryDto) {
    return this.estimates.list(id, user.id, query.page, query.pageSize);
  }
}
