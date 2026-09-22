import { ProviderAttributionRequirement, ProviderRightState, RawPayloadStoragePolicy } from '@prisma/client';

/** Which operation is being gated (mirrors ProviderUsageIntent's role in G02). */
export type IngestionUsageIntent = 'fetch' | 'storeRaw' | 'storeNormalized' | 'commercialUse' | 'mediaReuse';

export interface IngestionPolicyView {
  enabled: boolean;
  authRequired: boolean;
  rateLimitPerSecond: number | null;
  rateLimitPerDay: number | null;
  concurrencyLimit: number;
  maxRetries: number;
  rawPayloadStorage: RawPayloadStoragePolicy;
  normalizedStorageRight: ProviderRightState;
  commercialUseRight: ProviderRightState;
  mediaReusePolicy: ProviderRightState | null;
  attributionRequirement: ProviderAttributionRequirement;
  licenseCode: string | null;
  licenseUrl: string | null;
  sourceUrl: string | null;
  conditionalNotes: string | null;
  cacheMaxAgeSeconds: number | null;
  retentionDays: number | null;
  policyVersion: number;
}

export interface IngestionAccessResult {
  ok: boolean;
  code?: string;
  message?: string;
  sourceId?: string;
  sourceClass?: string;
  policy?: IngestionPolicyView;
}
