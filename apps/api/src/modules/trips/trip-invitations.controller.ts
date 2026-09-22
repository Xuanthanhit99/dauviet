import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { TripInvitationsService } from './trip-invitations.service';
import { AcceptTripInvitationDto, DeclineTripInvitationDto } from './dto/trip-collaboration.dto';

/**
 * Standalone invitation acceptance/decline (spec section 21/23/72). Token
 * is in the request BODY, never the URL path - see
 * docs/backend/G07_PRE_IMPLEMENTATION_REPORT.md section 13 for why this
 * deliberately deviates from the brief's own `:token` path-param sketch
 * (matches this repo's existing `/verify-email`/`/reset-password`
 * convention, so a bearer secret never appears in a URL/access log/
 * referrer header).
 */
@ApiTags('trip-invitations')
@ApiBearerAuth()
@Controller('trip-invitations')
export class TripInvitationsController {
  constructor(private readonly invitations: TripInvitationsService) {}

  /** Brute-force resistance (spec section 52) - defense in depth alongside the token's own 256 bits of entropy. */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('accept')
  accept(@CurrentUser() user: AuthUser, @Body() dto: AcceptTripInvitationDto) {
    return this.invitations.accept(dto.token, user);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('decline')
  decline(@CurrentUser() user: AuthUser, @Body() dto: DeclineTripInvitationDto) {
    return this.invitations.decline(dto.token, user);
  }
}
