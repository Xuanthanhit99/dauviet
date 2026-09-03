import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AliasType, EntityKind } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateAliasDto {
  @ApiProperty({ enum: EntityKind })
  @IsEnum(EntityKind)
  entityType!: EntityKind;

  @ApiProperty()
  @IsString()
  entityId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  alias!: string;

  @ApiPropertyOptional({ enum: AliasType })
  @IsOptional()
  @IsEnum(AliasType)
  aliasType?: AliasType;

  @ApiPropertyOptional({ description: 'Leave unset for a locale-agnostic alias (e.g. a romanization usable in any locale).' })
  @IsOptional()
  @IsString()
  locale?: string;
}
