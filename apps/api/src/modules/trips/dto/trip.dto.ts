import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsNumberString, IsOptional, IsString, IsIn, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { TripItemType, TripStatus, TripTransportMode } from '@prisma/client';

const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_CODE = /^[A-Z]{3}$/;

/**
 * Trip is created directly with structured fields (spec section 9) - there
 * is no draft-then-fill-in flow. `primaryCurrency` uses the same bare
 * `String` + `@Matches` + uppercase-`@Transform` convention as
 * `Country.defaultCurrency`/`AccommodationOffer.currency` (pre-implementation
 * report section 1.4/2.1) - no ISO-4217 membership check exists anywhere in
 * this codebase yet, so this DTO does not invent one for Trip alone.
 */
export class CreateTripDto {
  @ApiProperty({ example: 'Kyoto autumn trip' })
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiProperty({ example: '2026-11-01', description: 'Local calendar date, YYYY-MM-DD - never a UTC instant.' })
  @Matches(DATE_ONLY, { message: 'startDate must be YYYY-MM-DD' })
  startDate!: string;

  @ApiProperty({ example: '2026-11-05', description: 'Local calendar date, YYYY-MM-DD. Must be >= startDate; equal is a valid one-day trip.' })
  @Matches(DATE_ONLY, { message: 'endDate must be YYYY-MM-DD' })
  endDate!: string;

  @ApiProperty({ example: 'JPY', description: 'ISO 4217 currency code, uppercase.' })
  @Transform(upper)
  @Matches(CURRENCY_CODE, { message: 'primaryCurrency must be a 3-letter ISO 4217 code' })
  primaryCurrency!: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  travelerCount?: number;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  roomCount?: number;

  @ApiPropertyOptional({ description: 'Country canonicalSlug (e.g. "japan"). Unresolvable value -> 404 COUNTRY_NOT_FOUND.' })
  @IsOptional()
  @IsString()
  originCountrySlug?: string;

  @ApiPropertyOptional({ description: 'Region canonicalSlug. Unresolvable value -> 404 REGION_NOT_FOUND.' })
  @IsOptional()
  @IsString()
  originRegionSlug?: string;

  @ApiPropertyOptional({ description: 'City canonicalSlug. Unresolvable value -> 404 CITY_NOT_FOUND.' })
  @IsOptional()
  @IsString()
  originCitySlug?: string;

