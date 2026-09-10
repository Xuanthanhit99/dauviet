import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { PublicationStatus, Role } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Locale } from '../../common/decorators/locale.decorator';
import { DishesService } from './dishes.service';
import { CreateDishDto, ListDishesQueryDto, SetDishCuisinesDto, SetDishDestinationsDto, UpsertDishTranslationDto } from './dto/dish.dto';

class SetDishStatusDto {
  @IsEnum(PublicationStatus)
  status!: PublicationStatus;
}

@ApiTags('dishes')
@Controller('dishes')
export class DishesController {
  constructor(private readonly dishes: DishesService) {}

  @Public()
  @Get()
  list(@Query() query: ListDishesQueryDto, @Locale() locale: string) {
    return this.dishes.listPublic({ cuisine: query.cuisine, destination: query.destination, locale, page: query.page, pageSize: query.pageSize });
  }

  @Public()
  @Get(':slug')
  getBySlug(@Param('slug') slug: string, @Locale() locale: string) {
    return this.dishes.findBySlug(slug, locale);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDishDto) {
    return this.dishes.create(dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/translations/:locale')
  upsertTranslation(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('locale') locale: string, @Body() dto: UpsertDishTranslationDto) {
    return this.dishes.upsertTranslation(id, locale, dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/status')
  setStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetDishStatusDto) {
    return this.dishes.setStatus(id, dto.status, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/cuisines')
  setCuisines(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetDishCuisinesDto) {
    return this.dishes.setCuisines(id, dto.cuisineIds, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Patch(':id/destinations')
  setDestinations(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetDishDestinationsDto) {
    return this.dishes.setDestinations(id, dto.destinationIds, user.id);
  }
}
