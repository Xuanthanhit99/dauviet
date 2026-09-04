import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { EntityKind, Role } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { MediaService } from './media.service';
import {
  ArchiveMediaDto,
  ConfirmUploadDto,
  QuarantineMediaDto,
  RequestUploadDto,
  SetMediaTranslationDto,
  UpdateAccessPolicyDto,
  UpdateMediaRightsDto,
} from './dto/media.dto';

class AttachMediaDto {
  @IsEnum(EntityKind)
  entityType!: EntityKind;

  @IsString()
  entityId!: string;

  @IsString()
  mediaAssetId!: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

@ApiTags('media')
@ApiBearerAuth()
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Public()
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.media.findPublicById(id);
  }

  @Roles(Role.CONTRIBUTOR, Role.EDITOR, Role.HISTORIAN_REVIEWER, Role.ADMIN)
  @Post('uploads')
  requestUpload(@CurrentUser() user: AuthUser, @Body() dto: RequestUploadDto) {
    return this.media.requestUpload(dto, user.id);
  }

  @Roles(Role.CONTRIBUTOR, Role.EDITOR, Role.HISTORIAN_REVIEWER, Role.ADMIN)
  @Post('uploads/:id/confirm')
  confirmUpload(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ConfirmUploadDto) {
    return this.media.confirmUpload(id, dto, user);
  }

  @Roles(Role.EDITOR, Role.HISTORIAN_REVIEWER, Role.ADMIN)
  @Post('attach')
  attach(@Body() dto: AttachMediaDto) {
    return this.media.attachToEntity(dto.entityType, dto.entityId, dto.mediaAssetId, dto.role, dto.order);
  }

  @Roles(Role.EDITOR, Role.HISTORIAN_REVIEWER, Role.ADMIN)
  @Patch(':id/rights')
  updateRights(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateMediaRightsDto) {
    return this.media.updateRights(id, dto, user.id);
  }

  @Roles(Role.EDITOR, Role.HISTORIAN_REVIEWER, Role.ADMIN)
  @Patch(':id/translations/:locale')
  setTranslation(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('locale') locale: string, @Body() dto: SetMediaTranslationDto) {
    return this.media.setTranslation(id, locale, dto.caption, dto.altText, user.id);
  }

  @Roles(Role.EDITOR, Role.HISTORIAN_REVIEWER, Role.ADMIN)
  @Patch(':id/access-policy')
  updateAccessPolicy(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateAccessPolicyDto) {
    return this.media.updateAccessPolicy(id, dto, user.id);
  }

  @Roles(Role.MODERATOR, Role.ADMIN)
  @Patch(':id/quarantine')
  quarantine(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: QuarantineMediaDto) {
    return this.media.quarantine(id, dto, user.id);
  }

  @Roles(Role.EDITOR, Role.HISTORIAN_REVIEWER, Role.ADMIN)
  @Patch(':id/archive')
  archive(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ArchiveMediaDto) {
    return this.media.archive(id, dto, user.id);
  }

  /** Orphan-upload cleanup (spec section 40) - triggered on demand since no cron runner is wired up in this build. */
  @Roles(Role.ADMIN)
  @Post('admin/cleanup-expired-uploads')
  cleanupExpiredUploads(@CurrentUser() user: AuthUser) {
    return this.media.cleanupExpiredPendingUploads(user.id);
  }
}
