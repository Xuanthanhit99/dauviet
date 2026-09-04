import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { AccessPolicy, MediaType, RightsStatus } from '@prisma/client';
import { HistoricalDateInputDto } from '../../../common/historical-date/historical-date.dto';
import { ALLOWED_MEDIA_TYPES_BY_PURPOSE, UploadPurpose } from '../file-signature.util';

const UPLOAD_PURPOSES: UploadPurpose[] = ['photo', 'archival', 'document', 'audio', 'video', 'avatar'];

export class RequestUploadDto {
  @ApiProperty({ example: 'hoang-thanh-thang-long.jpg', description: 'Original filename - kept as metadata only, never used as the storage key.' })
  @IsString()
  @MaxLength(255)
  fileName!: string;

  @ApiProperty({ description: 'Declared Content-Type. Verified against the allow-list for `purpose`, and re-checked by magic-byte signature on confirm.' })
  @IsString()
  mimeType!: string;

  @ApiProperty({ description: 'Declared size in bytes, checked against the per-purpose limit and re-verified against the real object on confirm.' })
  @IsInt()
  @Min(1)
  sizeBytes!: number;

  @ApiProperty({ enum: MediaType })
  @IsEnum(MediaType)
  type!: MediaType;

  @ApiProperty({ enum: UPLOAD_PURPOSES, description: 'Determines the allowed MIME/size policy and the storage key prefix (spec section 15).' })
  @IsIn(UPLOAD_PURPOSES)
  purpose!: UploadPurpose;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  caption?: string;

  @ApiPropertyOptional({ description: 'Accessibility text (spec section 35). AI-generated alt text must be labeled as such, never silently treated as reviewed description.' })
  @IsOptional()
  @IsString()
  altText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  creatorName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceId?: string;

  @ApiPropertyOptional({ type: HistoricalDateInputDto, description: 'Capture/creation date, if known - never fabricated.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => HistoricalDateInputDto)
  captureDate?: HistoricalDateInputDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  license?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rightsHolder?: string;

  @ApiPropertyOptional({ description: 'Attribution line for public display, if the license/permission requires one.' })
  @IsOptional()
  @IsString()
  attributionText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  provenanceNote?: string;

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

export class ConfirmUploadDto {
  @ApiPropertyOptional({ description: 'SHA-256 hex digest computed client-side, cross-checked (not blindly trusted) against server computation where feasible.' })
  @IsOptional()
  @IsString()
  checksum?: string;
}

export class UpdateMediaRightsDto {
  @ApiPropertyOptional({ enum: RightsStatus })
  @IsOptional()
  @IsEnum(RightsStatus)
  rightsStatus?: RightsStatus;

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
  @IsString()
  attributionText?: string;
}

export class UpdateAccessPolicyDto {
  @ApiProperty({ enum: AccessPolicy })
  @IsEnum(AccessPolicy)
  accessPolicy!: AccessPolicy;
}

export class QuarantineMediaDto {
  @ApiProperty()
  @IsString()
  reason!: string;
}

export class SetMediaTranslationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  caption?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  altText?: string;
}

export class ArchiveMediaDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export { UPLOAD_PURPOSES, ALLOWED_MEDIA_TYPES_BY_PURPOSE };
