import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEnum, IsOptional, IsString, ValidateNested } from 'class-validator';
import { PersonPlaceRole, TranslationMethod } from '@prisma/client';
import { HistoricalDateInputDto } from '../../../common/historical-date/historical-date.dto';

/**
 * One PersonPlace association (G03) - an explicit, editor-asserted link in
 * one role (birth/death/residence/etc). Not a nationality field - see
 * PersonPlaceRole schema doc comment.
 */
export class PersonPlaceLinkInputDto {
  @ApiProperty()
  @IsString()
  placeId!: string;

  @ApiPropertyOptional({ enum: PersonPlaceRole, description: 'Defaults to OTHER when omitted.' })
  @IsOptional()
  @IsEnum(PersonPlaceRole)
  role?: PersonPlaceRole;
}

export class SetPersonPlacesDto {
  @ApiProperty({ type: [PersonPlaceLinkInputDto], description: 'Place associations for this person (G03). Replaces the full set of links.' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PersonPlaceLinkInputDto)
  places!: PersonPlaceLinkInputDto[];
}

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
