import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ProviderEnvironment } from '@prisma/client';

export class CreateProviderIntegrationDto {
  @ApiProperty({ enum: ProviderEnvironment })
  @IsEnum(ProviderEnvironment)
  environment!: ProviderEnvironment;

  @ApiPropertyOptional({ description: 'An env-var / secret-manager KEY NAME only - never the secret value itself.' })
  @IsOptional()
  @IsString()
  credentialReference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateProviderIntegrationDto {
  @ApiPropertyOptional({ description: 'An env-var / secret-manager KEY NAME only - never the secret value itself.' })
  @IsOptional()
  @IsString()
  credentialReference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
