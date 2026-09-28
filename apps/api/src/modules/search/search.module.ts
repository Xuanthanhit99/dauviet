import { Module } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import { AdminSearchController } from './admin-search.controller';
import { SearchProjectionService } from './search-projection.service';
import { SearchProjectionWorker } from './search-projection.worker';
import { SearchMetricsService } from './search-metrics.service';

@Module({
  providers: [SearchService, SearchProjectionService, SearchProjectionWorker, SearchMetricsService],
  controllers: [SearchController, AdminSearchController],
  exports: [SearchProjectionService],
})
export class SearchModule {}
