import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEnum, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { TerritoryType } from '@prisma/client';
import { HistoricalDateInputDto } from '../../../common/historical-date/historical-date.dto';

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

  @ApiProperty({ type: HistoricalDateInputDto, description: 'Start of the historical validity window.' })
  @ValidateNested()
  @Type(() => HistoricalDateInputDto)
  start!: HistoricalDateInputDto;

  @ApiPropertyOptional({ type: HistoricalDateInputDto, description: 'Omit if the territory is still valid / has no recorded end.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => HistoricalDateInputDto)
  end?: HistoricalDateInputDto;

  @ApiPropertyOptional({ description: 'Overall period display override.' })
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
