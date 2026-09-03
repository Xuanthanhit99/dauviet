import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { DatePrecision, FactCertainty, FactEditorialStatus, FactSensitivity, FactType } from '@prisma/client';

export class CreateFactDto {
  @ApiProperty({ enum: FactType })
  @IsEnum(FactType)
  factType!: FactType;

  @ApiProperty({ example: 'vi' })
  @IsString()
  locale!: string;

  @ApiProperty({ description: 'The factual statement, in the given locale.' })
  @IsString()
  statement!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateStart?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateEnd?: string;

  @ApiPropertyOptional({ enum: DatePrecision })
  @IsOptional()
  @IsEnum(DatePrecision)
  datePrecision?: DatePrecision;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dateLabel?: string;

  @ApiPropertyOptional({ enum: FactCertainty })
  @IsOptional()
  @IsEnum(FactCertainty)
  certainty?: FactCertainty;

  @ApiPropertyOptional({ enum: FactSensitivity })
  @IsOptional()
  @IsEnum(FactSensitivity)
  sensitivity?: FactSensitivity;
}

export class SetFactEditorialStatusDto {
  @ApiProperty({ enum: FactEditorialStatus })
  @IsEnum(FactEditorialStatus)
  status!: FactEditorialStatus;
}

export class LinkFactEntityDto {
  @ApiProperty()
  @IsString()
  entityId!: string;
}
