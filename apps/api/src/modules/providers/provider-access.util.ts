import {
  ProviderAttributionRequirement,
  ProviderCapabilityType,
  ProviderCredentialMode,
  ProviderIntegrationStatus,
  ProviderLicenseStatus,
  ProviderRightState,
  ProviderStatus,
} from '@prisma/client';
import { PROVIDER_ERROR_CODES } from '../../common/errors/provider-error-codes';
import { ProviderExecutionContext, ProviderUsageIntent } from './provider-access.types';

/**
 * Pure, DB-independent activation-gate evaluator (spec sections 19/20/45).
 * Takes already-loaded plain rows (no Prisma client, no I/O) so it can be
 * unit-tested directly with plain objects - the same technique
 * `story-body.util.ts`'s `validateStoryBody` uses for the trust-critical
 * validation logic. `ProviderRegistryService` is the only caller that
 * actually queries the database; it must re-run this evaluator on EVERY
 * call (never cache the result) so a license revocation/expiry takes
 * effect immediately (spec sections 20/42/43) with nothing to invalidate.
 */

export interface ProviderRow {
  id: string;
  code: string;
  status: ProviderStatus;
  credentialMode: ProviderCredentialMode;
}

export interface IntegrationRow {
  id: string;
  status: ProviderIntegrationStatus;
  credentialReference: string | null;
}

export interface IntegrationCapabilityRow {
  approvedAt: Date | null;
}

export interface LicenseRow {
  id: string;
  status: ProviderLicenseStatus;
  rightsDisplay: ProviderRightState;
  rightsCache: ProviderRightState;
  rightsStore: ProviderRightState;
  rightsModify: ProviderRightState;
  rightsRedistribute: ProviderRightState;
  rightsCommercialUse: ProviderRightState;
  conditionalNotes: string | null;
  attributionRequirement: ProviderAttributionRequirement;
  effectiveFrom: Date | null;
  effectiveUntil: Date | null;
}

export interface DataPolicyRow {
  cacheAllowed: ProviderRightState;
  maxCacheSeconds: number | null;
  storeIdentityAllowed: ProviderRightState;
  storeContentAllowed: ProviderRightState;
  persistentIdentifierAllowed: ProviderRightState;
}

export interface AttributionRuleRow {
  requirement: ProviderAttributionRequirement;
  displayText: string | null;
  logoRequired: boolean;
  linkUrl: string | null;
}

export interface EvaluateProviderAccessInput {
  now: Date;
  usage: ProviderUsageIntent;
  requestedCapability: ProviderCapabilityType;
  provider: ProviderRow | null;
  capabilitySupported: boolean;
  integration: IntegrationRow | null;
  integrationCapability: IntegrationCapabilityRow | null;
  license: LicenseRow | null;
  dataPolicy: DataPolicyRow | null;
  attributionRule: AttributionRuleRow | null;
}

export type ProviderAccessResult =
  | { ok: true; context: ProviderExecutionContext }
  | { ok: false; code: string; message: string };

const SUSPENDED_INTEGRATION_STATUSES: ProviderIntegrationStatus[] = ['SUSPENDED', 'FAILED', 'REVOKED'];

function rightForUsage(license: LicenseRow, usage: ProviderUsageIntent): ProviderRightState {
  switch (usage) {
    case 'display':
      return license.rightsDisplay;
    case 'cache':
      return license.rightsCache;
    case 'store':
      return license.rightsStore;
    case 'modify':
      return license.rightsModify;
    case 'redistribute':
      return license.rightsRedistribute;
    case 'commercialUse':
      return license.rightsCommercialUse;
  }
}

