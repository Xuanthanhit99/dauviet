import { Module } from '@nestjs/common';
import { EditorialService } from './editorial.service';
import { EditorialController } from './editorial.controller';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [MediaModule],
  providers: [EditorialService],
  controllers: [EditorialController],
  exports: [EditorialService],
})
export class EditorialModule {}
