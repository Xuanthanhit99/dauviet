import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateCitationDto {
  @ApiProperty()
  @IsString()
  factId!: string;

  @ApiProperty()
  @IsString()
  sourceId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pageFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pageTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  volume?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  chapter?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  excerpt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  editorNote?: string;
}
