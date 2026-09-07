import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { CommunityStoryType, DatePrecision } from '@prisma/client';
import { CursorPaginationQuery } from '../../../common/dto/pagination.dto';

/**
 * Phase 11 contract-hardening fix (spec section 13/14): `sort`/`type` were
 * previously read via bare `@Query('sort')`/`@Query('type')` parameter
 * bindings with no validation - an unrecognized `sort` value silently fell
 * back to the default order instead of a predictable 400, and `type` was
 * never checked against the real `CommunityStoryType` enum at all. Both
 * are now validated the same way every other filter/query DTO in this
 * codebase already is.
 */
export class ListCommunityStoriesQueryDto extends CursorPaginationQuery {
  @ApiPropertyOptional({ enum: CommunityStoryType })
  @IsOptional()
  @IsEnum(CommunityStoryType)
  type?: CommunityStoryType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  placeId?: string;

  @ApiPropertyOptional({ enum: ['NEW', 'HELPFUL'] })
  @IsOptional()
  @IsIn(['NEW', 'HELPFUL'])
  sort?: 'NEW' | 'HELPFUL';
}

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

