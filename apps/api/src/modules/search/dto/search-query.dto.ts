import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class SearchQueryDto {
  @ApiPropertyOptional({ example: 'Hue' })
  @IsString()
  @MinLength(1)
  q!: string;

  @ApiPropertyOptional({ description: 'Comma-separated entity types to restrict to' })
  @IsOptional()
  @IsString()
  types?: string;
}
