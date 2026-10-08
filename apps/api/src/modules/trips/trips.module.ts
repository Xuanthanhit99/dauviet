import { Module } from '@nestjs/common';
import { TripsService } from './trips.service';
import { TripItineraryService } from './trip-itinerary.service';
import { TripCostEstimatesService } from './trip-cost-estimates.service';
import { TripsController } from './trips.controller';
import { ProvidersModule } from '../providers/providers.module';
import { TripAuthorizationService } from './trip-authorization.service';
import { TripDiscussionAccessService } from './trip-discussion-access.service';
import { TripCollaborationEventService } from './trip-collaboration-event.service';
import { TripMembersService } from './trip-members.service';
import { TripInvitationsService } from './trip-invitations.service';
import { TripMembersController } from './trip-members.controller';
import { TripInvitationsController } from './trip-invitations.controller';
import { MailerModule } from '../mailer/mailer.module';
import { TripLocationSharingService } from './trip-location-sharing.service';
import { TripLocationsService } from './trip-locations.service';
import { TripExpensesService } from './trip-expenses.service';
import { TripSettlementsService } from './trip-settlements.service';
import { TripFinanceSummaryService } from './trip-finance-summary.service';

// G07 - Trip Collaboration (additive - see docs/backend/G07_PRE_IMPLEMENTATION_REPORT.md).
// G08 - Trip Location Sharing (additive - see docs/backend/G08_PRE_IMPLEMENTATION_REPORT.md).
// G09 - Trip Expense & Settlement (additive - see docs/backend/G09_PRE_IMPLEMENTATION_REPORT.md).
@Module({
  imports: [ProvidersModule, MailerModule],
  providers: [
    TripsService,
    TripItineraryService,
    TripCostEstimatesService,
    TripAuthorizationService,
    TripDiscussionAccessService,
    TripCollaborationEventService,
    TripMembersService,
    TripInvitationsService,
    TripLocationSharingService,
    TripLocationsService,
    TripExpensesService,
    TripSettlementsService,
    TripFinanceSummaryService,
  ],
  controllers: [TripsController, TripMembersController, TripInvitationsController],
  exports: [TripsService, TripItineraryService, TripCostEstimatesService, TripAuthorizationService, TripDiscussionAccessService],
})
export class TripsModule {}
