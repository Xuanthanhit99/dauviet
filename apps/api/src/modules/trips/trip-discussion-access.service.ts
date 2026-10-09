import { Injectable } from '@nestjs/common';
import { TripAuthorizationService, TripCapability } from './trip-authorization.service';

/**
 * A discussion never grants trip access. Every request must re-authorize
 * against current Trip.ownerId/TripMember, including after a reconnect.
 * This service is deliberately transport-agnostic (HTTP, websocket, worker).
 */
@Injectable()
export class TripDiscussionAccessService {
  constructor(private readonly tripAuth: TripAuthorizationService) {}

  async assertCanRead(tripId: string, userId: string): Promise<void> {
    await this.tripAuth.authorize(tripId, userId, TripCapability.VIEW_TRIP);
  }

  async assertCanPost(tripId: string, userId: string): Promise<void> {
    // VIEWER is permitted to discuss but not edit the trip itinerary.
    // Message moderation and rate limiting belong to the message service.
    await this.tripAuth.authorize(tripId, userId, TripCapability.VIEW_TRIP);
  }
}
