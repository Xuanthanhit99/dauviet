import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsNumberString, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { CostAssumptionScope, CostAssumptionStatus, CostCategory, CostUnit } from '@prisma/client';

const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_CODE = /^[A-Z]{3}$/;

/**
 * Admin-managed planning-cost configuration (spec section 31-33/79-81/
 * 96-99). `scope`/`scopeId`/`category`/`unit`/`effectiveFrom` together form
 * the row's natural identity (`@@unique([scope, scopeId, category, unit,
 * effectiveFrom])`) - deliberately immutable after creation; a new planning
 * period or a different scope/category/unit is a new row, never an edit of
 * this one (see `UpdateCostAssumptionDto` below, which does not expose
 * these fields).
 */
export class CreateCostAssumptionDto {
  @ApiProperty({ enum: CostAssumptionScope })
  @IsIn(Object.values(CostAssumptionScope))
  scope!: CostAssumptionScope;

  @ApiPropertyOptional({ description: 'Required unless scope = GLOBAL - the Country/Region/City/Destination canonicalSlug or id named by `scope`.' })
  @IsOptional()
  @IsString()
  scopeSlug?: string;

  @ApiProperty({ enum: CostCategory })
  @IsIn(Object.values(CostCategory))
  category!: CostCategory;

  @ApiProperty({ enum: CostUnit })
  @IsIn(Object.values(CostUnit))
  unit!: CostUnit;

  @ApiProperty({ example: 'VND' })
  @Transform(upper)
  @Matches(CURRENCY_CODE, { message: 'currency must be a 3-letter ISO 4217 code' })
  currency!: string;

  @ApiProperty({ description: 'low <= typical <= high, enforced at the service layer (spec section 80).' })
  @IsNumberString()
  lowAmount!: string;

  @ApiProperty()
  @IsNumberString()
  typicalAmount!: string;

  @ApiProperty()
  @IsNumberString()
  highAmount!: string;

  @ApiProperty({ example: '2026-01-01' })
  @Matches(DATE_ONLY, { message: 'effectiveFrom must be YYYY-MM-DD' })
  effectiveFrom!: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @Matches(DATE_ONLY, { message: 'effectiveTo must be YYYY-MM-DD' })
  effectiveTo?: string;

  @ApiProperty({ description: 'Provenance note (e.g. "editorial estimate" or a cited source) - never fabricated by an LLM (spec section 51).' })
  @IsString()
  @MaxLength(500)
  source!: string;
}

/** Only the non-identity fields may change after creation - see the class doc comment on `CreateCostAssumptionDto`. */
export class UpdateCostAssumptionDto {
  @ApiPropertyOptional({ example: 'VND' })
  @IsOptional()
  @Transform(upper)
  @Matches(CURRENCY_CODE, { message: 'currency must be a 3-letter ISO 4217 code' })
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumberString()
  lowAmount?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumberString()
  typicalAmount?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumberString()
  highAmount?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @Matches(DATE_ONLY, { message: 'effectiveTo must be YYYY-MM-DD' })
  effectiveTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  source?: string;
}

/** DRAFT -> ACTIVE -> RETIRED, forward-only (spec section 97) - same shape as Journey/Story's editorial status transitions. */
export class SetCostAssumptionStatusDto {
  @ApiProperty({ enum: CostAssumptionStatus })
  @IsIn(Object.values(CostAssumptionStatus))
  status!: CostAssumptionStatus;
}

export class ListCostAssumptionsQueryDto {
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

  @ApiPropertyOptional({ enum: CostAssumptionScope })
  @IsOptional()
  @IsIn(Object.values(CostAssumptionScope))
  scope?: CostAssumptionScope;

  @ApiPropertyOptional({ enum: CostCategory })
  @IsOptional()
  @IsIn(Object.values(CostCategory))
  category?: CostCategory;

  @ApiPropertyOptional({ enum: CostAssumptionStatus })
  @IsOptional()
  @IsIn(Object.values(CostAssumptionStatus))
  status?: CostAssumptionStatus;
}
