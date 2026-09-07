import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { DestinationType, PublicationStatus, Role } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Locale } from '../../common/decorators/locale.decorator';
import { OffsetPaginationQuery } from '../../common/dto/pagination.dto';
import { DestinationsService } from './destinations.service';
import { CreateDestinationDto, UpdateDestinationDto, UpsertDestinationTranslationDto } from './dto/destination.dto';

class SetDestinationStatusDto {
  @IsEnum(PublicationStatus)
  status!: PublicationStatus;
}

@ApiTags('destinations')
@Controller('destinations')
export class DestinationsController {
  constructor(private readonly destinations: DestinationsService) {}

  @Public()
  @Get()
  list(
    @Query() query: OffsetPaginationQuery,
    @Locale() locale: string,
    @Query('country') countryId?: string,
    @Query('region') regionId?: string,
    @Query('city') cityId?: string,
    @Query('type') type?: DestinationType,
  ) {
    return this.destinations.list({ countryId, regionId, cityId, type, locale, page: query.page, pageSize: query.pageSize });
  }

  @Public()
  @Get(':slug')
  getBySlug(@Param('slug') slug: string, @Locale() locale: string) {
    return this.destinations.findBySlug(slug, locale);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDestinationDto) {
    return this.destinations.create(dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateDestinationDto) {
    return this.destinations.update(id, dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/translations/:locale')
  upsertTranslation(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('locale') locale: string,
    @Body() dto: UpsertDestinationTranslationDto,
  ) {
    return this.destinations.upsertTranslation(id, locale, dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/status')
  setStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetDestinationStatusDto) {
    return this.destinations.setStatus(id, dto.status, user.id);
  }
}
