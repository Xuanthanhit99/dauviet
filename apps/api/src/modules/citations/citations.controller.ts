import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsOptional, IsString } from 'class-validator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { CitationsService } from './citations.service';
import { CreateCitationDto } from './dto/citation.dto';

class RejectCitationDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

@ApiTags('citations')
@ApiBearerAuth()
@Controller('citations')
export class CitationsController {
  constructor(private readonly citations: CitationsService) {}

  @Roles(Role.CONTRIBUTOR, Role.EDITOR, Role.HISTORIAN_REVIEWER, Role.ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCitationDto) {
    return this.citations.create(dto, user.id);
  }

  @Roles(Role.HISTORIAN_REVIEWER, Role.ADMIN)
  @Patch(':id/verify')
  verify(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.citations.verify(id, user.id);
  }

  @Roles(Role.HISTORIAN_REVIEWER, Role.ADMIN)
  @Patch(':id/dispute')
  dispute(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.citations.dispute(id, user.id);
  }

  @Roles(Role.HISTORIAN_REVIEWER, Role.ADMIN)
  @Patch(':id/reject')
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RejectCitationDto) {
    return this.citations.reject(id, user.id, dto.reason);
  }
}
