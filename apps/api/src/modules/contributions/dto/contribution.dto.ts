import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  AccessPolicy,
  ContributionAttribution,
  ContributionReviewDecision,
  ContributionRightsReviewState,
  ContributionSourceType,
  ContributionStatus,
  ContributionType,
  EntityKind,
  FactSensitivity,
  MediaType,
  ProvenanceConfidence,
  SourceCredibility,
  SourceType,
  SubmitterRightsDeclaration,
} from '@prisma/client';

/**
 * Entity kinds a Contribution may tag as contextual metadata beyond its own
 * `placeId` (spec section 8) - deliberately excludes PLACE (already its own
 * FK) and every non-historical kind (STORY/COMMUNITY_STORY/etc.) that a raw
 * contribution has no business linking to directly.
 */
export const CONTRIBUTION_LINKABLE_KINDS: EntityKind[] = [
  EntityKind.PERSON,
  EntityKind.EVENT,
  EntityKind.ERA,
  EntityKind.TERRITORY,
];

/** Canonical record kinds a CORRECTION contribution may target (spec section 20/21). */
export const CONTRIBUTION_CORRECTION_TARGET_KINDS: EntityKind[] = [
  EntityKind.PLACE,
  EntityKind.PERSON,
  EntityKind.EVENT,
  EntityKind.ERA,
  EntityKind.STORY,
  EntityKind.SOURCE,
  EntityKind.FACT,
];

export class CreateContributionDto {
  @ApiPropertyOptional({ enum: ContributionType, default: ContributionType.OTHER })
  @IsOptional()
  @IsEnum(ContributionType)
  type?: ContributionType;

  @ApiProperty()
  @IsString()
  @MaxLength(300)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ description: 'BCP-47-ish locale of the original submission text (spec section 7) - never silently translated.' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  originalLocale?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  originSource?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  currentOwner?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  sharingRights?: string;

  @ApiPropertyOptional({ enum: SubmitterRightsDeclaration, description: "Submitter's own claim - never an adjudicated rights state (spec section 13)." })
  @IsOptional()
  @IsEnum(SubmitterRightsDeclaration)
  submitterDeclaration?: SubmitterRightsDeclaration;

  @ApiPropertyOptional({ enum: ContributionAttribution })
  @IsOptional()
  @IsEnum(ContributionAttribution)
  attribution?: ContributionAttribution;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
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

  @ApiPropertyOptional({ enum: CONTRIBUTION_LINKABLE_KINDS })
  @IsOptional()
  @IsEnum(EntityKind)
  linkedEntityType?: EntityKind;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  linkedEntityId?: string;

  @ApiPropertyOptional({ enum: CONTRIBUTION_CORRECTION_TARGET_KINDS, description: 'Required (with correctionTargetId) when type=CORRECTION.' })
  @IsOptional()
  @IsEnum(EntityKind)
  correctionTargetType?: EntityKind;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  correctionTargetId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  contextNote?: string;

