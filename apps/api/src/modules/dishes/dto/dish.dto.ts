import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEnum, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';
import { TranslationMethod } from '@prisma/client';

export class DishTranslationInputDto {
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

export class CreateDishDto {
  @ApiProperty({ type: [DishTranslationInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DishTranslationInputDto)
  translations!: DishTranslationInputDto[];
}

export class UpsertDishTranslationDto extends DishTranslationInputDto {}

export class SetDishCuisinesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  cuisineIds!: string[];
}

export class SetDishDestinationsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  destinationIds!: string[];
}

export class ListDishesQueryDto {
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

  @ApiPropertyOptional({ description: 'Cuisine canonicalSlug, or the raw internal id.' })
  @IsOptional()
  @IsString()
  cuisine?: string;

  @ApiPropertyOptional({ description: 'Destination canonicalSlug, or the raw internal id.' })
  @IsOptional()
  @IsString()
  destination?: string;
}
