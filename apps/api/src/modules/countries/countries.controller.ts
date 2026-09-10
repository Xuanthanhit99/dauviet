import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { PublicationStatus, Role } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Locale } from '../../common/decorators/locale.decorator';
import { OffsetPaginationQuery } from '../../common/dto/pagination.dto';
import { CountriesService } from './countries.service';
import {
  CreateCountryDto,
  ListCountryCitiesQueryDto,
  ListCountryDestinationsQueryDto,
  ListCountryRegionsQueryDto,
  UpdateCountryDto,
  UpsertCountryTranslationDto,
} from './dto/country.dto';

class SetCountryStatusDto {
  @IsEnum(PublicationStatus)
  status!: PublicationStatus;
}

@ApiTags('countries')
@Controller('countries')
export class CountriesController {
  constructor(private readonly countries: CountriesService) {}

  @Public()
  @Get()
  list(@Query() query: OffsetPaginationQuery, @Locale() locale: string) {
    return this.countries.list({ locale, page: query.page, pageSize: query.pageSize });
  }

  @Public()
  @Get(':slug')
  getBySlug(@Param('slug') slug: string, @Locale() locale: string) {
    return this.countries.findBySlug(slug, locale);
  }

  @Public()
  @Get(':slug/regions')
  getRegions(@Param('slug') slug: string, @Locale() locale: string, @Query() query: ListCountryRegionsQueryDto) {
    return this.countries.getRegions(slug, locale, query.page, query.pageSize, query.type);
  }

  @Public()
  @Get(':slug/cities')
  getCities(@Param('slug') slug: string, @Locale() locale: string, @Query() query: ListCountryCitiesQueryDto) {
    return this.countries.getCities(slug, locale, query.page, query.pageSize, query.region);
  }

  @Public()
  @Get(':slug/destinations')
  getDestinations(@Param('slug') slug: string, @Locale() locale: string, @Query() query: ListCountryDestinationsQueryDto) {
    return this.countries.getDestinations(slug, locale, query.page, query.pageSize, query.region, query.city, query.type);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCountryDto) {
    return this.countries.create(dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateCountryDto) {
    return this.countries.update(id, dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/translations/:locale')
  upsertTranslation(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('locale') locale: string,
    @Body() dto: UpsertCountryTranslationDto,
  ) {
    return this.countries.upsertTranslation(id, locale, dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/status')
  setStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetCountryStatusDto) {
    return this.countries.setStatus(id, dto.status, user.id);
  }
}
