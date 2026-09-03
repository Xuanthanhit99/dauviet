import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { HistoricalDateInputDto } from '../../../common/historical-date/historical-date.dto';

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

  @ApiProperty({ type: HistoricalDateInputDto })
  @ValidateNested()
  @Type(() => HistoricalDateInputDto)
  start!: HistoricalDateInputDto;

  @ApiPropertyOptional({ type: HistoricalDateInputDto, description: 'Omit for a dynasty with no recorded end.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => HistoricalDateInputDto)
  end?: HistoricalDateInputDto;

  @ApiPropertyOptional({ description: 'Overall period display override, e.g. "1802-1945".' })
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
