import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { EntityKind, Role } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { AliasesService } from './aliases.service';
import { CreateAliasDto } from './dto/alias.dto';

@ApiTags('aliases')
@Controller('aliases')
export class AliasesController {
  constructor(private readonly aliases: AliasesService) {}

  @Public()
  @Get()
  list(@Query('entityType') entityType: EntityKind, @Query('entityId') entityId: string) {
    return this.aliases.listForEntity(entityType, entityId);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.HISTORIAN_REVIEWER, Role.ADMIN)
  @Post()
  create(@Body() dto: CreateAliasDto, @CurrentUser() user: AuthUser) {
    return this.aliases.create(dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.HISTORIAN_REVIEWER, Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.aliases.delete(id, user.id);
  }
}
