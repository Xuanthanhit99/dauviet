import { Module } from '@nestjs/common';
import { ThenNowService } from './then-now.service';
import { ThenNowController } from './then-now.controller';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [MediaModule],
  providers: [ThenNowService],
  controllers: [ThenNowController],
})
export class ThenNowModule {}
