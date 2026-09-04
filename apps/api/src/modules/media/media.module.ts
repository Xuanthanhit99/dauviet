import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';
import { S3Service } from './s3.service';
import { MediaProcessor } from './media.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'media-processing',
      // Bounded retry/backoff (spec Phase 05.1 section 12) - a transient
      // storage error gets a few exponentially-spaced attempts; a corrupt
      // image is marked FAILED directly by the processor itself (it never
      // rethrows for that case), so it is never retried regardless of this
      // setting.
      defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    }),
  ],
  providers: [MediaService, S3Service, MediaProcessor],
  controllers: [MediaController],
  exports: [MediaService, S3Service],
})
export class MediaModule {}
