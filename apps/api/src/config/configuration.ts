export interface AppConfig {
  nodeEnv: string;
  port: number;
  apiPrefix: string;
  appUrl: string;
  corsOrigins: string[];
  database: { url: string };
  redis: { url: string };
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
}

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  apiPrefix: process.env.API_PREFIX ?? 'v1',
  appUrl: process.env.APP_URL ?? 'http://localhost:3000',
  corsOrigins: (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  database: { url: process.env.DATABASE_URL ?? '' },
  redis: { url: process.env.REDIS_URL ?? 'redis://localhost:6379' },
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
});
