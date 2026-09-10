import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { PlaceType, TranslationMethod } from '@prisma/client';

export class PlaceTranslationInputDto {
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

export class CreatePlaceDto {
  @ApiProperty({ enum: PlaceType })
  @IsEnum(PlaceType)
  type!: PlaceType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  parentPlaceId?: string;

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

  @ApiPropertyOptional({ description: 'Current-geography link to G01 Country (G03). Required if currentRegionId/currentCityId is given.' })
  @IsOptional()
  @IsString()
  currentCountryId?: string;

  @ApiPropertyOptional({ description: 'Current-geography link to G01 Region (G03). Must belong to currentCountryId.' })
  @IsOptional()
  @IsString()
  currentRegionId?: string;

  @ApiPropertyOptional({ description: 'Current-geography link to G01 City (G03). Must belong to currentCountryId.' })
  @IsOptional()
  @IsString()
  currentCityId?: string;

  @ApiProperty({ type: [PlaceTranslationInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PlaceTranslationInputDto)
  translations!: PlaceTranslationInputDto[];
}

export class UpdatePlaceDto {
  @ApiPropertyOptional({ enum: PlaceType })
  @IsOptional()
  @IsEnum(PlaceType)
  type?: PlaceType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({ description: 'Current-geography link to G01 Country (G03). Required if currentRegionId/currentCityId is given.' })
  @IsOptional()
  @IsString()
  currentCountryId?: string;

  @ApiPropertyOptional({ description: 'Current-geography link to G01 Region (G03). Must belong to currentCountryId.' })
  @IsOptional()
  @IsString()
  currentRegionId?: string;

  @ApiPropertyOptional({ description: 'Current-geography link to G01 City (G03). Must belong to currentCountryId.' })
  @IsOptional()
  @IsString()
  currentCityId?: string;
}
