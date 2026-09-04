import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ModerationStatus, PublicationStatus } from '@prisma/client';

export class CreateThenNowComparisonDto {
  @ApiProperty()
  @IsString()
  placeId!: string;

  @ApiProperty({ description: 'MediaAsset id for the "before" image - must be owned by the caller (or created by EDITOR+).' })
  @IsString()
  beforeMediaId!: string;

  @ApiProperty({ description: 'MediaAsset id for the "after" image - must be owned by the caller (or created by EDITOR+), and different from beforeMediaId.' })
  @IsString()
  afterMediaId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  historicalPeriod?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  viewpointNote?: string;

  @ApiPropertyOptional({ example: 'vi' })
  @IsOptional()
  @IsString()
  locale?: string;

  @ApiPropertyOptional({ description: 'Description in the given locale.' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class SetThenNowPublicationStatusDto {
  @ApiProperty({ enum: PublicationStatus })
  @IsEnum(PublicationStatus)
  status!: PublicationStatus;
}

export class SetThenNowModerationStatusDto {
  @ApiProperty({ enum: ModerationStatus })
  @IsEnum(ModerationStatus)
  status!: ModerationStatus;
}
