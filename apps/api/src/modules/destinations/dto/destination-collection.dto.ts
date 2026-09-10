import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEnum, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { TranslationMethod } from '@prisma/client';

export class DestinationCollectionTranslationInputDto {
  @ApiProperty({ example: 'vi' })
  @IsString()
  locale!: string;

  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  summary?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: TranslationMethod })
  @IsOptional()
  @IsEnum(TranslationMethod)
  method?: TranslationMethod;
}

export class CreateDestinationCollectionDto {
  @ApiPropertyOptional({ description: 'Optional country scope - omit for a cross-country collection.' })
  @IsOptional()
  @IsString()
  countryId?: string;

  @ApiProperty({ type: [DestinationCollectionTranslationInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DestinationCollectionTranslationInputDto)
  translations!: DestinationCollectionTranslationInputDto[];
}

export class UpsertDestinationCollectionTranslationDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  summary?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: TranslationMethod })
  @IsOptional()
  @IsEnum(TranslationMethod)
  method?: TranslationMethod;
}

export class DestinationCollectionMemberInputDto {
  @ApiProperty()
  @IsString()
  destinationId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class SetDestinationCollectionMembersDto {
  @ApiProperty({ type: [DestinationCollectionMemberInputDto], description: 'Full desired ordered membership (G04). Replaces the existing set.' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DestinationCollectionMemberInputDto)
  members!: DestinationCollectionMemberInputDto[];
}
