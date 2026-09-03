import { Body, Controller, Delete, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { EntityKind, ModerationStatus, Role } from '@prisma/client';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CommentsService } from './comments.service';

class CreateCommentDto {
  @IsEnum(EntityKind)
  targetType!: EntityKind;

  @IsString()
  targetId!: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;
}

class VoteDto {
  @IsIn([1, -1])
  value!: 1 | -1;
}

class ModerateCommentDto {
  @IsEnum(ModerationStatus)
  status!: ModerationStatus;
}

@ApiTags('community')
@ApiBearerAuth()
@Controller('comments')
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCommentDto) {
    return this.comments.create(user.id, dto.targetType, dto.targetId, dto.body, dto.parentId);
  }

  @Post(':id/vote')
  vote(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: VoteDto) {
    return this.comments.vote(user.id, id, dto.value);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.comments.remove(user.id, id);
  }

  @Roles(Role.MODERATOR, Role.ADMIN)
  @Patch(':id/moderate')
  moderate(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ModerateCommentDto) {
    return this.comments.moderate(user.id, id, dto.status);
  }
}
