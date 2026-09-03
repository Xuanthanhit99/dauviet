import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsEnum, IsOptional, IsString, ValidateNested } from 'class-validator';
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  eventDateStart?: string;

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
