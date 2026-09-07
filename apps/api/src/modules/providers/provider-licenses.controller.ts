import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { ProviderLicenseStatus, Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { ProviderLicensesService } from './provider-licenses.service';
import {
  CreateProviderDataPolicyDto,
  CreateProviderPolicyEvidenceDto,
  SetProviderLicenseRightsDto,
  UpdateProviderLicenseDto,
} from './dto/provider-license.dto';

class SetProviderLicenseStatusDto {
  @IsEnum(ProviderLicenseStatus)
  status!: ProviderLicenseStatus;
}

@ApiTags('admin-providers')
@ApiBearerAuth()
@Controller('admin/provider-licenses')
export class ProviderLicensesController {
  constructor(private readonly licenses: ProviderLicensesService) {}

  @Roles(Role.ADMIN)
  @Get(':id')
  getDetail(@Param('id') id: string) {
    return this.licenses.getDetail(id);
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateProviderLicenseDto) {
    return this.licenses.update(id, dto, user.id);
  }

  @Roles(Role.ADMIN)
  @Patch(':id/rights')
  setRights(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetProviderLicenseRightsDto) {
    return this.licenses.setRights(id, dto, user.id);
  }

  @Roles(Role.ADMIN)
  @Patch(':id/status')
  setStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetProviderLicenseStatusDto) {
    return this.licenses.setStatus(id, dto.status, user.id);
  }

  @Roles(Role.ADMIN)
  @Post(':id/evidence')
  addEvidence(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateProviderPolicyEvidenceDto) {
    return this.licenses.addEvidence(id, dto, user.id);
  }

  @Roles(Role.ADMIN)
  @Post(':id/data-policy')
  createDataPolicy(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateProviderDataPolicyDto) {
    return this.licenses.createDataPolicy(id, dto, user.id);
  }
}
