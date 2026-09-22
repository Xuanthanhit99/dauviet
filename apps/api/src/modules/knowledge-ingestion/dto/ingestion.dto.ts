import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  IngestionCandidateStatus,
  IngestionScopeType,
  IngestionSourceClass,
  IngestionTransport,
  ProviderAttributionRequirement,
  ProviderRightState,
  RawPayloadStoragePolicy,
} from '@prisma/client';
import { OffsetPaginationQuery } from '../../../common/dto/pagination.dto';

const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);

export class CreateIngestionSourceDto {
  @ApiProperty({ example: 'WIKIDATA' })
  @Transform(upper)
  @Matches(/^[A-Z][A-Z0-9_]{1,63}$/)
  code!: string;

  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ enum: IngestionSourceClass })
  @IsEnum(IngestionSourceClass)
  sourceClass!: IngestionSourceClass;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpsertIngestionSourcePolicyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiProperty({ enum: IngestionTransport })
  @IsEnum(IngestionTransport)
  transport!: IngestionTransport;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  authRequired?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  rateLimitPerSecond?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  rateLimitPerDay?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  concurrencyLimit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  maxRetries?: number;

  @ApiProperty({ enum: RawPayloadStoragePolicy })
  @IsEnum(RawPayloadStoragePolicy)
  rawPayloadStorage!: RawPayloadStoragePolicy;

  @ApiProperty({ enum: ProviderRightState })
  @IsEnum(ProviderRightState)
  normalizedStorageRight!: ProviderRightState;

  @ApiProperty({ enum: ProviderRightState })
  @IsEnum(ProviderRightState)
  commercialUseRight!: ProviderRightState;

  @ApiPropertyOptional({ enum: ProviderRightState })
  @IsOptional()
  @IsEnum(ProviderRightState)
  mediaReusePolicy?: ProviderRightState;

  @ApiProperty({ enum: ProviderAttributionRequirement })
  @IsEnum(ProviderAttributionRequirement)
  attributionRequirement!: ProviderAttributionRequirement;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  licenseCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  licenseUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  sourceUrl?: string;

  @ApiPropertyOptional()
  @ValidateIf((o) => o.commercialUseRight === 'CONDITIONAL' || o.normalizedStorageRight === 'CONDITIONAL' || o.mediaReusePolicy === 'CONDITIONAL')
  @IsString()
  conditionalNotes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  cacheMaxAgeSeconds?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  retentionDays?: number;
}

export class CreateIngestionSourcePolicyEvidenceDto {
  @ApiProperty()
  @IsString()
  title!: string;

  @ApiProperty()
  @IsUrl()
  sourceUrl!: string;

  @ApiProperty()
  @Type(() => Date)
  accessedAt!: Date;

  @ApiProperty()
  @IsString()
  sourceType!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateIngestionJobDto {
  @ApiProperty({ example: 'WIKIDATA' })
  @Transform(upper)
  @IsString()
  sourceCode!: string;

  @ApiProperty({ enum: IngestionScopeType })
  @IsEnum(IngestionScopeType)
  scopeType!: IngestionScopeType;

  @ApiProperty({ description: 'Bounded scope payload, e.g. { "ids": ["Q1858"] } - never {} (spec section 18).' })
  @IsObject()
  scopeParams!: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  label?: string;
}

export class ReviewCandidateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class MergeCandidateDto {
  @ApiProperty()
  @IsString()
  mergedIntoCandidateId!: string;
}

export class ListCandidatesQuery extends OffsetPaginationQuery {
  @ApiPropertyOptional({ enum: IngestionCandidateStatus })
  @IsOptional()
  @IsEnum(IngestionCandidateStatus)
  status?: IngestionCandidateStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceCode?: string;
}
