import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { PublicationStatus, Role } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Locale } from '../../common/decorators/locale.decorator';
import { ActivitiesService } from './activities.service';
import {
  CreateActivityDto,
  CreateProviderActivityReferenceDto,
  GetActivityOffersDto,
  ListActivitiesQueryDto,
  MapProviderActivityReferenceDto,
  SetActivityDestinationsDto,
  UpsertActivityTranslationDto,
} from './dto/activity.dto';

class SetActivityStatusDto {
  @IsEnum(PublicationStatus)
  status!: PublicationStatus;
}

@ApiTags('activities')
@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  @Public()
  @Get()
  list(@Query() query: ListActivitiesQueryDto, @Locale() locale: string) {
    return this.activities.listPublic({ country: query.country, destination: query.destination, locale, page: query.page, pageSize: query.pageSize });
  }

  @Public()
  @Get(':slug')
  getBySlug(@Param('slug') slug: string, @Locale() locale: string) {
    return this.activities.findBySlug(slug, locale);
  }

  @Public()
  @Get(':slug/offers')
  getOffers(@Param('slug') slug: string, @Query() query: GetActivityOffersDto) {
    return this.activities.getOffers(slug, query);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateActivityDto) {
    return this.activities.create(dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/translations/:locale')
  upsertTranslation(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('locale') locale: string, @Body() dto: UpsertActivityTranslationDto) {
    return this.activities.upsertTranslation(id, locale, dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/status')
  setStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetActivityStatusDto) {
    return this.activities.setStatus(id, dto.status, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/destinations')
  setDestinations(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetActivityDestinationsDto) {
    return this.activities.setDestinations(id, dto.destinationIds, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Post('provider-references')
  upsertProviderReference(@CurrentUser() user: AuthUser, @Body() dto: CreateProviderActivityReferenceDto) {
    return this.activities.upsertProviderReference(dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch('provider-references/:referenceId/map')
  mapProviderReference(@CurrentUser() user: AuthUser, @Param('referenceId') referenceId: string, @Body() dto: MapProviderActivityReferenceDto) {
    return this.activities.mapProviderReference(referenceId, dto, user.id);
  }
}
