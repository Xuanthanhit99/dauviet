import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { ContributionStatus } from '@prisma/client';

export class CreateContributionDto {
  @ApiProperty()
  @IsString()
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  originSource?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currentOwner?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sharingRights?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  approxDateLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  approxDateStart?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  approxDateEnd?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  peopleShown?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  placeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contextNote?: string;

  @ApiPropertyOptional({ type: [String], description: 'MediaAsset ids uploaded beforehand' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mediaAssetIds?: string[];
}

export class AdvanceContributionDto {
  @ApiProperty({ enum: ContributionStatus })
  @IsEnum(ContributionStatus)
  status!: ContributionStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
