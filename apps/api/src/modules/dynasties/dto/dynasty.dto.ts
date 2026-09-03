import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsEnum, IsOptional, IsString, ValidateNested } from 'class-validator';
import { DatePrecision } from '@prisma/client';

export class DynastyTranslationInputDto {
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

export class CreateDynastyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  capitalPlaceId?: string;

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

  @ApiProperty({ type: [DynastyTranslationInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DynastyTranslationInputDto)
  translations!: DynastyTranslationInputDto[];
}
