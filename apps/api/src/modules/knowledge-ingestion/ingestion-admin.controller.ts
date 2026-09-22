import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { IngestionSourcesService } from './ingestion-sources.service';
import { IngestionJobsService } from './ingestion-jobs.service';
import {
  CreateIngestionJobDto,
  CreateIngestionSourceDto,
  CreateIngestionSourcePolicyEvidenceDto,
  UpsertIngestionSourcePolicyDto,
} from './dto/ingestion.dto';

class SetEnabledDto {
  @IsBoolean()
  enabled!: boolean;
}

/**
 * Source/policy/job configuration - ADMIN only, no EDITOR carve-out (spec
 * section 45), matching G02 Providers' exact tier: this gates rate limits,
 * licensing classification, and what gets fetched from where.
 */
@ApiTags('admin-ingestion')
@ApiBearerAuth()
@Controller('admin/ingestion')
export class IngestionAdminController {
  constructor(
    private readonly sources: IngestionSourcesService,
    private readonly jobs: IngestionJobsService,
  ) {}

  @Roles(Role.ADMIN)
  @Get('sources')
  listSources() {
    return this.sources.list();
  }

  @Roles(Role.ADMIN)
  @Get('sources/:id')
  getSource(@Param('id') id: string) {
    return this.sources.getDetail(id);
  }

  @Roles(Role.ADMIN)
  @Post('sources')
  createSource(@CurrentUser() user: AuthUser, @Body() dto: CreateIngestionSourceDto) {
    return this.sources.create(dto, user.id);
  }

  @Roles(Role.ADMIN)
  @Patch('sources/:id/enabled')
  setEnabled(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetEnabledDto) {
    return this.sources.setEnabled(id, dto.enabled, user.id);
  }

  @Roles(Role.ADMIN)
  @Post('sources/:id/policy')
  upsertPolicy(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpsertIngestionSourcePolicyDto) {
    return this.sources.upsertPolicy(id, dto, user.id);
  }

  @Roles(Role.ADMIN)
  @Post('sources/:id/policy/evidence')
  addPolicyEvidence(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateIngestionSourcePolicyEvidenceDto) {
    return this.sources.addPolicyEvidence(id, dto, user.id);
  }

  @Roles(Role.ADMIN)
  @Get('jobs')
  listJobs() {
    return this.jobs.list();
  }

  @Roles(Role.ADMIN)
  @Get('jobs/:id')
  getJob(@Param('id') id: string) {
    return this.jobs.getDetail(id);
  }

  @Roles(Role.ADMIN)
  @Post('jobs')
  createJob(@CurrentUser() user: AuthUser, @Body() dto: CreateIngestionJobDto) {
    return this.jobs.create(dto, user.id);
  }

  @Roles(Role.ADMIN)
  @Post('jobs/:id/run')
  runJob(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.jobs.enqueue(id, user.id);
  }

  @Roles(Role.ADMIN)
  @Post('runs/:id/cancel')
  cancelRun(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.jobs.cancelRun(id, user.id);
  }
}
