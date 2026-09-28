import { Injectable } from '@nestjs/common';
import { AFFILIATE_ERROR_CODES } from '../../common/errors/affiliate-error-codes';
import { AffiliateProviderAdapter } from './affiliate-adapter.types';
import { FixtureAffiliateAdapter } from './adapters/fixture-affiliate-adapter';

export class AdapterNotFoundError extends Error {
  readonly code = AFFILIATE_ERROR_CODES.AFFILIATE_ADAPTER_NOT_FOUND;
}

/**
 * Adapter registry (spec section 15) - the ONE place a `providerCode` maps
 * to its adapter implementation, so no business service ever branches on
 * provider code itself. Only the fixture adapter is registered this phase
 * (see docs/backend/G10_PRE_IMPLEMENTATION_REPORT.md section 6/12) - a real
 * adapter would be added here, never inline in a service, once real
 * provider credentials/verified documentation exist.
 */
@Injectable()
export class AffiliateAdapterRegistry {
  private readonly adapters = new Map<string, AffiliateProviderAdapter>();

  constructor() {
    this.register(new FixtureAffiliateAdapter());
  }

  register(adapter: AffiliateProviderAdapter) {
    this.adapters.set(adapter.providerCode, adapter);
  }

  get(providerCode: string): AffiliateProviderAdapter {
    const exact = this.adapters.get(providerCode);
    if (exact) return exact;
    // A real `ExternalProvider.code` maps 1:1 to its adapter (e.g.
    // "BOOKING_COM"). Test fixture providers need one distinct
    // `ExternalProvider` row per test (the code column is unique) while
    // still exercising the SAME fixture adapter, so a `<adapterCode>_...`
    // suffixed code also routes to that adapter.
    for (const adapter of this.adapters.values()) {
      if (providerCode.startsWith(`${adapter.providerCode}_`)) return adapter;
    }
    throw new AdapterNotFoundError(`No affiliate adapter registered for provider "${providerCode}".`);
  }
}
