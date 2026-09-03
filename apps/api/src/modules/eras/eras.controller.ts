import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Locale } from '../../common/decorators/locale.decorator';
import { ErasService } from './eras.service';
import { CreateEraDto } from './dto/era.dto';

@ApiTags('eras')
@Controller('eras')
export class ErasController {
  constructor(private readonly eras: ErasService) {}

  @Public()
  @Get()
  list(@Locale() locale: string) {
    return this.eras.list(locale);
  }

  @Public()
  @Get(':slug')
  getBySlug(@Param('slug') slug: string, @Locale() locale: string) {
    return this.eras.findBySlug(slug, locale);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateEraDto) {
    return this.eras.create(dto, user.id);
  }
}
