import { Module } from '@nestjs/common';
import { ErasService } from './eras.service';
import { ErasController } from './eras.controller';

@Module({
  providers: [ErasService],
  controllers: [ErasController],
  exports: [ErasService],
})
export class ErasModule {}
