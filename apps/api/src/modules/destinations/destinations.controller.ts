import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { PublicationStatus, Role } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Locale } from '../../common/decorators/locale.decorator';
import { DestinationsService } from './destinations.service';
import { CreateDestinationDto, ListDestinationsQueryDto, UpdateDestinationDto, UpsertDestinationTranslationDto } from './dto/destination.dto';
import {
  SetDestinationEventsDto,
  SetDestinationJourneysDto,
  SetDestinationPlacesDto,
  SetDestinationStoriesDto,
  SetDestinationThemesDto,
} from './dto/destination-composition.dto';

class SetDestinationStatusDto {
  @IsEnum(PublicationStatus)
  status!: PublicationStatus;
}

@ApiTags('destinations')
@Controller('destinations')
export class DestinationsController {
  constructor(private readonly destinations: DestinationsService) {}

  @Public()
  @Get()
  list(@Query() query: ListDestinationsQueryDto, @Locale() locale: string) {
    return this.destinations.listPublic({
      country: query.country,
      region: query.region,
      city: query.city,
      type: query.type,
      theme: query.theme,
      locale,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Public()
  @Get(':slug')
  getBySlug(@Param('slug') slug: string, @Locale() locale: string) {
    return this.destinations.findBySlug(slug, locale);
  }

  @Public()
  @Get(':slug/related')
  async getRelated(@Param('slug') slug: string, @Locale() locale: string) {
    const destination = await this.destinations.findBySlug(slug, locale);
    return this.destinations.getRelated(destination.id, locale);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDestinationDto) {
    return this.destinations.create(dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateDestinationDto) {
    return this.destinations.update(id, dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/translations/:locale')
  upsertTranslation(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('locale') locale: string,
    @Body() dto: UpsertDestinationTranslationDto,
  ) {
    return this.destinations.upsertTranslation(id, locale, dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/status')
  setStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetDestinationStatusDto) {
    return this.destinations.setStatus(id, dto.status, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/places')
  setPlaces(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetDestinationPlacesDto) {
    return this.destinations.setPlaces(id, dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/themes')
  setThemes(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetDestinationThemesDto) {
    return this.destinations.setThemes(id, dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/stories')
  setStories(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetDestinationStoriesDto) {
    return this.destinations.setStories(id, dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/journeys')
  setJourneys(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetDestinationJourneysDto) {
    return this.destinations.setJourneys(id, dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/events')
  setEvents(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetDestinationEventsDto) {
    return this.destinations.setEvents(id, dto, user.id);
  }
}
