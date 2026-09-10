/**
 * G04 - Destination Discovery composition DTOs. Each `Set*` DTO is a
 * "replace style" mutation (spec section 42): the full desired set of links
 * is supplied and the service diffs it against what exists inside one
 * transaction - never an incremental add/remove pair the caller has to
 * choreograph itself.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayUnique, IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { DestinationPlaceRole } from '@prisma/client';

export class DestinationPlaceLinkInputDto {
  @ApiProperty()
  @IsString()
  placeId!: string;

  @ApiPropertyOptional({ enum: DestinationPlaceRole, description: 'Defaults to CONTEXTUAL when omitted.' })
  @IsOptional()
  @IsEnum(DestinationPlaceRole)
  role?: DestinationPlaceRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  editorialNote?: string;
}

export class SetDestinationPlacesDto {
  @ApiProperty({ type: [DestinationPlaceLinkInputDto], description: 'Full desired set of Place links for this Destination (G04). Replaces the existing set.' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DestinationPlaceLinkInputDto)
  places!: DestinationPlaceLinkInputDto[];
}

export class SetDestinationThemesDto {
  @ApiProperty({ type: [String], description: 'Full desired set of Theme ids for this Destination (G04). Replaces the existing set.' })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  themeIds!: string[];
}

export class DestinationOrderedLinkInputDto {
  @ApiProperty()
  @IsString()
  id!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class SetDestinationStoriesDto {
  @ApiProperty({ type: [DestinationOrderedLinkInputDto], description: 'Full desired set of published-or-draft Story ids/order for this Destination (G04). Replaces the existing set. Publication is enforced at read time, not link time.' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DestinationOrderedLinkInputDto)
  stories!: DestinationOrderedLinkInputDto[];
}

export class SetDestinationJourneysDto {
  @ApiProperty({ type: [DestinationOrderedLinkInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DestinationOrderedLinkInputDto)
  journeys!: DestinationOrderedLinkInputDto[];
}

export class DestinationEventLinkInputDto {
  @ApiProperty()
  @IsString()
  eventId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ description: 'Free-text editorial label for this turning point\'s role (e.g. "founding", "capital-move") - not a claim, purely organizational.' })
  @IsOptional()
  @IsString()
  role?: string;
}

export class SetDestinationEventsDto {
  @ApiProperty({ type: [DestinationEventLinkInputDto], description: 'Curated historical turning points for this Destination\'s "how it became what it is" composition (G04). Replaces the existing set.' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DestinationEventLinkInputDto)
  events!: DestinationEventLinkInputDto[];
}
