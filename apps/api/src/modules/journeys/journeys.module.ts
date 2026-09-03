import { Module } from '@nestjs/common';
import { JourneysService } from './journeys.service';
import { JourneysController } from './journeys.controller';
import { CommentsModule } from '../comments/comments.module';

@Module({
  imports: [CommentsModule],
  providers: [JourneysService],
  controllers: [JourneysController],
  exports: [JourneysService],
})
export class JourneysModule {}
