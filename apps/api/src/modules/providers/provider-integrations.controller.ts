import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { ProviderCapabilityType, ProviderEnvironment, ProviderIntegrationStatus, Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { ProviderIntegrationsService } from './provider-integrations.service';
import { UpdateProviderIntegrationDto } from './dto/provider-integration.dto';

class SetProviderIntegrationStatusDto {
  @IsEnum(ProviderIntegrationStatus)
  status!: ProviderIntegrationStatus;
}

@ApiTags('admin-providers')
@ApiBearerAuth()
@Controller('admin/provider-integrations')
export class ProviderIntegrationsController {
  constructor(private readonly integrations: ProviderIntegrationsService) {}

  @Roles(Role.ADMIN)
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateProviderIntegrationDto) {
    return this.integrations.update(id, dto, user.id);
  }

  @Roles(Role.ADMIN)
  @Patch(':id/status')
  setStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetProviderIntegrationStatusDto) {
    return this.integrations.setStatus(id, dto.status, user.id);
  }

  /** ENABLED_FOR_OUR_ACCOUNT (spec section 7) - ungated by license state, see ProviderIntegrationsService.enableCapability. */
  @Roles(Role.ADMIN)
  @Post(':id/capabilities/:capability/enable')
  enableCapability(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('capability') capability: ProviderCapabilityType,
  ) {
    return this.integrations.enableCapability(id, capability, user.id);
  }

  @Roles(Role.ADMIN)
  @Post(':id/capabilities/:capability/activate')
  activateCapability(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('capability') capability: ProviderCapabilityType,
  ) {
    return this.integrations.activateCapability(id, capability, user.id);
  }

  @Roles(Role.ADMIN)
  @Delete(':id/capabilities/:capability')
  revokeCapability(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('capability') capability: ProviderCapabilityType,
  ) {
    return this.integrations.revokeCapability(id, capability, user.id);
  }

  /** Diagnostic/admin read-only check of the real, always-fresh serving gate (spec section 52). */
  @Roles(Role.ADMIN)
  @Get('check-access')
  checkAccess(
    @Query('providerCode') providerCode: string,
    @Query('environment') environment: ProviderEnvironment,
    @Query('capability') capability: ProviderCapabilityType,
  ) {
    return this.integrations.checkAccess(providerCode, environment, capability);
  }
}
