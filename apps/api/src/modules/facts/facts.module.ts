import { Module } from '@nestjs/common';
import { FactsService } from './facts.service';
import { FactsController } from './facts.controller';

@Module({
  providers: [FactsService],
  controllers: [FactsController],
  exports: [FactsService],
})
export class FactsModule {}
