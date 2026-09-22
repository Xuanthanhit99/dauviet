import { evaluateIngestionAccess, IngestionSourcePolicyRow, IngestionSourceRow } from './ingestion-policy.util';

const source: IngestionSourceRow = { id: 's1', code: 'WIKIDATA', name: 'Wikidata', sourceClass: 'STRUCTURED_KNOWLEDGE', enabled: true };

function policy(overrides: Partial<IngestionSourcePolicyRow> = {}): IngestionSourcePolicyRow {
  return {
    enabled: true,
    authRequired: false,
    rateLimitPerSecond: 1,
    rateLimitPerDay: null,
    concurrencyLimit: 1,
    maxRetries: 3,
    rawPayloadStorage: 'STORE_ALLOWED',
    normalizedStorageRight: 'ALLOWED',
    commercialUseRight: 'ALLOWED',
    mediaReusePolicy: null,
    attributionRequirement: 'NOT_REQUIRED',
    licenseCode: 'CC0',
    licenseUrl: 'https://example.org/cc0',
    sourceUrl: 'https://www.wikidata.org',
    conditionalNotes: null,
    cacheMaxAgeSeconds: null,
    retentionDays: null,
    policyVersion: 1,
    ...overrides,
  };
}

describe('evaluateIngestionAccess (spec sections 4/53)', () => {
  it('fails closed with INGESTION_SOURCE_NOT_FOUND when the source does not exist', () => {
    const result = evaluateIngestionAccess({ source: null, policy: null, usage: 'fetch', hasCredential: false });
    expect(result).toEqual({ ok: false, code: 'INGESTION_SOURCE_NOT_FOUND', message: expect.any(String) });
  });

  it('fails closed when the source is disabled', () => {
    const result = evaluateIngestionAccess({ source: { ...source, enabled: false }, policy: policy(), usage: 'fetch', hasCredential: false });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('INGESTION_SOURCE_DISABLED');
  });

  it('fails closed when no policy row exists at all (spec section 53 UNKNOWN)', () => {
    const result = evaluateIngestionAccess({ source, policy: null, usage: 'fetch', hasCredential: false });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('INGESTION_POLICY_NOT_FOUND');
  });

  it('fails closed when the policy itself is disabled', () => {
    const result = evaluateIngestionAccess({ source, policy: policy({ enabled: false }), usage: 'fetch', hasCredential: false });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('INGESTION_POLICY_DISABLED');
  });

  it('fails closed when auth is required but no credential is configured', () => {
    const result = evaluateIngestionAccess({ source, policy: policy({ authRequired: true }), usage: 'fetch', hasCredential: false });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('INGESTION_POLICY_NO_CREDENTIAL');
  });

  it('allows fetch once source+policy are enabled and any required credential is present', () => {
    const result = evaluateIngestionAccess({ source, policy: policy({ authRequired: true }), usage: 'fetch', hasCredential: true });
    expect(result.ok).toBe(true);
    expect(result.policy?.licenseCode).toBe('CC0');
  });

  it('blocks storeRaw when rawPayloadStorage is PROHIBITED', () => {
    const result = evaluateIngestionAccess({ source, policy: policy({ rawPayloadStorage: 'PROHIBITED' }), usage: 'storeRaw', hasCredential: false });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('INGESTION_POLICY_STORAGE_PROHIBITED');
  });

  it.each(['STORE_ALLOWED', 'STORE_LIMITED', 'REFERENCE_ONLY'])('allows storeRaw for non-PROHIBITED classification %s', (cls) => {
    const result = evaluateIngestionAccess({ source, policy: policy({ rawPayloadStorage: cls as any }), usage: 'storeRaw', hasCredential: false });
    expect(result.ok).toBe(true);
  });

  it.each([
    ['UNKNOWN', 'INGESTION_POLICY_RIGHT_UNKNOWN'],
    ['PROHIBITED', 'INGESTION_POLICY_RIGHT_PROHIBITED'],
    ['CONDITIONAL', 'INGESTION_POLICY_CONDITIONAL_UNMET'],
  ])('storeNormalized fails closed for right state %s (code %s)', (state, expectedCode) => {
    const result = evaluateIngestionAccess({
      source,
      policy: policy({ normalizedStorageRight: state as any }),
      usage: 'storeNormalized',
      hasCredential: false,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe(expectedCode);
  });

  it('CONDITIONAL never silently passes as ALLOWED, even with conditionalNotes present (mirrors G02 3a correction)', () => {
    const result = evaluateIngestionAccess({
      source,
      policy: policy({ commercialUseRight: 'CONDITIONAL', conditionalNotes: 'requires share-alike attribution' }),
      usage: 'commercialUse',
      hasCredential: false,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('INGESTION_POLICY_CONDITIONAL_UNMET');
    expect(result.message).toContain('share-alike');
  });

  it('allows commercialUse only when explicitly ALLOWED', () => {
    const result = evaluateIngestionAccess({ source, policy: policy({ commercialUseRight: 'ALLOWED' }), usage: 'commercialUse', hasCredential: false });
    expect(result.ok).toBe(true);
  });

  it('mediaReusePolicy null (not applicable for a non-MEDIA source) fails closed like UNKNOWN, not like ALLOWED', () => {
    const result = evaluateIngestionAccess({ source, policy: policy({ mediaReusePolicy: null }), usage: 'mediaReuse', hasCredential: false });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('INGESTION_POLICY_RIGHT_UNKNOWN');
  });
});
