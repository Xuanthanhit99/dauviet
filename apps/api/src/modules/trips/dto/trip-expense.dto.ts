import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsNumberString, IsOptional, IsString, Matches, Min, MaxLength, ValidateNested } from 'class-validator';
import { CostCategory, TripExpenseSplitMode } from '@prisma/client';
import { OffsetPaginationQuery } from '../../../common/dto/pagination.dto';
import { IsCalendarDate } from '../../../common/validators/is-calendar-date';

const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);
const CURRENCY_CODE = /^[A-Z]{3}$/;

/**
 * One participant's allocation in a create/replace request (spec section
 * 16). `amount` is required (and `percentage` must be omitted) for EXACT
 * mode; `percentage` is required (and `amount` must be omitted) for
 * PERCENTAGE mode; both must be omitted for EQUAL mode - enforced at the
 * service layer (`TripExpensesService`), the one place every other
 * cross-field invariant in this schema already lives, not here.
 */
export class TripExpenseShareInputDto {
  @ApiProperty({ description: 'Must be a current accepted trip participant (owner or TripMember) at mutation time - see spec section 22/24.' })
  @IsString()
  userId!: string;

  @ApiPropertyOptional({ description: 'Required for splitMode=EXACT, forbidden otherwise.' })
  @IsOptional()
  @IsNumberString()
  amount?: string;

  @ApiPropertyOptional({ description: 'Required for splitMode=PERCENTAGE, forbidden otherwise. E.g. "33.34".' })
  @IsOptional()
  @IsNumberString()
  percentage?: string;
}

/**
 * Full expense state (spec section 5/64/68). `UpdateTripExpenseDto` reuses
 * this shape verbatim plus `expectedVersion` - an edit is a full replace of
 * the expense's mutable fields + share set, never a partial patch (same
 * "replace the entire set" idiom `ReplaceTripDestinationsDto`/
 * `ReplaceTripDayItemsDto` already use for itinerary sub-resources, chosen
 * here because a financial aggregate's fields/shares are too
 * interdependent - amount, splitMode, and the participant set - to patch
 * safely field-by-field).
 */
export class CreateTripExpenseDto {
  @ApiProperty({ example: 'Ryokan dinner' })
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiProperty({ enum: CostCategory })
  @IsIn(Object.values(CostCategory))
  category!: CostCategory;

  @ApiProperty({ description: 'Decimal string, > 0, at most 2 decimal places - never a JS number (spec section 9/56).', example: '4500.00' })
  @IsNumberString()
  amount!: string;

  @ApiProperty({ example: 'JPY', description: 'ISO 4217 currency code, uppercase. Independent of Trip.primaryCurrency (spec section 11/13) - never assumed to match it.' })
  @Transform(upper)
  @Matches(CURRENCY_CODE, { message: 'currency must be a 3-letter ISO 4217 code' })
  currency!: string;

  @ApiProperty({ description: 'A current accepted trip participant (owner or TripMember) - validated at mutation time.' })
  @IsString()
  payerUserId!: string;

  @ApiProperty({ enum: TripExpenseSplitMode })
  @IsIn(Object.values(TripExpenseSplitMode))
  splitMode!: TripExpenseSplitMode;

  @ApiProperty({ example: '2026-11-02', description: 'Local calendar date the expense actually occurred on - never equated with createdAt (spec section 53). Not required to fall within the trip\'s own date range.' })
  @IsCalendarDate({ message: 'occurredOn must be YYYY-MM-DD' })
  occurredOn!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiProperty({ type: [TripExpenseShareInputDto], description: 'The full participant/share list for this expense - always a complete replace, never a partial patch.' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TripExpenseShareInputDto)
  shares!: TripExpenseShareInputDto[];
}

export class UpdateTripExpenseDto extends CreateTripExpenseDto {
  @ApiProperty({ description: 'TripExpense.version at read time - optimistic concurrency (spec section 33/34).' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;
}

export class DeleteTripExpenseDto {
  @ApiProperty({ description: 'TripExpense.version at read time.' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;
}

export class ListTripExpensesQueryDto extends OffsetPaginationQuery {}

export class CreateTripSettlementDto {
  @ApiProperty({ description: 'The current trip participant who paid / is declaring the settlement.' })
  @IsString()
  fromUserId!: string;

  @ApiProperty({ description: 'The current trip participant who received it. Must differ from fromUserId.' })
  @IsString()
  toUserId!: string;

  @ApiProperty({ description: 'Decimal string, > 0, at most 2 decimal places.', example: '100.00' })
  @IsNumberString()
  amount!: string;

  @ApiProperty({ example: 'JPY' })
  @Transform(upper)
  @Matches(CURRENCY_CODE, { message: 'currency must be a 3-letter ISO 4217 code' })
  currency!: string;

  @ApiProperty({ example: '2026-11-05', description: 'Local calendar date the external settlement occurred on.' })
  @IsCalendarDate({ message: 'settledAt must be YYYY-MM-DD' })
  settledAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class ListTripSettlementsQueryDto extends OffsetPaginationQuery {}
