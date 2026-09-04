import { Module } from '@nestjs/common';
import { CommunityService } from './community.service';
import { CommunityController } from './community.controller';
import { CommentsModule } from '../comments/comments.module';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [CommentsModule, MediaModule],
  providers: [CommunityService],
  controllers: [CommunityController],
  exports: [CommunityService],
})
export class CommunityModule {}
