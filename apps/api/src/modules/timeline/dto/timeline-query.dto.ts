import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { DateEra } from '@prisma/client';

export class TimelineQueryDto {
  @ApiPropertyOptional({
    description:
      'Inclusive lower-bound year (spec section 26) - overlap semantics, not containment: an event spanning 1250-1310 matches fromYear=1200&toYear=1300. Always a positive, 1-based, in-era number (G03) - pair with fromEra to query BCE (e.g. fromYear=300&fromEra=BCE for 300 BCE). No public astronomical/signed-year contract exists.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  fromYear?: number;

  @ApiPropertyOptional({ description: 'Era for fromYear (G03). Defaults to CE - existing CE-only queries (e.g. fromYear=1945) are unaffected.' })
  @IsOptional()
  @IsEnum(DateEra)
  fromEra?: DateEra;

  @ApiPropertyOptional({ description: 'Inclusive upper-bound year (G03: positive, 1-based, in-era - pair with toEra for BCE).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  toYear?: number;

  @ApiPropertyOptional({ description: 'Era for toYear (G03). Defaults to CE.' })
  @IsOptional()
  @IsEnum(DateEra)
  toEra?: DateEra;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  eraId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  placeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  personId?: string;

  @ApiPropertyOptional({ description: 'Theme slug (spec section 22) - filters HistoricalEvent items via EventTheme.' })
  @IsOptional()
  @IsString()
  theme?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minImportance?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
