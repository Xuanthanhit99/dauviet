import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { DestinationsService } from './destinations.service';
import { DestinationsController } from './destinations.controller';
import { DestinationCollectionsService } from './destination-collections.service';
import { DestinationCollectionsController } from './destination-collections.controller';

@Module({
  imports: [MediaModule],
  providers: [DestinationsService, DestinationCollectionsService],
  controllers: [DestinationsController, DestinationCollectionsController],
  exports: [DestinationsService, DestinationCollectionsService],
})
export class DestinationsModule {}
