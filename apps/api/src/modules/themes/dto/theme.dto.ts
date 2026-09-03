import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEnum, IsOptional, IsString, ValidateNested } from 'class-validator';
import { ThemeCategory } from '@prisma/client';

export class ThemeTranslationInputDto {
  @ApiProperty({ example: 'vi' })
  @IsString()
  locale!: string;

  @ApiProperty()
  @IsString()
  name!: string;
}

export class CreateThemeDto {
  @ApiProperty({ enum: ThemeCategory })
  @IsEnum(ThemeCategory)
  category!: ThemeCategory;

  @ApiProperty({ type: [ThemeTranslationInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ThemeTranslationInputDto)
  translations!: ThemeTranslationInputDto[];
}

export class ThemeQueryDto {
  @ApiPropertyOptional({ enum: ThemeCategory })
  @IsOptional()
  @IsEnum(ThemeCategory)
  category?: ThemeCategory;
}
