import { Module } from '@nestjs/common';
import { JourneysService } from './journeys.service';
import { JourneysController } from './journeys.controller';
import { AdminJourneysController } from './admin-journeys.controller';
import { CommentsModule } from '../comments/comments.module';

@Module({
  imports: [CommentsModule],
  providers: [JourneysService],
  controllers: [JourneysController, AdminJourneysController],
  exports: [JourneysService],
})
export class JourneysModule {}
