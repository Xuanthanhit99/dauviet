import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { PublicationStatus, Role } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Locale } from '../../common/decorators/locale.decorator';
import { AttractionsService } from './attractions.service';
import { CreateAttractionDto, ListAttractionsQueryDto, SetAttractionDestinationsDto, UpsertAttractionTranslationDto } from './dto/attraction.dto';

class SetAttractionStatusDto {
  @IsEnum(PublicationStatus)
  status!: PublicationStatus;
}

@ApiTags('attractions')
@Controller('attractions')
export class AttractionsController {
  constructor(private readonly attractions: AttractionsService) {}

  @Public()
  @Get()
  list(@Query() query: ListAttractionsQueryDto, @Locale() locale: string) {
    return this.attractions.listPublic({ country: query.country, region: query.region, city: query.city, locale, page: query.page, pageSize: query.pageSize });
  }

  @Public()
  @Get(':slug')
  getBySlug(@Param('slug') slug: string, @Locale() locale: string) {
    return this.attractions.findBySlug(slug, locale);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAttractionDto) {
    return this.attractions.create(dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/translations/:locale')
  upsertTranslation(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('locale') locale: string, @Body() dto: UpsertAttractionTranslationDto) {
    return this.attractions.upsertTranslation(id, locale, dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/status')
  setStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetAttractionStatusDto) {
    return this.attractions.setStatus(id, dto.status, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/destinations')
  setDestinations(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetAttractionDestinationsDto) {
    return this.attractions.setDestinations(id, dto.destinationIds, user.id);
  }
}
