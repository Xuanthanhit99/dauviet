import 'reflect-metadata';
import { productionConfigErrors, validateEnv } from './env.validation';

/** G12 required-core-configuration contract: missing/unsafe production config fails the boot clearly. */
describe('validateEnv (G12)', () => {
  const secretA = 'a'.repeat(40);
  const secretB = 'b'.repeat(40);
  const base = {
    DATABASE_URL: 'postgresql://u:p@db:5432/app',
    REDIS_URL: 'redis://redis:6379',
    JWT_ACCESS_SECRET: secretA,
    JWT_REFRESH_SECRET: secretB,
  };
  const prod = { ...base, NODE_ENV: 'production', CORS_ORIGINS: 'https://dauviet.vn,https://admin.dauviet.vn', APP_URL: 'https://dauviet.vn' };

  it('accepts a complete development config without CORS_ORIGINS/APP_URL', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'development' })).not.toThrow();
  });

  it('accepts a complete production config', () => {
    expect(() => validateEnv(prod)).not.toThrow();
  });

  it.each(['DATABASE_URL', 'REDIS_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'])('fails clearly when %s is missing', (key) => {
    const cfg: Record<string, unknown> = { ...prod };
    delete cfg[key];
    expect(() => validateEnv(cfg)).toThrow(/Invalid environment configuration/);
  });

  it('fails when DATABASE_URL is an empty string', () => {
    expect(() => validateEnv({ ...prod, DATABASE_URL: '' })).toThrow(/DATABASE_URL/);
  });

  it('rejects a short JWT secret in every environment', () => {
    expect(() => validateEnv({ ...base, JWT_ACCESS_SECRET: 'short' })).toThrow(/at least 32/);
  });

  it.each([
    ['empty CORS_ORIGINS', { CORS_ORIGINS: '' }, /CORS_ORIGINS must list/],
    ['wildcard CORS_ORIGINS', { CORS_ORIGINS: '*' }, /no wildcard/],
    ['origin with a path', { CORS_ORIGINS: 'https://dauviet.vn/app' }, /no wildcard, no path/],
    ['placeholder access secret', { JWT_ACCESS_SECRET: 'change-me-access-secret-at-least-32-characters' }, /placeholder/],
    ['placeholder refresh secret', { JWT_REFRESH_SECRET: 'CHANGEME-refresh-secret-at-least-32-characters' }, /placeholder/],
    ['identical access/refresh secrets', { JWT_REFRESH_SECRET: secretA }, /must differ/],
    ['missing APP_URL', { APP_URL: '' }, /APP_URL/],
    ['SKIP_DB_CONNECT', { SKIP_DB_CONNECT: 'true' }, /SKIP_DB_CONNECT/],
  ])('production refuses %s', (_label, override, message) => {
    expect(() => validateEnv({ ...prod, ...override })).toThrow(message);
  });

  it('never echoes a secret value in the error', () => {
    const secret = 'change-me-but-this-is-the-actual-value-1234567890';
    try {
      validateEnv({ ...prod, JWT_ACCESS_SECRET: secret });
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as Error).message).not.toContain(secret);
    }
  });

  it('production rules are inert outside production', () => {
    expect(productionConfigErrors({ ...base, NODE_ENV: 'staging', CORS_ORIGINS: '' })).toEqual([]);
  });
});
