import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { CommunityVerificationState, ModerationStatus, Role } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Locale } from '../../common/decorators/locale.decorator';
import { CursorPaginationQuery } from '../../common/dto/pagination.dto';
import { CommunityService } from './community.service';
import { CreateCommunityStoryDto, ListCommunityStoriesQueryDto, UpdateCommunityStoryDto } from './dto/community-story.dto';
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

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

@ApiTags('community')
@Controller('community/stories')
export class CommunityController {
  constructor(private readonly community: CommunityService, private readonly comments: CommentsService) {}

  @Public()
  @Get()
  list(@Query() query: ListCommunityStoriesQueryDto, @Locale() locale: string) {
    return this.community.list({ locale, type: query.type, placeId: query.placeId, sort: query.sort, cursor: query.cursor, limit: query.limit });
  }

  // Registered before `:slug` - otherwise "mine" would be captured as a slug.
  @ApiBearerAuth()
  @Get('mine')
  listMine(@CurrentUser() user: AuthUser) {
    return this.community.listMine(user.id);
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
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCommunityStoryDto) {
    return this.community.create(dto, user);
  }

  @ApiBearerAuth()
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateCommunityStoryDto) {
    return this.community.update(id, user, dto);
  }

  @ApiBearerAuth()
  @Delete(':id')
  withdraw(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.community.withdraw(id, user.id);
  }

  @ApiBearerAuth()
  @Post(':id/places')
  linkPlace(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: LinkEntityDto) {
    return this.community.linkPlace(id, dto.entityId, user);
  }

  @ApiBearerAuth()
  @Post(':id/people')
  linkPerson(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: LinkEntityDto) {
    return this.community.linkPerson(id, dto.entityId, user);
  }

  @ApiBearerAuth()
  @Post(':id/events')
  linkEvent(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: LinkEntityDto) {
    return this.community.linkEvent(id, dto.entityId, user);
  }

  @ApiBearerAuth()
  @Post(':id/eras')
  linkEra(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: LinkEntityDto) {
    return this.community.linkEra(id, dto.entityId, user);
  }

  @ApiBearerAuth()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post(':id/vote')
  vote(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.community.vote(user.id, id);
  }

  @ApiBearerAuth()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Delete(':id/vote')
  unvote(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.community.unvote(user.id, id);
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
    return this.community.setModerationStatus(user.id, id, dto.status, dto.reason);
  }
}
