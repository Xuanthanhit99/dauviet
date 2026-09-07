import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { PublicationStatus, RegionType, Role } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Locale } from '../../common/decorators/locale.decorator';
import { OffsetPaginationQuery } from '../../common/dto/pagination.dto';
import { RegionsService } from './regions.service';
import { CreateRegionDto, UpdateRegionDto, UpsertRegionTranslationDto } from './dto/region.dto';

class SetRegionStatusDto {
  @IsEnum(PublicationStatus)
  status!: PublicationStatus;
}

@ApiTags('regions')
@Controller('regions')
export class RegionsController {
  constructor(private readonly regions: RegionsService) {}

  @Public()
  @Get()
  list(
    @Query() query: OffsetPaginationQuery,
    @Locale() locale: string,
    @Query('country') countryId?: string,
    @Query('parentRegion') parentRegionId?: string,
    @Query('type') type?: RegionType,
  ) {
    return this.regions.list({ countryId, parentRegionId, type, locale, page: query.page, pageSize: query.pageSize });
  }

  @Public()
  @Get(':slug')
  getBySlug(@Param('slug') slug: string, @Locale() locale: string) {
    return this.regions.findBySlug(slug, locale);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRegionDto) {
    return this.regions.create(dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateRegionDto) {
    return this.regions.update(id, dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/translations/:locale')
  upsertTranslation(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('locale') locale: string,
    @Body() dto: UpsertRegionTranslationDto,
  ) {
    return this.regions.upsertTranslation(id, locale, dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/status')
  setStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetRegionStatusDto) {
    return this.regions.setStatus(id, dto.status, user.id);
  }
}
