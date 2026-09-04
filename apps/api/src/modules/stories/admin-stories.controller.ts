import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { Locale } from '../../common/decorators/locale.decorator';
import { StoriesService } from './stories.service';

/**
 * Authenticated preview for DRAFT/in-review Stories (spec section 46) - a
 * literal `/admin/*` path, not a secret query parameter on the public
 * route, matching the existing `/admin/audit`/`/admin/users` convention.
 */
@ApiTags('admin/stories')
@ApiBearerAuth()
@Controller('admin/stories')
@Roles(Role.EDITOR, Role.HISTORIAN_REVIEWER, Role.ADMIN)
export class AdminStoriesController {
  constructor(private readonly stories: StoriesService) {}

  @Get(':id/preview')
  preview(@Param('id') id: string, @Locale() locale: string) {
    return this.stories.preview(id, locale);
  }

  @Get(':id/media')
  getMedia(@Param('id') id: string) {
    return this.stories.getMedia(id);
  }
}
