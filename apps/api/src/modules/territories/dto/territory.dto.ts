import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsEnum, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { DatePrecision, TerritoryType } from '@prisma/client';

export class TerritoryTranslationInputDto {
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
}

export class CreateTerritoryDto {
  @ApiProperty({ enum: TerritoryType })
  @IsEnum(TerritoryType)
  type!: TerritoryType;

  @ApiPropertyOptional({ description: 'GeoJSON geometry (Polygon/MultiPolygon), SRID 4326' })
  @IsOptional()
  @IsObject()
  geometry?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  validTo?: string;

  @ApiPropertyOptional({ enum: DatePrecision })
  @IsOptional()
  @IsEnum(DatePrecision)
  datePrecision?: DatePrecision;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dateLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  provenanceNote?: string;

  @ApiProperty({ type: [TerritoryTranslationInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TerritoryTranslationInputDto)
  translations!: TerritoryTranslationInputDto[];
}
