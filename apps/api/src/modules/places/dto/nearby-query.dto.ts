import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class NearbyPlacesQueryDto {
  @ApiProperty({ description: 'Latitude, -90..90' })
  @Type(() => Number)
  @IsNumber()
  lat!: number;

  @ApiProperty({ description: 'Longitude, -180..180' })
  @Type(() => Number)
  @IsNumber()
  lng!: number;

  @ApiPropertyOptional({ description: 'Radius in meters, default 5000, capped at 50000 (spec section 54).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  radius?: number;

  @ApiPropertyOptional({ description: 'Comma-separated PlaceType values' })
  @IsOptional()
  @IsString()
  types?: string;

  @ApiPropertyOptional({ description: 'Default 20, capped at 100.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
