import { Module } from '@nestjs/common';
import { DynastiesService } from './dynasties.service';
import { DynastiesController } from './dynasties.controller';

@Module({
  providers: [DynastiesService],
  controllers: [DynastiesController],
  exports: [DynastiesService],
})
export class DynastiesModule {}
