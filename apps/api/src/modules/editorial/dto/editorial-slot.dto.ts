import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EntityKind } from '@prisma/client';
import { IsEnum, IsInt, IsISO8601, IsOptional, IsString, Min } from 'class-validator';

export class UpsertEditorialSlotDto {
  @ApiProperty({ example: 'HOME_FEATURED_STORY', description: 'Slot name - not a fixed enum, so new slots do not require a schema migration.' })
  @IsString()
  slotKey!: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @ApiProperty({ enum: EntityKind })
  @IsEnum(EntityKind)
  entityKind!: EntityKind;

  @ApiProperty()
  @IsString()
  entityId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  endsAt?: string;
}
