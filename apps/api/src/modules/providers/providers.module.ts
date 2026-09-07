import { Module } from '@nestjs/common';
import { ProvidersService } from './providers.service';
import { ProvidersController } from './providers.controller';
import { ProviderIntegrationsService } from './provider-integrations.service';
import { ProviderIntegrationsController } from './provider-integrations.controller';
import { ProviderLicensesService } from './provider-licenses.service';
import { ProviderLicensesController } from './provider-licenses.controller';
import { ProviderRegistryService } from './provider-registry.service';

/**
 * One cohesive module for the whole Provider + Licensing domain (spec
 * section 21), deliberately NOT split one-module-per-model the way G01's
 * independently-public Country/Region/City/Destination were: every write
 * path here needs cross-model validation in one atomic operation
 * (activation reads Provider+Capability+Integration+License+DataPolicy+
 * AttributionRule together), and none of these models has an independent
 * public surface that would justify separate modules.
 */
@Module({
  providers: [ProvidersService, ProviderIntegrationsService, ProviderLicensesService, ProviderRegistryService],
  controllers: [ProvidersController, ProviderIntegrationsController, ProviderLicensesController],
  exports: [ProviderRegistryService],
})
export class ProvidersModule {}
