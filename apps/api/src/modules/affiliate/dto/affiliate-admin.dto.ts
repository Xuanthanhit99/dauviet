import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';
import { AffiliateConversionStatus, AffiliateEvidenceType } from '@prisma/client';
import { OffsetPaginationQuery } from '../../../common/dto/pagination.dto';

export class ListAffiliateConversionsQueryDto extends OffsetPaginationQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  providerCode?: string;

  @ApiPropertyOptional({ enum: AffiliateConversionStatus })
  @IsOptional()
  @IsIn(Object.values(AffiliateConversionStatus))
  status?: AffiliateConversionStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;
}

/**
 * Approved-evidence ingestion (spec section 27-29/43/53) - never a generic
 * "create commission" endpoint. `evidence` is the provider-shaped raw
 * payload, normalized (not stored raw, spec section 43) via the adapter's
 * own `normalizeConversion`. `evidenceReference` is required (spec section
 * 53's "require evidence/source").
 */
export class IngestAffiliateConversionDto {
  @ApiProperty({ example: 'TEST_FIXTURE_PROVIDER_G10_AFFILIATE' })
  @IsString()
  providerCode!: string;

  @ApiProperty({ enum: AffiliateEvidenceType })
  @IsIn(Object.values(AffiliateEvidenceType))
  evidenceType!: AffiliateEvidenceType;

  @ApiProperty({ description: 'The provider report id / webhook delivery id / import batch reference this evidence came from - never the raw payload itself in the audit trail.' })
  @IsString()
  evidenceReference!: string;

  @ApiProperty({ description: 'Provider-shaped raw evidence, normalized via the adapter and never persisted verbatim.' })
  @IsObject()
  evidence!: Record<string, unknown>;
}
