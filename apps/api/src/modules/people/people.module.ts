import { Module } from '@nestjs/common';
import { PeopleService } from './people.service';
import { PeopleController } from './people.controller';
import { CommentsModule } from '../comments/comments.module';
import { StoriesModule } from '../stories/stories.module';

@Module({
  imports: [CommentsModule, StoriesModule],
  providers: [PeopleService],
  controllers: [PeopleController],
  exports: [PeopleService],
})
export class PeopleModule {}
