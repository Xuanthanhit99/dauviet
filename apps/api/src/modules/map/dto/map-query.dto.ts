import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class MapFeaturesQueryDto {
  @ApiPropertyOptional({ description: 'west,south,east,north (minLng,minLat,maxLng,maxLat)', example: '105.7,20.9,105.9,21.1' })
  @IsOptional()
  @Matches(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/)
  bbox?: string;

  @ApiPropertyOptional({ description: 'Drives zoom-based feature density (spec section 9) - low zoom shows only high-importance anchors.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(22)
  zoom?: number;

  @ApiPropertyOptional({ description: 'Historical year - filters time-bound Territory/Event layers using overlap semantics, never a fabricated exact date.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  year?: number;

  @ApiPropertyOptional({ description: 'Comma-separated PlaceType values' })
  @IsOptional()
  @IsString()
  types?: string;

  @ApiPropertyOptional({ description: 'Theme slug (spec section 17) - filters HistoricalEvent features via EventTheme.' })
  @IsOptional()
  @IsString()
  theme?: string;

  @ApiPropertyOptional({ description: 'HistoricalEra id (spec section 16) - filters HistoricalEvent features.' })
  @IsOptional()
  @IsString()
  eraId?: string;
}
