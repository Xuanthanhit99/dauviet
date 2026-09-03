import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Locale } from '../../common/decorators/locale.decorator';
import { DynastiesService } from './dynasties.service';
import { CreateDynastyDto } from './dto/dynasty.dto';

@ApiTags('dynasties')
@Controller('dynasties')
export class DynastiesController {
  constructor(private readonly dynasties: DynastiesService) {}

  @Public()
  @Get()
  list(@Locale() locale: string) {
    return this.dynasties.list(locale);
  }

  @Public()
  @Get(':slug')
  getBySlug(@Param('slug') slug: string, @Locale() locale: string) {
    return this.dynasties.findBySlug(slug, locale);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDynastyDto) {
    return this.dynasties.create(dto, user.id);
  }
}
