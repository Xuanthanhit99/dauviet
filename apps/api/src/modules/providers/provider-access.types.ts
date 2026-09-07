import { ProviderAttributionRequirement, ProviderCapabilityType, ProviderRightState } from '@prisma/client';

/**
 * Which legal right is being exercised by a would-be caller (spec section
 * 19's activation-gate checklist, section 45's cache-policy contract).
 * `getExecutionContext` always checks `display` (the minimum bar for
 * showing anything at all); a caller additionally checking `cache`/
 * `store`/`commercialUse` passes the relevant intent explicitly.
 */
export type ProviderUsageIntent = 'display' | 'cache' | 'store' | 'modify' | 'redistribute' | 'commercialUse';

/**
 * Minimal safe adapter contract (spec section 26) - a typed extension
 * point future G05 provider adapters implement. Deliberately NOT a giant
 * `execute(action, params): any` - each real capability gets its own
 * narrow, typed interface (e.g. a future `PlacesProviderAdapter`) that
 * ALSO satisfies this base shape. G02 implements no real adapter; only the
 * internal test/fixture adapter (`provider-test-fixture.ts`) exists.
 */
export interface ProviderAdapter {
  readonly providerCode: string;
  readonly capabilities: readonly ProviderCapabilityType[];
  healthCheck?(): Promise<boolean>;
}

/** Resolved, read-only view of a License's rights - never a raw Prisma row. */
export interface ProviderPolicyView {
  display: ProviderRightState;
  cache: ProviderRightState;
  maxCacheSeconds: number | null;
  store: ProviderRightState;
  storeIdentity: ProviderRightState;
  modify: ProviderRightState;
  redistribute: ProviderRightState;
  commercialUse: ProviderRightState;
  conditionalNotes: string | null;
}

export interface ProviderAttributionView {
  requirement: ProviderAttributionRequirement;
  displayText: string | null;
  logoRequired: boolean;
  linkUrl: string | null;
}

/**
 * Returned ONLY after every activation gate passes (spec section 46).
 * Never carries a raw secret - `credentialReference` is the env-var/secret-
 * manager KEY NAME the caller must resolve itself through its own
 * configuration layer, exactly like `ProviderIntegration.credentialReference`.
 */
export interface ProviderExecutionContext {
  providerId: string;
  providerCode: string;
  capability: ProviderCapabilityType;
  integrationId: string;
  licenseId: string;
  policy: ProviderPolicyView;
  attribution: ProviderAttributionView;
  credentialReference: string | null;
}
