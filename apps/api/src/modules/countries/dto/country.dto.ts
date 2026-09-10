import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { DestinationType, RegionType, TranslationMethod } from '@prisma/client';

/**
 * Post-G04 API consistency hardening (see
 * docs/backend/POST_G04_API_CONSISTENCY_HARDENING.md): same dual-`@Query()`
 * binding collision G04 originally found on `GET /v1/destinations` (see
 * docs/backend/G04_DESTINATION_DISCOVERY.md section 11), also present on
 * `CountriesController`'s `:slug/regions`, `:slug/cities`, and
 * `:slug/destinations` sub-routes. One combined DTO per route fixes it.
 */
export class ListCountryRegionsQueryDto {
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

  @ApiPropertyOptional({ enum: RegionType })
  @IsOptional()
  @IsEnum(RegionType)
  type?: RegionType;
}

export class ListCountryCitiesQueryDto {
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

  @ApiPropertyOptional({ description: 'Region canonicalSlug, or the raw internal id. Unresolvable value -> 404 REGION_NOT_FOUND.' })
  @IsOptional()
  @IsString()
  region?: string;
}

export class ListCountryDestinationsQueryDto {
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

  @ApiPropertyOptional({ description: 'Region canonicalSlug, or the raw internal id. Unresolvable value -> 404 REGION_NOT_FOUND.' })
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional({ description: 'City canonicalSlug, or the raw internal id. Unresolvable value -> 404 CITY_NOT_FOUND.' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ enum: DestinationType })
  @IsOptional()
  @IsEnum(DestinationType)
  type?: DestinationType;
}

const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);

export class CountryTranslationInputDto {
  @ApiProperty({ example: 'vi' })
  @IsString()
  locale!: string;

  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shortDescription?: string;

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

export class CreateCountryDto {
  @ApiProperty({ example: 'VN', description: 'ISO 3166-1 alpha-2' })
  @Transform(upper)
  @Matches(/^[A-Z]{2}$/, { message: 'iso2 must be a 2-letter ISO 3166-1 alpha-2 code.' })
  iso2!: string;

  @ApiProperty({ example: 'VNM', description: 'ISO 3166-1 alpha-3' })
  @Transform(upper)
  @Matches(/^[A-Z]{3}$/, { message: 'iso3 must be a 3-letter ISO 3166-1 alpha-3 code.' })
  iso3!: string;

  @ApiProperty({ example: 'vi', description: "The country's own default locale - a geography default, never a user preference." })
  @IsString()
  @Matches(/^[a-z]{2,3}$/, { message: 'defaultLocale must be a lowercase 2-3 letter language code.' })
  defaultLocale!: string;

  @ApiProperty({ example: 'VND', description: 'ISO 4217 currency code' })
  @Transform(upper)
  @Matches(/^[A-Z]{3}$/, { message: 'defaultCurrency must be a 3-letter ISO 4217 code.' })
  defaultCurrency!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiProperty({ type: [CountryTranslationInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CountryTranslationInputDto)
  translations!: CountryTranslationInputDto[];
}

/** iso2/iso3 are immutable identity (spec section 5) - not editable here. */
export class UpdateCountryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^[a-z]{2,3}$/, { message: 'defaultLocale must be a lowercase 2-3 letter language code.' })
  defaultLocale?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(upper)
  @Matches(/^[A-Z]{3}$/, { message: 'defaultCurrency must be a 3-letter ISO 4217 code.' })
  defaultCurrency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;
}

export class UpsertCountryTranslationDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shortDescription?: string;

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
