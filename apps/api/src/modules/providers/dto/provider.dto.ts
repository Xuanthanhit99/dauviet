import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsEnum, IsOptional, IsString, IsUrl, Matches } from 'class-validator';
import { ProviderCapabilityType, ProviderCredentialMode, ProviderEnvironment } from '@prisma/client';

const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);

export class CreateProviderDto {
  @ApiProperty({ example: 'GOOGLE_PLACES', description: 'Stable, machine-readable, immutable after creation.' })
  @Transform(upper)
  @Matches(/^[A-Z][A-Z0-9_]{1,63}$/, { message: 'code must be uppercase letters/digits/underscore, starting with a letter.' })
  code!: string;

  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  websiteUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  developerUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  partnerPortalUrl?: string;

  @ApiPropertyOptional({ enum: ProviderCredentialMode })
  @IsOptional()
  @IsEnum(ProviderCredentialMode)
  credentialMode?: ProviderCredentialMode;

  @ApiPropertyOptional({ enum: ProviderEnvironment, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(ProviderEnvironment, { each: true })
  supportedEnvironments?: ProviderEnvironment[];
}

/** `code` is immutable after creation (spec section 6) - not editable here. */
export class UpdateProviderDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  websiteUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  developerUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  partnerPortalUrl?: string;

  @ApiPropertyOptional({ enum: ProviderCredentialMode })
  @IsOptional()
  @IsEnum(ProviderCredentialMode)
  credentialMode?: ProviderCredentialMode;

  @ApiPropertyOptional({ enum: ProviderEnvironment, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(ProviderEnvironment, { each: true })
  supportedEnvironments?: ProviderEnvironment[];
}

export class DeclareProviderCapabilityDto {
  @ApiProperty({ enum: ProviderCapabilityType })
  @IsEnum(ProviderCapabilityType)
  capability!: ProviderCapabilityType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
