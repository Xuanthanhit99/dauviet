import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { DateEra } from '@prisma/client';
import { SUPPORTED_LOCALES } from '../../../common/decorators/locale.decorator';
import { Type } from 'class-transformer';

export class MapFeaturesQueryDto {
  @ApiPropertyOptional({ description: 'west,south,east,north (minLng,minLat,maxLng,maxLat)', example: '105.7,20.9,105.9,21.1' })
  @IsOptional()
  @Matches(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/)
  bbox?: string;

  @ApiPropertyOptional({ description: 'Drives zoom-based feature density (spec section 9) - low zoom shows only high-importance anchors.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(22)
  zoom?: number;

  @ApiPropertyOptional({ description: 'Historical year - filters time-bound Territory/Event layers using overlap semantics, never a fabricated exact date.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  year?: number;

  @ApiPropertyOptional({ description: 'Comma-separated PlaceType values' })
  @IsOptional()
  @IsString()
  types?: string;

  @ApiPropertyOptional({ description: 'Theme slug (spec section 17) - filters HistoricalEvent features via EventTheme.' })
  @IsOptional()
  @IsString()
  theme?: string;

  @ApiPropertyOptional({ description: 'HistoricalEra id (spec section 16) - filters HistoricalEvent features.' })
  @IsOptional()
  @IsString()
  eraId?: string;

  @ApiPropertyOptional({ description: 'Requested response locale (vi | en). Also honored from the Accept-Language header.' })
  @IsOptional()
  @IsIn(SUPPORTED_LOCALES)
  locale?: string;

  @ApiPropertyOptional({
    description:
      'Comma-separated map layers to return: PLACE, EVENT, TERRITORY (historical) and COUNTRY, REGION, CITY, DESTINATION (current geography). Omitted = the pre-G11 default set (PLACE, EVENT, and TERRITORY when `year` is given); current geography is opt-in.',
    example: 'CITY,DESTINATION',
  })
  @IsOptional()
  @IsString()
  kinds?: string;

  @ApiPropertyOptional({ description: 'Strict period start (in-era year). Only TERRITORY/EVENT with a KNOWN chronology overlapping the period are returned; undated entities never match.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  fromYear?: number;

  @ApiPropertyOptional({ enum: DateEra, default: DateEra.CE })
  @IsOptional()
  @IsEnum(DateEra)
  fromEra?: DateEra;

  @ApiPropertyOptional({ description: 'Strict period end (in-era year).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  toYear?: number;

  @ApiPropertyOptional({ enum: DateEra, default: DateEra.CE })
  @IsOptional()
  @IsEnum(DateEra)
  toEra?: DateEra;
}
