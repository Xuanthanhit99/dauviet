import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEnum, IsInt, IsOptional, IsString, Matches, Max, Min, ValidateNested } from 'class-validator';
import { TranslationMethod } from '@prisma/client';

export class ActivityTranslationInputDto {
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

  @ApiPropertyOptional({ enum: TranslationMethod })
  @IsOptional()
  @IsEnum(TranslationMethod)
  method?: TranslationMethod;
}

export class CreateActivityDto {
  @ApiProperty()
  @IsString()
  countryId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  regionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cityId?: string;

  @ApiPropertyOptional({ description: 'Optional - not every Activity is tied to one Attraction (spec section 43).' })
  @IsOptional()
  @IsString()
  attractionId?: string;

  @ApiProperty({ type: [ActivityTranslationInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ActivityTranslationInputDto)
  translations!: ActivityTranslationInputDto[];
}

export class UpsertActivityTranslationDto extends ActivityTranslationInputDto {}

export class SetActivityDestinationsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  destinationIds!: string[];
}

export class ListActivitiesQueryDto {
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

  @ApiPropertyOptional({ description: 'Country canonicalSlug, ISO2, or ISO3 code - the raw internal id also still resolves.' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ description: 'Destination canonicalSlug, or the raw internal id.' })
  @IsOptional()
  @IsString()
  destination?: string;
}

export class CreateProviderActivityReferenceDto {
  @ApiProperty({ description: 'ExternalProvider.code - must already exist and be ACTIVE.' })
  @IsString()
  providerCode!: string;

  @ApiProperty()
  @IsString()
  externalEntityId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  externalUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  destinationId?: string;
}

export class MapProviderActivityReferenceDto {
  @ApiProperty()
  @IsString()
  activityId!: string;
}

/** Local calendar date (spec section 99) - never assumes UTC == local attraction time. */
export class GetActivityOffersDto {
  @ApiProperty({ example: '2026-12-01' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date!: string;

  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  participants!: number;

  @ApiProperty({ example: 'USD', description: 'ISO 4217 currency code, uppercase.' })
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter ISO 4217 code' })
  currency!: string;
}
