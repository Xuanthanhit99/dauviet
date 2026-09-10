import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DateEra, DatePrecision, DateQualifier } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Nested historical-date input for entity DTOs. Replaces the old flat
 * `dateStart`/`dateEnd`/`datePrecision`/`dateLabel` ISO-string fields, which
 * forced callers to fabricate a day/month for anything coarser than DAY
 * precision (spec section 3). See `historical-date.util.ts` for validation
 * and `docs/backend/HISTORICAL_DOMAIN.md` for the full contract.
 */
export class HistoricalDateInputDto {
  @ApiPropertyOptional({ description: 'Calendar year, required unless precision is UNKNOWN.' })
  @IsOptional()
  @IsInt()
  year?: number;

  @ApiPropertyOptional({ description: 'Only set when precision is MONTH or DAY.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @ApiPropertyOptional({ description: 'Only set when precision is DAY.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  day?: number;

  @ApiProperty({ enum: DatePrecision })
  @IsEnum(DatePrecision)
  precision!: DatePrecision;

  @ApiPropertyOptional({ enum: DateQualifier, description: 'Defaults to EXACT (or UNCERTAIN when precision is UNKNOWN).' })
  @IsOptional()
  @IsEnum(DateQualifier)
  qualifier?: DateQualifier;

  @ApiPropertyOptional({ enum: DateEra, description: 'Defaults to CE (G03). year is always a positive, 1-based, in-era number - there is no historical year zero.' })
  @IsOptional()
  @IsEnum(DateEra)
  era?: DateEra;

  @ApiPropertyOptional({ description: 'Only meaningful when qualifier is BETWEEN.' })
  @IsOptional()
  @IsInt()
  rangeEndYear?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  rangeEndMonth?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  rangeEndDay?: number;

  @ApiPropertyOptional({ description: 'Editor-authored display override, e.g. a traditional calendar rendering.' })
  @IsOptional()
  @IsString()
  label?: string;
}
