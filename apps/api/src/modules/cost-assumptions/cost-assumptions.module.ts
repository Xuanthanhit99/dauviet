import { Module } from '@nestjs/common';
import { CostAssumptionsService } from './cost-assumptions.service';
import { CostAssumptionsController } from './cost-assumptions.controller';

@Module({
  providers: [CostAssumptionsService],
  controllers: [CostAssumptionsController],
  exports: [CostAssumptionsService],
})
export class CostAssumptionsModule {}
