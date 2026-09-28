export interface AppConfig {
  nodeEnv: string;
  port: number;
  apiPrefix: string;
  appUrl: string;
  corsOrigins: string[];
  database: { url: string };
  // G12: `prefix` namespaces every BullMQ key (`<prefix>:<queue>:...`). Defaults to BullMQ's own
  // default `bull`, so an existing deployment's keys are unchanged; the e2e harness sets a unique
  // per-run prefix so its cleanup can delete exactly the keys it owns (never FLUSHALL).
  redis: { url: string; prefix: string };
  jwt: {
    accessSecret: string;
    accessTtl: string;
    refreshSecret: string;
    refreshTtl: string;
  };
  google: { clientId: string; clientSecret: string; callbackUrl: string };
  s3: {
    endpoint: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
    forcePathStyle: boolean;
    publicBaseUrl: string;
    uploadUrlTtlSeconds: number;
    downloadUrlTtlSeconds: number;
    restrictedDownloadUrlTtlSeconds: number;
    pendingUploadExpiryMinutes: number;
  };
  smtp: { host: string; port: number; secure: boolean; from: string };
  rateLimit: { ttl: number; max: number };
  locales: { canonical: string; supported: string[] };
  ingestion: {
    enabled: boolean;
    wikimediaUserAgent: string;
    wikimediaContact: string;
    geonamesUsername: string;
    googlePlacesApiKey: string;
    workerConcurrency: number;
    maxRetries: number;
    rawRetentionDays: number;
  };
  // G08 - Trip Location Sharing. Two independently-configurable clocks
  // (docs/backend/G08_PRE_IMPLEMENTATION_REPORT.md section 10) - consent
  // DURATION (how long a sharing session may remain ACTIVE) is never
  // confused with location TTL/freshness (how long a single coordinate may
  // be disclosed before it goes stale/unavailable).
  tripLocation: {
    sharingMinDurationMinutes: number;
    sharingMaxDurationMinutes: number;
    ttlSeconds: number;
    freshnessSeconds: number;
    maxFutureClockSkewSeconds: number;
  };
  // G10 - Affiliate & Commercial Attribution. `sessionTtlMinutes` is a
  // plain browsing-session-length window - deliberately NOT the same
  // config as any provider's own attribution/cookie window (spec section
  // 33), which is provider policy (ProviderAttributionRule), never a
  // backend constant. `redirectTokenTtlSeconds` is short-lived by design
  // (spec section 14).
  affiliate: {
    sessionTtlMinutes: number;
    redirectTokenTtlSeconds: number;
    defaultEnvironment: 'SANDBOX' | 'PRODUCTION';
  };
  // G11 Global Search & Map. The projection worker drains the trigger-fed
  // queue; `projectionIntervalMs` (default 2 s) is the dominant term of the
  // <= 60 s public freshness contract. `claimTimeoutSeconds` lets another
  // worker retry an entity whose claimant crashed mid-refresh.
  search: {
    projectionWorkerEnabled: boolean;
    projectionIntervalMs: number;
    claimTimeoutSeconds: number;
    drainBatchSize: number;
  };
}

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  apiPrefix: process.env.API_PREFIX ?? 'v1',
  appUrl: process.env.APP_URL ?? 'http://localhost:3000',
  corsOrigins: (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  database: { url: process.env.DATABASE_URL ?? '' },
  redis: { url: process.env.REDIS_URL ?? 'redis://localhost:6379', prefix: process.env.REDIS_KEY_PREFIX || 'bull' },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? '',
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? '',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '30d',
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    callbackUrl: process.env.GOOGLE_CALLBACK_URL ?? '',
  },
  s3: {
    endpoint: process.env.S3_ENDPOINT ?? '',
    region: process.env.S3_REGION ?? 'us-east-1',
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
    bucket: process.env.S3_BUCKET ?? 'dauviet-media',
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? 'true') === 'true',
    publicBaseUrl: process.env.S3_PUBLIC_BASE_URL ?? '',
    // Signed URL TTLs (spec section 37) - short-lived by design, never a
    // hardcoded one-week lifetime. Restricted/reviewer access intentionally
    // gets a shorter window than a routine upload PUT.
    uploadUrlTtlSeconds: parseInt(process.env.S3_UPLOAD_URL_TTL_SECONDS ?? '900', 10),
    downloadUrlTtlSeconds: parseInt(process.env.S3_DOWNLOAD_URL_TTL_SECONDS ?? '3600', 10),
    restrictedDownloadUrlTtlSeconds: parseInt(process.env.S3_RESTRICTED_DOWNLOAD_URL_TTL_SECONDS ?? '300', 10),
    // How long a PENDING_UPLOAD MediaAsset row may sit unconfirmed before an
    // orphan-cleanup pass may mark it FAILED (spec section 40).
    pendingUploadExpiryMinutes: parseInt(process.env.MEDIA_PENDING_UPLOAD_EXPIRY_MINUTES ?? '60', 10),
  },
  smtp: {
    host: process.env.SMTP_HOST ?? 'localhost',
    port: parseInt(process.env.SMTP_PORT ?? '1025', 10),
    secure: (process.env.SMTP_SECURE ?? 'false') === 'true',
    from: process.env.SMTP_FROM ?? 'Dau Viet <no-reply@dauviet.vn>',
  },
  rateLimit: {
    ttl: parseInt(process.env.RATE_LIMIT_TTL ?? '60', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX ?? '120', 10),
  },
  locales: {
    canonical: 'vi',
    supported: ['vi', 'en'],
  },
  // G06.5 - Knowledge & Place Data Ingestion. Default fail-closed: an
  // unset optional credential (GEONAMES_USERNAME/GOOGLE_PLACES_API_KEY)
  // produces a cleanly-disabled adapter, never a startup failure - see
  // docs/backend/G06_5_SOURCE_POLICY_RESEARCH.md.
  ingestion: {
    enabled: (process.env.KNOWLEDGE_INGESTION_ENABLED ?? 'false') === 'true',
    wikimediaUserAgent: process.env.WIKIMEDIA_USER_AGENT ?? '',
    wikimediaContact: process.env.WIKIMEDIA_CONTACT ?? '',
    geonamesUsername: process.env.GEONAMES_USERNAME ?? '',
    googlePlacesApiKey: process.env.GOOGLE_PLACES_API_KEY ?? '',
    workerConcurrency: parseInt(process.env.INGESTION_WORKER_CONCURRENCY ?? '1', 10),
    maxRetries: parseInt(process.env.INGESTION_MAX_RETRIES ?? '3', 10),
    rawRetentionDays: parseInt(process.env.INGESTION_RAW_RETENTION_DAYS ?? '90', 10),
  },
  // G08 - Trip Location Sharing. Conservative documented defaults (spec
  // section 52/63) - never an indefinite session, never a long-lived stale
  // coordinate. All five are overridable per-environment, never hardcoded
  // product policy baked directly into the service layer.
  tripLocation: {
    sharingMinDurationMinutes: parseInt(process.env.TRIP_LOCATION_SHARING_MIN_DURATION_MINUTES ?? '5', 10),
    sharingMaxDurationMinutes: parseInt(process.env.TRIP_LOCATION_SHARING_MAX_DURATION_MINUTES ?? '720', 10),
    ttlSeconds: parseInt(process.env.TRIP_LOCATION_TTL_SECONDS ?? '300', 10),
    freshnessSeconds: parseInt(process.env.TRIP_LOCATION_FRESHNESS_SECONDS ?? '90', 10),
    maxFutureClockSkewSeconds: parseInt(process.env.TRIP_LOCATION_MAX_FUTURE_CLOCK_SKEW_SECONDS ?? '120', 10),
  },
  affiliate: {
    sessionTtlMinutes: parseInt(process.env.AFFILIATE_SESSION_TTL_MINUTES ?? '30', 10),
    redirectTokenTtlSeconds: parseInt(process.env.AFFILIATE_REDIRECT_TOKEN_TTL_SECONDS ?? '300', 10),
    defaultEnvironment: (process.env.AFFILIATE_DEFAULT_ENVIRONMENT ?? (process.env.NODE_ENV === 'production' ? 'PRODUCTION' : 'SANDBOX')) as 'SANDBOX' | 'PRODUCTION',
  },
  search: {
    projectionWorkerEnabled: (process.env.SEARCH_PROJECTION_WORKER_ENABLED ?? 'true') !== 'false',
    projectionIntervalMs: parseInt(process.env.SEARCH_PROJECTION_INTERVAL_MS ?? '2000', 10),
    claimTimeoutSeconds: parseInt(process.env.SEARCH_PROJECTION_CLAIM_TIMEOUT_SECONDS ?? '60', 10),
    drainBatchSize: parseInt(process.env.SEARCH_PROJECTION_DRAIN_BATCH_SIZE ?? '200', 10),
  },
});
