import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsObject } from 'class-validator';
import { PublicationStatus, Role } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Locale } from '../../common/decorators/locale.decorator';
import { TerritoriesService } from './territories.service';
import { CreateTerritoryDto } from './dto/territory.dto';

class SetTerritoryGeometryDto {
  @ApiProperty({ description: 'GeoJSON geometry (Polygon/MultiPolygon), SRID 4326' })
  @IsObject()
  geometry!: Record<string, unknown>;
}

class SetTerritoryGeometryStatusDto {
  @ApiProperty({ enum: PublicationStatus })
  @IsEnum(PublicationStatus)
  status!: PublicationStatus;
}

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

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.HISTORIAN_REVIEWER, Role.ADMIN)
  @Patch(':id/geometry')
  setGeometry(@Param('id') id: string, @Body() dto: SetTerritoryGeometryDto, @CurrentUser() user: AuthUser) {
    return this.territories.setGeometry(id, dto.geometry, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.HISTORIAN_REVIEWER, Role.ADMIN)
  @Patch(':id/geometry-status')
  setGeometryStatus(@Param('id') id: string, @Body() dto: SetTerritoryGeometryStatusDto, @CurrentUser() user: AuthUser) {
    return this.territories.setGeometryStatus(id, dto.status, user.id);
  }
}
