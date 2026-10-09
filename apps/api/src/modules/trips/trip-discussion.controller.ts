import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { PostTripDiscussionMessageDto } from './dto/trip-discussion.dto';
import { TripDiscussionService } from './trip-discussion.service';

@ApiTags('trips')
@ApiBearerAuth()
@Controller('trips')
export class TripDiscussionController {
  constructor(private readonly discussion: TripDiscussionService) {}

  @Get(':id/discussion/messages')
  list(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.discussion.list(id, user.id);
  }

  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @Post(':id/discussion/messages')
  post(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: PostTripDiscussionMessageDto) {
    return this.discussion.post(id, user.id, dto.body);
  }
}
