import { Module } from '@nestjs/common';
import { TerritoriesService } from './territories.service';
import { TerritoriesController } from './territories.controller';

@Module({
  providers: [TerritoriesService],
  controllers: [TerritoriesController],
  exports: [TerritoriesService],
})
export class TerritoriesModule {}
