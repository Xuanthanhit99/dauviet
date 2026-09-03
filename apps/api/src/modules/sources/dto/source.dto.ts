import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUrl } from 'class-validator';
import { AccessPolicy, SourceCredibility, SourceType } from '@prisma/client';

export class CreateSourceDto {
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
  edition?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  volume?: string;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  accessedAt?: string;

  @ApiPropertyOptional({ enum: SourceCredibility })
  @IsOptional()
  @IsEnum(SourceCredibility)
  credibilityLevel?: SourceCredibility;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateSourceDocumentDto {
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
  extractedText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  usageRights?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rightsHolder?: string;

  @ApiPropertyOptional({ enum: AccessPolicy })
  @IsOptional()
  @IsEnum(AccessPolicy)
  accessPolicy?: AccessPolicy;
}
