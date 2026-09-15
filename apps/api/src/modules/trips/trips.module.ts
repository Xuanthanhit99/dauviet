import { Module } from '@nestjs/common';
import { TripsService } from './trips.service';
import { TripItineraryService } from './trip-itinerary.service';
import { TripCostEstimatesService } from './trip-cost-estimates.service';
import { TripsController } from './trips.controller';
import { ProvidersModule } from '../providers/providers.module';

@Module({
  imports: [ProvidersModule],
  providers: [TripsService, TripItineraryService, TripCostEstimatesService],
  controllers: [TripsController],
  exports: [TripsService, TripItineraryService, TripCostEstimatesService],
})
export class TripsModule {}
