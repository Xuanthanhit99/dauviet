import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { EntityKind, ReportCategory, ReportStatus, Role } from '@prisma/client';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ReportsService } from './reports.service';

class FileReportDto {
  @IsEnum(EntityKind)
  targetType!: EntityKind;

  @IsString()
  targetId!: string;

  @IsEnum(ReportCategory)
  category!: ReportCategory;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

class ResolveReportDto {
  @IsEnum(ReportStatus)
  status!: ReportStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolutionNote?: string;
}

@ApiTags('community')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post()
  file(@CurrentUser() user: AuthUser, @Body() dto: FileReportDto) {
    return this.reports.file(user.id, dto.targetType, dto.targetId, dto.category, dto.notes);
  }

  @Roles(Role.MODERATOR, Role.ADMIN)
  @Get('admin')
  list(@Query('status') status?: ReportStatus) {
    return this.reports.list(status);
  }

  @Roles(Role.MODERATOR, Role.ADMIN)
  @Patch(':id/resolve')
  resolve(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ResolveReportDto) {
    return this.reports.resolve(user.id, id, dto.status, dto.resolutionNote);
  }
}
