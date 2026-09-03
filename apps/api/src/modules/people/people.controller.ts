import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { PublicationStatus, Role } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Locale } from '../../common/decorators/locale.decorator';
import { CursorPaginationQuery } from '../../common/dto/pagination.dto';
import { PeopleService } from './people.service';
import { CreatePersonDto } from './dto/person.dto';
import { CommentsService } from '../comments/comments.service';

class SetPublicationStatusDto {
  @IsEnum(PublicationStatus)
  status!: PublicationStatus;
}

@ApiTags('people')
@Controller('people')
export class PeopleController {
  constructor(private readonly people: PeopleService, private readonly comments: CommentsService) {}

  @Public()
  @Get()
  list(@Query() query: CursorPaginationQuery, @Locale() locale: string) {
    return this.people.list(locale, query.cursor, query.limit);
  }

  @Public()
  @Get(':slug')
  getBySlug(@Param('slug') slug: string, @Locale() locale: string) {
    return this.people.findBySlug(slug, locale);
  }

  @Public()
  @Get(':slug/comments')
  async getComments(@Param('slug') slug: string, @Query() query: CursorPaginationQuery) {
    const person = await this.people.findBySlug(slug, 'vi');
    return this.comments.list('PERSON', person.id, query);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePersonDto) {
    return this.people.create(dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.HISTORIAN_REVIEWER, Role.ADMIN)
  @Patch(':id/publication-status')
  setStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetPublicationStatusDto) {
    return this.people.setPublicationStatus(id, dto.status, user.id);
  }
}
