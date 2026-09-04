import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsIn, MaxLength } from 'class-validator';
import { EntityKind, ReportCategory, ReportStatus, Role } from '@prisma/client';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ModerationActionVerb, ModerationService } from './moderation.service';

class ModerationActionDto {
  @IsEnum(EntityKind)
  targetType!: EntityKind;

  @IsString()
  targetId!: string;

  @IsIn(['REMOVE', 'RESTORE', 'LIMIT', 'LOCK', 'UNLOCK', 'MARK_UNDER_REVIEW'])
  action!: ModerationActionVerb;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

/** Never public - every route requires MODERATOR/ADMIN (spec section 47). */
@ApiTags('moderation')
@ApiBearerAuth()
@Roles(Role.MODERATOR, Role.ADMIN)
@Controller('admin/moderation')
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}

  @Get('queue')
  queue(
    @Query('status') status?: ReportStatus,
    @Query('targetType') targetType?: EntityKind,
    @Query('category') category?: ReportCategory,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.moderation.queue({ status, targetType, category, from, to });
  }

  @Get(':targetType/:targetId')
  detail(@Param('targetType') targetType: EntityKind, @Param('targetId') targetId: string) {
    return this.moderation.detail(targetType, targetId);
  }

  @Post('actions')
  action(@CurrentUser() user: AuthUser, @Body() dto: ModerationActionDto) {
    return this.moderation.action(user.id, dto.targetType, dto.targetId, dto.action, dto.reason);
  }
}
