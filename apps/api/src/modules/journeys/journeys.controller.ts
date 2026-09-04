import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { Role } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Locale } from '../../common/decorators/locale.decorator';
import { CursorPaginationQuery } from '../../common/dto/pagination.dto';
import { JourneysService } from './journeys.service';
import {
  AddJourneyStopDto,
  CreateJourneyDto,
  ReorderJourneyStopsDto,
  ScheduleJourneyDto,
  SetJourneyEditorialStatusDto,
  SetJourneyHeroMediaDto,
} from './dto/journey.dto';
import { CommentsService } from '../comments/comments.service';

class JourneyListQuery extends CursorPaginationQuery {
  @IsOptional()
  @IsString()
  region?: string;
}

@ApiTags('journeys')
@Controller('journeys')
export class JourneysController {
  constructor(private readonly journeys: JourneysService, private readonly comments: CommentsService) {}

  @Public()
  @Get()
  list(@Query() query: JourneyListQuery, @Locale() locale: string) {
    return this.journeys.list({ locale, region: query.region, cursor: query.cursor, limit: query.limit });
  }

  @Public()
  @Get(':slug')
  getBySlug(@Param('slug') slug: string, @Locale() locale: string) {
    return this.journeys.findBySlug(slug, locale);
  }

  @Public()
  @Get(':slug/comments')
  async getComments(@Param('slug') slug: string, @Query() query: CursorPaginationQuery) {
    const journey = await this.journeys.findBySlug(slug, 'vi');
    return this.comments.list('JOURNEY', journey.id, query);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateJourneyDto) {
    return this.journeys.create(dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Post(':id/stops')
  addStop(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AddJourneyStopDto) {
    return this.journeys.addStop(id, dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Delete(':id/stops/:stopId')
  removeStop(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('stopId') stopId: string) {
    return this.journeys.removeStop(id, stopId, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/stops/reorder')
  reorderStops(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReorderJourneyStopsDto) {
    return this.journeys.reorderStops(id, dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/hero-media')
  setHeroMedia(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetJourneyHeroMediaDto) {
    return this.journeys.setHeroMedia(id, dto.mediaAssetId, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/schedule')
  schedule(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ScheduleJourneyDto) {
    return this.journeys.schedule(id, dto.scheduledAt, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/editorial-status')
  setStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetJourneyEditorialStatusDto) {
    return this.journeys.setEditorialStatus(id, dto.status, user.id, { notes: dto.notes, expectedVersion: dto.expectedVersion });
  }
}
