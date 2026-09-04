import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ContributionStatus, Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { ContributionsService } from './contributions.service';
import { AdvanceContributionDto, CreateContributionDto } from './dto/contribution.dto';

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

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.contributions.findById(id);
  }

  @Roles(Role.EDITOR, Role.HISTORIAN_REVIEWER, Role.ADMIN)
  @Get()
  listForReview(@Query('status') status?: ContributionStatus) {
    return this.contributions.listForReview(status);
  }

  @Roles(Role.EDITOR, Role.HISTORIAN_REVIEWER, Role.ADMIN)
  @Patch(':id/advance')
  advance(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AdvanceContributionDto) {
    return this.contributions.advance(id, user.id, dto);
  }
}
