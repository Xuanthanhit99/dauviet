import { Body, Controller, Delete, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsString } from 'class-validator';
import { EntityKind } from '@prisma/client';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { BookmarksService } from './bookmarks.service';

class BookmarkDto {
  @IsEnum(EntityKind)
  targetType!: EntityKind;

  @IsString()
  targetId!: string;
}

@ApiTags('community')
@ApiBearerAuth()
@Controller('bookmarks')
export class BookmarksController {
  constructor(private readonly bookmarks: BookmarksService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('targetType') targetType?: EntityKind) {
    return this.bookmarks.list(user.id, targetType);
  }

  @Post()
  add(@CurrentUser() user: AuthUser, @Body() dto: BookmarkDto) {
    return this.bookmarks.add(user.id, dto.targetType, dto.targetId);
  }

  @Delete()
  remove(@CurrentUser() user: AuthUser, @Body() dto: BookmarkDto) {
    return this.bookmarks.remove(user.id, dto.targetType, dto.targetId);
  }
}
