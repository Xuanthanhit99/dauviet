import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { DestinationWatchService } from './destination-watch.service';
import { FollowDestinationDto, UpdateWatchPreferencesDto } from './destination-watch.dto';

@ApiTags('destination-watch')
@ApiBearerAuth()
@Controller('me')
export class DestinationWatchController {
  constructor(private readonly watches: DestinationWatchService) {}

  @Get('destination-watches')
  list(@CurrentUser() user: AuthUser) {
    return this.watches.listWatches(user.id);
  }

  @Post('destination-watches')
  follow(@CurrentUser() user: AuthUser, @Body() dto: FollowDestinationDto) {
    return this.watches.follow(user.id, dto.destinationId);
  }

  @Delete('destination-watches/:destinationId')
  unfollow(@CurrentUser() user: AuthUser, @Param('destinationId') destinationId: string) {
    return this.watches.unfollow(user.id, destinationId);
  }

  @Get('watch-preferences')
  preferences(@CurrentUser() user: AuthUser) {
    return this.watches.getPreferences(user.id);
  }

  @Patch('watch-preferences')
  updatePreferences(@CurrentUser() user: AuthUser, @Body() dto: UpdateWatchPreferencesDto) {
    return this.watches.updatePreferences(user.id, dto);
  }

@Get('watch-notifications')
notifications(
  @CurrentUser() user: AuthUser,
  @Query('limit') requestedLimit?: string,
) {
  if (
    requestedLimit !== undefined &&
    (typeof requestedLimit !== 'string' || !/^[0-9]+$/.test(requestedLimit))
  ) {
    throw new BadRequestException('limit must be a positive integer');
  }

  const parsedLimit = requestedLimit === undefined
    ? 20
    : Number(requestedLimit);

  if (!Number.isSafeInteger(parsedLimit) || parsedLimit < 1) {
    throw new BadRequestException('limit must be a positive integer');
  }

  return this.watches.listNotifications(
    user.id,
    Math.min(parsedLimit, 100),
  );
}
  @Patch('watch-notifications/:id/read')
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.watches.markRead(user.id, id);
  }
}
