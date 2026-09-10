import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEnum, IsInt, IsOptional, IsString, Matches, Max, Min, ValidateNested } from 'class-validator';
import { AccommodationType, TranslationMethod } from '@prisma/client';

export class AccommodationTranslationInputDto {
  @ApiProperty({ example: 'vi' })
  @IsString()
  locale!: string;

  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  summary?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  seoTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  seoDescription?: string;

  @ApiPropertyOptional({ enum: TranslationMethod })
  @IsOptional()
  @IsEnum(TranslationMethod)
  method?: TranslationMethod;
}

export class CreateAccommodationDto {
  @ApiProperty()
  @IsString()
  countryId!: string;

  @ApiPropertyOptional({ description: 'Must belong to the same country when provided.' })
  @IsOptional()
  @IsString()
  regionId?: string;

  @ApiPropertyOptional({ description: 'Must belong to the same country (and same region, if both are set) when provided.' })
  @IsOptional()
  @IsString()
  cityId?: string;

  @ApiProperty({ enum: AccommodationType })
  @IsEnum(AccommodationType)
  type!: AccommodationType;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  longitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  heroMediaId?: string;

  @ApiProperty({ type: [AccommodationTranslationInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AccommodationTranslationInputDto)
  translations!: AccommodationTranslationInputDto[];
}

export class UpdateAccommodationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  regionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cityId?: string;

  @ApiPropertyOptional({ enum: AccommodationType })
  @IsOptional()
  @IsEnum(AccommodationType)
  type?: AccommodationType;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  longitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  heroMediaId?: string;
}

export class UpsertAccommodationTranslationDto extends AccommodationTranslationInputDto {}

export class SetAccommodationDestinationsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  destinationIds!: string[];
}

/**
 * Mirrors `ListDestinationsQueryDto`'s own fix exactly (see
 * docs/backend/G04_DESTINATION_DISCOVERY.md section 11 /
 * docs/backend/POST_G04_API_CONSISTENCY_HARDENING.md) - one combined DTO,
 * never a whole-object `@Query()` binding alongside separate `@Query('x')`
 * params, which would collide with the global `forbidNonWhitelisted`
 * ValidationPipe.
 */
export class ListAccommodationsQueryDto {
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

  @ApiPropertyOptional({ description: 'Country canonicalSlug, ISO2, or ISO3 code - the raw internal id also still resolves. Unresolvable value -> 404 COUNTRY_NOT_FOUND.' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ description: 'Region canonicalSlug, or the raw internal id. Unresolvable value -> 404 REGION_NOT_FOUND.' })
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional({ description: 'City canonicalSlug, or the raw internal id. Unresolvable value -> 404 CITY_NOT_FOUND.' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'Destination canonicalSlug, or the raw internal id. Unresolvable value -> 404 DESTINATION_NOT_FOUND.' })
  @IsOptional()
  @IsString()
  destination?: string;

  @ApiPropertyOptional({ enum: AccommodationType })
  @IsOptional()
  @IsEnum(AccommodationType)
  type?: AccommodationType;
}

export class CreateProviderAccommodationReferenceDto {
  @ApiProperty({ description: 'ExternalProvider.code - must already exist and be ACTIVE (spec section 9).' })
  @IsString()
  providerCode!: string;

  @ApiProperty()
  @IsString()
  externalEntityId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  externalUrl?: string;
}

export class MapProviderAccommodationReferenceDto {
  @ApiProperty({ description: 'Canonical Accommodation id to map this provider reference to. Never automatic/fuzzy (spec section 19).' })
  @IsString()
  accommodationId!: string;
}

/** Local calendar dates (spec section 98) - `YYYY-MM-DD`, never a timestamp. */
export class GetAccommodationOffersDto {
  @ApiProperty({ example: '2026-12-01' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'checkIn must be YYYY-MM-DD' })
  checkIn!: string;

  @ApiProperty({ example: '2026-12-03' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'checkOut must be YYYY-MM-DD' })
  checkOut!: string;

  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  guests!: number;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  rooms: number = 1;

  @ApiProperty({ example: 'USD', description: 'ISO 4217 currency code, uppercase.' })
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter ISO 4217 code' })
  currency!: string;
}