  @ApiPropertyOptional({ type: [String], description: 'MediaAsset ids uploaded beforehand - each must be owned by the caller (or the caller is EDITOR+).' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  mediaAssetIds?: string[];
}

/** SUBMITTED/NEEDS_INFORMATION-state edits only (spec section 45) - same field set as create, all optional. */
export class UpdateContributionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  originSource?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  currentOwner?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  sharingRights?: string;

  @ApiPropertyOptional({ enum: SubmitterRightsDeclaration })
  @IsOptional()
  @IsEnum(SubmitterRightsDeclaration)
  submitterDeclaration?: SubmitterRightsDeclaration;

  @ApiPropertyOptional({ enum: ContributionAttribution })
  @IsOptional()
  @IsEnum(ContributionAttribution)
  attribution?: ContributionAttribution;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
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
  @MaxLength(3000)
  contextNote?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mediaAssetIds?: string[];
}

export class AddProvenanceSourceDto {
  @ApiProperty({ enum: ContributionSourceType })
  @IsEnum(ContributionSourceType)
  referenceType!: ContributionSourceType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  claimedCreator?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  claimedOwner?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  acquisitionMethod?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  approxDateLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  sourceOrganization?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  archiveCatalogRef?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  publicationInfo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  url?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  evidenceMediaAssetId?: string;
}

/** Base fields shared by every reviewer/admin write against one contribution - the optimistic-concurrency guard (spec section 53/54). */
class VersionedActionDto {
  @ApiProperty({ description: 'The Contribution.version this action was read at - stale values are refused (CONTRIBUTION_VERSION_CONFLICT).' })
  @Type(() => Number)
  @IsInt()
  expectedVersion!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  notes?: string;
}

/**
 * The single review-action entrypoint (spec sections 27/49) - server
 * validates the transition + role + self-review, never a client-chosen
 * arbitrary next status.
 */
export class SubmitContributionReviewDto extends VersionedActionDto {
  @ApiProperty({ enum: ContributionReviewDecision })
  @IsEnum(ContributionReviewDecision)
  decision!: ContributionReviewDecision;
}

export class SetRightsReviewDto extends VersionedActionDto {
  @ApiProperty({ enum: ContributionRightsReviewState })
  @IsEnum(ContributionRightsReviewState)
  rightsReviewState!: ContributionRightsReviewState;
}

export class SetProvenanceConfidenceDto extends VersionedActionDto {
  @ApiProperty({ enum: ProvenanceConfidence })
  @IsEnum(ProvenanceConfidence)
  provenanceConfidence!: ProvenanceConfidence;
}

export class SetSensitivityDto extends VersionedActionDto {
  @ApiProperty({ enum: FactSensitivity })
  @IsEnum(FactSensitivity)
  sensitivity!: FactSensitivity;
}

export class WithdrawContributionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class CatalogueSourceDto extends VersionedActionDto {
  @ApiProperty({ enum: SourceType })
  @IsEnum(SourceType)
  sourceType!: SourceType;

  @ApiProperty()
  @IsString()
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  author?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  organization?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  publisher?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  publicationYear?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  isbn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  issn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  archiveName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  archiveCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  originalLanguage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  url?: string;

  @ApiProperty({ enum: SourceCredibility, description: 'Reviewer-set only - never copied from any submitter-supplied field (spec section 32).' })
  @IsEnum(SourceCredibility)
  credibilityLevel!: SourceCredibility;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CatalogueDocumentDto extends VersionedActionDto {
  @ApiProperty()
  @IsString()
  mediaAssetId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  pageCount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  usageRights?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rightsHolder?: string;

  @ApiPropertyOptional({ enum: AccessPolicy, description: 'Defaults to METADATA_ONLY - unknown-rights contributed documents are never defaulted to PUBLIC (spec section 63).' })
  @IsOptional()
  @IsEnum(AccessPolicy)
  accessPolicy?: AccessPolicy;
}

export class CatalogueMediaDto extends VersionedActionDto {
  @ApiProperty()
  @IsString()
  mediaAssetId!: string;

  @ApiPropertyOptional({ enum: MediaType, description: 'e.g. promote a plain PHOTO to ARCHIVAL_PHOTO/MAP - reviewer-only (spec section 35/36).' })
  @IsOptional()
  @IsEnum(MediaType)
  promoteToType?: MediaType;

  @ApiPropertyOptional({ description: 'Link the promoted media to the canonical Source already catalogued for this contribution.' })
  @IsOptional()
  @IsBoolean()
  linkToCataloguedSource?: boolean;
}

/** GET /v1/admin/contributions filters (spec section 47). */
export class ContributionQueueQueryDto {
  @ApiPropertyOptional({ enum: ContributionStatus })
  @IsOptional()
  @IsEnum(ContributionStatus)
  status?: ContributionStatus;

  @ApiPropertyOptional({ enum: ContributionType })
  @IsOptional()
  @IsEnum(ContributionType)
  type?: ContributionType;

  @ApiPropertyOptional({ enum: FactSensitivity })
  @IsOptional()
  @IsEnum(FactSensitivity)
  sensitivity?: FactSensitivity;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  submitterId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reviewerId?: string;

  @ApiPropertyOptional({ enum: EntityKind })
  @IsOptional()
  @IsEnum(EntityKind)
  correctionTargetType?: EntityKind;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
