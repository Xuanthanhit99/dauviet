import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class TimelineQueryDto {
  @ApiPropertyOptional({ description: 'Inclusive lower-bound year (spec section 26) - overlap semantics, not containment: an event spanning 1250-1310 matches fromYear=1200&toYear=1300.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  fromYear?: number;

  @ApiPropertyOptional({ description: 'Inclusive upper-bound year.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  toYear?: number;

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
