import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { PublicationStatus, Role } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Locale } from '../../common/decorators/locale.decorator';
import { CursorPaginationQuery } from '../../common/dto/pagination.dto';
import { JourneysService } from './journeys.service';
import { AddJourneyStopDto, CreateJourneyDto } from './dto/journey.dto';
import { CommentsService } from '../comments/comments.service';

class SetStatusDto {
  @IsEnum(PublicationStatus)
  status!: PublicationStatus;
}

@ApiTags('journeys')
@Controller('journeys')
export class JourneysController {
  constructor(private readonly journeys: JourneysService, private readonly comments: CommentsService) {}

  @Public()
  @Get()
  list(@Locale() locale: string) {
    return this.journeys.list(locale);
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
  addStop(@Param('id') id: string, @Body() dto: AddJourneyStopDto) {
    return this.journeys.addStop(id, dto);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/editorial-status')
  setStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetStatusDto) {
    return this.journeys.setEditorialStatus(id, dto.status, user.id);
  }
}
