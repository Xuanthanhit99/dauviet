import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FactEditorialStatus, FactSensitivity, Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { FactsService } from './facts.service';
import { CreateFactDto, SetFactEditorialStatusDto } from './dto/fact.dto';

@ApiTags('facts')
@ApiBearerAuth()
@Controller('facts')
@Roles(Role.CONTRIBUTOR, Role.EDITOR, Role.HISTORIAN_REVIEWER, Role.ADMIN)
export class FactsController {
  constructor(private readonly facts: FactsService) {}

  @Get()
  list(@Query('editorialStatus') editorialStatus?: FactEditorialStatus, @Query('sensitivity') sensitivity?: FactSensitivity) {
    return this.facts.list({ editorialStatus, sensitivity });
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.facts.findById(id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateFactDto) {
    return this.facts.create(dto, user.id);
  }

  @Post(':id/places/:entityId')
  linkPlace(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('entityId') entityId: string) {
    return this.facts.linkEntity(id, 'place', entityId, user.id);
  }

  @Post(':id/people/:entityId')
  linkPerson(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('entityId') entityId: string) {
    return this.facts.linkEntity(id, 'person', entityId, user.id);
  }

  @Post(':id/events/:entityId')
  linkEvent(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('entityId') entityId: string) {
    return this.facts.linkEntity(id, 'event', entityId, user.id);
  }

  @Post(':id/eras/:entityId')
  linkEra(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('entityId') entityId: string) {
    return this.facts.linkEntity(id, 'era', entityId, user.id);
  }

  @Post(':id/territories/:entityId')
  linkTerritory(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('entityId') entityId: string) {
    return this.facts.linkEntity(id, 'territory', entityId, user.id);
  }

  @Patch(':id/editorial-status')
  setStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetFactEditorialStatusDto) {
    return this.facts.setEditorialStatus(id, dto.status, user, { notes: dto.notes, decision: dto.decision });
  }

  @Get(':id/reviews')
  listReviews(@Param('id') id: string) {
    return this.facts.listReviews(id);
  }
}
