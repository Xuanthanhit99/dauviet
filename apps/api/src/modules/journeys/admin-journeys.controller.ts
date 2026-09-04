import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { Locale } from '../../common/decorators/locale.decorator';
import { JourneysService } from './journeys.service';

/** Authenticated preview for DRAFT/in-review Journeys (spec section 46). */
@ApiTags('admin/journeys')
@ApiBearerAuth()
@Controller('admin/journeys')
@Roles(Role.EDITOR, Role.ADMIN)
export class AdminJourneysController {
  constructor(private readonly journeys: JourneysService) {}

  @Get(':id/preview')
  preview(@Param('id') id: string, @Locale() locale: string) {
    return this.journeys.preview(id, locale);
  }
}
