/**
 * G06.5 - Knowledge & Place Data Ingestion. Deterministic registry/
 * configuration data ONLY (spec section 62) - the six `IngestionSource`
 * rows plus their `IngestionSourcePolicy`, seeded with the exact rights
 * classification recorded in docs/backend/G06_5_SOURCE_POLICY_RESEARCH.md
 * after fetching each source's official documentation on 2026-09-22. No
 * fake real-world historical fact, no fake Google operational data, no
 * fixture-only data is seeded here as if it were production truth.
 */

export interface IngestionSourceSpec {
  code: string;
  name: string;
  sourceClass: string;
  enabled: boolean;
  policy: {
    transport: string;
    authRequired: boolean;
    rateLimitPerSecond?: number;
    concurrencyLimit: number;
    maxRetries: number;
    rawPayloadStorage: string;
    normalizedStorageRight: string;
    commercialUseRight: string;
    mediaReusePolicy?: string;
    attributionRequirement: string;
    licenseCode?: string;
    licenseUrl?: string;
    sourceUrl?: string;
    conditionalNotes?: string;
    retentionDays?: number;
  };
  evidence: { title: string; sourceUrl: string; accessedAt: string; sourceType: string };
}

export const GOLDEN_INGESTION_SOURCES: IngestionSourceSpec[] = [
  {
    code: 'WIKIDATA',
    name: 'Wikidata',
    sourceClass: 'STRUCTURED_KNOWLEDGE',
    enabled: true,
    policy: {
      transport: 'API',
      authRequired: false,
      concurrencyLimit: 1,
      maxRetries: 3,
      rawPayloadStorage: 'STORE_ALLOWED',
      normalizedStorageRight: 'ALLOWED',
      commercialUseRight: 'ALLOWED',
      attributionRequirement: 'NOT_REQUIRED',
      licenseCode: 'CC0',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      sourceUrl: 'https://www.wikidata.org',
    },
    evidence: {
      title: 'Wikidata:Data access',
      sourceUrl: 'https://www.wikidata.org/wiki/Wikidata:Data_access',
      accessedAt: '2026-09-22',
      sourceType: 'OFFICIAL_DEVELOPER_DOC',
    },
  },
  {
    code: 'WIKIMEDIA_COMMONS',
    name: 'Wikimedia Commons',
    sourceClass: 'MEDIA',
    enabled: true,
    policy: {
      transport: 'API',
      authRequired: false,
      concurrencyLimit: 1,
      maxRetries: 3,
      // Metadata only - never the binary itself (see adapter doc comment).
      rawPayloadStorage: 'STORE_LIMITED',
      normalizedStorageRight: 'ALLOWED',
      commercialUseRight: 'CONDITIONAL',
      mediaReusePolicy: 'CONDITIONAL',
      attributionRequirement: 'CONDITIONAL',
      sourceUrl: 'https://commons.wikimedia.org',
      conditionalNotes:
        'License/attribution/commercial-use varies per file - must be read from each file\'s own imageinfo.extmetadata, never assumed at the source level.',
    },
    evidence: {
      title: 'Commons:Reusing content outside Wikimedia',
      sourceUrl: 'https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia',
      accessedAt: '2026-09-22',
      sourceType: 'OFFICIAL_DEVELOPER_DOC',
    },
  },
  {
    code: 'UNESCO',
    name: 'UNESCO World Heritage List (DataHub)',
    sourceClass: 'AUTHORITATIVE',
    enabled: true,
    policy: {
      transport: 'DATASET',
      authRequired: false,
      concurrencyLimit: 1,
      maxRetries: 3,
      rawPayloadStorage: 'STORE_ALLOWED',
      normalizedStorageRight: 'ALLOWED',
      commercialUseRight: 'CONDITIONAL',
      attributionRequirement: 'REQUIRED',
      licenseCode: 'CC-BY-SA-4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
      sourceUrl: 'https://data.unesco.org/explore/dataset/whc001/',
      conditionalNotes:
        'CC BY-SA share-alike condition applies to redistributing the dataset itself, not to citing individual facts with attribution.',
    },
    evidence: {
      title: 'UNESCO DataHub - World Heritage List dataset (whc001) metadata',
      sourceUrl: 'https://data.unesco.org/api/explore/v2.1/catalog/datasets/whc001/',
      accessedAt: '2026-09-22',
      sourceType: 'OFFICIAL_DEVELOPER_DOC',
    },
  },
  {
    code: 'GEONAMES',
    name: 'GeoNames',
    sourceClass: 'GEOSPATIAL',
    enabled: false, // disabled by default - activates only if operator supplies a real GEONAMES_USERNAME
    policy: {
      transport: 'API',
      authRequired: true,
      rateLimitPerSecond: 1,
      concurrencyLimit: 1,
      maxRetries: 3,
      rawPayloadStorage: 'STORE_ALLOWED',
      normalizedStorageRight: 'ALLOWED',
      commercialUseRight: 'ALLOWED',
      attributionRequirement: 'REQUIRED',
      licenseCode: 'CC-BY-4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      sourceUrl: 'https://www.geonames.org',
    },
    evidence: {
      title: 'GeoNames Web Services',
      sourceUrl: 'https://www.geonames.org/export/web-services.html',
      accessedAt: '2026-09-22',
      sourceType: 'OFFICIAL_DEVELOPER_DOC',
    },
  },
  {
    code: 'OPENSTREETMAP',
    name: 'OpenStreetMap (Nominatim)',
    sourceClass: 'GEOSPATIAL',
    enabled: false, // permanently disabled - see adapter doc comment
    policy: {
      transport: 'API',
      authRequired: false,
      concurrencyLimit: 1,
      maxRetries: 0,
      rawPayloadStorage: 'PROHIBITED',
      normalizedStorageRight: 'PROHIBITED',
      commercialUseRight: 'PROHIBITED',
      attributionRequirement: 'REQUIRED',
      licenseCode: 'ODbL',
      sourceUrl: 'https://operations.osmfoundation.org/policies/nominatim/',
      conditionalNotes: 'Public Nominatim usage policy prohibits the bulk/systematic use this pipeline would require - permanently disabled, contract-only.',
    },
    evidence: {
      title: 'Nominatim Usage Policy',
      sourceUrl: 'https://operations.osmfoundation.org/policies/nominatim/',
      accessedAt: '2026-09-22',
      sourceType: 'OFFICIAL_TERMS',
    },
  },
  {
    code: 'GOOGLE_PLACES',
    name: 'Google Places API',
    sourceClass: 'OPERATIONAL_PROVIDER',
    enabled: false, // disabled by default - no real GOOGLE_PLACES_API_KEY in this environment
    policy: {
      transport: 'API',
      authRequired: true,
      concurrencyLimit: 1,
      maxRetries: 3,
      // Everything except Place ID / coordinates is PROHIBITED from
      // storage - the whole-payload classification is therefore PROHIBITED;
      // the adapter itself only ever persists placeId + coordinates.
      rawPayloadStorage: 'PROHIBITED',
      normalizedStorageRight: 'CONDITIONAL',
      commercialUseRight: 'PROHIBITED',
      attributionRequirement: 'REQUIRED',
      sourceUrl: 'https://developers.google.com/maps/documentation/places/web-service/policies',
      conditionalNotes:
        'Place ID storable indefinitely; latitude/longitude cacheable up to 30 days; every other field must never be pre-fetched/cached/stored (see retentionDays).',
      retentionDays: 30,
    },
    evidence: {
      title: 'Policies and attributions for Places API',
      sourceUrl: 'https://developers.google.com/maps/documentation/places/web-service/policies',
      accessedAt: '2026-09-22',
      sourceType: 'OFFICIAL_DEVELOPER_DOC',
    },
  },
];
