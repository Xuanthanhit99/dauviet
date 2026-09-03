import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsString } from 'class-validator';
import { CommunityVerificationState, ModerationStatus, Role } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Locale } from '../../common/decorators/locale.decorator';
import { CursorPaginationQuery } from '../../common/dto/pagination.dto';
import { CommunityService } from './community.service';
import { CreateCommunityStoryDto } from './dto/community-story.dto';
import { CommentsService } from '../comments/comments.service';

class LinkEntityDto {
  @IsString()
  entityId!: string;
}

class SetAuthorVerificationStateDto {
  @IsEnum(CommunityVerificationState)
  state!: CommunityVerificationState;
}

class SetReviewVerificationStateDto {
  @IsEnum(CommunityVerificationState)
  state!: CommunityVerificationState;
}

class SetModerationStatusDto {
  @IsEnum(ModerationStatus)
  status!: ModerationStatus;
}

@ApiTags('community')
@Controller('community/stories')
export class CommunityController {
  constructor(private readonly community: CommunityService, private readonly comments: CommentsService) {}

  @Public()
  @Get()
  list(@Query() query: CursorPaginationQuery, @Locale() locale: string, @Query('type') type?: string) {
    return this.community.list({ locale, type, cursor: query.cursor, limit: query.limit });
  }

  @Public()
  @Get(':slug')
  getBySlug(@Param('slug') slug: string, @Locale() locale: string) {
    return this.community.findBySlug(slug, locale);
  }

  @Public()
  @Get(':slug/comments')
  async getComments(@Param('slug') slug: string, @Query() query: CursorPaginationQuery) {
    const story = await this.community.findBySlug(slug, 'vi');
    return this.comments.list('COMMUNITY_STORY', story.id, query);
  }

  @ApiBearerAuth()
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCommunityStoryDto) {
    return this.community.create(dto, user.id);
  }

  @ApiBearerAuth()
  @Post(':id/places')
  linkPlace(@Param('id') id: string, @Body() dto: LinkEntityDto) {
    return this.community.linkPlace(id, dto.entityId);
  }

  @ApiBearerAuth()
  @Post(':id/people')
  linkPerson(@Param('id') id: string, @Body() dto: LinkEntityDto) {
    return this.community.linkPerson(id, dto.entityId);
  }

  @ApiBearerAuth()
  @Post(':id/events')
  linkEvent(@Param('id') id: string, @Body() dto: LinkEntityDto) {
    return this.community.linkEvent(id, dto.entityId);
  }

  @ApiBearerAuth()
  @Post(':id/eras')
  linkEra(@Param('id') id: string, @Body() dto: LinkEntityDto) {
    return this.community.linkEra(id, dto.entityId);
  }

  @ApiBearerAuth()
  @Patch(':id/verification-state')
  setAuthorVerificationState(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetAuthorVerificationStateDto) {
    return this.community.setAuthorVerificationState(id, user.id, dto.state);
  }

  @ApiBearerAuth()
  @Roles(Role.HISTORIAN_REVIEWER, Role.EDITOR, Role.ADMIN)
  @Patch(':id/review-verification-state')
  setReviewVerificationState(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetReviewVerificationStateDto) {
    return this.community.setReviewVerificationState(user.id, id, dto.state);
  }

  @ApiBearerAuth()
  @Roles(Role.MODERATOR, Role.ADMIN)
  @Patch(':id/moderation-status')
  setModerationStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetModerationStatusDto) {
    return this.community.setModerationStatus(user.id, id, dto.status);
  }
}
