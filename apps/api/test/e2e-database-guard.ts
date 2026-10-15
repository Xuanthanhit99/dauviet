/**
 * Fail-closed protection for destructive E2E fixture cleanup.
 * Never fall back to DATABASE_URL or the API's local .env.
 */
const ALLOWED_DATABASES = new Set(['dauviet_e2e', 'dauviet_dw_v15_qa']);
const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const ALLOWED_QUERY_KEYS = new Set(['schema', 'connect_timeout', 'pool_timeout']);

export function resolveE2eDatabaseUrl(raw: string | undefined): string {
  if (!raw?.trim()) {
    throw new Error('E2E_DATABASE_URL is required; refusing to run E2E.');
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Invalid E2E_DATABASE_URL.');
  }

  let database: string;
  try {
    database = decodeURIComponent(url.pathname.slice(1));
  } catch {
    throw new Error('Invalid E2E database name.');
  }

  if (
    !['postgresql:', 'postgres:'].includes(url.protocol) ||
    !ALLOWED_HOSTS.has(url.hostname.toLowerCase()) ||
    !ALLOWED_DATABASES.has(database) ||
    !url.username ||
    !url.password ||
    url.hash ||
    [...url.searchParams.keys()].some((key) => !ALLOWED_QUERY_KEYS.has(key))
  ) {
    throw new Error('E2E database rejected: approved local PostgreSQL QA database required.');
  }

  url.searchParams.set('connect_timeout', '60');
  url.searchParams.set('pool_timeout', '60');
  return url.toString();
}
