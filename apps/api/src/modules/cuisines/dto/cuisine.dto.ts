import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEnum, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';
import { TranslationMethod } from '@prisma/client';

export class CuisineTranslationInputDto {
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

export class CreateCuisineDto {
  @ApiPropertyOptional({ description: 'Optional country scope - a Cuisine may be cross-country (e.g. no scope) or narrower (region-scoped).' })
  @IsOptional()
  @IsString()
  countryId?: string;

  @ApiPropertyOptional({ description: 'Must belong to countryId when both are provided.' })
  @IsOptional()
  @IsString()
  regionId?: string;

  @ApiProperty({ type: [CuisineTranslationInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CuisineTranslationInputDto)
  translations!: CuisineTranslationInputDto[];
}

export class UpsertCuisineTranslationDto extends CuisineTranslationInputDto {}

export class ListCuisinesQueryDto {
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
}
