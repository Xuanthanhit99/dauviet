import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsOptional, IsString } from 'class-validator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Locale } from '../../common/decorators/locale.decorator';
import { CursorPaginationQuery } from '../../common/dto/pagination.dto';
import { StoriesService } from './stories.service';
import {
  CreateStoryDto,
  LinkStoryCitationDto,
  LinkStoryEntityDto,
  LinkStoryFactDto,
  SetStoryEditorialStatusDto,
  SetStoryFeaturedDto,
  SetStoryHeroMediaDto,
} from './dto/story.dto';
import { CommentsService } from '../comments/comments.service';

class StoryListQuery extends CursorPaginationQuery {
  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  placeId?: string;

  @IsOptional()
  @IsString()
  personId?: string;

  @IsOptional()
  @IsString()
  eventId?: string;
}

@ApiTags('stories')
@Controller('stories')
export class StoriesController {
  constructor(private readonly stories: StoriesService, private readonly comments: CommentsService) {}

  @Public()
  @Get()
  list(@Query() query: StoryListQuery, @Locale() locale: string) {
    return this.stories.list({
      locale,
      type: query.type,
      placeId: query.placeId,
      personId: query.personId,
      eventId: query.eventId,
      cursor: query.cursor,
      limit: query.limit,
    });
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
  linkPlace(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: LinkStoryEntityDto) {
    return this.stories.linkEntity(id, 'place', dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Post(':id/people')
  linkPerson(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: LinkStoryEntityDto) {
    return this.stories.linkEntity(id, 'person', dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Post(':id/events')
  linkEvent(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: LinkStoryEntityDto) {
    return this.stories.linkEntity(id, 'event', dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.HISTORIAN_REVIEWER, Role.ADMIN)
  @Post(':id/facts')
  linkFact(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: LinkStoryFactDto) {
    return this.stories.linkFact(id, dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.HISTORIAN_REVIEWER, Role.ADMIN)
  @Post(':id/citations')
  linkCitation(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: LinkStoryCitationDto) {
    return this.stories.linkCitation(id, dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/hero-media')
  setHeroMedia(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetStoryHeroMediaDto) {
    return this.stories.setHeroMedia(id, dto.mediaAssetId, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/featured')
  setFeatured(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetStoryFeaturedDto) {
    return this.stories.setFeatured(id, dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.HISTORIAN_REVIEWER, Role.ADMIN)
  @Patch(':id/editorial-status')
  setStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetStoryEditorialStatusDto) {
    return this.stories.setEditorialStatus(id, dto.status, user, {
      notes: dto.notes,
      decision: dto.decision,
      scheduledAt: dto.scheduledAt,
      expectedVersion: dto.expectedVersion,
    });
  }
}
