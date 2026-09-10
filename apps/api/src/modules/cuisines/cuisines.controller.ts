import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { PublicationStatus, Role } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Locale } from '../../common/decorators/locale.decorator';
import { CuisinesService } from './cuisines.service';
import { CreateCuisineDto, ListCuisinesQueryDto, UpsertCuisineTranslationDto } from './dto/cuisine.dto';

class SetCuisineStatusDto {
  @IsEnum(PublicationStatus)
  status!: PublicationStatus;
}

@ApiTags('cuisines')
@Controller('cuisines')
export class CuisinesController {
  constructor(private readonly cuisines: CuisinesService) {}

  @Public()
  @Get()
  list(@Query() query: ListCuisinesQueryDto, @Locale() locale: string) {
    return this.cuisines.listPublic({ country: query.country, locale, page: query.page, pageSize: query.pageSize });
  }

  @Public()
  @Get(':slug')
  getBySlug(@Param('slug') slug: string, @Locale() locale: string) {
    return this.cuisines.findBySlug(slug, locale);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCuisineDto) {
    return this.cuisines.create(dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/translations/:locale')
  upsertTranslation(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('locale') locale: string, @Body() dto: UpsertCuisineTranslationDto) {
    return this.cuisines.upsertTranslation(id, locale, dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/status')
  setStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetCuisineStatusDto) {
    return this.cuisines.setStatus(id, dto.status, user.id);
  }
}
