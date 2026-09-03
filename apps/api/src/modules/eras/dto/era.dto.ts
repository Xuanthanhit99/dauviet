import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsEnum, IsOptional, IsString, ValidateNested } from 'class-validator';
import { DatePrecision } from '@prisma/client';

export class EraTranslationInputDto {
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

export class CreateEraDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  parentEraId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateStart?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateEnd?: string;

  @ApiPropertyOptional({ enum: DatePrecision })
  @IsOptional()
  @IsEnum(DatePrecision)
  datePrecision?: DatePrecision;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dateLabel?: string;

  @ApiProperty({ type: [EraTranslationInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => EraTranslationInputDto)
  translations!: EraTranslationInputDto[];
}
