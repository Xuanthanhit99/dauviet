import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { PublicationStatus, Role } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Locale } from '../../common/decorators/locale.decorator';
import { AccommodationsService } from './accommodations.service';
import {
  CreateAccommodationDto,
  CreateProviderAccommodationReferenceDto,
  GetAccommodationOffersDto,
  ListAccommodationsQueryDto,
  MapProviderAccommodationReferenceDto,
  SetAccommodationDestinationsDto,
  UpdateAccommodationDto,
  UpsertAccommodationTranslationDto,
} from './dto/accommodation.dto';

class SetAccommodationStatusDto {
  @IsEnum(PublicationStatus)
  status!: PublicationStatus;
}

@ApiTags('accommodations')
@Controller('accommodations')
export class AccommodationsController {
  constructor(private readonly accommodations: AccommodationsService) {}

  @Public()
  @Get()
  list(@Query() query: ListAccommodationsQueryDto, @Locale() locale: string) {
    return this.accommodations.listPublic({
      country: query.country,
      region: query.region,
      city: query.city,
      destination: query.destination,
      type: query.type,
      locale,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Public()
  @Get(':slug')
  getBySlug(@Param('slug') slug: string, @Locale() locale: string) {
    return this.accommodations.findBySlug(slug, locale);
  }

  @Public()
  @Get(':slug/offers')
  getOffers(@Param('slug') slug: string, @Query() query: GetAccommodationOffersDto) {
    return this.accommodations.getOffers(slug, query);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAccommodationDto) {
    return this.accommodations.create(dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateAccommodationDto) {
    return this.accommodations.update(id, dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/translations/:locale')
  upsertTranslation(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('locale') locale: string, @Body() dto: UpsertAccommodationTranslationDto) {
    return this.accommodations.upsertTranslation(id, locale, dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/status')
  setStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetAccommodationStatusDto) {
    return this.accommodations.setStatus(id, dto.status, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/destinations')
  setDestinations(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetAccommodationDestinationsDto) {
    return this.accommodations.setDestinations(id, dto.destinationIds, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Post('provider-references')
  upsertProviderReference(@CurrentUser() user: AuthUser, @Body() dto: CreateProviderAccommodationReferenceDto) {
    return this.accommodations.upsertProviderReference(dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch('provider-references/:referenceId/map')
  mapProviderReference(@CurrentUser() user: AuthUser, @Param('referenceId') referenceId: string, @Body() dto: MapProviderAccommodationReferenceDto) {
    return this.accommodations.mapProviderReference(referenceId, dto, user.id);
  }
}
