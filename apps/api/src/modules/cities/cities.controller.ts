import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { PublicationStatus, Role } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Locale } from '../../common/decorators/locale.decorator';
import { OffsetPaginationQuery } from '../../common/dto/pagination.dto';
import { CitiesService } from './cities.service';
import { CreateCityDto, ListCitiesQueryDto, UpdateCityDto, UpsertCityTranslationDto } from './dto/city.dto';

class SetCityStatusDto {
  @IsEnum(PublicationStatus)
  status!: PublicationStatus;
}

@ApiTags('cities')
@Controller('cities')
export class CitiesController {
  constructor(private readonly cities: CitiesService) {}

  @Public()
  @Get()
  list(@Query() query: ListCitiesQueryDto, @Locale() locale: string) {
    return this.cities.listPublic({ country: query.country, region: query.region, locale, page: query.page, pageSize: query.pageSize });
  }

  @Public()
  @Get(':slug')
  getBySlug(@Param('slug') slug: string, @Locale() locale: string) {
    return this.cities.findBySlug(slug, locale);
  }

  @Public()
  @Get(':slug/destinations')
  getDestinations(@Param('slug') slug: string, @Locale() locale: string, @Query() query: OffsetPaginationQuery) {
    return this.cities.getDestinations(slug, locale, query.page, query.pageSize);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCityDto) {
    return this.cities.create(dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateCityDto) {
    return this.cities.update(id, dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/translations/:locale')
  upsertTranslation(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('locale') locale: string,
    @Body() dto: UpsertCityTranslationDto,
  ) {
    return this.cities.upsertTranslation(id, locale, dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/status')
  setStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetCityStatusDto) {
    return this.cities.setStatus(id, dto.status, user.id);
  }
}
