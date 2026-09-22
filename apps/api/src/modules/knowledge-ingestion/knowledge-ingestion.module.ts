import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MediaModule } from '../media/media.module';
import { INGESTION_QUEUE } from './knowledge-ingestion.constants';
import { OutboundHttpService } from './outbound-http.service';
import { IngestionPolicyService } from './ingestion-policy.service';
import { EntityResolutionService } from './entity-resolution.service';
import { IngestionRunService } from './ingestion-run.service';
import { IngestionSourcesService } from './ingestion-sources.service';
import { IngestionJobsService } from './ingestion-jobs.service';
import { IngestionCandidatesService } from './ingestion-candidates.service';
import { IngestionPromotionService } from './ingestion-promotion.service';
import { IngestionProcessor } from './ingestion.processor';
import { IngestionAdminController } from './ingestion-admin.controller';
import { IngestionCandidatesController } from './ingestion-candidates.controller';
import { WikidataAdapter } from './adapters/wikidata.adapter';
import { WikimediaCommonsAdapter } from './adapters/wikimedia-commons.adapter';
import { UnescoAdapter } from './adapters/unesco.adapter';
import { GeonamesAdapter } from './adapters/geonames.adapter';
import { OpenStreetMapAdapter } from './adapters/openstreetmap.adapter';
import { GooglePlacesAdapter } from './adapters/google-places.adapter';

/**
 * G06.5 - Knowledge & Place Data Ingestion. Imports MediaModule for
 * S3Service (media promotion only - never the media upload/confirm
 * controller flow, which stays client-driven). Follows G02 Providers'
 * single-cohesive-module precedent (spec section 21 rationale) rather than
 * one module per model - every write path here needs cross-model
 * validation (policy gate + resolution + promotion) in one place.
 */
@Module({
  imports: [
    MediaModule,
    BullModule.registerQueue({
      name: INGESTION_QUEUE,
      // Bounded retry/backoff, same convention as media-processing (spec
      // section 40/41) - a policy rejection or permanent classification is
      // never retried regardless of this setting (IngestionRunService
      // itself decides FAILED vs PARTIAL and never rethrows for those
      // classes).
      defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    }),
  ],
  providers: [
    OutboundHttpService,
    IngestionPolicyService,
    EntityResolutionService,
    IngestionRunService,
    IngestionSourcesService,
    IngestionJobsService,
    IngestionCandidatesService,
    IngestionPromotionService,
    IngestionProcessor,
    WikidataAdapter,
    WikimediaCommonsAdapter,
    UnescoAdapter,
    GeonamesAdapter,
    OpenStreetMapAdapter,
    GooglePlacesAdapter,
  ],
  controllers: [IngestionAdminController, IngestionCandidatesController],
  exports: [IngestionPolicyService, IngestionRunService],
})
export class KnowledgeIngestionModule {}
