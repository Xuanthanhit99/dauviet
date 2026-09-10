import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEnum, IsOptional, IsString, ValidateNested } from 'class-validator';
import { EventCountryRole, TranslationMethod } from '@prisma/client';
import { HistoricalDateInputDto } from '../../../common/historical-date/historical-date.dto';

/**
 * One EventCountry link (G03, revised). `role` is an explicit
 * EventCountryRole - a bare countryId list was ambiguous about whether a
 * linked country meant "this happened here" or "this is merely related"
 * (see EventCountry.role schema doc comment). Omitting `role` defaults to
 * RELATED at the persistence layer, the conservative choice.
 */
export class EventCountryLinkInputDto {
  @ApiProperty()
  @IsString()
  countryId!: string;

  @ApiPropertyOptional({ enum: EventCountryRole, description: 'Defaults to RELATED (conservative) when omitted.' })
  @IsOptional()
  @IsEnum(EventCountryRole)
  role?: EventCountryRole;
}

export class SetEventCountriesDto {
  @ApiProperty({ type: [EventCountryLinkInputDto], description: 'Country links this event spans (G03). Replaces the full set of links.' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EventCountryLinkInputDto)
  countries!: EventCountryLinkInputDto[];
}

export class EventTranslationInputDto {
  @ApiProperty({ example: 'vi' })
  @IsString()
  locale!: string;

  @ApiProperty()
  @IsString()
  title!: string;

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

export class CreateEventDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  eraId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  territoryId?: string;

  @ApiProperty({ type: HistoricalDateInputDto })
  @ValidateNested()
  @Type(() => HistoricalDateInputDto)
  date!: HistoricalDateInputDto;

  @ApiPropertyOptional({ type: [EventCountryLinkInputDto], description: 'Country links this event spans (G03) - an event can touch more than one modern country, each in its own explicit role.' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EventCountryLinkInputDto)
  countries?: EventCountryLinkInputDto[];

  @ApiProperty({ type: [EventTranslationInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => EventTranslationInputDto)
  translations!: EventTranslationInputDto[];
}
