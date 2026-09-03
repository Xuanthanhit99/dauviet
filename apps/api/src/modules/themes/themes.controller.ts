import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Locale } from '../../common/decorators/locale.decorator';
import { ThemesService } from './themes.service';
import { CreateThemeDto, ThemeQueryDto } from './dto/theme.dto';

@ApiTags('themes')
@Controller('themes')
export class ThemesController {
  constructor(private readonly themes: ThemesService) {}

  @Public()
  @Get()
  list(@Locale() locale: string, @Query() query: ThemeQueryDto) {
    return this.themes.list(locale, query.category);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Post()
  create(@Body() dto: CreateThemeDto, @CurrentUser() user: AuthUser) {
    return this.themes.create(dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Post(':id/events/:eventId')
  linkEvent(@Param('id') id: string, @Param('eventId') eventId: string, @CurrentUser() user: AuthUser) {
    return this.themes.linkToEvent(id, eventId, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Delete(':id/events/:eventId')
  unlinkEvent(@Param('id') id: string, @Param('eventId') eventId: string, @CurrentUser() user: AuthUser) {
    return this.themes.unlinkFromEvent(id, eventId, user.id);
  }
}
