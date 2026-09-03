import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Locale } from '../../common/decorators/locale.decorator';
import { TerritoriesService } from './territories.service';
import { CreateTerritoryDto } from './dto/territory.dto';

@ApiTags('territories')
@Controller('territories')
export class TerritoriesController {
  constructor(private readonly territories: TerritoriesService) {}

  @Public()
  @Get()
  list(@Locale() locale: string) {
    return this.territories.list(locale);
  }

  @Public()
  @Get(':slug')
  getBySlug(@Param('slug') slug: string, @Locale() locale: string) {
    return this.territories.findBySlug(slug, locale);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.HISTORIAN_REVIEWER, Role.ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTerritoryDto) {
    return this.territories.create(dto, user.id);
  }
}
