import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEnum, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';
import { TranslationMethod } from '@prisma/client';

export class AttractionTranslationInputDto {
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

export class CreateAttractionDto {
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

  @ApiPropertyOptional({ description: 'Optional typed mapping when this attraction is also a real historical Place (spec section 42) - never a merge.' })
  @IsOptional()
  @IsString()
  placeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  longitude?: number;

  @ApiProperty({ type: [AttractionTranslationInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AttractionTranslationInputDto)
  translations!: AttractionTranslationInputDto[];
}

export class UpsertAttractionTranslationDto extends AttractionTranslationInputDto {}

export class SetAttractionDestinationsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  destinationIds!: string[];
}

export class ListAttractionsQueryDto {
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

  @ApiPropertyOptional({ description: 'Region canonicalSlug, or the raw internal id.' })
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional({ description: 'City canonicalSlug, or the raw internal id.' })
  @IsOptional()
  @IsString()
  city?: string;
}
