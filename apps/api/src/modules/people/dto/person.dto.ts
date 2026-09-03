import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEnum, IsOptional, IsString, ValidateNested } from 'class-validator';
import { TranslationMethod } from '@prisma/client';
import { HistoricalDateInputDto } from '../../../common/historical-date/historical-date.dto';

export class PersonTranslationInputDto {
  @ApiProperty({ example: 'vi' })
  @IsString()
  locale!: string;

  @ApiProperty()
  @IsString()
  displayName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  alternateNames?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  summary?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: TranslationMethod })
  @IsOptional()
  @IsEnum(TranslationMethod)
  method?: TranslationMethod;
}

export class CreatePersonDto {
  @ApiPropertyOptional({ type: HistoricalDateInputDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => HistoricalDateInputDto)
  birth?: HistoricalDateInputDto;

  @ApiPropertyOptional({ type: HistoricalDateInputDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => HistoricalDateInputDto)
  death?: HistoricalDateInputDto;

  @ApiProperty({ type: [PersonTranslationInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PersonTranslationInputDto)
  translations!: PersonTranslationInputDto[];
}
