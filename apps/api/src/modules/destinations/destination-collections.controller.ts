import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PublicationStatus, Role } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Locale } from '../../common/decorators/locale.decorator';
import { DestinationCollectionsService } from './destination-collections.service';
import { CreateDestinationCollectionDto, SetDestinationCollectionMembersDto, UpsertDestinationCollectionTranslationDto } from './dto/destination-collection.dto';

class SetDestinationCollectionStatusDto {
  @IsEnum(PublicationStatus)
  status!: PublicationStatus;
}

class ListDestinationCollectionsQueryDto {
  @IsOptional()
  @IsString()
  country?: string;
}

@ApiTags('destination-collections')
@Controller('destination-collections')
export class DestinationCollectionsController {
  constructor(private readonly collections: DestinationCollectionsService) {}

  @Public()
  @Get()
  list(@Query() query: ListDestinationCollectionsQueryDto, @Locale() locale: string) {
    return this.collections.list(locale, query.country);
  }

  @Public()
  @Get(':slug')
  getBySlug(@Param('slug') slug: string, @Locale() locale: string) {
    return this.collections.findBySlug(slug, locale);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDestinationCollectionDto) {
    return this.collections.create(dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/translations/:locale')
  upsertTranslation(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('locale') locale: string, @Body() dto: UpsertDestinationCollectionTranslationDto) {
    return this.collections.upsertTranslation(id, locale, dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/status')
  setStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetDestinationCollectionStatusDto) {
    return this.collections.setStatus(id, dto.status, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/members')
  setMembers(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetDestinationCollectionMembersDto) {
    return this.collections.setMembers(id, dto, user.id);
  }
}
