import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class MapFeaturesQueryDto {
  @ApiPropertyOptional({ description: 'minLng,minLat,maxLng,maxLat', example: '105.7,20.9,105.9,21.1' })
  @IsOptional()
  @Matches(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/)
  bbox?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(22)
  zoom?: number;

  @ApiPropertyOptional({ description: 'Historical year - filters time-bound territory layers' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  year?: number;

  @ApiPropertyOptional({ description: 'Comma-separated PlaceType values' })
  @IsOptional()
  @IsString()
  types?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  theme?: string;
}
