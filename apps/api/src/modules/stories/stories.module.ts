import { Module } from '@nestjs/common';
import { StoriesService } from './stories.service';
import { StoriesController } from './stories.controller';
import { AdminStoriesController } from './admin-stories.controller';
import { CommentsModule } from '../comments/comments.module';

@Module({
  imports: [CommentsModule],
  providers: [StoriesService],
  controllers: [StoriesController, AdminStoriesController],
  exports: [StoriesService],
})
export class StoriesModule {}
