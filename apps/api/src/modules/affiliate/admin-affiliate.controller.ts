import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { AffiliateConversionsService } from './affiliate-conversions.service';
import { AffiliateReportingService } from './affiliate-reporting.service';
import { IngestAffiliateConversionDto, ListAffiliateConversionsQueryDto } from './dto/affiliate-admin.dto';

/**
 * Commercial conversion/revenue reporting and evidence ingestion is
 * ADMIN-only (spec section 50/52) - no other role, including a trip
 * OWNER/EDITOR, can reach anything here (spec section 49). No generic
 * "create commission" endpoint exists - `ingest` requires a typed evidence
 * envelope (provider code + evidence type + evidence reference + the
 * provider-shaped payload itself), never an arbitrary field set (spec
 * section 53).
 */
@ApiTags('admin-affiliate')
@ApiBearerAuth()
@Controller('admin/affiliate')
export class AdminAffiliateController {
  constructor(
    private readonly conversions: AffiliateConversionsService,
    private readonly reporting: AffiliateReportingService,
  ) {}

  @Roles(Role.ADMIN)
  @Get('conversions')
  listConversions(@Query() query: ListAffiliateConversionsQueryDto) {
    return this.reporting.listConversions(query);
  }

  @Roles(Role.ADMIN)
  @Get('summary')
  summary() {
    return this.reporting.summary();
  }

  @Roles(Role.ADMIN)
  @Post('conversions/ingest')
  ingest(@CurrentUser() user: AuthUser, @Body() dto: IngestAffiliateConversionDto) {
    return this.conversions.ingest(user.id, dto);
  }
}
