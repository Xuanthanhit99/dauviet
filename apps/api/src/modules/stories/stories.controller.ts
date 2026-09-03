import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsString } from 'class-validator';
import { PublicationStatus, Role } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Locale } from '../../common/decorators/locale.decorator';
import { CursorPaginationQuery } from '../../common/dto/pagination.dto';
import { StoriesService } from './stories.service';
import { CreateStoryDto } from './dto/story.dto';
import { CommentsService } from '../comments/comments.service';

class SetStatusDto {
  @IsEnum(PublicationStatus)
  status!: PublicationStatus;
}

class LinkEntityDto {
  @IsString()
  entityId!: string;
}

@ApiTags('stories')
@Controller('stories')
export class StoriesController {
  constructor(private readonly stories: StoriesService, private readonly comments: CommentsService) {}

  @Public()
  @Get()
  list(@Query() query: CursorPaginationQuery, @Locale() locale: string) {
    return this.stories.list(locale, query.cursor, query.limit);
  }

  @Public()
  @Get(':slug')
  getBySlug(@Param('slug') slug: string, @Locale() locale: string) {
    return this.stories.findBySlug(slug, locale);
  }

  @Public()
  @Get(':slug/comments')
  async getComments(@Param('slug') slug: string, @Query() query: CursorPaginationQuery) {
    const story = await this.stories.findBySlug(slug, 'vi');
    return this.comments.list('STORY', story.id, query);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateStoryDto) {
    return this.stories.create(dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Post(':id/places')
  linkPlace(@Param('id') id: string, @Body() dto: LinkEntityDto) {
    return this.stories.linkPlace(id, dto.entityId);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Post(':id/people')
  linkPerson(@Param('id') id: string, @Body() dto: LinkEntityDto) {
    return this.stories.linkPerson(id, dto.entityId);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Post(':id/events')
  linkEvent(@Param('id') id: string, @Body() dto: LinkEntityDto) {
    return this.stories.linkEvent(id, dto.entityId);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Post(':id/citations')
  linkCitation(@Param('id') id: string, @Body() dto: LinkEntityDto) {
    return this.stories.linkCitation(id, dto.entityId);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/editorial-status')
  setStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetStatusDto) {
    return this.stories.setEditorialStatus(id, dto.status, user.id);
  }
}
