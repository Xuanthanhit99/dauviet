import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsOptional, IsString, ValidateNested } from 'class-validator';
import { FactCertainty, FactEditorialStatus, FactSensitivity, FactType } from '@prisma/client';
import { HistoricalDateInputDto } from '../../../common/historical-date/historical-date.dto';

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

  @ApiPropertyOptional({ type: HistoricalDateInputDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => HistoricalDateInputDto)
  date?: HistoricalDateInputDto;

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
