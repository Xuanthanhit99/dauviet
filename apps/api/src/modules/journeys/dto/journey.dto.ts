import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEnum, IsInt, IsISO8601, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { PublicationStatus } from '@prisma/client';

export class JourneyTranslationInputDto {
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  seoTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  seoDescription?: string;
}

export class CreateJourneyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  durationMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  distanceMeters?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  difficulty?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  region?: string;

  @ApiProperty({ type: [JourneyTranslationInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => JourneyTranslationInputDto)
  translations!: JourneyTranslationInputDto[];
}

export class AddJourneyStopDto {
  @ApiProperty()
  @IsString()
  placeId!: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  order!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  stopTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  recommendedDurationMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  storyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  eventId?: string;
}

export class ReorderJourneyStopsDto {
  @ApiProperty({ type: [String], description: 'Every existing stop id for this Journey, in the desired final order.' })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  stopIds!: string[];
}

export class SetJourneyHeroMediaDto {
  @ApiProperty()
  @IsString()
  mediaAssetId!: string;
}

export class SetJourneyEditorialStatusDto {
  @ApiProperty({ enum: PublicationStatus })
  @IsEnum(PublicationStatus)
  status!: PublicationStatus;

  @ApiPropertyOptional({ description: 'Required when sending a published Journey back to DRAFT or archiving it.' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Optimistic concurrency (spec section 60) - the version this edit was read at.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedVersion?: number;
}

export class ScheduleJourneyDto {
  @ApiProperty({ description: 'Must be in the future. Data-model only in this build - automatic execution at this time requires a scheduler that is not wired up (spec section 23), classified UNVERIFIED_LIVE_DB.' })
  @IsISO8601()
  scheduledAt!: string;
}
