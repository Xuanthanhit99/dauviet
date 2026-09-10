import { Module } from '@nestjs/common';
import { AccommodationsService } from './accommodations.service';
import { AccommodationsController } from './accommodations.controller';
import { ProvidersModule } from '../providers/providers.module';

@Module({
  imports: [ProvidersModule],
  providers: [AccommodationsService],
  controllers: [AccommodationsController],
  exports: [AccommodationsService],
})
export class AccommodationsModule {}
