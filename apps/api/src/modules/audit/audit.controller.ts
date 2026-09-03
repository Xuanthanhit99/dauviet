import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { EntityKind, Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditService } from './audit.service';

@ApiTags('admin/audit')
@ApiBearerAuth()
@Controller('admin/audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Roles(Role.ADMIN, Role.MODERATOR, Role.HISTORIAN_REVIEWER)
  @Get()
  @ApiQuery({ name: 'entityType', enum: EntityKind, required: false })
  @ApiQuery({ name: 'entityId', required: false })
  list(@Query('entityType') entityType?: EntityKind, @Query('entityId') entityId?: string) {
    return this.audit.list({ entityType, entityId });
  }
}
