import { Module } from '@nestjs/common';
import { TripsService } from './trips.service';
import { TripItineraryService } from './trip-itinerary.service';
import { TripCostEstimatesService } from './trip-cost-estimates.service';
import { TripsController } from './trips.controller';
import { ProvidersModule } from '../providers/providers.module';
import { TripAuthorizationService } from './trip-authorization.service';
import { TripCollaborationEventService } from './trip-collaboration-event.service';
import { TripMembersService } from './trip-members.service';
import { TripInvitationsService } from './trip-invitations.service';
import { TripMembersController } from './trip-members.controller';
import { TripInvitationsController } from './trip-invitations.controller';
import { MailerModule } from '../mailer/mailer.module';

// G07 - Trip Collaboration (additive - see docs/backend/G07_PRE_IMPLEMENTATION_REPORT.md).
@Module({
  imports: [ProvidersModule, MailerModule],
  providers: [
    TripsService,
    TripItineraryService,
    TripCostEstimatesService,
    TripAuthorizationService,
    TripCollaborationEventService,
    TripMembersService,
    TripInvitationsService,
  ],
  controllers: [TripsController, TripMembersController, TripInvitationsController],
  exports: [TripsService, TripItineraryService, TripCostEstimatesService, TripAuthorizationService],
})
export class TripsModule {}
