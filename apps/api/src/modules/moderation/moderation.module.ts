import { Module } from '@nestjs/common';
import { ModerationService } from './moderation.service';
import { ModerationController } from './moderation.controller';
import { ReportsModule } from '../reports/reports.module';
import { CommunityModule } from '../community/community.module';
import { CommentsModule } from '../comments/comments.module';

@Module({
  imports: [ReportsModule, CommunityModule, CommentsModule],
  providers: [ModerationService],
  controllers: [ModerationController],
})
export class ModerationModule {}
