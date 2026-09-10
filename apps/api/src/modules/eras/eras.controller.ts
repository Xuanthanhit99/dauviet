import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Locale } from '../../common/decorators/locale.decorator';
import { ErasService } from './eras.service';
import { CreateEraDto, SetEraCountriesDto } from './dto/era.dto';

class SetEraParentDto {
  @ApiPropertyOptional({ description: 'Omit/null to detach from any parent era.' })
  @IsOptional()
  @IsString()
  parentEraId?: string | null;
}

@ApiTags('eras')
@Controller('eras')
export class ErasController {
  constructor(private readonly eras: ErasService) {}

  @Public()
  @Get()
  list(@Locale() locale: string) {
    return this.eras.list(locale);
  }

  @Public()
  @Get(':slug')
  getBySlug(@Param('slug') slug: string, @Locale() locale: string) {
    return this.eras.findBySlug(slug, locale);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateEraDto) {
    return this.eras.create(dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/parent')
  setParent(@Param('id') id: string, @Body() dto: SetEraParentDto, @CurrentUser() user: AuthUser) {
    return this.eras.setParent(id, dto.parentEraId ?? null, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/countries')
  setCountries(@Param('id') id: string, @Body() dto: SetEraCountriesDto, @CurrentUser() user: AuthUser) {
    return this.eras.setCountries(id, dto.countryIds, user.id);
  }
}