export function evaluateProviderAccess(input: EvaluateProviderAccessInput): ProviderAccessResult {
  const { provider, capabilitySupported, integration, integrationCapability, license, dataPolicy, attributionRule, now, usage, requestedCapability } = input;

  if (!provider) {
    return { ok: false, code: PROVIDER_ERROR_CODES.PROVIDER_NOT_FOUND, message: 'Provider not found.' };
  }
  if (provider.status !== 'ACTIVE') {
    return { ok: false, code: PROVIDER_ERROR_CODES.PROVIDER_NOT_ACTIVE, message: `Provider ${provider.code} is not ACTIVE.` };
  }
  if (!capabilitySupported) {
    return {
      ok: false,
      code: PROVIDER_ERROR_CODES.PROVIDER_CAPABILITY_UNSUPPORTED,
      message: `Provider ${provider.code} does not declare support for ${requestedCapability}.`,
    };
  }
  if (!integration) {
    return { ok: false, code: PROVIDER_ERROR_CODES.PROVIDER_INTEGRATION_NOT_CONFIGURED, message: 'No integration configured for this provider/environment.' };
  }
  if (integration.status !== 'ACTIVE') {
    const code = SUSPENDED_INTEGRATION_STATUSES.includes(integration.status)
      ? PROVIDER_ERROR_CODES.PROVIDER_INTEGRATION_SUSPENDED
      : PROVIDER_ERROR_CODES.PROVIDER_INTEGRATION_NOT_CONFIGURED;
    return { ok: false, code, message: `Integration status is ${integration.status}, not ACTIVE.` };
  }
  if (provider.credentialMode !== 'NONE' && !integration.credentialReference) {
    return { ok: false, code: PROVIDER_ERROR_CODES.PROVIDER_CREDENTIALS_MISSING, message: 'No credential reference configured for this integration.' };
  }
  if (!integrationCapability || !integrationCapability.approvedAt) {
    return {
      ok: false,
      code: PROVIDER_ERROR_CODES.PROVIDER_CAPABILITY_NOT_ENABLED,
      message: `Capability ${requestedCapability} is not enabled for this integration.`,
    };
  }
  if (!license) {
    return { ok: false, code: PROVIDER_ERROR_CODES.PROVIDER_LICENSE_NOT_FOUND, message: `No applicable license found for ${requestedCapability}.` };
  }
  if (license.status === 'REVOKED') {
    return { ok: false, code: PROVIDER_ERROR_CODES.PROVIDER_LICENSE_REVOKED, message: 'The applicable license has been revoked.' };
  }
  if (license.status === 'EXPIRED') {
    return { ok: false, code: PROVIDER_ERROR_CODES.PROVIDER_LICENSE_EXPIRED, message: 'The applicable license has expired.' };
  }
  if (license.status !== 'APPROVED') {
    return { ok: false, code: PROVIDER_ERROR_CODES.PROVIDER_LICENSE_NOT_APPROVED, message: `License status is ${license.status}, not APPROVED.` };
  }
  // Runtime effective-window check (spec section 42) - no scheduler needed;
  // an expired-by-date license fails closed even if its `status` column
  // has not been separately transitioned to EXPIRED yet.
  if (license.effectiveFrom && now < license.effectiveFrom) {
    return { ok: false, code: PROVIDER_ERROR_CODES.PROVIDER_LICENSE_NOT_APPROVED, message: 'The applicable license is not yet effective.' };
  }
  if (license.effectiveUntil && now >= license.effectiveUntil) {
    return { ok: false, code: PROVIDER_ERROR_CODES.PROVIDER_LICENSE_EXPIRED, message: 'The applicable license has passed its effectiveUntil date.' };
  }

  // CONDITIONAL fails closed by design (corrected during G02 live QA): this
  // phase has no machine-evaluable condition checker, so a constraint
  // recorded in `conditionalNotes` (e.g. "logo must be >= 24px") cannot
  // actually be verified here - silently treating CONDITIONAL as ALLOWED
  // would let an unverified constraint slip through as if satisfied. A
  // future phase may introduce an explicit condition-evaluator and let
  // CONDITIONAL pass once its specific condition is checked; until then it
  // is deliberately in the same fail-closed bucket as PROHIBITED/UNKNOWN.
  const right = rightForUsage(license, usage);
  if (right === 'PROHIBITED' || right === 'UNKNOWN' || right === 'CONDITIONAL') {
    return {
      ok: false,
      code: PROVIDER_ERROR_CODES.PROVIDER_USAGE_NOT_ALLOWED,
      message:
        right === 'CONDITIONAL'
          ? `Right '${usage}' is CONDITIONAL (${license.conditionalNotes ?? 'no condition notes recorded'}) - G02 has no condition evaluator yet, fails closed.`
          : `Right '${usage}' is ${right} for this license - fails closed.`,
    };
  }

  const attributionRequirement = attributionRule?.requirement ?? license.attributionRequirement;
  const attributionSatisfied = Boolean(attributionRule?.displayText) || (attributionRule?.logoRequired && Boolean(attributionRule?.linkUrl));
  if ((attributionRequirement === 'REQUIRED' || attributionRequirement === 'UNKNOWN') && !attributionSatisfied) {
    return {
      ok: false,
      code: PROVIDER_ERROR_CODES.PROVIDER_ATTRIBUTION_REQUIRED,
      message: 'Required attribution is not configured for this provider/license.',
    };
  }

  const context: ProviderExecutionContext = {
    providerId: provider.id,
    providerCode: provider.code,
    capability: requestedCapability,
    integrationId: integration.id,
    licenseId: license.id,
    policy: {
      display: license.rightsDisplay,
      cache: dataPolicy?.cacheAllowed ?? 'UNKNOWN',
      maxCacheSeconds: dataPolicy?.maxCacheSeconds ?? null,
      store: dataPolicy?.storeContentAllowed ?? license.rightsStore,
      storeIdentity: dataPolicy?.persistentIdentifierAllowed ?? 'UNKNOWN',
      modify: license.rightsModify,
      redistribute: license.rightsRedistribute,
      commercialUse: license.rightsCommercialUse,
      conditionalNotes: license.conditionalNotes,
    },
    attribution: {
      requirement: attributionRequirement,
      displayText: attributionRule?.displayText ?? null,
      logoRequired: attributionRule?.logoRequired ?? false,
      linkUrl: attributionRule?.linkUrl ?? null,
    },
    credentialReference: integration.credentialReference,
  };

  return { ok: true, context };
}
