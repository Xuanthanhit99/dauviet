import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Locale } from '../../common/decorators/locale.decorator';
import { EditorialService } from './editorial.service';
import { UpsertEditorialSlotDto } from './dto/editorial-slot.dto';

@ApiTags('editorial')
@Controller('editorial')
export class EditorialController {
  constructor(private readonly editorial: EditorialService) {}

  @Public()
  @Get('home')
  getHome(@Locale() locale: string) {
    return this.editorial.getHome(locale);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Post('slots')
  upsertSlot(@CurrentUser() user: AuthUser, @Body() dto: UpsertEditorialSlotDto) {
    return this.editorial.upsertSlot(dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.ADMIN)
  @Delete('slots/:id')
  removeSlot(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.editorial.removeSlot(id, user.id);
  }
}
