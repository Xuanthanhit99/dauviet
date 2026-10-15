import { Module } from '@nestjs/common';
import { DestinationWatchController } from './destination-watch.controller';
import { DestinationWatchService } from './destination-watch.service';

@Module({
  controllers: [DestinationWatchController],
  providers: [DestinationWatchService],
})
export class DestinationWatchModule {}
