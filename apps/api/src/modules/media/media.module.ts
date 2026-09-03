import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';
import { S3Service } from './s3.service';
import { MediaProcessor } from './media.processor';

@Module({
  imports: [BullModule.registerQueue({ name: 'media-processing' })],
  providers: [MediaService, S3Service, MediaProcessor],
  controllers: [MediaController],
  exports: [MediaService, S3Service],
})
export class MediaModule {}
