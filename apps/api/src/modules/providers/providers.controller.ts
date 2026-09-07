import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { ProviderStatus, Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { OffsetPaginationQuery } from '../../common/dto/pagination.dto';
import { ProvidersService } from './providers.service';
import { ProviderIntegrationsService } from './provider-integrations.service';
import { ProviderLicensesService } from './provider-licenses.service';
import { CreateProviderDto, DeclareProviderCapabilityDto, UpdateProviderDto } from './dto/provider.dto';
import { CreateProviderIntegrationDto } from './dto/provider-integration.dto';
import { CreateProviderAttributionRuleDto, CreateProviderLicenseDto } from './dto/provider-license.dto';

class SetProviderStatusDto {
  @IsEnum(ProviderStatus)
  status!: ProviderStatus;
}

class ListProvidersQuery extends OffsetPaginationQuery {
  @IsOptional()
  @IsEnum(ProviderStatus)
  status?: ProviderStatus;
}

/**
 * Admin-only infrastructure/governance surface (spec section 22 - G02
 * exposes little/no public provider metadata; this entire module is
 * ADMIN-gated, no @Public() route exists anywhere here).
 */
@ApiTags('admin-providers')
@ApiBearerAuth()
@Controller('admin/providers')
export class ProvidersController {
  constructor(
    private readonly providers: ProvidersService,
    private readonly integrations: ProviderIntegrationsService,
    private readonly licenses: ProviderLicensesService,
  ) {}

  @Roles(Role.ADMIN)
  @Get()
  list(@Query() query: ListProvidersQuery) {
    return this.providers.list({ page: query.page, pageSize: query.pageSize, status: query.status });
  }

  @Roles(Role.ADMIN)
  @Get(':id')
  getDetail(@Param('id') id: string) {
    return this.providers.getDetail(id);
  }

  @Roles(Role.ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProviderDto) {
    return this.providers.create(dto, user.id);
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateProviderDto) {
    return this.providers.update(id, dto, user.id);
  }

  @Roles(Role.ADMIN)
  @Patch(':id/status')
  setStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetProviderStatusDto) {
    return this.providers.setStatus(id, dto.status, user.id);
  }

  @Roles(Role.ADMIN)
  @Post(':id/capabilities')
  declareCapability(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DeclareProviderCapabilityDto) {
    return this.providers.declareCapability(id, dto, user.id);
  }

  @Roles(Role.ADMIN)
  @Post(':id/integrations')
  createIntegration(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateProviderIntegrationDto) {
    return this.integrations.create(id, dto, user.id);
  }

  @Roles(Role.ADMIN)
  @Post(':id/licenses')
  createLicense(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateProviderLicenseDto) {
    return this.licenses.create(id, dto, user.id);
  }

  @Roles(Role.ADMIN)
  @Post(':id/attribution-rules')
  createAttributionRule(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateProviderAttributionRuleDto) {
    return this.licenses.createAttributionRule(id, dto, user.id);
  }
}
