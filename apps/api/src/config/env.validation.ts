import { plainToInstance } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MinLength, validateSync } from 'class-validator';

class EnvironmentVariables {
  @IsIn(['development', 'test', 'staging', 'production'])
  @IsOptional()
  NODE_ENV?: string;

  @IsInt()
  @IsOptional()
  PORT?: number;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  REDIS_URL!: string;

  @IsString()
  @MinLength(32, { message: 'JWT_ACCESS_SECRET must be at least 32 characters' })
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @MinLength(32, { message: 'JWT_REFRESH_SECRET must be at least 32 characters' })
  JWT_REFRESH_SECRET!: string;
}

/**
 * G12 production-only rules. Development/test boots keep their permissive
 * defaults (reflected CORS origin, localhost APP_URL); a production boot fails
 * fast instead of starting with a configuration that is unsafe or broken:
 * - CORS_ORIGINS must list explicit origins: with it empty, main.ts reflects
 *   ANY origin while sending `credentials: true`; `*` is refused for the same
 *   reason.
 * - JWT secrets must not be the `.env.example` placeholders (which are long
 *   enough to pass the length rule) and must differ from each other, so an
 *   access token can never be replayed as a refresh token or vice versa.
 * - APP_URL is required: it is the only origin of every emailed link
 *   (verification, password reset, trip invitation).
 * - SKIP_DB_CONNECT (an offline OpenAPI-generation escape hatch) is refused.
 */
export function productionConfigErrors(config: Record<string, unknown>): string[] {
  if (config.NODE_ENV !== 'production') return [];
  const errors: string[] = [];
  const str = (key: string) => (typeof config[key] === 'string' ? (config[key] as string).trim() : '');

  const origins = str('CORS_ORIGINS').split(',').map((s) => s.trim()).filter(Boolean);
  if (origins.length === 0) {
    errors.push('CORS_ORIGINS must list the allowed browser origins in production (empty would reflect any origin with credentials)');
  }
  for (const origin of origins) {
    if (origin === '*' || !/^https?:\/\/[^/\s*]+$/.test(origin)) {
      errors.push(`CORS_ORIGINS entry "${origin}" must be an explicit scheme://host[:port] origin (no wildcard, no path)`);
    }
  }

  for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
    if (/change-?me/i.test(str(key))) errors.push(`${key} is still the .env.example placeholder`);
  }
  if (str('JWT_ACCESS_SECRET') && str('JWT_ACCESS_SECRET') === str('JWT_REFRESH_SECRET')) {
    errors.push('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ');
  }

  if (!/^https?:\/\/\S+$/.test(str('APP_URL'))) errors.push('APP_URL must be set to the public app URL in production');
  if (str('SKIP_DB_CONNECT') === 'true') errors.push('SKIP_DB_CONNECT=true is an offline-tooling flag and is not allowed in production');
  return errors;
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  const messages = errors.map((e) => Object.values(e.constraints ?? {}).join(', '));
  messages.push(...productionConfigErrors(config));
  if (messages.length > 0) {
    throw new Error(`Invalid environment configuration: ${messages.join('; ')}`);
  }
  return validated;
}
