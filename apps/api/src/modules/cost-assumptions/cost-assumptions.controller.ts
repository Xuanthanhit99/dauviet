import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { CostAssumptionsService } from './cost-assumptions.service';
import { CreateCostAssumptionDto, ListCostAssumptionsQueryDto, SetCostAssumptionStatusDto, UpdateCostAssumptionDto } from './dto/cost-assumption.dto';

/**
 * ADMIN-only configuration feeding the Cost Engine (pre-implementation
 * report section 1.10) - same RBAC tier as `provider-licenses`, stricter
 * than the EDITOR/ADMIN tier used for public catalogue content, because a
 * mistake here silently skews every owner's cost estimate, not just one
 * piece of editorial copy.
 */
@ApiTags('admin-cost-assumptions')
@ApiBearerAuth()
@Controller('admin/cost-assumptions')
export class CostAssumptionsController {
  constructor(private readonly costAssumptions: CostAssumptionsService) {}

  @Roles(Role.ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCostAssumptionDto) {
    return this.costAssumptions.create(dto, user.id);
  }

  @Roles(Role.ADMIN)
  @Get()
  list(@Query() query: ListCostAssumptionsQueryDto) {
    return this.costAssumptions.list(query);
  }

  @Roles(Role.ADMIN)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.costAssumptions.findOne(id);
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateCostAssumptionDto) {
    return this.costAssumptions.update(id, dto, user.id);
  }

  @Roles(Role.ADMIN)
  @Patch(':id/status')
  setStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetCostAssumptionStatusDto) {
    return this.costAssumptions.setStatus(id, dto, user.id);
  }
}
