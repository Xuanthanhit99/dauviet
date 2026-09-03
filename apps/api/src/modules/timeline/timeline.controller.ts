import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { Locale } from '../../common/decorators/locale.decorator';
import { TimelineService } from './timeline.service';
import { TimelineQueryDto } from './dto/timeline-query.dto';

@ApiTags('timeline')
@Controller('timeline')
export class TimelineController {
  constructor(private readonly timeline: TimelineService) {}

  @Public()
  @Get()
  get(@Query() query: TimelineQueryDto, @Locale() locale: string) {
    return this.timeline.getTimeline(query, locale);
  }
}
