import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { ThenNowService } from './then-now.service';
import { CreateThenNowComparisonDto, SetThenNowModerationStatusDto, SetThenNowPublicationStatusDto } from './dto/then-now.dto';

@ApiTags('then-now')
@Controller('then-now')
export class ThenNowController {
  constructor(private readonly thenNow: ThenNowService) {}

  @Public()
  @Get()
  list(@Query('placeId') placeId?: string) {
    return this.thenNow.listPublic(placeId);
  }

  @ApiBearerAuth()
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateThenNowComparisonDto) {
    return this.thenNow.create(dto, user);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.HISTORIAN_REVIEWER, Role.ADMIN)
  @Patch(':id/publication-status')
  setPublicationStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetThenNowPublicationStatusDto) {
    return this.thenNow.setPublicationStatus(id, dto.status, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.MODERATOR, Role.ADMIN)
  @Patch(':id/moderation-status')
  setModerationStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetThenNowModerationStatusDto) {
    return this.thenNow.setModerationStatus(id, dto.status, user.id);
  }
}
