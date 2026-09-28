import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { TripsService } from './trips.service';
import { TripItineraryService } from './trip-itinerary.service';
import { TripCostEstimatesService } from './trip-cost-estimates.service';
import { TripExpensesService } from './trip-expenses.service';
import { TripSettlementsService } from './trip-settlements.service';
import { TripFinanceSummaryService } from './trip-finance-summary.service';
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
import { CreateTripExpenseDto, CreateTripSettlementDto, DeleteTripExpenseDto, ListTripExpensesQueryDto, ListTripSettlementsQueryDto, UpdateTripExpenseDto } from './dto/trip-expense.dto';

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
    private readonly expenses: TripExpensesService,
    private readonly settlements: TripSettlementsService,
    private readonly financeSummary: TripFinanceSummaryService,
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

  // G09 - Trip Expense & Settlement (spec section 68). Static-path routes
  // (`summary`, `settlement-suggestions`, `settlements`) are declared
  // BEFORE the dynamic `:expenseId` routes below, so Nest's first-match
  // route resolution never swallows one of them as an expense id.

  @Get(':id/expenses/summary')
  expensesSummary(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.financeSummary.summary(id, user.id);
  }

  @Get(':id/settlement-suggestions')
  settlementSuggestions(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.financeSummary.suggestions(id, user.id);
  }

  @Get(':id/settlements')
  listSettlements(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query() query: ListTripSettlementsQueryDto) {
    return this.settlements.list(id, user.id, query);
  }

  @Post(':id/settlements')
  createSettlement(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateTripSettlementDto) {
    return this.settlements.create(id, user.id, dto);
  }

  @Get(':id/expenses')
  listExpenses(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query() query: ListTripExpensesQueryDto) {
    return this.expenses.list(id, user.id, query);
  }

  @Post(':id/expenses')
  createExpense(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateTripExpenseDto) {
    return this.expenses.create(id, user.id, dto);
  }

  @Get(':id/expenses/:expenseId')
  expenseDetail(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('expenseId') expenseId: string) {
    return this.expenses.detail(id, expenseId, user.id);
  }

  @Patch(':id/expenses/:expenseId')
  updateExpense(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('expenseId') expenseId: string, @Body() dto: UpdateTripExpenseDto) {
    return this.expenses.update(id, expenseId, user.id, dto);
  }

  @Delete(':id/expenses/:expenseId')
  deleteExpense(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('expenseId') expenseId: string, @Body() dto: DeleteTripExpenseDto) {
    return this.expenses.delete(id, expenseId, user.id, dto);
  }
}
