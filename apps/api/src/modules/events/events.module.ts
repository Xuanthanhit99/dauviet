import { Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { CommentsModule } from '../comments/comments.module';
import { StoriesModule } from '../stories/stories.module';

@Module({
  imports: [CommentsModule, StoriesModule],
  providers: [EventsService],
  controllers: [EventsController],
  exports: [EventsService],
})
export class EventsModule {}
