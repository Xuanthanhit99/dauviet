import { IngestionCandidateType } from '@prisma/client';

/**
 * What a live fetch returns for one external record, before normalization.
 * `rawPayload` is only kept when the source's policy permits it (spec
 * section 21) - the adapter itself doesn't decide that; the caller
 * (IngestionRunnerService) checks `IngestionPolicyService` and strips
 * `rawPayload` to null when storage isn't permitted.
 */
export interface FetchedRecord {
  externalId: string;
  retrievedAt: Date;
  rawPayload: Record<string, unknown>;
  /** Deterministic hash of rawPayload, computed by the adapter so identical re-fetches are detected before normalization even runs. */
  payloadHash: string;
}

/** Source-neutral candidate proposal - what NormalizationService produces from a FetchedRecord (spec section 22). */
export interface NormalizedCandidate {
  candidateType: IngestionCandidateType;
  /** Source-neutral shape: canonical field names only, never provider-specific keys (e.g. "labelVi"/"labelEn"/"lat"/"lng"/"aliases", never Wikidata's "P625"/"labels.vi.value"). */
  normalizedData: {
    labels: Partial<Record<'vi' | 'en' | 'ja', string>>;
    aliases: Partial<Record<'vi' | 'en' | 'ja', string[]>>;
    description?: string;
    coordinates?: { lat: number; lng: number };
    countryCode?: string;
    instanceOf?: string[];
    dates?: { label?: string; year?: number };
    externalIdentifiers?: Record<string, string>;
    media?: { url: string; license?: string; attributionText?: string }[];
  };
  evidence: {
    externalRecordId: string;
    sourceUrl?: string;
    retrievedAt: Date;
    licenseCode?: string;
    licenseUrl?: string;
    attributionText?: string;
  };
}

/** Minimal, typed adapter contract (mirrors G02's ProviderAdapter shape - spec section 26). */
export interface IngestionAdapter {
  readonly sourceCode: string;
  readonly adapterVersion: string;
  readonly normalizationVersion: number;

  /** Bounded fetch for an explicit set of external ids (spec section 6 - no unbounded crawling). */
  fetchByIds(ids: string[]): Promise<FetchedRecord[]>;

  normalize(record: FetchedRecord): NormalizedCandidate[];
}
