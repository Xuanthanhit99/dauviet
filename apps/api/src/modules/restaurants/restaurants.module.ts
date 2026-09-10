import { Module } from '@nestjs/common';
import { RestaurantsService } from './restaurants.service';
import { RestaurantsController } from './restaurants.controller';
import { ProvidersModule } from '../providers/providers.module';

@Module({
  imports: [ProvidersModule],
  providers: [RestaurantsService],
  controllers: [RestaurantsController],
  exports: [RestaurantsService],
})
export class RestaurantsModule {}