  @ApiPropertyOptional({ description: 'Free-text origin label, used when no canonical geography row fits - never a precise home address.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  originLabel?: string;

  @ApiPropertyOptional({ description: 'Optional planning target - a user aspiration, never confused with a calculated estimate.' })
  @IsOptional()
  @IsNumberString()
  targetBudgetAmount?: string;

  @ApiPropertyOptional({ example: 'JPY' })
  @IsOptional()
  @Transform(upper)
  @Matches(CURRENCY_CODE, { message: 'targetBudgetCurrency must be a 3-letter ISO 4217 code' })
  targetBudgetCurrency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}

/**
 * Optimistic concurrency (spec section 62) - `expectedVersion` is required,
 * not optional, on every update: a client that never read the current
 * version has nothing meaningful to compare against. Mismatch -> 409
 * `TRIP_VERSION_CONFLICT` (a deliberate divergence from Story/Journey/
 * Contribution's existing 400 for the same shape - see pre-implementation
 * report section 1.7).
 */
export class UpdateTripDto {
  @ApiProperty({ description: 'The version this edit was read at.' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ enum: TripStatus })
  @IsOptional()
  @IsIn(Object.values(TripStatus))
  status?: TripStatus;

  @ApiPropertyOptional({ example: '2026-11-01' })
  @IsOptional()
  @Matches(DATE_ONLY, { message: 'startDate must be YYYY-MM-DD' })
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-11-05' })
  @IsOptional()
  @Matches(DATE_ONLY, { message: 'endDate must be YYYY-MM-DD' })
  endDate?: string;

  @ApiPropertyOptional({ example: 'JPY' })
  @IsOptional()
  @Transform(upper)
  @Matches(CURRENCY_CODE, { message: 'primaryCurrency must be a 3-letter ISO 4217 code' })
  primaryCurrency?: string;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  travelerCount?: number;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  roomCount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  originCountrySlug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  originRegionSlug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  originCitySlug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  originLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumberString()
  targetBudgetAmount?: string;

  @ApiPropertyOptional({ example: 'JPY' })
  @IsOptional()
  @Transform(upper)
  @Matches(CURRENCY_CODE, { message: 'targetBudgetCurrency must be a 3-letter ISO 4217 code' })
  targetBudgetCurrency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}

/**
 * Same required-`expectedVersion` shape as `UpdateTripDto` - archiving is a
 * mutation like any other and must not silently clobber a concurrent edit.
 */
export class ArchiveTripDto {
  @ApiProperty({ description: 'The version this archive action was read at.' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;
}

/**
 * Combined pagination + filter DTO (post-G04 API consistency hardening
 * convention - pre-implementation report section 1.10): never a dual
 * `@Query()` binding over the same request-query object.
 */
export class ListTripsQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;

  @ApiPropertyOptional({ enum: TripStatus })
  @IsOptional()
  @IsIn(Object.values(TripStatus))
  status?: TripStatus;
}

/**
 * One ordered entry in a `PUT .../destinations` replace-all call (spec
 * section 14). `sortOrder` is the array index, not a client-supplied field -
 * ordering is expressed purely by array position, matching every other
 * replace-style composition mutation in this codebase (e.g.
 * `DestinationCollectionsService.setMembers`).
 */
export class TripDestinationInputDto {
  @ApiProperty({ description: 'Destination canonicalSlug. Unresolvable value -> 404 DESTINATION_NOT_FOUND.' })
  @IsString()
  destinationSlug!: string;

  @ApiPropertyOptional({ example: '2026-11-01' })
  @IsOptional()
  @Matches(DATE_ONLY, { message: 'arrivalDate must be YYYY-MM-DD' })
  arrivalDate?: string;

  @ApiPropertyOptional({ example: '2026-11-03' })
  @IsOptional()
  @Matches(DATE_ONLY, { message: 'departureDate must be YYYY-MM-DD' })
  departureDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class ReplaceTripDestinationsDto {
  @ApiProperty({ description: 'The Trip version this replace was read at.' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @ApiProperty({ type: [TripDestinationInputDto], description: 'The full ordered destination list - this replaces the entire set, it is never a partial patch.' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TripDestinationInputDto)
  destinations!: TripDestinationInputDto[];
}

/**
 * One ordered entry in a `PUT .../days/:dayId/items` replace-all call (spec
 * section 17/18/21). Exactly one canonical slug field must be set, matching
 * `type` - enforced at the service layer (`TripItineraryService`), the same
 * place every other cross-field invariant in this schema already is; a
 * `CUSTOM` item must set none of them and must set `title` instead.
 */
export class TripItemInputDto {
  @ApiProperty({ enum: TripItemType })
  @IsIn(Object.values(TripItemType))
  type!: TripItemType;

  @ApiPropertyOptional({ description: 'Required when type = ACCOMMODATION. Unresolvable -> 404 ACCOMMODATION_NOT_FOUND.' })
  @IsOptional()
  @IsString()
  accommodationSlug?: string;

  @ApiPropertyOptional({ description: 'Required when type = RESTAURANT. Unresolvable -> 404 RESTAURANT_NOT_FOUND.' })
  @IsOptional()
  @IsString()
  restaurantSlug?: string;

  @ApiPropertyOptional({ description: 'Required when type = ACTIVITY. Unresolvable -> 404 ACTIVITY_NOT_FOUND.' })
  @IsOptional()
  @IsString()
  activitySlug?: string;

  @ApiPropertyOptional({ description: 'Required when type = ATTRACTION. Unresolvable -> 404 ATTRACTION_NOT_FOUND.' })
  @IsOptional()
  @IsString()
  attractionSlug?: string;

  @ApiPropertyOptional({ description: 'Required when type = PLACE. Unresolvable -> 404 TRIP_ITEM_PLACE_NOT_FOUND.' })
  @IsOptional()
  @IsString()
  placeSlug?: string;

  @ApiPropertyOptional({ description: 'Required when type = TRANSPORT - an existing TripTransportLeg id on this trip.' })
  @IsOptional()
  @IsString()
  transportLegId?: string;

  @ApiPropertyOptional({ description: 'Required when type = CUSTOM; otherwise an optional display-snapshot label only.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ example: '09:30', description: '"HH:mm" local time - timezone is resolved from the relevant Destination/City, never stored here.' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'startLocalTime must be HH:mm' })
  startLocalTime?: string;

  @ApiPropertyOptional({ example: '11:00' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'endLocalTime must be HH:mm' })
  endLocalTime?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  allDay?: boolean;

  @ApiPropertyOptional({ description: 'User-entered planning override (spec section 78 precedence tier 1).' })
  @IsOptional()
  @IsNumberString()
  plannedAmount?: string;

  @ApiPropertyOptional({ example: 'JPY' })
  @IsOptional()
  @Transform(upper)
  @Matches(CURRENCY_CODE, { message: 'plannedCurrency must be a 3-letter ISO 4217 code' })
  plannedCurrency?: string;
}

export class ReplaceTripDayItemsDto {
  @ApiProperty({ description: 'The Trip version this replace was read at.' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @ApiProperty({ type: [TripItemInputDto], description: 'The full ordered item list for this day - this replaces the entire set, it is never a partial patch.' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TripItemInputDto)
  items!: TripItemInputDto[];
}

/**
 * Full item-id ordering for one day, reorder-only (spec section 20) - no
 * other field may change through this route. Every existing item id for the
 * day must be present exactly once, matching
 * `ReorderJourneyStopsDto`'s exact shape and the two-phase negative-
 * placeholder write it drives (`JourneysService.reorderStops`).
 */
export class ReorderTripDayItemsDto {
  @ApiProperty({ description: 'The Trip version this reorder was read at.' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @ApiProperty({ type: [String], description: 'Every existing TripItem id for this day, in the desired final order.' })
  @IsArray()
  @IsString({ each: true })
  itemIds!: string[];
}

/**
 * One ordered entry in a `PUT .../transport-legs` replace-all call (spec
 * section 22/23/24) - never a booking, never a live fare, never an invented
 * road distance (no `distanceMeters` field exists here or on the schema).
 */
export class TripTransportLegInputDto {
  @ApiProperty({ enum: TripTransportMode })
  @IsIn(Object.values(TripTransportMode))
  mode!: TripTransportMode;

  @ApiProperty({ example: 'Tokyo Station' })
  @IsString()
  @MaxLength(200)
  fromLabel!: string;

  @ApiProperty({ example: 'Kyoto Station' })
  @IsString()
  @MaxLength(200)
  toLabel!: string;

  @ApiPropertyOptional({ description: 'Destination canonicalSlug, if the origin coincides with a canonical Destination. Unresolvable -> 404 DESTINATION_NOT_FOUND.' })
  @IsOptional()
  @IsString()
  fromDestinationSlug?: string;

  @ApiPropertyOptional({ description: 'Destination canonicalSlug, if the endpoint coincides with a canonical Destination. Unresolvable -> 404 DESTINATION_NOT_FOUND.' })
  @IsOptional()
  @IsString()
  toDestinationSlug?: string;

  @ApiPropertyOptional({ example: '2026-11-03' })
  @IsOptional()
  @Matches(DATE_ONLY, { message: 'plannedDate must be YYYY-MM-DD' })
  plannedDate?: string;

  @ApiPropertyOptional({ description: 'User-entered or rule-based planning estimate - never a fabricated live fare (spec section 41).' })
  @IsOptional()
  @IsNumberString()
  plannedAmount?: string;

  @ApiPropertyOptional({ example: 'JPY' })
  @IsOptional()
  @Transform(upper)
  @Matches(CURRENCY_CODE, { message: 'plannedCurrency must be a 3-letter ISO 4217 code' })
  plannedCurrency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class ReplaceTripTransportLegsDto {
  @ApiProperty({ description: 'The Trip version this replace was read at.' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @ApiProperty({ type: [TripTransportLegInputDto], description: 'The full ordered transport-leg list - this replaces the entire set, it is never a partial patch.' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TripTransportLegInputDto)
  transportLegs!: TripTransportLegInputDto[];
}

/** Bounded estimate-generation history list (spec section 88). */
export class ListTripCostEstimatesQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}
