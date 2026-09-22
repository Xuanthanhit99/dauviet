import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { IngestionCandidatesService } from './ingestion-candidates.service';
import { ListCandidatesQuery, MergeCandidateDto, ReviewCandidateDto } from './dto/ingestion.dto';

/**
 * Candidate review/promotion (spec section 33/45) - EDITOR/
 * HISTORIAN_REVIEWER/ADMIN, never CONTRIBUTOR/USER (candidates are
 * pre-publication - spec section 2/23). Self-approval on sensitive types
 * (PERSON/EVENT/HISTORICAL_FACT) is enforced inside
 * `IngestionCandidatesService.approve`, mirroring the existing FactReview
 * rule.
 */
@ApiTags('admin-ingestion-candidates')
@ApiBearerAuth()
@Controller('admin/ingestion/candidates')
@Roles(Role.EDITOR, Role.HISTORIAN_REVIEWER, Role.ADMIN)
export class IngestionCandidatesController {
  constructor(private readonly candidates: IngestionCandidatesService) {}

  @Get()
  list(@Query() query: ListCandidatesQuery) {
    return this.candidates.list(query);
  }

  @Get(':id')
  getDetail(@Param('id') id: string) {
    return this.candidates.getDetail(id);
  }

  @Get(':id/diff')
  getDiff(@Param('id') id: string) {
    return this.candidates.getDiff(id);
  }

  @Post(':id/approve')
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.candidates.approve(id, user.id);
  }

  @Post(':id/reject')
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReviewCandidateDto) {
    return this.candidates.reject(id, user.id, dto.notes);
  }

  @Post(':id/merge')
  merge(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: MergeCandidateDto) {
    return this.candidates.merge(id, dto.mergedIntoCandidateId, user.id);
  }
}
