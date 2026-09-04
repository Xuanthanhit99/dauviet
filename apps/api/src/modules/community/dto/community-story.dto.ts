import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { CommunityStoryType, DatePrecision } from '@prisma/client';

export class CommunityStoryTranslationInputDto {
  @ApiProperty({ example: 'vi' })
  @IsString()
  locale!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  content?: string;
}

export class CreateCommunityStoryDto {
  @ApiProperty({ enum: CommunityStoryType })
  @IsEnum(CommunityStoryType)
  type!: CommunityStoryType;

  @ApiPropertyOptional({ description: 'Only known component - never fabricate a month/day.' })
  @IsOptional()
  @IsInt()
  eventDateYear?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  eventDateMonth?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  eventDateDay?: number;

  @ApiPropertyOptional({ enum: DatePrecision })
  @IsOptional()
  @IsEnum(DatePrecision)
  eventDatePrecision?: DatePrecision;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  eventDateLabel?: string;

  @ApiPropertyOptional({ description: 'Must be a MediaAsset the caller owns (spec section 16).' })
  @IsOptional()
  @IsString()
  heroMediaId?: string;

  @ApiPropertyOptional({ description: 'Only valid when type = THEN_AND_NOW (spec section 18) - must be a ThenNowComparison the caller created.' })
  @IsOptional()
  @IsString()
  thenNowComparisonId?: string;

  @ApiProperty({ type: [CommunityStoryTranslationInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CommunityStoryTranslationInputDto)
  translations!: CommunityStoryTranslationInputDto[];
}

/**
 * Deliberately excludes `verificationState`/`moderationStatus` (spec section
 * 13: "Do not let user mutate moderation/verification fields") - those move
 * only through `setAuthorVerificationState`/`setReviewVerificationState`/
 * `setModerationStatus`, never a plain field update.
 */
export class UpdateCommunityStoryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  eventDateYear?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  eventDateMonth?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  eventDateDay?: number;

  @ApiPropertyOptional({ enum: DatePrecision })
  @IsOptional()
  @IsEnum(DatePrecision)
  eventDatePrecision?: DatePrecision;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  eventDateLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  heroMediaId?: string;

  @ApiPropertyOptional({ type: [CommunityStoryTranslationInputDto], description: 'Replaces the story\'s translations wholesale.' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CommunityStoryTranslationInputDto)
  translations?: CommunityStoryTranslationInputDto[];
}

