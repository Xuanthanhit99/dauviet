import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUrl, Min } from 'class-validator';
import {
  ProviderAttributionRequirement,
  ProviderCapabilityType,
  ProviderPolicyEvidenceSourceType,
  ProviderRightState,
} from '@prisma/client';

export class CreateProviderLicenseDto {
  @ApiProperty({ example: 'Places API core data' })
  @IsString()
  datasetOrProduct!: string;

  @ApiPropertyOptional({ enum: ProviderCapabilityType, description: 'Leave unset for a dataset-wide license not tied to one capability.' })
  @IsOptional()
  @IsEnum(ProviderCapabilityType)
  capability?: ProviderCapabilityType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  licenseType?: string;

  @ApiProperty()
  @IsUrl()
  termsUrl!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  privacyUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  developerTermsUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  effectiveUntil?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateProviderLicenseDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  datasetOrProduct?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  licenseType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  termsUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  privacyUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  developerTermsUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  effectiveUntil?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

/**
 * A dedicated reviewed action (spec section 11/21) - rights are never
 * silently mutated via a generic metadata PATCH. Setting `reviewedById`
 * happens server-side from the caller's identity, never client-supplied.
 */
export class SetProviderLicenseRightsDto {
  @ApiProperty({ enum: ProviderRightState })
  @IsEnum(ProviderRightState)
  rightsDisplay!: ProviderRightState;

  @ApiProperty({ enum: ProviderRightState })
  @IsEnum(ProviderRightState)
  rightsCache!: ProviderRightState;

  @ApiProperty({ enum: ProviderRightState })
  @IsEnum(ProviderRightState)
  rightsStore!: ProviderRightState;

  @ApiProperty({ enum: ProviderRightState })
  @IsEnum(ProviderRightState)
  rightsModify!: ProviderRightState;

  @ApiProperty({ enum: ProviderRightState })
  @IsEnum(ProviderRightState)
  rightsRedistribute!: ProviderRightState;

  @ApiProperty({ enum: ProviderRightState })
  @IsEnum(ProviderRightState)
  rightsCommercialUse!: ProviderRightState;

  @ApiPropertyOptional({ description: 'Required when any right above is CONDITIONAL.' })
  @IsOptional()
  @IsString()
  conditionalNotes?: string;

  @ApiProperty({ enum: ProviderAttributionRequirement })
  @IsEnum(ProviderAttributionRequirement)
  attributionRequirement!: ProviderAttributionRequirement;
}

export class CreateProviderDataPolicyDto {
  @ApiProperty({ enum: ProviderCapabilityType })
  @IsEnum(ProviderCapabilityType)
  capability!: ProviderCapabilityType;

  @ApiProperty({ enum: ProviderRightState })
  @IsEnum(ProviderRightState)
  cacheAllowed!: ProviderRightState;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxCacheSeconds?: number;

  @ApiProperty({ enum: ProviderRightState })
  @IsEnum(ProviderRightState)
  storeIdentityAllowed!: ProviderRightState;

  @ApiProperty({ enum: ProviderRightState })
  @IsEnum(ProviderRightState)
  storeContentAllowed!: ProviderRightState;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  refreshRequiredAfterSeconds?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  deleteAfterSeconds?: number;

  @ApiProperty({ enum: ProviderRightState })
  @IsEnum(ProviderRightState)
  persistentIdentifierAllowed!: ProviderRightState;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  policySourceUrl?: string;
}

export class CreateProviderAttributionRuleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  licenseId?: string;

  @ApiPropertyOptional({ enum: ProviderCapabilityType })
  @IsOptional()
  @IsEnum(ProviderCapabilityType)
  capability?: ProviderCapabilityType;

  @ApiProperty({ enum: ProviderAttributionRequirement })
  @IsEnum(ProviderAttributionRequirement)
  requirement!: ProviderAttributionRequirement;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  displayText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  logoRequired?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  linkUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  placementNotes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class CreateProviderPolicyEvidenceDto {
  @ApiProperty()
  @IsString()
  title!: string;

  @ApiProperty()
  @IsUrl()
  sourceUrl!: string;

  @ApiProperty()
  @IsDateString()
  accessedAt!: string;

  @ApiProperty({ enum: ProviderPolicyEvidenceSourceType })
  @IsEnum(ProviderPolicyEvidenceSourceType)
  sourceType!: ProviderPolicyEvidenceSourceType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
