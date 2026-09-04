import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SearchQueryDto {
  @ApiPropertyOptional({ example: 'Hue' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  q!: string;

  @ApiPropertyOptional({ description: 'Comma-separated entity types to restrict to' })
  @IsOptional()
  @IsString()
  types?: string;
}

export class SearchSuggestQueryDto {
  @ApiPropertyOptional({ example: 'Hue' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  q!: string;
}
