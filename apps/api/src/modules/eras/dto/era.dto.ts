import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { HistoricalDateInputDto } from '../../../common/historical-date/historical-date.dto';

export class SetEraCountriesDto {
  @ApiProperty({ type: [String], description: "Country ids this era's geographic scope spans (G03). Replaces the full set of links." })
  @IsArray()
  @IsString({ each: true })
  countryIds!: string[];
}

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

  @ApiProperty({ type: HistoricalDateInputDto })
  @ValidateNested()
  @Type(() => HistoricalDateInputDto)
  start!: HistoricalDateInputDto;

  @ApiPropertyOptional({ type: HistoricalDateInputDto, description: 'Omit for an era with no recorded end (still ongoing).' })
  @IsOptional()
  @ValidateNested()
  @Type(() => HistoricalDateInputDto)
  end?: HistoricalDateInputDto;

  @ApiPropertyOptional({ description: 'Overall period display override, e.g. "1009-1225".' })
  @IsOptional()
  @IsString()
  dateLabel?: string;

  @ApiPropertyOptional({ type: [String], description: "Country ids this era's geographic scope spans (G03) - an era can cover more than one modern country." })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  countryIds?: string[];

  @ApiProperty({ type: [EraTranslationInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => EraTranslationInputDto)
  translations!: EraTranslationInputDto[];
}
