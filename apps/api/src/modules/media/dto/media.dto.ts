import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength } from 'class-validator';
import { AccessPolicy, MediaType } from '@prisma/client';

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/tiff',
  'application/pdf',
  'audio/mpeg',
  'audio/wav',
  'video/mp4',
];

export class RequestUploadDto {
  @ApiProperty({ example: 'hoang-thanh-thang-long.jpg' })
  @IsString()
  @MaxLength(255)
  fileName!: string;

  @ApiProperty({ enum: ALLOWED_MIME_TYPES })
  @IsIn(ALLOWED_MIME_TYPES)
  mimeType!: string;

  @ApiProperty({ description: 'Bytes, max 200MB' })
  @IsInt()
  @Max(200 * 1024 * 1024)
  sizeBytes!: number;

  @ApiProperty({ enum: MediaType })
  @IsEnum(MediaType)
  type!: MediaType;
}

export class RegisterMediaDto {
  @ApiProperty()
  @IsString()
  storageKey!: string;

  @ApiProperty({ enum: MediaType })
  @IsEnum(MediaType)
  type!: MediaType;

  @ApiProperty()
  @IsString()
  mimeType!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sizeBytes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  caption?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  creatorName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  license?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rightsHolder?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isHistorical?: boolean;

  @ApiPropertyOptional({ description: 'Must be disclosed - AI-generated/reconstructed media must never masquerade as archival material.' })
  @IsOptional()
  @IsBoolean()
  isAiGenerated?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  aiDisclosure?: string;

  @ApiPropertyOptional({ enum: AccessPolicy })
  @IsOptional()
  @IsEnum(AccessPolicy)
  accessPolicy?: AccessPolicy;
}
