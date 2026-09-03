import { Module } from '@nestjs/common';
import { ThemesService } from './themes.service';
import { ThemesController } from './themes.controller';

@Module({
  providers: [ThemesService],
  controllers: [ThemesController],
  exports: [ThemesService],
})
export class ThemesModule {}
