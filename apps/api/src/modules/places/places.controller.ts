import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PublicationStatus, Role } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Locale } from '../../common/decorators/locale.decorator';
import { CursorPaginationQuery } from '../../common/dto/pagination.dto';
import { PlacesService } from './places.service';
import { CreatePlaceDto, UpdatePlaceDto } from './dto/place.dto';
import { CommentsService } from '../comments/comments.service';

class SetPublicationStatusDto {
  @IsEnum(PublicationStatus)
  status!: PublicationStatus;
}

class RecordVisitDto {
  @IsOptional()
  @IsString()
  note?: string;
}

@ApiTags('places')
@Controller('places')
export class PlacesController {
  constructor(private readonly places: PlacesService, private readonly comments: CommentsService) {}

  @Public()
  @Get()
  list(@Query() query: CursorPaginationQuery, @Locale() locale: string, @Query('type') type?: string) {
    return this.places.list({ type, locale, cursor: query.cursor, limit: query.limit });
  }

  @Public()
  @Get(':slug')
  getBySlug(@Param('slug') slug: string, @Locale() locale: string) {
    return this.places.findBySlug(slug, locale);
  }

  @Public()
  @Get(':slug/timeline')
  getTimeline(@Param('slug') slug: string, @Locale() locale: string) {
    return this.places.getTimeline(slug, locale);
  }

  @Public()
  @Get(':slug/sources')
  getSources(@Param('slug') slug: string) {
    return this.places.getSources(slug);
  }

  @Public()
  @Get(':slug/media')
  getMedia(@Param('slug') slug: string) {
    return this.places.getMedia(slug);
  }

  @Public()
  @Get(':slug/community')
  getCommunity(@Param('slug') slug: string, @Locale() locale: string) {
    return this.places.getCommunityStories(slug, locale);
  }

  @Public()
  @Get(':slug/comments')
  async getComments(@Param('slug') slug: string, @Query() query: CursorPaginationQuery) {
    const place = await this.places.findBySlug(slug, 'vi', true);
    return this.comments.list('PLACE', place.id, query);
  }

  @ApiBearerAuth()
  @Post(':slug/visits')
  recordVisit(@CurrentUser() user: AuthUser, @Param('slug') slug: string, @Body() dto: RecordVisitDto) {
    return this.places.recordVisit(user.id, slug, dto.note);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePlaceDto) {
    return this.places.create(dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdatePlaceDto) {
    return this.places.update(id, dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.HISTORIAN_REVIEWER, Role.ADMIN)
  @Patch(':id/publication-status')
  setPublicationStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SetPublicationStatusDto,
  ) {
    return this.places.setPublicationStatus(id, dto.status, user.id);
  }
}
