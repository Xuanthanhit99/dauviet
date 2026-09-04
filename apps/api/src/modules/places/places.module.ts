import { Module } from '@nestjs/common';
import { PlacesService } from './places.service';
import { PlacesController } from './places.controller';
import { CommentsModule } from '../comments/comments.module';
import { StoriesModule } from '../stories/stories.module';
import { JourneysModule } from '../journeys/journeys.module';

@Module({
  imports: [CommentsModule, StoriesModule, JourneysModule],
  providers: [PlacesService],
  controllers: [PlacesController],
  exports: [PlacesService],
})
export class PlacesModule {}
