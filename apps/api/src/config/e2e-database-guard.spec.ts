import { resolveE2eDatabaseUrl } from '../../test/e2e-database-guard';

describe('E2E database isolation guard', () => {
  const qa = 'postgresql://qa:secret@127.0.0.1:55433/dauviet_dw_v15_qa?schema=public';

  it('rejects a missing E2E_DATABASE_URL', () => {
    expect(() => resolveE2eDatabaseUrl(undefined)).toThrow('E2E_DATABASE_URL is required');
    expect(() => resolveE2eDatabaseUrl('')).toThrow('E2E_DATABASE_URL is required');
  });

  it.each([
    'not a url',
    'postgresql://qa:secret@db.production.example/dauviet_e2e',
    'postgresql://qa:secret@localhost/dauviet_prod',
    'postgresql://qa:secret@localhost/dauviet_staging',
    'postgresql://qa:secret@localhost/dauviet_e2e?hostaddr=10.0.0.2',
    'postgresql://qa:secret@localhost/dauviet_e2e?options=-c%20search_path%3Dpublic',
    'postgresql://qa:secret@localhost/dauviet_e2e/other',
    'postgresql://qa@localhost/dauviet_e2e',
  ])('rejects unsafe URL: %s', (url) => {
    expect(() => resolveE2eDatabaseUrl(url)).toThrow();
  });

  it('accepts only an approved local QA database and adds timeouts', () => {
    const result = new URL(resolveE2eDatabaseUrl(qa));
    expect(result.hostname).toBe('127.0.0.1');
    expect(result.pathname).toBe('/dauviet_dw_v15_qa');
    expect(result.searchParams.get('schema')).toBe('public');
    expect(result.searchParams.get('connect_timeout')).toBe('60');
    expect(result.searchParams.get('pool_timeout')).toBe('60');
  });

  it('accepts a second approved QA database', () => {
    expect(resolveE2eDatabaseUrl('postgresql://qa:secret@localhost/dauviet_e2e'))
      .toContain('/dauviet_e2e?');
  });
});
