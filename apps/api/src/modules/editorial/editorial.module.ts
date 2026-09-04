import { Module } from '@nestjs/common';
import { EditorialService } from './editorial.service';
import { EditorialController } from './editorial.controller';

@Module({
  providers: [EditorialService],
  controllers: [EditorialController],
  exports: [EditorialService],
})
export class EditorialModule {}
