import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { PublicationStatus, Role } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Locale } from '../../common/decorators/locale.decorator';
import { RestaurantsService } from './restaurants.service';
import {
  CreateProviderRestaurantReferenceDto,
  CreateRestaurantDto,
  ListRestaurantsQueryDto,
  MapProviderRestaurantReferenceDto,
  SetRestaurantCuisinesDto,
  SetRestaurantDestinationsDto,
  SetRestaurantDishesDto,
  UpsertRestaurantTranslationDto,
} from './dto/restaurant.dto';

class SetRestaurantStatusDto {
  @IsEnum(PublicationStatus)
  status!: PublicationStatus;
}

@ApiTags('restaurants')
@Controller('restaurants')
export class RestaurantsController {
  constructor(private readonly restaurants: RestaurantsService) {}

  @Public()
  @Get()
  list(@Query() query: ListRestaurantsQueryDto, @Locale() locale: string) {
    return this.restaurants.listPublic({ country: query.country, region: query.region, city: query.city, cuisine: query.cuisine, locale, page: query.page, pageSize: query.pageSize });
  }

  @Public()
  @Get(':slug')
  getBySlug(@Param('slug') slug: string, @Locale() locale: string) {
    return this.restaurants.findBySlug(slug, locale);
  }

  @Public()
  @Get(':slug/operational-snapshot')
  getOperationalSnapshot(@Param('slug') slug: string) {
    return this.restaurants.getOperationalSnapshot(slug);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRestaurantDto) {
    return this.restaurants.create(dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/translations/:locale')
  upsertTranslation(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('locale') locale: string, @Body() dto: UpsertRestaurantTranslationDto) {
    return this.restaurants.upsertTranslation(id, locale, dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/status')
  setStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetRestaurantStatusDto) {
    return this.restaurants.setStatus(id, dto.status, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/cuisines')
  setCuisines(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetRestaurantCuisinesDto) {
    return this.restaurants.setCuisines(id, dto.cuisineIds, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/dishes')
  setDishes(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetRestaurantDishesDto) {
    return this.restaurants.setDishes(id, dto.dishIds, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/destinations')
  setDestinations(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetRestaurantDestinationsDto) {
    return this.restaurants.setDestinations(id, dto.destinationIds, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Post('provider-references')
  upsertProviderReference(@CurrentUser() user: AuthUser, @Body() dto: CreateProviderRestaurantReferenceDto) {
    return this.restaurants.upsertProviderReference(dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch('provider-references/:referenceId/map')
  mapProviderReference(@CurrentUser() user: AuthUser, @Param('referenceId') referenceId: string, @Body() dto: MapProviderRestaurantReferenceDto) {
    return this.restaurants.mapProviderReference(referenceId, dto, user.id);
  }
}
