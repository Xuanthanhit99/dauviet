/**
 * Jest `setupFiles` entry (spec Phase 11 section 78/89) - provides safe,
 * fake-but-valid-format environment variables so a test that boots the
 * real Nest DI graph (`openapi-contract.spec.ts`) can run in any CI/dev
 * environment without a developer manually exporting anything, and without
 * ever touching a real secret. Only sets a variable if it isn't already
 * set, so a real `.env`/CI secret always wins.
 */
function setDefault(key: string, value: string) {
  if (!process.env[key]) process.env[key] = value;
}

setDefault('NODE_ENV', 'test');
setDefault('DATABASE_URL', 'postgresql://test:test@localhost:5432/test?schema=public');
setDefault('REDIS_URL', 'redis://localhost:6379');
setDefault('JWT_ACCESS_SECRET', 'test-access-secret-at-least-32-characters-long');
setDefault('JWT_REFRESH_SECRET', 'test-refresh-secret-at-least-32-characters-long');
// Never set by a real server boot (main.ts never reads/sets this) - see
// PrismaService.onModuleInit. Safe here because no *.spec.ts file other
// than openapi-contract.spec.ts ever boots the real AppModule/PrismaService.
setDefault('SKIP_DB_CONNECT', 'true');
