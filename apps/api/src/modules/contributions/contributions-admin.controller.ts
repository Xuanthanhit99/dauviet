import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { ContributionsService } from './contributions.service';
import {
  CatalogueDocumentDto,
  CatalogueMediaDto,
  CatalogueSourceDto,
  ContributionQueueQueryDto,
  SetProvenanceConfidenceDto,
  SetRightsReviewDto,
  SetSensitivityDto,
  SubmitContributionReviewDto,
} from './dto/contribution.dto';

const CATALOGUE_ROLES = [Role.HISTORIAN_REVIEWER, Role.ADMIN];

/**
 * Reviewer/admin queue and every review/cataloguing action (spec sections
 * 47-51). Never publicly reachable - the whole controller requires at least
 * EDITOR/HISTORIAN_REVIEWER/ADMIN; the cataloguing (promotion) routes are
 * further restricted to HISTORIAN_REVIEWER/ADMIN, the same stricter gate as
 * `PATCH /sources/:id/archive` (spec section 30/50).
 */
@ApiTags('admin/contributions')
@ApiBearerAuth()
@Roles(Role.EDITOR, Role.HISTORIAN_REVIEWER, Role.ADMIN)
@Controller('admin/contributions')
export class ContributionsAdminController {
  constructor(private readonly contributions: ContributionsService) {}

  @Get()
  queue(@Query() query: ContributionQueueQueryDto) {
    return this.contributions.queue(query);
  }

  @Get(':id')
  getDetail(@Param('id') id: string) {
    return this.contributions.getAdminDetail(id);
  }

  @Post(':id/reviews')
  submitReview(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SubmitContributionReviewDto) {
    return this.contributions.submitReview(id, user, dto);
  }

  @Patch(':id/rights-review')
  setRightsReview(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetRightsReviewDto) {
    return this.contributions.setRightsReview(id, user, dto);
  }

  @Patch(':id/provenance-confidence')
  setProvenanceConfidence(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetProvenanceConfidenceDto) {
    return this.contributions.setProvenanceConfidence(id, user, dto);
  }

  @Patch(':id/sensitivity')
  setSensitivity(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetSensitivityDto) {
    return this.contributions.setSensitivity(id, user, dto);
  }

  @Roles(...CATALOGUE_ROLES)
  @Post(':id/catalogue/source')
  catalogueSource(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CatalogueSourceDto) {
    return this.contributions.catalogueSource(id, user, dto);
  }

  @Roles(...CATALOGUE_ROLES)
  @Post(':id/catalogue/document')
  catalogueDocument(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CatalogueDocumentDto) {
    return this.contributions.catalogueDocument(id, user, dto);
  }

  @Roles(...CATALOGUE_ROLES)
  @Post(':id/catalogue/media')
  catalogueMedia(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CatalogueMediaDto) {
    return this.contributions.catalogueMedia(id, user, dto);
  }
}
