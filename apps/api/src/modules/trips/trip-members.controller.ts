import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { TripMembersService } from './trip-members.service';
import { TripInvitationsService } from './trip-invitations.service';
import { TripCollaborationEventService } from './trip-collaboration-event.service';
import { TripAuthorizationService, TripCapability } from './trip-authorization.service';
import {
  CreateTripInvitationDto,
  LeaveTripDto,
  ListTripActivityQuery,
  ListTripInvitationsQuery,
  RemoveTripMemberDto,
  TransferTripOwnershipDto,
  UpdateTripMemberRoleDto,
} from './dto/trip-collaboration.dto';

/**
 * Trip membership/invitation/activity - private trip-scoped sub-resources
 * (spec section 11), same controller-prefix convention as `TripsController`
 * itself (both target `/v1/trips`). No `@Public()` route exists here.
 */
@ApiTags('trips')
@ApiBearerAuth()
@Controller('trips')
export class TripMembersController {
  constructor(
    private readonly members: TripMembersService,
    private readonly invitations: TripInvitationsService,
    private readonly activity: TripCollaborationEventService,
    private readonly authz: TripAuthorizationService,
  ) {}

  @Get(':id/members')
  listMembers(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.members.list(id, user.id);
  }

  @Patch(':id/members/:memberId')
  updateMemberRole(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('memberId') memberId: string, @Body() dto: UpdateTripMemberRoleDto) {
    return this.members.updateRole(id, memberId, user.id, dto);
  }

  @Delete(':id/members/:memberId')
  removeMember(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('memberId') memberId: string, @Body() dto: RemoveTripMemberDto) {
    return this.members.remove(id, memberId, user.id, dto);
  }

  @Post(':id/leave')
  leave(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: LeaveTripDto) {
    return this.members.leave(id, user.id, dto);
  }

  @Post(':id/transfer-ownership')
  transferOwnership(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: TransferTripOwnershipDto) {
    return this.members.transferOwnership(id, user.id, dto);
  }

  /** Rate-limited (spec section 51/93/94) - an invitation triggers a real email send, the one abuse-relevant action in this controller. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':id/invitations')
  createInvitation(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateTripInvitationDto) {
    return this.invitations.create(id, user.id, dto);
  }

  @Get(':id/invitations')
  listInvitations(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query() query: ListTripInvitationsQuery) {
    return this.invitations.list(id, user.id, query.status);
  }

  @Delete(':id/invitations/:invitationId')
  revokeInvitation(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('invitationId') invitationId: string) {
    return this.invitations.revoke(id, invitationId, user.id);
  }

  /** VIEW_TRIP-gated (spec section 42) - a removed/left member or an unrelated user must never reach the activity feed. */
  @Get(':id/activity')
  async listActivity(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query() query: ListTripActivityQuery) {
    await this.authz.authorize(id, user.id, TripCapability.VIEW_TRIP);
    return this.activity.list(id, query.page, query.pageSize);
  }
}
