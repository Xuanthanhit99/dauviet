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
import { DestinationType, TranslationMethod } from '@prisma/client';

/**
 * G04 fix (found live in this phase's own QA, pre-existing since G01): a
 * route that binds BOTH `@Query() query: OffsetPaginationQuery` (the whole
 * request-query object, `whitelist: true` + `forbidNonWhitelisted: true`)
 * AND separate `@Query('country')`/`@Query('type')`/etc. params reads the
 * exact same underlying `req.query` object for both - the whole-object
 * binding's whitelist validation runs regardless of the individual params
 * also declared alongside it, so `?country=...` was rejected with
 * `VALIDATION_ERROR: "property country should not exist"` even though a
 * dedicated `@Query('country')` parameter was right there. This was never
 * caught before G04 because no prior live QA phase actually exercised
 * `GET /v1/destinations` with a filter query string live (only bare
 * `GET /v1/destinations` and `GET /v1/destinations/:slug` were verified -
 * see docs/backend/LIVE_QA_REPORT.md's G01 section). Fixed by using one
 * proper combined DTO (pagination + every filter) for the whole query
 * object - the same convention `ListCommunityStoriesQueryDto` already
 * established elsewhere in this codebase - never two competing bindings
 * over the same query string again.
 */
export class ListDestinationsQueryDto {
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

  @ApiPropertyOptional({ description: "Country canonicalSlug (e.g. \"viet-nam\") - the raw internal id also still resolves, but is not a documented public shape. Unresolvable value -> 404 COUNTRY_NOT_FOUND, never a silently broadened/empty page." })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ description: 'Region canonicalSlug. Unresolvable value -> 404 REGION_NOT_FOUND.' })
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional({ description: 'City canonicalSlug. Unresolvable value -> 404 CITY_NOT_FOUND.' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ enum: DestinationType })
  @IsOptional()
  @IsEnum(DestinationType)
  type?: DestinationType;

  @ApiPropertyOptional({ description: 'Theme slug. Unresolvable value -> 404 DESTINATION_THEME_NOT_FOUND.' })
  @IsOptional()
  @IsString()
  theme?: string;
}

export class DestinationTranslationInputDto {
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

  @ApiPropertyOptional({ description: 'Short discovery-editorial hook (G04) - never operational (no price/hours/availability).' })
  @IsOptional()
  @IsString()
  tagline?: string;

  @ApiPropertyOptional({ description: 'Short "why visit" editorial copy (G04) - never operational.' })
  @IsOptional()
  @IsString()
  whyVisit?: string;

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

export class CreateDestinationDto {
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

  @ApiProperty({ enum: DestinationType })
  @IsEnum(DestinationType)
  type!: DestinationType;

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

  @ApiPropertyOptional({ description: 'MediaAsset id for the cover image (G04) - subject to the same rights/access-policy/status gating as every other heroMedia relation.' })
  @IsOptional()
  @IsString()
  heroMediaId?: string;

  @ApiProperty({ type: [DestinationTranslationInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DestinationTranslationInputDto)
  translations!: DestinationTranslationInputDto[];
}

export class UpdateDestinationDto {
  @ApiPropertyOptional({ description: 'Set to null to detach from a Region.' })
  @IsOptional()
  @IsString()
  regionId?: string | null;

  @ApiPropertyOptional({ description: 'Set to null to detach from a City.' })
  @IsOptional()
  @IsString()
  cityId?: string | null;

  @ApiPropertyOptional({ enum: DestinationType })
  @IsOptional()
  @IsEnum(DestinationType)
  type?: DestinationType;

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

  @ApiPropertyOptional({ description: 'Set to null to remove the cover image.' })
  @IsOptional()
  @IsString()
  heroMediaId?: string | null;
}

export class UpsertDestinationTranslationDto {
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

  @ApiPropertyOptional({ description: 'Short discovery-editorial hook (G04) - never operational (no price/hours/availability).' })
  @IsOptional()
  @IsString()
  tagline?: string;

  @ApiPropertyOptional({ description: 'Short "why visit" editorial copy (G04) - never operational.' })
  @IsOptional()
  @IsString()
  whyVisit?: string;

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
