import { Module } from '@nestjs/common';
import { ContributionsService } from './contributions.service';
import { ContributionsController } from './contributions.controller';
import { ContributionsAdminController } from './contributions-admin.controller';
import { MediaModule } from '../media/media.module';
import { SourcesModule } from '../sources/sources.module';

@Module({
  imports: [MediaModule, SourcesModule],
  providers: [ContributionsService],
  controllers: [ContributionsController, ContributionsAdminController],
})
export class ContributionsModule {}
