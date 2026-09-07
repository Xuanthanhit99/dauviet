import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { ContributionsService } from './contributions.service';
import {
  AddProvenanceSourceDto,
  CreateContributionDto,
  UpdateContributionDto,
  WithdrawContributionDto,
} from './dto/contribution.dto';

/**
 * Submitter-facing surface only (spec section 44/45/74) - a contributor's
 * own submission and its status. Never exposes another user's contribution,
 * internal review notes, or the admin queue - see `ContributionsAdminController`
 * for the reviewer/admin surface.
 */
@ApiTags('contributions')
@ApiBearerAuth()
@Controller('contributions')
export class ContributionsController {
  constructor(private readonly contributions: ContributionsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateContributionDto) {
    return this.contributions.create(dto, user);
  }

  @Get('mine')
  listMine(@CurrentUser() user: AuthUser) {
    return this.contributions.listMine(user.id);
  }

  @Get('mine/:id')
  getMineById(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.contributions.findMineById(id, user);
  }

  @Patch('mine/:id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateContributionDto) {
    return this.contributions.update(id, dto, user);
  }

  @Post('mine/:id/withdraw')
  withdraw(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: WithdrawContributionDto) {
    return this.contributions.withdraw(id, dto, user);
  }

  @Post(':id/provenance-sources')
  addProvenanceSource(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AddProvenanceSourceDto) {
    return this.contributions.addProvenanceSource(id, dto, user);
  }
}
