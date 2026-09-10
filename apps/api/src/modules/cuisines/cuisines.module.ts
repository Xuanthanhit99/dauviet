import { Module } from '@nestjs/common';
import { CuisinesService } from './cuisines.service';
import { CuisinesController } from './cuisines.controller';

@Module({
  providers: [CuisinesService],
  controllers: [CuisinesController],
  exports: [CuisinesService],
})
export class CuisinesModule {}
