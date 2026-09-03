import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { HealthController } from './health.controller';

@Module({
  imports: [BullModule.registerQueue({ name: 'media-processing' })],
  controllers: [HealthController],
})
export class HealthModule {}
