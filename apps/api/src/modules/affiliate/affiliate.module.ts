import { Module } from '@nestjs/common';
import { ProvidersModule } from '../providers/providers.module';
import { TripsModule } from '../trips/trips.module';
import { AffiliateController } from './affiliate.controller';
import { AdminAffiliateController } from './admin-affiliate.controller';
import { AffiliateClicksService } from './affiliate-clicks.service';
import { AffiliateConversionsService } from './affiliate-conversions.service';
import { AffiliateReportingService } from './affiliate-reporting.service';
import { AffiliateAdapterRegistry } from './affiliate-adapter-registry.service';

// G10 - Affiliate & Commercial Attribution (additive - see
// docs/backend/G10_PRE_IMPLEMENTATION_REPORT.md). Imports ProvidersModule
// for the G02 `ProviderRegistryService` policy gate (never bypassed, spec
// section 16) and TripsModule for `TripAuthorizationService` (a click that
// references a trip must still pass ordinary VIEW_TRIP access, spec section
// 49's converse).
@Module({
  imports: [ProvidersModule, TripsModule],
  providers: [AffiliateClicksService, AffiliateConversionsService, AffiliateReportingService, AffiliateAdapterRegistry],
  controllers: [AffiliateController, AdminAffiliateController],
})
export class AffiliateModule {}
