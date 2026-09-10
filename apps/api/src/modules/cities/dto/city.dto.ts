import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { TranslationMethod } from '@prisma/client';

/**
 * Post-G04 API consistency hardening (see
 * docs/backend/POST_G04_API_CONSISTENCY_HARDENING.md): same dual-`@Query()`
 * binding collision G04 originally found on `GET /v1/destinations` (see
 * docs/backend/G04_DESTINATION_DISCOVERY.md section 11), also present on
 * `CitiesController.list()`. One combined DTO fixes it.
 */
export class ListCitiesQueryDto {
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

  @ApiPropertyOptional({ description: 'Country canonicalSlug, ISO2, or ISO3 code (e.g. "viet-nam", "VN", "VNM") - the raw internal id also still resolves. Unresolvable value -> 404 COUNTRY_NOT_FOUND.' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ description: 'Region canonicalSlug, or the raw internal id. Unresolvable value -> 404 REGION_NOT_FOUND.' })
  @IsOptional()
  @IsString()
  region?: string;
}

export class CityTranslationInputDto {
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

export class CreateCityDto {
  @ApiProperty()
  @IsString()
  countryId!: string;

  @ApiPropertyOptional({ description: 'Optional - Country is authoritative and City does not require a Region.' })
  @IsOptional()
  @IsString()
  regionId?: string;

  @ApiProperty({ example: 'Asia/Ho_Chi_Minh', description: 'IANA timezone identifier' })
  @IsString()
  timezone!: string;

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

  @ApiProperty({ type: [CityTranslationInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CityTranslationInputDto)
  translations!: CityTranslationInputDto[];
}

export class UpdateCityDto {
  @ApiPropertyOptional({ description: 'Set to null to detach from a Region.' })
  @IsOptional()
  @IsString()
  regionId?: string | null;

  @ApiPropertyOptional({ example: 'Asia/Ho_Chi_Minh' })
  @IsOptional()
  @IsString()
  timezone?: string;

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

export class UpsertCityTranslationDto {
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
