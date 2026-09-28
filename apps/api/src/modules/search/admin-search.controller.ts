import { Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { SearchProjectionService } from './search-projection.service';
import { SearchMetricsService } from './search-metrics.service';

/**
 * Projection operations. ADMIN only: they never expose content (counts and timings only) and
 * there is deliberately NO unpublished-content search here or anywhere (no `includeUnpublished`).
 */
@ApiTags('admin-search')
@ApiBearerAuth()
@Controller('admin/search/projection')
export class AdminSearchController {
  constructor(
    private readonly projection: SearchProjectionService,
    private readonly metrics: SearchMetricsService,
  ) {}

  @Roles(Role.ADMIN)
  @Get('status')
  async status() {
    return { ...(await this.projection.status()), metrics: this.metrics.snapshot() };
  }

  @Roles(Role.ADMIN)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('drain')
  drain() {
    return this.projection.drain();
  }

  @Roles(Role.ADMIN)
  @Throttle({ default: { limit: 2, ttl: 60_000 } })
  @Post('rebuild')
  rebuild() {
    return this.projection.rebuildAll();
  }
}
