import { INGESTION_ERROR_CODES } from '../../common/errors/ingestion-error-codes';
import { IngestionAccessResult, IngestionPolicyView, IngestionUsageIntent } from './ingestion-policy.types';

export interface IngestionSourceRow {
  id: string;
  code: string;
  name: string;
  sourceClass: string;
  enabled: boolean;
}

export interface IngestionSourcePolicyRow {
  enabled: boolean;
  authRequired: boolean;
  rateLimitPerSecond: number | null;
  rateLimitPerDay: number | null;
  concurrencyLimit: number;
  maxRetries: number;
  rawPayloadStorage: string;
  normalizedStorageRight: string;
  commercialUseRight: string;
  mediaReusePolicy: string | null;
  attributionRequirement: string;
  licenseCode: string | null;
  licenseUrl: string | null;
  sourceUrl: string | null;
  conditionalNotes: string | null;
  cacheMaxAgeSeconds: number | null;
  retentionDays: number | null;
  policyVersion: number;
}

/**
 * Pure, DB-independent decision function (mirrors G02's
 * `evaluateProviderAccess` exactly - spec section 4/53). Every usage intent
 * fails closed on UNKNOWN/PROHIBITED/CONDITIONAL identically - a
 * CONDITIONAL right is never treated as ALLOWED here, since G06.5 (like
 * G02) has no machine-evaluable condition checker; an unverified constraint
 * must never silently pass.
 */
export function evaluateIngestionAccess(params: {
  source: IngestionSourceRow | null;
  policy: IngestionSourcePolicyRow | null;
  usage: IngestionUsageIntent;
  hasCredential: boolean;
}): IngestionAccessResult {
  const { source, policy, usage, hasCredential } = params;

  if (!source) {
    return { ok: false, code: INGESTION_ERROR_CODES.INGESTION_SOURCE_NOT_FOUND, message: 'Ingestion source not found.' };
  }
  if (!source.enabled) {
    return { ok: false, code: INGESTION_ERROR_CODES.INGESTION_SOURCE_DISABLED, message: `Ingestion source ${source.code} is disabled.` };
  }
  if (!policy) {
    return { ok: false, code: INGESTION_ERROR_CODES.INGESTION_POLICY_NOT_FOUND, message: `No policy configured for source ${source.code}.` };
  }
  if (!policy.enabled) {
    return { ok: false, code: INGESTION_ERROR_CODES.INGESTION_POLICY_DISABLED, message: `Policy for source ${source.code} is disabled.` };
  }
  if (policy.authRequired && !hasCredential) {
    return {
      ok: false,
      code: INGESTION_ERROR_CODES.INGESTION_POLICY_NO_CREDENTIAL,
      message: `Source ${source.code} requires a credential that is not configured.`,
    };
  }

  const view: IngestionPolicyView = {
    enabled: policy.enabled,
    authRequired: policy.authRequired,
    rateLimitPerSecond: policy.rateLimitPerSecond,
    rateLimitPerDay: policy.rateLimitPerDay,
    concurrencyLimit: policy.concurrencyLimit,
    maxRetries: policy.maxRetries,
    rawPayloadStorage: policy.rawPayloadStorage as any,
    normalizedStorageRight: policy.normalizedStorageRight as any,
    commercialUseRight: policy.commercialUseRight as any,
    mediaReusePolicy: policy.mediaReusePolicy as any,
    attributionRequirement: policy.attributionRequirement as any,
    licenseCode: policy.licenseCode,
    licenseUrl: policy.licenseUrl,
    sourceUrl: policy.sourceUrl,
    conditionalNotes: policy.conditionalNotes,
    cacheMaxAgeSeconds: policy.cacheMaxAgeSeconds,
    retentionDays: policy.retentionDays,
    policyVersion: policy.policyVersion,
  };

  if (usage === 'fetch') {
    // Fetching itself only requires the source/policy to be enabled (and
    // credentialed if required) - already checked above.
    return { ok: true, sourceId: source.id, sourceClass: source.sourceClass, policy: view };
  }

  if (usage === 'storeRaw') {
    if (policy.rawPayloadStorage === 'PROHIBITED') {
      return {
        ok: false,
        code: INGESTION_ERROR_CODES.INGESTION_POLICY_STORAGE_PROHIBITED,
        message: `Raw payload storage is PROHIBITED for source ${source.code}.`,
        policy: view,
      };
    }
    return { ok: true, sourceId: source.id, sourceClass: source.sourceClass, policy: view };
  }

  const right =
    usage === 'storeNormalized'
      ? policy.normalizedStorageRight
      : usage === 'commercialUse'
        ? policy.commercialUseRight
        : policy.mediaReusePolicy;

  // UNKNOWN, PROHIBITED, and CONDITIONAL all fail closed identically (spec
  // section 53) - mirrors G02's own explicit correction (documented in
  // docs/backend/PROVIDER_LICENSING.md section 3a): a CONDITIONAL right is
  // not "surfaced and allowed," it is unmet until a real condition
  // evaluator exists.
  if (right !== 'ALLOWED') {
    const code =
      right === 'PROHIBITED'
        ? INGESTION_ERROR_CODES.INGESTION_POLICY_RIGHT_PROHIBITED
        : right === 'CONDITIONAL'
          ? INGESTION_ERROR_CODES.INGESTION_POLICY_CONDITIONAL_UNMET
          : INGESTION_ERROR_CODES.INGESTION_POLICY_RIGHT_UNKNOWN;
    return {
      ok: false,
      code,
      message: `${usage} is not ALLOWED for source ${source.code} (state: ${right ?? 'UNKNOWN'}).${
        right === 'CONDITIONAL' && policy.conditionalNotes ? ` Condition: ${policy.conditionalNotes}` : ''
      }`,
      policy: view,
    };
  }

  return { ok: true, sourceId: source.id, sourceClass: source.sourceClass, policy: view };
}
