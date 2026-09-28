import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { DateEra } from '@prisma/client';
import { SUPPORTED_LOCALES } from '../../../common/decorators/locale.decorator';

export const SEARCH_MAX_QUERY_LENGTH = 200;
export const SEARCH_MAX_LIMIT = 50;
export const SEARCH_DEFAULT_LIMIT = 20;

/** Public search query (G11). Every field is optional except `q`; nothing here can select unpublished content. */
export class SearchQueryDto {
  @ApiPropertyOptional({ example: 'Hội An', description: 'Free text (max 200 chars). Diacritic-insensitive; NFC/NFD equivalent.' })
  @IsString()
  @MinLength(1)
  @MaxLength(SEARCH_MAX_QUERY_LENGTH)
  q!: string;

  @ApiPropertyOptional({ description: 'Requested response locale (vi | en). Also honored from the Accept-Language header.' })
  @IsOptional()
  @IsIn(SUPPORTED_LOCALES)
  locale?: string;

  @ApiPropertyOptional({ description: 'Comma-separated entity kinds to restrict to.', example: 'PLACE,CITY' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  types?: string;

  @ApiPropertyOptional({ description: 'Restrict to documents stored under this current Country id.' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  countryId?: string;

  @ApiPropertyOptional({ description: 'Restrict to documents stored under this current Region id.' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  regionId?: string;

  @ApiPropertyOptional({ description: 'Restrict to documents stored under this current City id.' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  cityId?: string;

  @ApiPropertyOptional({ description: 'Period start (in-era year, 1-based). Entities with an UNKNOWN date never match a period filter.' })
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

  @ApiPropertyOptional({ description: 'Period end (in-era year, 1-based).' })
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

  @ApiPropertyOptional({ description: 'west,south,east,north (EPSG:4326). Antimeridian-crossing boxes are rejected.', example: '105.7,20.9,105.9,21.1' })
  @IsOptional()
  @Matches(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/)
  bbox?: string;

  @ApiPropertyOptional({ description: 'Opaque cursor from a previous nextCursor; bound to the exact query, filters and locale.' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @ApiPropertyOptional({ default: SEARCH_DEFAULT_LIMIT, maximum: SEARCH_MAX_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(SEARCH_MAX_LIMIT)
  limit?: number;
}

export class SearchSuggestQueryDto {
  @ApiPropertyOptional({ example: 'Hue' })
  @IsString()
  @MinLength(1)
  @MaxLength(SEARCH_MAX_QUERY_LENGTH)
  q!: string;

  @ApiPropertyOptional({ description: 'Requested response locale (vi | en).' })
  @IsOptional()
  @IsIn(SUPPORTED_LOCALES)
  locale?: string;
}
