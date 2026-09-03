import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { EntityKind, Role } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { MediaService } from './media.service';
import { RegisterMediaDto, RequestUploadDto } from './dto/media.dto';

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
    return this.media.findById(id);
  }

  @Roles(Role.CONTRIBUTOR, Role.EDITOR, Role.HISTORIAN_REVIEWER, Role.ADMIN)
  @Post('uploads')
  requestUpload(@CurrentUser() user: AuthUser, @Body() dto: RequestUploadDto) {
    return this.media.requestUpload(dto, user.id);
  }

  @Roles(Role.CONTRIBUTOR, Role.EDITOR, Role.HISTORIAN_REVIEWER, Role.ADMIN)
  @Post()
  register(@CurrentUser() user: AuthUser, @Body() dto: RegisterMediaDto) {
    return this.media.register(dto, user.id);
  }

  @Roles(Role.EDITOR, Role.HISTORIAN_REVIEWER, Role.ADMIN)
  @Post('attach')
  attach(@Body() dto: AttachMediaDto) {
    return this.media.attachToEntity(dto.entityType, dto.entityId, dto.mediaAssetId, dto.role, dto.order);
  }
}
