import { Body, Controller, Get, Param, Patch, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { EntityKind, Role } from '@prisma/client';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Public } from '../../common/decorators/public.decorator';
import { LocalTestStorageService } from './local-test-storage.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { MediaService } from './media.service';
import type { Response } from 'express';
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


class SetHeroMediaDto {
  @IsIn(['PLACE', 'DESTINATION'])
  entityType!: 'PLACE' | 'DESTINATION';

  @IsString()
  entityId!: string;

  @IsString()
  mediaAssetId!: string;
}

@ApiTags('media')
// G12: bearer auth is declared per role-gated method, not on the class - GET /media/:id is
// @Public() and the class-level declaration made OpenAPI claim it required a bearer token.
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService, private readonly localStorage: LocalTestStorageService) {}

  @Public()
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.media.findPublicById(id);
  }

  @Public()
  @Get('test-public/:key')
  async getTestPublic(@Param('key') key: string, @Res() res: Response) {
    if (process.env.MEDIA_STORAGE_DRIVER !== 'local-test') return res.status(404).end();
    const decoded = decodeURIComponent(key);
    const stream = await this.localStorage.getObjectStream(decoded);
    stream.pipe(res);
  }

  @ApiBearerAuth()
  @Roles(Role.CONTRIBUTOR, Role.EDITOR, Role.HISTORIAN_REVIEWER, Role.ADMIN)
  @Post('uploads')
  requestUpload(@CurrentUser() user: AuthUser, @Body() dto: RequestUploadDto) {
    return this.media.requestUpload(dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.CONTRIBUTOR, Role.EDITOR, Role.HISTORIAN_REVIEWER, Role.ADMIN)
  @Post('uploads/:id/confirm')
  confirmUpload(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ConfirmUploadDto) {
    return this.media.confirmUpload(id, dto, user);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.HISTORIAN_REVIEWER, Role.ADMIN)
  @Post('set-hero')
  setHero(@CurrentUser() user: AuthUser, @Body() dto: SetHeroMediaDto) {
    return this.media.setHeroMedia(dto.entityType, dto.entityId, dto.mediaAssetId, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.HISTORIAN_REVIEWER, Role.ADMIN)
  @Post('attach')
  attach(@Body() dto: AttachMediaDto) {
    return this.media.attachToEntity(dto.entityType, dto.entityId, dto.mediaAssetId, dto.role, dto.order);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.HISTORIAN_REVIEWER, Role.ADMIN)
  @Patch(':id/rights')
  updateRights(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateMediaRightsDto) {
    return this.media.updateRights(id, dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.HISTORIAN_REVIEWER, Role.ADMIN)
  @Patch(':id/translations/:locale')
  setTranslation(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('locale') locale: string, @Body() dto: SetMediaTranslationDto) {
    return this.media.setTranslation(id, locale, dto.caption, dto.altText, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.HISTORIAN_REVIEWER, Role.ADMIN)
  @Patch(':id/access-policy')
  updateAccessPolicy(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateAccessPolicyDto) {
    return this.media.updateAccessPolicy(id, dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.MODERATOR, Role.ADMIN)
  @Patch(':id/quarantine')
  quarantine(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: QuarantineMediaDto) {
    return this.media.quarantine(id, dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.HISTORIAN_REVIEWER, Role.ADMIN)
  @Patch(':id/archive')
  archive(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ArchiveMediaDto) {
    return this.media.archive(id, dto, user.id);
  }

  /** Orphan-upload cleanup (spec section 40) - triggered on demand since no cron runner is wired up in this build. */
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @Post('admin/cleanup-expired-uploads')
  cleanupExpiredUploads(@CurrentUser() user: AuthUser) {
    return this.media.cleanupExpiredPendingUploads(user.id);
  }
}
