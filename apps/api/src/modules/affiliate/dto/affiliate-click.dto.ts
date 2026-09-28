import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { AffiliatePlacement, AffiliateSourceSurface, EntityKind } from '@prisma/client';

/**
 * Redirect input is canonical internal identifiers only (spec section 11) -
 * deliberately NO `url`/`destinationUrl`/`redirectTo` field exists anywhere
 * on this DTO (spec section 12) - the server/adapter is the sole authority
 * for the destination.
 */
export class CreateAffiliateClickDto {
  @ApiProperty({ example: 'TEST_FIXTURE_PROVIDER_G10_AFFILIATE' })
  @IsString()
  providerCode!: string;

  @ApiPropertyOptional({ description: 'The G05 provider-reference id this click is about, if any. Never a full offer payload.' })
  @IsOptional()
  @IsString()
  providerEntityReferenceId?: string;

  @ApiPropertyOptional({ description: 'The G05 provider-offer id this click is about, if any.' })
  @IsOptional()
  @IsString()
  providerOfferId?: string;

  @ApiPropertyOptional({ enum: EntityKind, description: 'Which G05 reference-table family providerEntityReferenceId belongs to.' })
  @IsOptional()
  @IsEnum(EntityKind)
  entityKind?: EntityKind;

  @ApiProperty({ enum: AffiliateSourceSurface })
  @IsIn(Object.values(AffiliateSourceSurface))
  surface!: AffiliateSourceSurface;

  @ApiPropertyOptional({ enum: AffiliatePlacement })
  @IsOptional()
  @IsIn(Object.values(AffiliatePlacement))
  placement?: AffiliatePlacement;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tripId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  destinationId?: string;

  @ApiPropertyOptional({ description: 'A previous response\'s sessionId, for attribution continuity across multiple clicks in the same browsing session. Omit to start a new session.' })
  @IsOptional()
  @IsString()
  sessionId?: string;
}
