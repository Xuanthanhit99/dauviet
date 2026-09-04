import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsOptional, IsString } from 'class-validator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { SourcesService } from './sources.service';
import { CreateSourceDocumentDto, CreateSourceDto } from './dto/source.dto';
import { CommentsService } from '../comments/comments.service';
import { CursorPaginationQuery } from '../../common/dto/pagination.dto';

class ArchiveSourceDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

@ApiTags('sources')
@Controller('sources')
export class SourcesController {
  constructor(private readonly sources: SourcesService, private readonly comments: CommentsService) {}

  @Public()
  @Get()
  list(@Query('sourceType') sourceType?: string, @Query('q') q?: string) {
    return this.sources.list({ sourceType, q });
  }

  @Public()
  @Get(':id')
  async getById(@Param('id') id: string) {
    const source = await this.sources.findById(id);
    return {
      ...source,
      sourceDocuments: source.sourceDocuments.map((d) => this.sources.redactDocumentForPublic(d)),
    };
  }

  @Public()
  @Get(':id/comments')
  getComments(@Param('id') id: string, @Query() query: CursorPaginationQuery) {
    return this.comments.list('SOURCE', id, query);
  }

  @ApiBearerAuth()
  @Get(':id/documents/:documentId')
  getDocument(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('documentId') documentId: string) {
    return this.sources.getDocumentForViewer(id, documentId, user.roles);
  }

  @ApiBearerAuth()
  @Roles(Role.CONTRIBUTOR, Role.EDITOR, Role.HISTORIAN_REVIEWER, Role.ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSourceDto) {
    return this.sources.create(dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.EDITOR, Role.HISTORIAN_REVIEWER, Role.ADMIN)
  @Post(':id/documents')
  addDocument(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateSourceDocumentDto) {
    return this.sources.addDocument(id, dto, user.id);
  }

  @ApiBearerAuth()
  @Roles(Role.HISTORIAN_REVIEWER, Role.ADMIN)
  @Patch(':id/archive')
  archive(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ArchiveSourceDto) {
    return this.sources.archive(id, user.id, dto.reason ?? 'No reason given.');
  }
}
