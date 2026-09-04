import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsEnum, IsInt, IsISO8601, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { ReviewDecision, StoryEditorialStatus, StoryLinkRole, StoryType, TranslationMethod } from '@prisma/client';

export class StoryTranslationInputDto {
  @ApiProperty({ example: 'vi' })
  @IsString()
  locale!: string;

  @ApiProperty()
  @IsString()
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subtitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  summary?: string;

  @ApiPropertyOptional({ description: 'Structured content-block array - see story-body.util.ts. Never raw HTML.' })
  @IsOptional()
  content?: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  seoTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  seoDescription?: string;

  @ApiPropertyOptional({ enum: TranslationMethod })
  @IsOptional()
  @IsEnum(TranslationMethod)
  method?: TranslationMethod;
}

export class CreateStoryDto {
  @ApiPropertyOptional({ enum: StoryType })
  @IsOptional()
  @IsEnum(StoryType)
  type?: StoryType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  byline?: string;

  @ApiProperty({ type: [StoryTranslationInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StoryTranslationInputDto)
  translations!: StoryTranslationInputDto[];
}

export class LinkStoryEntityDto {
  @ApiProperty()
  @IsString()
  entityId!: string;

  @ApiPropertyOptional({ enum: StoryLinkRole })
  @IsOptional()
  @IsEnum(StoryLinkRole)
  role?: StoryLinkRole;
}

export class LinkStoryFactDto {
  @ApiProperty()
  @IsString()
  factId!: string;
}

export class LinkStoryCitationDto {
  @ApiProperty()
  @IsString()
  citationId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  locator?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  quoteNote?: string;
}

export class SetStoryHeroMediaDto {
  @ApiProperty()
  @IsString()
  mediaAssetId!: string;
}

export class SetStoryEditorialStatusDto {
  @ApiProperty({ enum: StoryEditorialStatus })
  @IsEnum(StoryEditorialStatus)
  status!: StoryEditorialStatus;

  @ApiPropertyOptional({ description: 'Required when sending a Story back to DRAFT or archiving a published one.' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ enum: ReviewDecision })
  @IsOptional()
  @IsEnum(ReviewDecision)
  decision?: ReviewDecision;

  @ApiPropertyOptional({ description: 'Required only when transitioning to SCHEDULED - must be in the future.' })
  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;

  @ApiPropertyOptional({ description: 'Optimistic concurrency (spec section 60) - the version this edit was read at.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedVersion?: number;
}

export class SetStoryFeaturedDto {
  @ApiProperty()
  @IsBoolean()
  featured!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  priority?: number;
}
