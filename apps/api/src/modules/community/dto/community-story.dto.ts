import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEnum, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';
import { CommunityStoryType, DatePrecision } from '@prisma/client';

export class CommunityStoryTranslationInputDto {
  @ApiProperty({ example: 'vi' })
  @IsString()
  locale!: string;

  @ApiProperty()
  @IsString()
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
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
  eventDateLabel?: string;

  @ApiProperty({ type: [CommunityStoryTranslationInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CommunityStoryTranslationInputDto)
  translations!: CommunityStoryTranslationInputDto[];
}
